import { getQuickJS } from 'react-native-quickjs';
import {
  DEFAULT_LIMITS,
  type JsSandbox,
  type SandboxLimits,
  type SandboxResult,
} from '@sage/sandbox-core/manager';

/**
 * On-device QuickJS sandbox via the react-native-quickjs JSI binding. Mirrors
 * the WASM runner's isolation contract: a fresh context per execution, only a
 * capturing console.log injected, enforced memory/stack/time limits, and no
 * bridge to host app state (App Store 2.5.2-compliant).
 *
 * DEVICE-BOUND: requires the native binding; cannot run in CI. The WASM runner
 * (@sage/sandbox-core) is the verified reference implementation of the same
 * contract.
 */
export function createReactNativeQuickJsSandbox(): JsSandbox {
  return {
    async execute(code: string, limits?: SandboxLimits): Promise<SandboxResult> {
      const lim = { ...DEFAULT_LIMITS, ...limits };
      const QuickJS = await getQuickJS();
      const runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(lim.memoryBytes);
      runtime.setMaxStackSize(lim.maxStackBytes);

      const start = Date.now();
      const deadline = start + lim.timeoutMs;
      runtime.setInterruptHandler(() => Date.now() > deadline);

      const vm = runtime.newContext();
      const logs: string[] = [];
      const consoleObj = vm.newObject();
      const logFn = vm.newFunction('log', (...args) => {
        logs.push(args.map((a) => safeString(vm.dump(a))).join(' '));
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
          return {
            ok: false,
            logs,
            error: {
              name: typeof dumped?.name === 'string' ? dumped.name : 'Error',
              message: typeof dumped?.message === 'string' ? dumped.message : String(dumped),
            },
            durationMs: Date.now() - start,
          };
        }
        const value = vm.dump(result.value);
        result.value.dispose();
        return { ok: true, value, logs, durationMs: Date.now() - start };
      } finally {
        vm.dispose();
        runtime.dispose();
      }
    },
  };
}

function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
