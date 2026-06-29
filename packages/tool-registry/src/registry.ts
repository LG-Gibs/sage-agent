import type { ToolDomain, ToolName } from '@sage/shared-types';
import { TOOL_DEFINITIONS, type ToolDefinition } from './tools';

export class ToolRegistryError extends Error {}

/**
 * The authoritative two-domain tool registry.
 *
 * Constitutional Constraint 4: a tool registered as `mobile` must never be
 * executed on the server; a tool registered as `cloud` must never execute
 * without connectivity. This class is the single source of truth that the
 * ToolDomainRouter (Phase 3) consults to dispatch every tool_call.
 */
export class ToolRegistry {
  private readonly byName: Map<ToolName, ToolDefinition>;

  constructor(defs: readonly ToolDefinition[] = TOOL_DEFINITIONS) {
    this.byName = new Map();
    for (const def of defs) {
      if (this.byName.has(def.name)) {
        throw new ToolRegistryError(`Duplicate tool: ${def.name}`);
      }
      this.byName.set(def.name, def);
    }
  }

  get(name: ToolName): ToolDefinition | undefined {
    return this.byName.get(name);
  }

  /** Throws if the tool is unknown — callers should never guess a domain. */
  domainOf(name: ToolName): ToolDomain {
    const def = this.byName.get(name);
    if (!def) throw new ToolRegistryError(`Unknown tool: ${name}`);
    return def.domain;
  }

  isMobile(name: ToolName): boolean {
    return this.domainOf(name) === 'mobile';
  }

  isCloud(name: ToolName): boolean {
    return this.domainOf(name) === 'cloud';
  }

  byDomain(domain: ToolDomain): ToolDefinition[] {
    return [...this.byName.values()].filter((d) => d.domain === domain);
  }

  names(): ToolName[] {
    return [...this.byName.keys()];
  }

  /** Tool schemas formatted for an LLM `tools` parameter. */
  toLLMTools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }> {
    return [...this.byName.values()].map((d) => ({
      type: 'function',
      function: {
        name: d.name,
        description: d.description,
        parameters: d.parameters,
      },
    }));
  }

  /**
   * Runtime invariant check. Belt-and-suspenders alongside the compile-time
   * domain typing: every tool has a valid domain, every cloud tool declares an
   * offline_error path, every mobile tool declares native, and the 6/4 split
   * matches the spec's ten-tool registry.
   */
  assertIntegrity(): void {
    const mobile = this.byDomain('mobile');
    const cloud = this.byDomain('cloud');
    for (const d of this.byName.values()) {
      if (d.domain !== 'mobile' && d.domain !== 'cloud') {
        throw new ToolRegistryError(`Tool ${d.name} has invalid domain`);
      }
      if (d.domain === 'mobile' && d.offline !== 'native') {
        throw new ToolRegistryError(
          `Mobile tool ${d.name} must declare offline:'native'`,
        );
      }
      if (d.domain === 'cloud' && d.offline !== 'offline_error') {
        throw new ToolRegistryError(
          `Cloud tool ${d.name} must declare offline:'offline_error'`,
        );
      }
    }
    if (this.byName.size !== 10) {
      throw new ToolRegistryError(
        `Expected 10 registered tools, found ${this.byName.size}`,
      );
    }
    if (mobile.length !== 6 || cloud.length !== 4) {
      throw new ToolRegistryError(
        `Expected 6 mobile / 4 cloud tools, found ${mobile.length}/${cloud.length}`,
      );
    }
  }
}

/** Shared default instance built from the canonical definitions. */
export const defaultToolRegistry = new ToolRegistry();
