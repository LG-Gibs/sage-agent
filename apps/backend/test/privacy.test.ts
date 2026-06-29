import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server';
import { loadConfig } from '../src/config';

let server: Server;
let base = '';

beforeAll(async () => {
  const config = loadConfig({
    SAGE_UPSTREAM_PROVIDER: 'mock',
    SAGE_HEARTBEAT_MS: '0',
    SAGE_ALLOWED_MODELS: 'mock-cloud',
  } as NodeJS.ProcessEnv);
  const app = createApp(config);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe('Privacy audit (Constraint 5: memory text never logged)', () => {
  it('logs memory COUNT only — never memory content', async () => {
    const SECRET = 'PASSPORT-NUMBER-X7Q9-DO-NOT-LOG';
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    try {
      const res = await fetch(`${base}/api/sage/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-cloud',
          messages: [{ role: 'user', content: 'what is my passport number' }],
          memories: [
            { id: 'm1', text: SECRET, score: 0.99 },
            { id: 'm2', text: 'another private detail', score: 0.8 },
          ],
        }),
      });
      // Drain the SSE stream so the request completes and logging fires.
      await res.text();
    } finally {
      spy.mockRestore();
    }

    const all = logged.join('\n');
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain('another private detail');
    // The count IS logged.
    expect(all).toMatch(/memories=2/);
  });
});
