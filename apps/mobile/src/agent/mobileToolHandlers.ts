import type { MobileToolHandler } from '@sage/arbiter-core';
import type { MobileToolName, ToolCall } from '@sage/shared-types';

/**
 * Mobile-domain tool handlers. The orchestration (ReActLoop + ToolDomainRouter)
 * is complete in Phase 3; the concrete on-device implementations land in their
 * respective phases. Until then, handlers return a clean UNSUPPORTED ToolResult
 * the model can adapt to — never a crash.
 */
function pending(phase: string): MobileToolHandler {
  return async (call: ToolCall) => ({
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ error: `${call.name} arrives in ${phase}`, code: 'UNSUPPORTED' }),
    error: { code: 'UNSUPPORTED', message: `${call.name} not yet implemented (${phase})` },
  });
}

export const mobileToolHandlers: Partial<Record<MobileToolName, MobileToolHandler>> = {
  execute_js: pending('Phase 4 (Code Sandbox)'),
  render_prototype: pending('Phase 4 (Code Sandbox)'),
  search_local_memory: pending('Phase 5 (Search & Memory)'),
  read_native_contacts: pending('Phase 6 (Deep OS Integrations)'),
  create_calendar_event: pending('Phase 6 (Deep OS Integrations)'),
  set_reminder: pending('Phase 6 (Deep OS Integrations)'),
};
