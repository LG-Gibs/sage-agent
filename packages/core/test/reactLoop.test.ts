import { describe, it, expect, beforeAll } from 'vitest';
import type { SageSignals, CapabilityManifest, ToolCall, ToolName, ToolDomain } from '@sage/shared-types';
import {
  ReActLoop,
  ReActError,
  ToolDomainRouter,
  createSageRouter,
  createScriptedTarget,
  createFailingTarget,
  okMobileHandler,
  okCloudClient,
  cycle,
  buildCapabilityManifest,
  createMockCapabilityProbe,
  type InferenceEvent,
} from '../src/index';

const router = createSageRouter();
let capability: CapabilityManifest;

beforeAll(async () => {
  capability = await buildCapabilityManifest(
    createMockCapabilityProbe({
      installedModels: [
        { id: 'gemma-4-2b', path: '/2b.gguf', sizeBytes: 1, verified: true },
        { id: 'gemma-4-9b', path: '/9b.gguf', sizeBytes: 1, verified: true },
      ],
    }),
    { signalsReady: true },
  );
});

const CLOUD_SIGNALS: SageSignals = {
  network: 'good',
  power: 'normal',
  complexity: 'moderate',
  privacy: 'standard',
  preference: 'auto',
};

const mobileHandlers = {
  execute_js: okMobileHandler,
  render_prototype: okMobileHandler,
  read_native_contacts: okMobileHandler,
  create_calendar_event: okMobileHandler,
  set_reminder: okMobileHandler,
  search_local_memory: okMobileHandler,
};

function toolRouter(isOnline = true) {
  return new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => isOnline });
}

function call(name: ToolName, domain: ToolDomain): ToolCall {
  return { id: `tc_${name}`, name, arguments: { q: 'x' }, domain };
}

function buildLoop(cloudCycles: InferenceEvent[][], opts: { localCycles?: InferenceEvent[][]; signals?: SageSignals; maxIterations?: number; hooks?: ConstructorParameters<typeof ReActLoop>[0]['hooks'] } = {}) {
  return new ReActLoop({
    router,
    capability,
    readSignals: () => opts.signals ?? CLOUD_SIGNALS,
    targets: {
      cloud: createScriptedTarget(cloudCycles),
      local: createScriptedTarget(opts.localCycles ?? [cycle.text('local fallback answer')]),
    },
    toolRouter: toolRouter(),
    maxIterations: opts.maxIterations ?? 6,
    hooks: opts.hooks,
  });
}

describe('ReActLoop — 5 distinct multi-tool task types', () => {
  const tasks: Array<{ label: string; tool: ToolName; domain: ToolDomain }> = [
    { label: 'research', tool: 'web_search', domain: 'cloud' },
    { label: 'code execution', tool: 'execute_js', domain: 'mobile' },
    { label: 'contact lookup', tool: 'read_native_contacts', domain: 'mobile' },
    { label: 'calendar creation', tool: 'create_calendar_event', domain: 'mobile' },
    { label: 'RAG query', tool: 'search_local_memory', domain: 'mobile' },
  ];

  for (const task of tasks) {
    it(`completes a ${task.label} task end-to-end`, async () => {
      const loop = buildLoop([cycle.toolCall(call(task.tool, task.domain)), cycle.text('done answer')]);
      const result = await loop.run([{ role: 'user', content: `do ${task.label}` }]);
      expect(result.finalText).toBe('done answer');
      expect(result.messages.some((m) => m.role === 'tool' && m.name === task.tool)).toBe(true);
    });
  }
});

describe('ReActLoop — tool-loop completion rate (≥99%)', () => {
  it('completes 100% of a 25-scenario suite without error', async () => {
    let success = 0;
    const total = 25;
    for (let i = 0; i < total; i++) {
      const tool: [ToolName, ToolDomain] = i % 2 === 0 ? ['web_search', 'cloud'] : ['execute_js', 'mobile'];
      const cycles =
        i % 3 === 0
          ? [cycle.text('immediate answer')] // text-only
          : [cycle.toolCall(call(tool[0], tool[1])), cycle.text('answer after tool')];
      const loop = buildLoop(cycles);
      try {
        const r = await loop.run([{ role: 'user', content: `task ${i}` }]);
        if (r.finalText.length > 0) success += 1;
      } catch {
        /* counted as failure */
      }
    }
    expect(success / total).toBeGreaterThanOrEqual(0.99);
  });
});

describe('ReActLoop — graceful degradation', () => {
  it('falls back from a failing cloud target to local', async () => {
    const degrades: string[] = [];
    const loop = new ReActLoop({
      router,
      capability,
      readSignals: () => CLOUD_SIGNALS,
      targets: {
        cloud: createFailingTarget('UPSTREAM_ERROR'),
        local: createScriptedTarget([cycle.text('from local')]),
      },
      toolRouter: toolRouter(),
      hooks: { onDegrade: (from, to) => degrades.push(`${from.target}->${to.target}`) },
    });
    const result = await loop.run([{ role: 'user', content: 'hello' }]);
    expect(result.finalText).toBe('from local');
    expect(degrades.some((d) => d.endsWith('->local'))).toBe(true);
  });
});

describe('ReActLoop — guards', () => {
  it('throws ReActError when max iterations are exceeded (runaway tool loop)', async () => {
    const cloudCycles = Array.from({ length: 5 }, () => cycle.toolCall(call('web_search', 'cloud')));
    const loop = buildLoop(cloudCycles, { maxIterations: 3 });
    await expect(loop.run([{ role: 'user', content: 'loop forever' }])).rejects.toBeInstanceOf(ReActError);
  });

  it('surfaces a non-retryable error as a ReActError', async () => {
    const loop = new ReActLoop({
      router,
      capability,
      readSignals: () => CLOUD_SIGNALS,
      targets: {
        cloud: createScriptedTarget([[{ type: 'error', code: 'MODEL_NOT_ALLOWED', message: 'nope', retryable: false }]]),
        local: createScriptedTarget([cycle.text('unused')]),
      },
      toolRouter: toolRouter(),
    });
    await expect(loop.run([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      code: 'MODEL_NOT_ALLOWED',
    });
  });
});
