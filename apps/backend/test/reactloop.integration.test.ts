import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ArbiterSignals } from '@sage/shared-types';
import {
  ReActLoop,
  ToolDomainRouter,
  createArbiterRouter,
  createCloudTarget,
  createScriptedTarget,
  cycle,
  okCloudClient,
  buildCapabilityManifest,
  createMockCapabilityProbe,
} from '@sage/arbiter-core';
import { createApp } from '../src/server';
import { loadConfig } from '../src/config';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const config = loadConfig({
    SAGE_UPSTREAM_PROVIDER: 'mock',
    SAGE_HEARTBEAT_MS: '0',
  } as NodeJS.ProcessEnv);
  const app = createApp(config);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => server?.close());

const CLOUD_SIGNALS: ArbiterSignals = {
  network: 'good',
  power: 'normal',
  complexity: 'moderate',
  privacy: 'standard',
  preference: 'auto',
};

describe('ReActLoop ↔ SAGE Backend v3 (real cloud target, SSE end-to-end)', () => {
  it('completes a cloud cycle via the live /api/sage/infer stream', async () => {
    const capability = await buildCapabilityManifest(createMockCapabilityProbe(), {
      signalsReady: true,
    });

    const loop = new ReActLoop({
      arbiter: createArbiterRouter(),
      capability,
      readSignals: () => CLOUD_SIGNALS,
      targets: {
        cloud: createCloudTarget({ baseUrl }),
        local: createScriptedTarget([cycle.text('unused local')]),
      },
      toolRouter: new ToolDomainRouter({
        mobileHandlers: {},
        cloudClient: okCloudClient,
        isOnline: () => true,
      }),
    });

    // A prompt without "search" so the mock upstream returns text + done (no tool call).
    const result = await loop.run([{ role: 'user', content: 'say hello' }]);

    // Router picked the cloud-efficient model; the backend (mock upstream) echoes it.
    expect(result.finalText).toContain('Mock response');
    expect(result.finalText).toContain('google/gemini-2.5-flash');
    expect(result.iterations).toBe(1);
  });

  it('surfaces a non-allowlisted model as MODEL_NOT_ALLOWED from the live backend', async () => {
    const capability = await buildCapabilityManifest(createMockCapabilityProbe(), {
      signalsReady: true,
    });
    // Force a model the backend allowlist (Constraint 2) will reject with 403.
    const loop = new ReActLoop({
      arbiter: createArbiterRouter({ cloud: { efficient: 'evil/model', capable: 'evil/model' } }),
      capability,
      readSignals: () => CLOUD_SIGNALS,
      targets: {
        cloud: createCloudTarget({ baseUrl }),
        local: createScriptedTarget([cycle.text('local')]),
      },
      toolRouter: new ToolDomainRouter({ mobileHandlers: {}, cloudClient: okCloudClient, isOnline: () => true }),
    });
    // 403 MODEL_NOT_ALLOWED is non-retryable → surfaced (no silent fallback).
    await expect(loop.run([{ role: 'user', content: 'say hello' }])).rejects.toMatchObject({
      code: 'MODEL_NOT_ALLOWED',
    });
  });
});
