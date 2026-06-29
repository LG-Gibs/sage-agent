import type { MobileToolHandler } from '@sage/arbiter-core';
import type { MobileToolName, ToolCall } from '@sage/shared-types';
import { SandboxManager } from '@sage/sandbox-core/manager';
import { toMemoryFragments } from '@sage/memory-core';
import { createReactNativeQuickJsSandbox } from '../sandbox/reactNativeQuickJs';
import { deviceMemory } from '../memory/deviceMemory';
import { osToolHandlers } from '../os/osTools';

/**
 * Mobile-domain tool handlers for the ToolDomainRouter. Every registered mobile
 * tool now has a real on-device handler:
 *  - Phase 4: execute_js + render_prototype via the SandboxManager (QuickJS).
 *  - Phase 5: search_local_memory via the sqlite-vec store.
 *  - Phase 6: contacts/calendar/reminders/file_system via the native SageOs
 *    bridge (osToolHandlers), with clean PERMISSION_DENIED handling.
 */

// One SandboxManager (warm QuickJS) shared across tool calls.
const sandbox = new SandboxManager({
  jsSandbox: createReactNativeQuickJsSandbox(),
  isOnline: () => true,
});
const sandboxHandlers = sandbox.mobileHandlers();

// Phase 5 — sqlite-vec RAG retrieval, on-device.
const searchLocalMemory: MobileToolHandler = async (call: ToolCall) => {
  const args = call.arguments as Record<string, unknown>;
  const query = typeof args.query === 'string' ? args.query : '';
  const topK = typeof args.topK === 'number' ? args.topK : 5;
  const hits = await deviceMemory().recall(query, topK);
  return {
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ memories: toMemoryFragments(hits) }),
  };
};

export const mobileToolHandlers: Partial<Record<MobileToolName, MobileToolHandler>> = {
  execute_js: sandboxHandlers.execute_js, // Phase 4 — QuickJS isolated context
  render_prototype: sandboxHandlers.render_prototype, // Phase 4 — sandboxed WebView
  search_local_memory: searchLocalMemory, // Phase 5 — sqlite-vec RAG
  ...osToolHandlers, // Phase 6 — native Contacts / Calendar / Reminders / Files
};
