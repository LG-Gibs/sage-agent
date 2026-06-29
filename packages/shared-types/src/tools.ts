import type { SageErrorCode } from './errors';

/**
 * Constitutional Constraint 4 — THE TWO-DOMAIN TOOL REGISTRY IS AUTHORITATIVE.
 * Every tool is either mobile or cloud. This is binding, not a hint.
 */
export type ToolDomain = 'mobile' | 'cloud';

/** Mobile-domain tools: execute on-device. The server never sees args or results. */
export type MobileToolName =
  | 'execute_js' // QuickJS, isolated context
  | 'render_prototype' // sandboxed WebView HTML/JS/CSS
  | 'read_native_contacts' // Contacts read/search (Contacts / ContactsContract)
  | 'create_calendar_event' // EventKit / CalendarContract
  | 'query_calendar' // Calendar query (EventKit / CalendarContract) — Phase 6
  | 'set_reminder' // EventKit / AlarmManager
  | 'list_reminders' // Reminders list (EventKit / provider) — Phase 6
  | 'file_system' // sandboxed read/write/list (Files.app / SAF) — Phase 6
  | 'search_local_memory'; // sqlite-vec top-k retrieval

/** Cloud-domain tools: routed to POST /api/sage/tools/*. Require connectivity. */
export type CloudToolName =
  | 'web_search' // Tavily
  | 'fetch_webpage' // Jina Reader
  | 'execute_python' // E2B Firecracker microVM
  | 'deep_research'; // orchestrated multi-step browse

export type ToolName = MobileToolName | CloudToolName;

export interface ToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
  /**
   * Domain travels with the call so the ReActLoop and ToolDomainRouter never
   * have to infer it. The registry is the source of truth that stamps it.
   */
  domain: ToolDomain;
}

export interface ToolResult {
  tool_call_id: string;
  name: ToolName;
  /** Stringified payload appended verbatim to the message thread. */
  content: string;
  /** Present only on failure. Mirrors the OFFLINE / PERMISSION_DENIED contract. */
  error?: { code: SageErrorCode; message: string };
}

/** Convenience: the canonical OFFLINE envelope a cloud tool returns when the radio is down. */
export function offlineResult(call: ToolCall): ToolResult {
  return {
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({
      error: 'Device is offline; cloud tool unavailable',
      code: 'OFFLINE',
    }),
    error: { code: 'OFFLINE', message: 'Device is offline; cloud tool unavailable' },
  };
}

/** Canonical PERMISSION_DENIED envelope a native tool returns when the OS denies access. */
export function permissionDeniedResult(call: ToolCall, detail?: string): ToolResult {
  const message = detail ?? `Permission denied for ${call.name}`;
  return {
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ error: 'permission_denied', code: 'PERMISSION_DENIED' }),
    error: { code: 'PERMISSION_DENIED', message },
  };
}
