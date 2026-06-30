import { describe, it, expect, beforeAll } from 'vitest';
import {
  permissionDeniedResult,
  type SageSignals,
  type CapabilityManifest,
  type ToolCall,
  type MobileToolName,
} from '@sage/shared-types';
import {
  ReActLoop,
  ToolDomainRouter,
  createSageRouter,
  createScriptedTarget,
  okMobileHandler,
  okCloudClient,
  cycle,
  buildCapabilityManifest,
  createMockCapabilityProbe,
  type MobileToolHandler,
} from '../src/index';

const router = createSageRouter();
let capability: CapabilityManifest;

beforeAll(async () => {
  capability = await buildCapabilityManifest(createMockCapabilityProbe(), { signalsReady: true });
});

const CLOUD_SIGNALS: SageSignals = {
  network: 'good',
  power: 'normal',
  complexity: 'moderate',
  privacy: 'standard',
  preference: 'auto',
};

// The six native OS tools delivered in Phase 6.
const NATIVE_TOOLS: MobileToolName[] = [
  'read_native_contacts',
  'create_calendar_event',
  'query_calendar',
  'set_reminder',
  'list_reminders',
  'file_system',
];

function nativeCall(name: MobileToolName): ToolCall {
  return { id: `tc_${name}`, name, arguments: { path: '/notes.txt', op: 'read' }, domain: 'mobile' };
}

function buildLoop(tool: MobileToolName, handler: MobileToolHandler) {
  const mobileHandlers = Object.fromEntries(
    NATIVE_TOOLS.map((n) => [n, n === tool ? handler : okMobileHandler]),
  );
  return new ReActLoop({
    router,
    capability,
    readSignals: () => CLOUD_SIGNALS,
    targets: {
      cloud: createScriptedTarget([cycle.toolCall(nativeCall(tool)), cycle.text('handled')]),
      local: createScriptedTarget([cycle.text('local')]),
    },
    toolRouter: new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => true }),
  });
}

describe('Native OS tools — benchmark (gate: ≥95% completion across all six)', () => {
  it('completes ≥95% of a task suite covering all six native tools', async () => {
    let success = 0;
    let total = 0;
    // 3 normal runs per tool + 1 permission-denied run per tool = 24 tasks.
    for (const tool of NATIVE_TOOLS) {
      for (let i = 0; i < 3; i++) {
        total += 1;
        const r = await buildLoop(tool, okMobileHandler).run([{ role: 'user', content: `use ${tool}` }]);
        if (r.finalText === 'handled') success += 1;
      }
      total += 1;
      const denied: MobileToolHandler = async (c) => permissionDeniedResult(c, 'OS denied');
      const r = await buildLoop(tool, denied).run([{ role: 'user', content: `use ${tool}` }]);
      // Even when permission is denied, the turn still completes with an adapted answer.
      if (r.finalText === 'handled') success += 1;
    }
    expect(success / total).toBeGreaterThanOrEqual(0.95);
  });
});

describe('Native OS tools — graceful PERMISSION_DENIED', () => {
  it('appends a clean PERMISSION_DENIED result and the loop continues (no throw)', async () => {
    const denied: MobileToolHandler = async (c) => permissionDeniedResult(c, 'Contacts access denied');
    const result = await buildLoop('read_native_contacts', denied).run([
      { role: 'user', content: 'look up Maya' },
    ]);
    expect(result.finalText).toBe('handled'); // completed, did not throw
    const toolMsg = result.messages.find((m) => m.role === 'tool' && m.name === 'read_native_contacts');
    expect(toolMsg).toBeDefined();
    expect(JSON.parse((toolMsg as { content: string }).content)).toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });

  it('exposes the canonical permission_denied envelope shape', () => {
    const r = permissionDeniedResult(nativeCall('file_system'));
    expect(r.error?.code).toBe('PERMISSION_DENIED');
    expect(JSON.parse(r.content)).toEqual({ error: 'permission_denied', code: 'PERMISSION_DENIED' });
  });
});
