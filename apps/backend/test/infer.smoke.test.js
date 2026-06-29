import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/server';
import { loadConfig } from '../src/config';
import { decodeSseStream } from '@sage/sse-contract';
let server;
let base = '';
beforeAll(async () => {
    const config = loadConfig({
        SAGE_UPSTREAM_PROVIDER: 'mock',
        SAGE_HEARTBEAT_MS: '0', // one immediate heartbeat, no interval -> deterministic
        SAGE_ALLOWED_MODELS: 'mock-cloud',
    });
    const app = createApp(config);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
});
afterAll(() => {
    server?.close();
});
async function postInfer(body) {
    const res = await fetch(`${base}/api/sage/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
        return { status: res.status, contentType, events: [], json: await res.json() };
    }
    const events = [];
    for await (const evt of decodeSseStream(res.body)) {
        events.push(evt);
    }
    return { status: res.status, contentType, events };
}
describe('SAGE Backend v3 — /health', () => {
    it('reports service + provider', async () => {
        const res = await fetch(`${base}/health`);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true, provider: 'mock' });
    });
});
describe('SAGE Backend v3 — POST /api/sage/infer (stateless cycle)', () => {
    it('streams heartbeat -> chunks -> done', async () => {
        const { contentType, events } = await postInfer({
            model: 'mock-cloud',
            messages: [{ role: 'user', content: 'hello sage' }],
        });
        expect(contentType).toContain('text/event-stream');
        // First event flushed is the immediate heartbeat.
        expect(events[0]).toEqual({ type: 'heartbeat', ts: expect.any(Number) });
        const chunks = events.filter((e) => e.type === 'chunk');
        expect(chunks.length).toBeGreaterThan(0);
        const last = events.at(-1);
        expect(last?.type).toBe('done');
        if (last?.type === 'done') {
            expect(last.model).toBe('mock-cloud');
            expect(last.usage.total_tokens).toBeGreaterThan(0);
        }
    });
    it('emits a domain-stamped cloud tool_call when the prompt warrants it', async () => {
        const { events } = await postInfer({
            model: 'mock-cloud',
            messages: [{ role: 'user', content: 'please search for the latest on sage' }],
        });
        const toolCall = events.find((e) => e.type === 'tool_call');
        expect(toolCall).toBeDefined();
        if (toolCall?.type === 'tool_call') {
            expect(toolCall.name).toBe('web_search');
            expect(toolCall.domain).toBe('cloud');
        }
    });
    it('injects memories without crashing and still completes the cycle', async () => {
        const { events } = await postInfer({
            model: 'mock-cloud',
            messages: [{ role: 'user', content: 'summarize my notes' }],
            memories: [
                { id: 'm1', text: 'User prefers concise replies', score: 0.91 },
                { id: 'm2', text: 'User timezone is Africa/Johannesburg' },
            ],
        });
        expect(events.at(-1)?.type).toBe('done');
    });
});
describe('SAGE Backend v3 — guards (Constraint 2 allowlist, validation)', () => {
    it('rejects a model not on the allowlist with MODEL_NOT_ALLOWED', async () => {
        const { status, json } = await postInfer({
            model: 'evil/untrusted-model',
            messages: [{ role: 'user', content: 'hi' }],
        });
        expect(status).toBe(403);
        expect(json).toMatchObject({ error: { code: 'MODEL_NOT_ALLOWED' } });
    });
    it('rejects a malformed request with INVALID_REQUEST', async () => {
        const { status, json } = await postInfer({ model: 'mock-cloud', messages: [] });
        expect(status).toBe(400);
        expect(json).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    });
});
//# sourceMappingURL=infer.smoke.test.js.map