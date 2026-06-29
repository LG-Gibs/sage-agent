import { initLlama, type LlamaContext } from 'llama.rn';
import type { InstalledModel } from '@sage/shared-types';

/**
 * On-device inference engine (llama.cpp GGUF via llama.rn).
 *
 * This is the local target of the graceful-degradation hierarchy and the
 * substrate for the "Airplane Mode Singularity": it runs with zero network
 * connectivity. GPU offload uses Metal on iOS and Vulkan on Android (the
 * binding picks the platform backend; `nGpuLayers` controls offload depth).
 *
 * DEVICE-BOUND: requires the native llama.rn library and a verified GGUF model
 * on disk. It cannot run in the CI container — see docs/phase-0-1-report.md for
 * the on-device first-token validation procedure.
 */
export interface LocalInferenceEngine {
  load(model: InstalledModel): Promise<void>;
  /**
   * Stream a completion. Resolves with timing including time-to-first-token,
   * which is exactly the Phase 0 "first token" success metric.
   */
  complete(
    prompt: string,
    onToken: (token: string) => void,
  ): Promise<{ ttftMs: number; tokens: number }>;
  release(): Promise<void>;
}

export interface LlamaEngineOptions {
  /** Layers offloaded to GPU (Metal/Vulkan). 99 ≈ "all"; lower for thermal/RAM. */
  nGpuLayers?: number;
  nCtx?: number;
}

export function createLlamaEngine(
  opts: LlamaEngineOptions = {},
): LocalInferenceEngine {
  let ctx: LlamaContext | null = null;

  return {
    async load(model: InstalledModel) {
      if (!model.verified) {
        throw new Error(`Refusing to load unverified model: ${model.id}`);
      }
      ctx = await initLlama({
        model: model.path,
        n_ctx: opts.nCtx ?? 4096,
        n_gpu_layers: opts.nGpuLayers ?? 99,
      });
    },

    async complete(prompt, onToken) {
      if (!ctx) throw new Error('Local engine not loaded');
      const start = Date.now();
      let ttftMs = -1;
      let tokens = 0;
      await ctx.completion(
        { prompt, n_predict: 256, temperature: 0.7, stop: ['</s>'] },
        (data: { token?: string }) => {
          if (data.token) {
            if (ttftMs < 0) ttftMs = Date.now() - start;
            tokens += 1;
            onToken(data.token);
          }
        },
      );
      return { ttftMs, tokens };
    },

    async release() {
      await ctx?.release();
      ctx = null;
    },
  };
}

/**
 * Phase 0 first-token probe. Loads the default GGUF and measures TTFT.
 * Invoke from a dev screen on a physical device to satisfy the A→B governance
 * gate ("Gemma 4 2B produces a first token on both iOS and Android").
 */
export async function firstTokenProbe(
  model: InstalledModel,
): Promise<{ ttftMs: number; tokens: number }> {
  const engine = createLlamaEngine();
  await engine.load(model);
  try {
    return await engine.complete('Hello', () => {});
  } finally {
    await engine.release();
  }
}
