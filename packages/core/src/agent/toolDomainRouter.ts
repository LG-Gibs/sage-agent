import {
  offlineResult,
  type SageErrorCode,
  type ToolCall,
  type ToolResult,
  type MobileToolName,
} from '@sage/shared-types';
import { ToolRegistry, defaultToolRegistry } from '@sage/tool-registry';

export type MobileToolHandler = (
  call: ToolCall,
  signal: AbortSignal,
) => Promise<ToolResult>;

export interface CloudToolClient {
  call(call: ToolCall, signal: AbortSignal): Promise<ToolResult>;
}

export interface ToolDomainRouterDeps {
  registry?: ToolRegistry;
  mobileHandlers: Partial<Record<MobileToolName, MobileToolHandler>>;
  cloudClient: CloudToolClient;
  /** Reads the live network signal — true when connectivity is available. */
  isOnline: () => boolean;
}

/**
 * ToolDomainRouter (Constitutional Constraint 4). Dispatches every tool_call by
 * the domain declared in the AUTHORITATIVE registry — not by the domain the
 * model put on the call — so a model can never trick the device into running a
 * cloud tool locally or vice-versa.
 *
 *  - mobile tools execute on-device (server never sees args/results)
 *  - cloud tools require connectivity; when offline they return the OFFLINE
 *    envelope immediately and the ReActLoop lets the model adapt.
 */
export class ToolDomainRouter {
  private readonly registry: ToolRegistry;

  constructor(private readonly deps: ToolDomainRouterDeps) {
    this.registry = deps.registry ?? defaultToolRegistry;
  }

  async dispatch(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    let domain;
    try {
      domain = this.registry.domainOf(call.name); // authoritative
    } catch {
      return errorResult(call, 'UNSUPPORTED', `Unknown tool: ${call.name}`);
    }

    if (domain === 'mobile') {
      const handler = this.deps.mobileHandlers[call.name as MobileToolName];
      if (!handler) {
        return errorResult(call, 'UNSUPPORTED', `No handler for ${call.name}`);
      }
      try {
        return await handler(call, signal);
      } catch (err) {
        return errorResult(
          call,
          'INTERNAL',
          err instanceof Error ? err.message : 'mobile tool failed',
        );
      }
    }

    // Cloud domain.
    if (!this.deps.isOnline()) {
      return offlineResult(call);
    }
    try {
      return await this.deps.cloudClient.call(call, signal);
    } catch (err) {
      return errorResult(
        call,
        'UPSTREAM_ERROR',
        err instanceof Error ? err.message : 'cloud tool failed',
      );
    }
  }
}

function errorResult(
  call: ToolCall,
  code: SageErrorCode,
  message: string,
): ToolResult {
  return {
    tool_call_id: call.id,
    name: call.name,
    content: JSON.stringify({ error: message, code }),
    error: { code, message },
  };
}
