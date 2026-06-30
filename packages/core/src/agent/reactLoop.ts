import {
  LOCAL_MODELS,
  type SageSignals,
  type CapabilityManifest,
  type MemoryFragment,
  type Message,
  type RoutingDecision,
  type RoutingTarget,
  type SageErrorCode,
  type ToolCall,
  type ToolResult,
} from '@sage/shared-types';
import { DEFAULT_CLOUD_CATALOG, type CloudModelCatalog, type ISageRouter } from '../router';
import { resolveTarget, type InferenceEvent, type TargetResolver } from './events';
import type { ToolDomainRouter } from './toolDomainRouter';

export class ReActError extends Error {
  constructor(
    public readonly code: SageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReActError';
  }
}

interface Attempt {
  target: RoutingTarget;
  model: string;
}

export interface ReActHooks {
  onRouteDecision?: (decision: RoutingDecision) => void;
  onAttempt?: (attempt: Attempt) => void;
  onText?: (delta: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
  onDegrade?: (from: Attempt, to: Attempt, reason: string) => void;
  onError?: (e: { code: SageErrorCode; message: string }) => void;
}

export interface ReActLoopDeps {
  router: ISageRouter;
  targets: TargetResolver;
  toolRouter: ToolDomainRouter;
  capability: CapabilityManifest;
  /** Fresh signals are read before EVERY cycle (battery/network drift). */
  readSignals: () => SageSignals;
  cloudCatalog?: CloudModelCatalog;
  maxIterations?: number;
  hooks?: ReActHooks;
}

export interface ReActRunOptions {
  signal?: AbortSignal;
  memories?: MemoryFragment[];
  tools?: unknown[];
}

export interface ReActResult {
  finalText: string;
  messages: Message[];
  iterations: number;
}

/**
 * ReActLoop (Constitutional Constraint 1): the device owns all reasoning and
 * tool orchestration. Each cycle re-routes via the SageRouter, runs the
 * chosen target (descending the graceful-degradation hierarchy on retryable
 * failure), dispatches any tool calls through the ToolDomainRouter, appends
 * results, and loops until the model stops requesting tools.
 */
export class ReActLoop {
  private readonly cloud: CloudModelCatalog;
  private readonly maxIterations: number;

  constructor(private readonly deps: ReActLoopDeps) {
    this.cloud = deps.cloudCatalog ?? DEFAULT_CLOUD_CATALOG;
    this.maxIterations = deps.maxIterations ?? 8;
  }

  async run(initialMessages: Message[], opts: ReActRunOptions = {}): Promise<ReActResult> {
    const signal = opts.signal ?? new AbortController().signal;
    const messages: Message[] = [...initialMessages];

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      let assistantText = '';
      const toolCalls: ToolCall[] = [];
      let surfaced: { code: SageErrorCode; message: string } | null = null;

      for await (const evt of this.runCycle(messages, opts, signal)) {
        switch (evt.type) {
          case 'text':
            assistantText += evt.delta;
            this.deps.hooks?.onText?.(evt.delta);
            break;
          case 'tool_call':
            toolCalls.push(evt.call);
            this.deps.hooks?.onToolCall?.(evt.call);
            break;
          case 'done':
            break;
          case 'error':
            surfaced = { code: evt.code, message: evt.message };
            this.deps.hooks?.onError?.(surfaced);
            break;
        }
      }

      if (surfaced) throw new ReActError(surfaced.code, surfaced.message);

      if (assistantText || toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: assistantText,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      }

      if (toolCalls.length === 0) {
        return { finalText: assistantText, messages, iterations: iteration };
      }

      // Dispatch every requested tool, append results, then loop.
      for (const call of toolCalls) {
        const result = await this.deps.toolRouter.dispatch(call, signal);
        this.deps.hooks?.onToolResult?.(result);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: result.content,
        });
      }
    }

    throw new ReActError('INTERNAL', `ReActLoop exceeded ${this.maxIterations} iterations`);
  }

  /** Run one inference cycle, descending the degradation hierarchy as needed. */
  private async *runCycle(
    messages: Message[],
    opts: ReActRunOptions,
    signal: AbortSignal,
  ): AsyncGenerator<InferenceEvent> {
    const decision = this.deps.router.route({
      signals: this.deps.readSignals(),
      capability: this.deps.capability,
    });
    this.deps.hooks?.onRouteDecision?.(decision);

    const descent = this.buildDescent(decision);
    let lastError: { code: SageErrorCode; message: string } | null = null;

    for (let a = 0; a < descent.length; a++) {
      const attempt = descent[a]!;
      this.deps.hooks?.onAttempt?.(attempt);

      const target = resolveTarget(this.deps.targets, attempt.target);
      const iterator = target
        .run(
          {
            model: attempt.model,
            messages,
            memories: opts.memories,
            tools: opts.tools,
          },
          signal,
        )
        [Symbol.asyncIterator]();

      const first = await iterator.next();
      const hasNext = a < descent.length - 1;

      // Empty stream → treat as a retryable failure.
      if (first.done) {
        lastError = { code: 'INTERNAL', message: 'empty inference stream' };
        if (hasNext) {
          this.deps.hooks?.onDegrade?.(attempt, descent[a + 1]!, lastError.message);
          continue;
        }
        break;
      }

      const firstEvt = first.value;
      if (firstEvt.type === 'error') {
        lastError = { code: firstEvt.code, message: firstEvt.message };
        if (firstEvt.retryable && hasNext) {
          this.deps.hooks?.onDegrade?.(attempt, descent[a + 1]!, firstEvt.message);
          continue; // descend the hierarchy
        }
        yield firstEvt; // non-retryable, or no tier left → surface
        return;
      }

      // Commit to this attempt: stream its first event and the remainder.
      yield firstEvt;
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        yield next.value;
      }
      return;
    }

    yield {
      type: 'error',
      code: lastError?.code ?? 'INTERNAL',
      message: lastError?.message ?? 'all routing tiers failed',
      retryable: false,
    };
  }

  /**
   * Graceful degradation hierarchy. Cloud decisions descend
   * cloud → cloud-efficient → local-default → local-efficient. Local decisions
   * NEVER escalate to cloud (they were chosen for offline/privacy reasons), so
   * they only fall back to the efficient local model.
   */
  private buildDescent(decision: RoutingDecision): Attempt[] {
    const attempts: Attempt[] = [];
    const push = (target: RoutingTarget, model: string) => {
      if (!attempts.some((x) => x.target === target && x.model === model)) {
        attempts.push({ target, model });
      }
    };

    if (decision.target === 'cloud') {
      // Honor the model the SageRouter chose as the entry point, then descend.
      push('cloud', decision.model);
      if (decision.model === this.cloud.capable) {
        push('cloud', this.cloud.efficient); // step down to the efficient cloud tier
      }
      push('local', this.bestLocal());
      push('local', LOCAL_MODELS.default);
    } else {
      // Local decisions never escalate to cloud (offline/privacy reasons).
      push('local', decision.model);
      push('local', LOCAL_MODELS.default);
    }
    return attempts;
  }

  private bestLocal(): string {
    const c = this.deps.capability;
    const has9B =
      c.supports9B && c.installedModels.some((m) => m.id === LOCAL_MODELS.capable && m.verified);
    return has9B ? LOCAL_MODELS.capable : LOCAL_MODELS.default;
  }
}
