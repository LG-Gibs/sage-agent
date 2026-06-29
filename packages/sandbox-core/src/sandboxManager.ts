import { offlineResult, type ToolCall, type ToolResult } from '@sage/shared-types';
import type { JsSandbox } from './jsSandbox';

/** Executes Python in the cloud (E2B Firecracker) via the backend tool route. */
export interface CloudCodeExecutor {
  execute(code: string, signal: AbortSignal): Promise<ToolResult>;
}

/** Sandboxed HTML/JS/CSS prototype descriptor handed to the on-device WebView. */
export interface PrototypeArtifact {
  type: 'prototype';
  title?: string;
  html: string;
  /** Always true — rendered in a locked-down WebView (no native bridge). */
  sandboxed: true;
}

export interface SandboxManagerDeps {
  /** Local QuickJS sandbox (WASM in tests, react-native-quickjs on device). */
  jsSandbox: JsSandbox;
  /** Cloud Python executor; absent/offline → execute_python returns OFFLINE. */
  cloudExecutor?: CloudCodeExecutor;
  isOnline: () => boolean;
}

function arg(call: ToolCall, key: string): string {
  const v = (call.arguments as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

/**
 * SandboxManager — orchestrates both execution paths (spec Phase 4):
 *  - local: QuickJS isolated context for execute_js (mobile domain), and
 *    render_prototype packaging for the sandboxed WebView;
 *  - cloud: execute_python via E2B Firecracker (cloud domain), returning the
 *    OFFLINE envelope when there's no connectivity.
 */
export class SandboxManager {
  constructor(private readonly deps: SandboxManagerDeps) {}

  async executeJs(call: ToolCall): Promise<ToolResult> {
    const r = await this.deps.jsSandbox.execute(arg(call, 'code'));
    return {
      tool_call_id: call.id,
      name: call.name,
      content: JSON.stringify({
        ok: r.ok,
        value: r.value,
        logs: r.logs,
        error: r.error,
        durationMs: r.durationMs,
      }),
      ...(r.ok ? {} : { error: { code: 'SANDBOX_ERROR', message: r.error?.message ?? 'execution error' } }),
    };
  }

  renderPrototype(call: ToolCall): ToolResult {
    const artifact: PrototypeArtifact = {
      type: 'prototype',
      title: arg(call, 'title') || undefined,
      html: arg(call, 'html'),
      sandboxed: true,
    };
    return { tool_call_id: call.id, name: call.name, content: JSON.stringify(artifact) };
  }

  async executePython(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    if (!this.deps.isOnline() || !this.deps.cloudExecutor) return offlineResult(call);
    return this.deps.cloudExecutor.execute(arg(call, 'code'), signal);
  }

  /** Mobile-domain handlers for the ToolDomainRouter (replaces Phase 3 stubs). */
  mobileHandlers() {
    return {
      execute_js: (call: ToolCall) => this.executeJs(call),
      render_prototype: async (call: ToolCall) => this.renderPrototype(call),
    };
  }
}
