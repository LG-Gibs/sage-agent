import { type CycleLatency, ioLatency, VOICE_LATENCY_TARGET_MS } from './latency';
import type {
  Responder,
  SttEngine,
  TtsEngine,
  VoiceState,
  WakeWordEngine,
} from './types';

export interface VoicePipelineHooks {
  onState?: (state: VoiceState, prev: VoiceState) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onResponseToken?: (token: string) => void;
  onResponseDone?: (full: string) => void;
  onLatency?: (latency: CycleLatency) => void;
  onError?: (e: { stage: VoiceState; error: Error; recoverable: boolean }) => void;
}

export interface VoicePipelineDeps {
  stt: SttEngine;
  tts: TtsEngine;
  responder: Responder;
  wake?: WakeWordEngine;
  /** Injectable clock (ms) for deterministic latency tests. */
  clock?: () => number;
  hooks?: VoicePipelineHooks;
}

/**
 * Mobile-owned voice loop orchestrator. Platform-agnostic: the native engines
 * (Porcupine / Whisper.cpp / Piper) are injected behind interfaces, so the full
 * state machine — including barge-in, cancellation, latency tracking and
 * graceful degradation — is unit-tested with no device.
 */
export class VoicePipeline {
  private _state: VoiceState = 'idle';
  private turn: AbortController | null = null;
  private armed = false;
  private lastLatency: CycleLatency | null = null;
  private readonly clock: () => number;

  constructor(private readonly deps: VoicePipelineDeps) {
    this.clock = deps.clock ?? (() => Date.now());
  }

  get state(): VoiceState {
    return this._state;
  }
  get canUseVoice(): boolean {
    return this.deps.stt.available;
  }
  getLastLatency(): CycleLatency | null {
    return this.lastLatency;
  }

  private setState(next: VoiceState): void {
    const prev = this._state;
    if (prev === next) return;
    this._state = next;
    this.deps.hooks?.onState?.(next, prev);
  }

  /** Arm wake-word listening if available; otherwise sit idle (push-to-talk). */
  async arm(): Promise<void> {
    this.armed = true;
    if (this.deps.wake?.available) {
      await this.deps.wake.start(() => {
        void this.beginTurn('wake');
      });
      this.setState('wake_listening');
    } else {
      this.setState('idle');
    }
  }

  async disarm(): Promise<void> {
    this.armed = false;
    if (this.deps.wake?.available) await this.deps.wake.stop().catch(() => {});
    this.cancel();
    this.setState('idle');
  }

  /** Manual trigger. Works without a wake word and barges in while speaking. */
  async pushToTalk(): Promise<void> {
    await this.beginTurn('manual');
  }

  /** Abort the in-flight turn (explicit cancel or barge-in). */
  cancel(): void {
    const wasInTurn = this.inTurn();
    if (this.turn) {
      this.turn.abort();
      this.turn = null;
    }
    void this.deps.stt.stop().catch(() => {});
    void this.deps.tts.stop().catch(() => {});
    if (wasInTurn) this.reArm();
  }

  private inTurn(): boolean {
    return (
      this._state === 'capturing' ||
      this._state === 'transcribing' ||
      this._state === 'thinking' ||
      this._state === 'speaking'
    );
  }

  private reArm(): void {
    if (this.armed && this.deps.wake?.available) this.setState('wake_listening');
    else this.setState('idle');
  }

  private async beginTurn(trigger: 'wake' | 'manual'): Promise<void> {
    // Graceful degradation: no STT engine → voice can't proceed.
    if (!this.deps.stt.available) {
      this.deps.hooks?.onError?.({
        stage: 'capturing',
        error: new Error('STT engine unavailable'),
        recoverable: false,
      });
      this.reArm();
      return;
    }

    // Barge-in: cancel any active turn before starting a new one.
    if (this.inTurn()) this.cancel();

    const ac = new AbortController();
    this.turn = ac;
    const latency: CycleLatency = { trigger };
    const t0 = this.clock();

    try {
      // ── Capture + STT ──
      this.setState('capturing');
      const sttStarted = this.clock();
      const result = await this.deps.stt.transcribe({
        signal: ac.signal,
        onPartial: (t) => {
          if (this._state === 'capturing') this.setState('transcribing');
          this.deps.hooks?.onPartialTranscript?.(t);
        },
      });
      if (ac.signal.aborted) return;
      const transcript = result.text.trim();
      latency.sttMs = Math.max(0, this.clock() - (result.captureEndedAt ?? sttStarted));
      this.deps.hooks?.onFinalTranscript?.(transcript);

      if (!transcript) {
        // Nothing said — quietly re-arm.
        this.finishTurn(ac, latency, /*emit*/ false);
        return;
      }

      // ── Responder (think) ──
      this.setState('thinking');
      const thinkStart = this.clock();
      let firstToken = true;
      const full = await this.deps.responder(
        transcript,
        (tok) => {
          if (firstToken) {
            latency.thinkMs = this.clock() - thinkStart;
            firstToken = false;
          }
          this.deps.hooks?.onResponseToken?.(tok);
        },
        ac.signal,
      );
      if (ac.signal.aborted) return;
      this.deps.hooks?.onResponseDone?.(full);

      // ── TTS (graceful: text-only if unavailable) ──
      if (this.deps.tts.available && full.trim()) {
        this.setState('speaking');
        const speakStart = this.clock();
        await this.deps.tts.speak(full, {
          signal: ac.signal,
          onStart: () => {
            latency.ttsStartMs = this.clock() - speakStart;
          },
        });
        if (ac.signal.aborted) return;
      }

      latency.totalMs = this.clock() - t0;
      this.finishTurn(ac, latency, /*emit*/ true);
    } catch (err) {
      if (ac.signal.aborted) return; // cancelled / barged-in: stay quiet
      this.deps.hooks?.onError?.({
        stage: this._state,
        error: err instanceof Error ? err : new Error(String(err)),
        recoverable: true,
      });
      this.setState('error');
      if (this.turn === ac) this.turn = null;
      this.reArm();
    }
  }

  private finishTurn(ac: AbortController, latency: CycleLatency, emit: boolean): void {
    if (emit) {
      latency.withinTarget = ioLatency(latency) <= VOICE_LATENCY_TARGET_MS;
      this.lastLatency = latency;
      this.deps.hooks?.onLatency?.(latency);
    }
    if (this.turn === ac) this.turn = null;
    this.reArm();
  }
}
