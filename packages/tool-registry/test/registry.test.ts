import { describe, it, expect } from 'vitest';
import {
  ToolRegistry,
  defaultToolRegistry,
  TOOL_DEFINITIONS,
} from '../src/index';
import type { ToolName } from '@sage/shared-types';

const EXPECTED_MOBILE: ToolName[] = [
  'execute_js',
  'render_prototype',
  'read_native_contacts',
  'create_calendar_event',
  'query_calendar',
  'set_reminder',
  'list_reminders',
  'file_system',
  'search_local_memory',
];

const EXPECTED_CLOUD: ToolName[] = [
  'web_search',
  'fetch_webpage',
  'execute_python',
  'deep_research',
];

describe('ToolRegistry — two-domain integrity (Constitutional Constraint 4)', () => {
  it('registers 9 mobile + 4 cloud tools (13 total after Phase 6)', () => {
    expect(defaultToolRegistry.names()).toHaveLength(13);
    expect(defaultToolRegistry.byDomain('mobile')).toHaveLength(9);
    expect(defaultToolRegistry.byDomain('cloud')).toHaveLength(4);
  });

  it('passes the runtime integrity assertion', () => {
    expect(() => defaultToolRegistry.assertIntegrity()).not.toThrow();
  });

  it('maps each tool to the correct domain', () => {
    for (const name of EXPECTED_MOBILE) {
      expect(defaultToolRegistry.domainOf(name)).toBe('mobile');
      expect(defaultToolRegistry.isMobile(name)).toBe(true);
    }
    for (const name of EXPECTED_CLOUD) {
      expect(defaultToolRegistry.domainOf(name)).toBe('cloud');
      expect(defaultToolRegistry.isCloud(name)).toBe(true);
    }
  });

  it('declares offline behavior consistent with the domain', () => {
    for (const def of TOOL_DEFINITIONS) {
      if (def.domain === 'mobile') expect(def.offline).toBe('native');
      else expect(def.offline).toBe('offline_error');
    }
  });

  it('throws on an unknown tool rather than guessing a domain', () => {
    expect(() => defaultToolRegistry.domainOf('does_not_exist' as ToolName)).toThrow(
      /Unknown tool/,
    );
  });

  it('detects a corrupted registry (a domain emptied of tools)', () => {
    const broken = new ToolRegistry(TOOL_DEFINITIONS.filter((d) => d.domain !== 'cloud'));
    expect(() => broken.assertIntegrity()).toThrow(/both domains/);
  });

  it('rejects a mobile tool mislabeled with a cloud offline path', () => {
    const corrupt = TOOL_DEFINITIONS.map((d) =>
      d.name === 'execute_js' ? { ...d, offline: 'offline_error' as const } : d,
    );
    const reg = new ToolRegistry(corrupt);
    expect(() => reg.assertIntegrity()).toThrow(/must declare offline:'native'/);
  });

  it('exposes LLM-formatted tool schemas for every registered tool', () => {
    const tools = defaultToolRegistry.toLLMTools();
    expect(tools).toHaveLength(13);
    expect(tools[0]).toHaveProperty('function.parameters');
  });
});
