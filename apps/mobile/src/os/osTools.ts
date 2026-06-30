import {
  permissionDeniedResult,
  type MobileToolName,
  type ToolCall,
  type ToolResult,
} from '@sage/shared-types';
import type { MobileToolHandler } from '@sage/core';
import { getSageOs, isPermissionError } from './sageOs';
import type { SageOsNativeModule } from '../../modules/sage-os';

type Args = Record<string, unknown>;
const str = (a: Args, k: string): string => (typeof a[k] === 'string' ? (a[k] as string) : '');
const strOrNull = (a: Args, k: string): string | null => (typeof a[k] === 'string' ? (a[k] as string) : null);
const num = (a: Args, k: string, d: number): number => (typeof a[k] === 'number' ? (a[k] as number) : d);
const bool = (a: Args, k: string, d: boolean): boolean => (typeof a[k] === 'boolean' ? (a[k] as boolean) : d);

function ok(call: ToolCall, data: unknown): ToolResult {
  return { tool_call_id: call.id, name: call.name, content: JSON.stringify(data) };
}
function unsupported(call: ToolCall): ToolResult {
  return {
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ error: 'native module unavailable', code: 'UNSUPPORTED' }),
    error: { code: 'UNSUPPORTED', message: 'SageOs native module not linked' },
  };
}
function failed(call: ToolCall, e: unknown): ToolResult {
  const message = e instanceof Error ? e.message : String(e);
  return {
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ error: message, code: 'INTERNAL' }),
    error: { code: 'INTERNAL', message },
  };
}

/** Wraps a native call: maps permission denials to PERMISSION_DENIED, never throws. */
function handler(fn: (os: SageOsNativeModule, a: Args) => Promise<unknown>): MobileToolHandler {
  return async (call: ToolCall) => {
    const os = getSageOs();
    if (!os) return unsupported(call);
    try {
      return ok(call, await fn(os, call.arguments as Args));
    } catch (e) {
      if (isPermissionError(e)) return permissionDeniedResult(call, (e as Error).message);
      return failed(call, e);
    }
  };
}

/** Phase 6 native OS tool handlers, dispatched only via the ToolDomainRouter. */
export const osToolHandlers: Partial<Record<MobileToolName, MobileToolHandler>> = {
  read_native_contacts: handler((os, a) => os.contactsRead(strOrNull(a, 'query'), num(a, 'limit', 20))),
  create_calendar_event: handler((os, a) =>
    os.calendarCreate(str(a, 'title'), str(a, 'startISO'), str(a, 'endISO'), strOrNull(a, 'location'), strOrNull(a, 'notes')),
  ),
  query_calendar: handler((os, a) => os.calendarQuery(str(a, 'startISO'), str(a, 'endISO'))),
  set_reminder: handler((os, a) => os.reminderCreate(str(a, 'title'), strOrNull(a, 'dueISO'), strOrNull(a, 'notes'))),
  list_reminders: handler((os, a) => os.reminderList(bool(a, 'includeCompleted', false), num(a, 'limit', 50))),
  file_system: handler((os, a) => {
    const op = str(a, 'op');
    if (op === 'read') return os.fileRead(str(a, 'path'));
    if (op === 'write') return os.fileWrite(str(a, 'path'), str(a, 'content'));
    return os.fileList(str(a, 'path'));
  }),
};
