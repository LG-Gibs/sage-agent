import { getQuickJS, type QuickJSWASMModule } from 'quickjs-emscripten';
import {
  DEFAULT_LIMITS,
  type JsSandbox,
  type SandboxLimits,
  type SandboxResult,
} from './jsSandbox';

let modulePromise: Promise<QuickJSWASMModule> | null = null;
function quickjs(): Promise<QuickJSWASMModule> {
  return (modulePromise ??= getQuickJS());
}

export interface QuickJsSandboxOptions {
  /**
   * Pre-built QuickJS WASM module. In Node/CI this is omitted and the default
   * `getQuickJS()` loads the wasm from disk. In the browser, a singlefile
   * (embedded-wasm) variant module is injected so no runtime fetch is needed —
   * the execute() logic below is identical either way.
   */
  module?: QuickJSWASMModule;
}

/**
 * QuickJS sandbox backed by the Emscripten WASM build. Runs in Node, CI, and
 * web — used for the benchmark and isolation tests, and (with an injected
 * browser module) the interactive preview. Each execute() spins a fresh
 * runtime + context (no shared state), injects only a capturing console.log,
 * and enforces memory/stack/time limits. There is NO bridge to the host:
 * process, require, fetch, and any host globals are simply absent.
 */
export function createQuickJsWasmSandbox(opts: QuickJsSandboxOptions = {}): JsSandbox {
  return {
    async execute(code: string, limits?: SandboxLimits): Promise<SandboxResult> {
      const lim = { ...DEFAULT_LIMITS, ...limits };
      const QuickJS = opts.module ?? (await quickjs());
      const runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(lim.memoryBytes);
      runtime.setMaxStackSize(lim.maxStackBytes);

      const start = Date.now();
      const deadline = start + lim.timeoutMs;
      runtime.setInterruptHandler(() => Date.now() > deadline);

      const vm = runtime.newContext();
      const logs: string[] = [];

      // Inject a controlled console.log — captures strings only, no host access.
      const consoleObj = vm.newObject();
      const logFn = vm.newFunction('log', (...args) => {
        logs.push(args.map((a) => stringify(vm.dump(a))).join(' '));
      });
      vm.setProp(consoleObj, 'log', logFn);
      vm.setProp(vm.global, 'console', consoleObj);
      logFn.dispose();
      consoleObj.dispose();

      try {
        const result = vm.evalCode(code);
        if (result.error) {
          const dumped = vm.dump(result.error);
          result.error.dispose();
          return { ok: false, logs, error: toError(dumped), durationMs: Date.now() - start };
        }
        const value = vm.dump(result.value);
        result.value.dispose();
        return { ok: true, value, logs, durationMs: Date.now() - start };
      } catch (e) {
        return {
          ok: false,
          logs,
          error: { name: 'HostError', message: e instanceof Error ? e.message : String(e) },
          durationMs: Date.now() - start,
        };
      } finally {
        vm.dispose();
        runtime.dispose();
      }
    },
  };
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function toError(dumped: unknown): { name: string; message: string } {
  if (dumped && typeof dumped === 'object') {
    const o = dumped as { name?: unknown; message?: unknown };
    return {
      name: typeof o.name === 'string' ? o.name : 'Error',
      message: typeof o.message === 'string' ? o.message : JSON.stringify(dumped),
    };
  }
  return { name: 'Error', message: String(dumped) };
}
