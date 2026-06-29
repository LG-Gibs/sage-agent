import type {
  Responder,
  SttEngine,
  SttResult,
  TtsEngine,
  WakeWordEngine,
} from './types';

/** Deterministic fake clock: advance time explicitly via tick(). */
export interface FakeClock {
  now: () => number;
  tick: (ms: number) => void;
}
export function createFakeClock(start = 0): FakeClock {
  let t = start;
  return { now: () => t, tick: (ms) => (t += ms) };
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

export interface MockWake extends WakeWordEngine {
  fire(): void;
}
export function createMockWake(opts: { available?: boolean } = {}): MockWake {
  let cb: (() => void) | null = null;
  return {
    available: opts.available ?? true,
    async start(onWake) {
      cb = onWake;
    },
    async stop() {
      cb = null;
    },
    fire() {
      cb?.();
    },
  };
}

export interface MockSttConfig {
  clock: FakeClock;
  text: string;
  /** Simulated user speaking duration (ms). */
  captureMs?: number;
  /** Simulated Whisper compute (ms) — this is what sttMs should report. */
  transcribeMs?: number;
  partials?: string[];
  available?: boolean;
}
export function createMockStt(cfg: MockSttConfig): SttEngine {
  return {
    available: cfg.available ?? true,
    async transcribe({ onPartial, signal }) {
      cfg.clock.tick(cfg.captureMs ?? 300);
      if (signal.aborted) throw abortError();
      for (const p of cfg.partials ?? []) onPartial?.(p);
      const captureEndedAt = cfg.clock.now();
      cfg.clock.tick(cfg.transcribeMs ?? 80);
      if (signal.aborted) throw abortError();
      return { text: cfg.text, captureEndedAt } satisfies SttResult;
    },
    async stop() {},
  };
}

export interface MockTtsConfig {
  clock: FakeClock;
  /** Synthesis → first audio (ms) — this is what ttsStartMs should report. */
  startMs?: number;
  /** Playback duration (ms). */
  playMs?: number;
  available?: boolean;
}
export function createMockTts(cfg: MockTtsConfig): TtsEngine {
  return {
    available: cfg.available ?? true,
    async speak(_text, { onStart, signal }) {
      cfg.clock.tick(cfg.startMs ?? 60);
      if (signal.aborted) throw abortError();
      onStart?.();
      cfg.clock.tick(cfg.playMs ?? 400);
      if (signal.aborted) throw abortError();
    },
    async stop() {},
  };
}

export function createMockResponder(cfg: {
  clock: FakeClock;
  text: string;
  thinkMs?: number;
}): Responder {
  return async (_transcript, onToken, signal) => {
    cfg.clock.tick(cfg.thinkMs ?? 120);
    if (signal.aborted) throw abortError();
    for (const tok of cfg.text.match(/\S+\s*/g) ?? [cfg.text]) {
      if (signal.aborted) throw abortError();
      onToken(tok);
    }
    return cfg.text;
  };
}

/** A TTS that blocks until aborted — for cancel / barge-in tests. */
export function createGatedTts(): TtsEngine {
  return {
    available: true,
    async speak(_text, { onStart, signal }) {
      onStart?.();
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
    async stop() {},
  };
}
