/**
 * Platform-agnostic sandboxed JS execution contract.
 *
 * Implemented by the WASM QuickJS runner (Node/tests/web) and, on device, by a
 * react-native-quickjs JSI binding. Both honor the same isolation guarantees:
 * a fresh context per execution, no host bindings (no process/require/fetch),
 * and enforced memory + time limits. This is the App Store 2.5.2-compliant
 * "isolated QuickJS context".
 */
export interface SandboxLimits {
  timeoutMs?: number;
  memoryBytes?: number;
  maxStackBytes?: number;
}

export interface SandboxResult {
  ok: boolean;
  /** Dumped completion value (JSON-able) on success. */
  value?: unknown;
  /** Captured console.log output. */
  logs: string[];
  error?: { name: string; message: string };
  durationMs: number;
}

export interface JsSandbox {
  execute(code: string, limits?: SandboxLimits): Promise<SandboxResult>;
  dispose?(): void | Promise<void>;
}

export const DEFAULT_LIMITS: Required<SandboxLimits> = {
  timeoutMs: 1000,
  memoryBytes: 64 * 1024 * 1024,
  maxStackBytes: 512 * 1024,
};
