import { describe, it, expect } from 'vitest';
import type { MobileToolName, ToolCall, ToolDomain, ToolName } from '@sage/shared-types';
import { defaultToolRegistry } from '@sage/tool-registry';
import { ToolDomainRouter, okMobileHandler, okCloudClient } from '../src/index';

const MOBILE: MobileToolName[] = [
  'execute_js',
  'render_prototype',
  'read_native_contacts',
  'create_calendar_event',
  'set_reminder',
  'search_local_memory',
];

const mobileHandlers = Object.fromEntries(MOBILE.map((n) => [n, okMobileHandler]));

function makeCall(name: ToolName, domain: ToolDomain = 'mobile'): ToolCall {
  return { id: `tc_${name}`, name, arguments: {}, domain };
}

const signal = new AbortController().signal;

describe('ToolDomainRouter — dispatch by authoritative registry domain', () => {
  it('routes all 10 tools to the correct domain', async () => {
    const router = new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => true });
    for (const name of defaultToolRegistry.names()) {
      const domain = defaultToolRegistry.domainOf(name);
      const result = await router.dispatch(makeCall(name, domain), signal);
      expect(result.error).toBeUndefined();
      const payload = JSON.parse(result.content);
      expect(payload.ok).toBe(true);
      if (domain === 'cloud') expect(payload.cloud).toBe(true);
    }
  });

  it('mobile tools work offline (on-device)', async () => {
    const router = new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => false });
    const result = await router.dispatch(makeCall('execute_js'), signal);
    expect(result.error).toBeUndefined();
  });

  it('cloud tools return OFFLINE when offline', async () => {
    const router = new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => false });
    const result = await router.dispatch(makeCall('web_search', 'cloud'), signal);
    expect(result.error?.code).toBe('OFFLINE');
  });

  it('uses the REGISTRY domain, not the domain stamped on the call', async () => {
    const router = new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => false });
    // Model lies: claims web_search is mobile. Registry says cloud → OFFLINE offline.
    const result = await router.dispatch(makeCall('web_search', 'mobile'), signal);
    expect(result.error?.code).toBe('OFFLINE');
  });

  it('unknown tool → UNSUPPORTED', async () => {
    const router = new ToolDomainRouter({ mobileHandlers, cloudClient: okCloudClient, isOnline: () => true });
    const result = await router.dispatch(makeCall('frobnicate' as ToolName), signal);
    expect(result.error?.code).toBe('UNSUPPORTED');
  });

  it('missing mobile handler → UNSUPPORTED', async () => {
    const router = new ToolDomainRouter({ mobileHandlers: {}, cloudClient: okCloudClient, isOnline: () => true });
    const result = await router.dispatch(makeCall('execute_js'), signal);
    expect(result.error?.code).toBe('UNSUPPORTED');
  });
});
