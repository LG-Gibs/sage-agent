import type { CloudToolClient } from '@sage/core';
import type { ToolCall, ToolResult } from '@sage/shared-types';

const ROUTE: Record<string, string> = {
  web_search: 'search',
  fetch_webpage: 'fetch',
  execute_python: 'execute',
  deep_research: 'research',
};

/**
 * Calls the SAGE Backend v3 cloud tool runtime (POST /api/sage/tools/*). Only
 * reached for cloud-domain tools when online (the ToolDomainRouter enforces
 * the OFFLINE envelope before this is invoked).
 */
export function createCloudToolClient(
  baseUrl: string,
  sessionToken?: string,
): CloudToolClient {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async call(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
      const path = ROUTE[call.name] ?? call.name;
      const res = await fetch(`${root}/api/sage/tools/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify(call.arguments),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      return {
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(data),
        ...(res.ok ? {} : { error: { code: 'UPSTREAM_ERROR', message: `tool ${res.status}` } }),
      };
    },
  };
}
