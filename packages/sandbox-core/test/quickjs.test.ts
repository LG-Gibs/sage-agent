import { describe, it, expect } from 'vitest';
import type { ToolCall } from '@sage/shared-types';
import {
  createQuickJsWasmSandbox,
  runJsBenchmark,
  JS_BENCHMARK,
  SandboxManager,
  type CloudCodeExecutor,
} from '../src/index';

const sandbox = createQuickJsWasmSandbox();
const signal = new AbortController().signal;
const call = (name: ToolCall['name'], args: Record<string, unknown>): ToolCall => ({
  id: `tc_${name}`,
  name,
  arguments: args,
  domain: 'mobile',
});

describe('QuickJS sandbox — execution benchmark (≥99% pass rate gate)', () => {
  it('runs the full benchmark suite', async () => {
    const result = await runJsBenchmark(sandbox);
    if (result.rate < 0.99) {
      // eslint-disable-next-line no-console
      console.error('QuickJS benchmark failures:', JSON.stringify(result.failures, null, 2));
    }
    expect(result.total).toBe(JS_BENCHMARK.length);
    expect(result.rate).toBeGreaterThanOrEqual(0.99);
  });
});

describe('QuickJS sandbox — isolation (cannot reach host state)', () => {
  it('has no Node/host globals', async () => {
    const r = await sandbox.execute(
      'JSON.stringify([typeof process, typeof require, typeof fetch, typeof globalThis.SAGE_HOST])',
    );
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.value as string)).toEqual([
      'undefined',
      'undefined',
      'undefined',
      'undefined',
    ]);
  });

  it('cannot see a secret set on the Node host global', async () => {
    (globalThis as Record<string, unknown>).SAGE_HOST_SECRET = 'top-secret';
    try {
      const r = await sandbox.execute('typeof SAGE_HOST_SECRET');
      expect(r.value).toBe('undefined');
    } finally {
      delete (globalThis as Record<string, unknown>).SAGE_HOST_SECRET;
    }
  });

  it('captures console.log without host access', async () => {
    const r = await sandbox.execute('console.log("hello", 42); 7');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(7);
    expect(r.logs).toEqual(['hello 42']);
  });

  it('interrupts an infinite loop via the time limit', async () => {
    const r = await sandbox.execute('while(true){}', { timeoutMs: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('surfaces a thrown error as a failed result, not a host crash', async () => {
    const r = await sandbox.execute('throw new Error("boom")');
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain('boom');
  });

  it('contains runaway memory allocation under a low limit', async () => {
    const r = await sandbox.execute(
      '(()=>{const a=[]; for(;;){ a.push(new Array(100000).fill(0)); } })()',
      { memoryBytes: 16 * 1024 * 1024, timeoutMs: 2000 },
    );
    expect(r.ok).toBe(false); // OOM or timeout — either way, contained
  });
});

describe('SandboxManager — both paths', () => {
  const online = new SandboxManager({ jsSandbox: sandbox, isOnline: () => true });

  it('executes execute_js and returns the value + logs', async () => {
    const result = await online.executeJs(call('execute_js', { code: 'console.log("hi"); 2+2' }));
    const payload = JSON.parse(result.content);
    expect(payload.ok).toBe(true);
    expect(payload.value).toBe(4);
    expect(payload.logs).toEqual(['hi']);
  });

  it('execute_js surfaces a SANDBOX_ERROR on throw', async () => {
    const result = await online.executeJs(call('execute_js', { code: 'throw new Error("nope")' }));
    expect(result.error?.code).toBe('SANDBOX_ERROR');
  });

  it('render_prototype returns a sandboxed artifact', async () => {
    const result = online.renderPrototype(call('render_prototype', { html: '<h1>Hi</h1>', title: 'Demo' }));
    const artifact = JSON.parse(result.content);
    expect(artifact).toMatchObject({ type: 'prototype', sandboxed: true, title: 'Demo' });
  });

  it('execute_python returns OFFLINE when offline', async () => {
    const offline = new SandboxManager({ jsSandbox: sandbox, isOnline: () => false });
    const result = await offline.executePython(call('execute_python', { code: 'print(1)' }), signal);
    expect(result.error?.code).toBe('OFFLINE');
  });

  it('execute_python delegates to the cloud executor when online', async () => {
    let called = false;
    const cloudExecutor: CloudCodeExecutor = {
      async execute(code) {
        called = true;
        return { tool_call_id: 'x', name: 'execute_python', content: JSON.stringify({ stdout: code }) };
      },
    };
    const mgr = new SandboxManager({ jsSandbox: sandbox, cloudExecutor, isOnline: () => true });
    const result = await mgr.executePython(call('execute_python', { code: 'print(42)' }), signal);
    expect(called).toBe(true);
    expect(JSON.parse(result.content).stdout).toBe('print(42)');
  });
});
