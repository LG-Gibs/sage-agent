import type { MobileToolHandler } from '@sage/arbiter-core';
import type { MobileToolName, ToolCall } from '@sage/shared-types';
import { SandboxManager } from '@sage/sandbox-core/manager';
import { createReactNativeQuickJsSandbox } from '../sandbox/reactNativeQuickJs';

/**
 * Mobile-domain tool handlers for the ToolDomainRouter.
 *
 * Phase 4 wires execute_js + render_prototype to the real SandboxManager
 * (QuickJS isolated context / sandboxed WebView packaging). The remaining
 * native tools land in their phases and return a clean UNSUPPORTED ToolResult
 * the model can adapt to until then — never a crash.
 */
function pending(phase: string): MobileToolHandler {
  return async (call: ToolCall) => ({
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ error: `${call.name} arrives in ${phase}`, code: 'UNSUPPORTED' }),
    error: { code: 'UNSUPPORTED', message: `${call.name} not yet implemented (${phase})` },
  });
}

// One SandboxManager (warm QuickJS) shared across tool calls.
const sandbox = new SandboxManager({
  jsSandbox: createReactNativeQuickJsSandbox(),
  isOnline: () => true,
});
const sandboxHandlers = sandbox.mobileHandlers();

export const mobileToolHandlers: Partial<Record<MobileToolName, MobileToolHandler>> = {
  execute_js: sandboxHandlers.execute_js, // Phase 4 — QuickJS isolated context
  render_prototype: sandboxHandlers.render_prototype, // Phase 4 — sandboxed WebView
  search_local_memory: pending('Phase 5 (Search & Memory)'),
  read_native_contacts: pending('Phase 6 (Deep OS Integrations)'),
  create_calendar_event: pending('Phase 6 (Deep OS Integrations)'),
  set_reminder: pending('Phase 6 (Deep OS Integrations)'),
};
