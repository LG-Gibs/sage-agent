import { describe, it, expect } from 'vitest';
import {
  VoicePipeline,
  type VoicePipelineHooks,
  type VoiceState,
  createFakeClock,
  createMockStt,
  createMockTts,
  createMockWake,
  createMockResponder,
  createGatedTts,
} from '../src/index';

const settle = () => new Promise((r) => setTimeout(r, 0));

function trackStates(): { hooks: VoicePipelineHooks; states: VoiceState[] } {
  const states: VoiceState[] = [];
  return { states, hooks: { onState: (s) => states.push(s) } };
}

describe('VoicePipeline — full cycle', () => {
  it('push-to-talk runs capture → transcribe → think → speak → idle', async () => {
    const clock = createFakeClock();
    const { hooks, states } = trackStates();
    const tokens: string[] = [];
    hooks.onResponseToken = (t) => tokens.push(t);
    let latency = null as null | ReturnType<VoicePipeline['getLastLatency']>;
    hooks.onLatency = (l) => (latency = l);

    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: 'what is the weather', partials: ['what'] }),
      tts: createMockTts({ clock }),
      responder: createMockResponder({ clock, text: 'It is sunny.' }),
      hooks,
    });

    await pipeline.pushToTalk();

    expect(states).toEqual([
      'capturing',
      'transcribing',
      'thinking',
      'speaking',
      'idle',
    ]);
    expect(tokens.join('')).toBe('It is sunny.');
    expect(latency).toMatchObject({
      trigger: 'manual',
      sttMs: 80, // transcribeMs
      thinkMs: 120,
      ttsStartMs: 60,
      withinTarget: true,
    });
  });

  it('wake word triggers a turn and re-arms to wake_listening', async () => {
    const clock = createFakeClock();
    const { hooks, states } = trackStates();
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    hooks.onLatency = () => done();

    const wake = createMockWake();
    const pipeline = new VoicePipeline({
      clock: clock.now,
      wake,
      stt: createMockStt({ clock, text: 'hello' }),
      tts: createMockTts({ clock }),
      responder: createMockResponder({ clock, text: 'Hi there.' }),
      hooks,
    });

    await pipeline.arm();
    expect(pipeline.state).toBe('wake_listening');
    wake.fire();
    await finished;
    expect(pipeline.state).toBe('wake_listening'); // re-armed
    expect(states).toContain('capturing');
    expect(states.at(-1)).toBe('wake_listening');
  });
});

describe('VoicePipeline — empty transcript', () => {
  it('does not think/speak and re-arms', async () => {
    const clock = createFakeClock();
    const { hooks, states } = trackStates();
    const tokens: string[] = [];
    hooks.onResponseToken = (t) => tokens.push(t);

    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: '   ' }),
      tts: createMockTts({ clock }),
      responder: createMockResponder({ clock, text: 'unused' }),
      hooks,
    });

    await pipeline.pushToTalk();
    expect(tokens).toEqual([]);
    expect(states).not.toContain('thinking');
    expect(states).not.toContain('speaking');
    expect(pipeline.state).toBe('idle');
  });
});

describe('VoicePipeline — graceful degradation', () => {
  it('TTS unavailable → still produces text, skips speaking', async () => {
    const clock = createFakeClock();
    const { hooks, states } = trackStates();
    const tokens: string[] = [];
    hooks.onResponseToken = (t) => tokens.push(t);
    let latency = null as null | ReturnType<VoicePipeline['getLastLatency']>;
    hooks.onLatency = (l) => (latency = l);

    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: 'hello' }),
      tts: createMockTts({ clock, available: false }),
      responder: createMockResponder({ clock, text: 'Hi.' }),
      hooks,
    });

    await pipeline.pushToTalk();
    expect(tokens.join('')).toBe('Hi.');
    expect(states).not.toContain('speaking');
    expect(latency?.ttsStartMs).toBeUndefined();
  });

  it('STT unavailable → emits non-recoverable error, no tokens', async () => {
    const clock = createFakeClock();
    let err: { recoverable: boolean } | null = null;
    const tokens: string[] = [];

    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: 'x', available: false }),
      tts: createMockTts({ clock }),
      responder: createMockResponder({ clock, text: 'y' }),
      hooks: {
        onError: (e) => (err = e),
        onResponseToken: (t) => tokens.push(t),
      },
    });

    await pipeline.pushToTalk();
    expect(err).toMatchObject({ recoverable: false });
    expect(tokens).toEqual([]);
    expect(pipeline.state).toBe('idle');
  });

  it('push-to-talk works without a wake word', async () => {
    const clock = createFakeClock();
    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: 'hi' }),
      tts: createMockTts({ clock }),
      responder: createMockResponder({ clock, text: 'ok' }),
    });
    expect(pipeline.canUseVoice).toBe(true);
    await pipeline.arm(); // no wake engine → idle
    expect(pipeline.state).toBe('idle');
    await pipeline.pushToTalk();
    expect(pipeline.state).toBe('idle');
  });
});

describe('VoicePipeline — cancellation & barge-in', () => {
  it('cancel() aborts a speaking turn and returns to idle', async () => {
    const clock = createFakeClock();
    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: 'hello' }),
      tts: createGatedTts(),
      responder: createMockResponder({ clock, text: 'a long reply' }),
    });

    const p = pipeline.pushToTalk();
    await settle();
    expect(pipeline.state).toBe('speaking');
    pipeline.cancel();
    await p;
    expect(pipeline.state).toBe('idle');
  });

  it('barge-in: a new push-to-talk cancels the active turn', async () => {
    const clock = createFakeClock();
    const states: VoiceState[] = [];
    const pipeline = new VoicePipeline({
      clock: clock.now,
      stt: createMockStt({ clock, text: 'hello' }),
      tts: createGatedTts(),
      responder: createMockResponder({ clock, text: 'reply' }),
      hooks: { onState: (s) => states.push(s) },
    });

    const p1 = pipeline.pushToTalk();
    await settle();
    expect(pipeline.state).toBe('speaking');

    const p2 = pipeline.pushToTalk(); // barge-in
    await p1; // first turn unwinds (aborted)
    await settle();
    expect(pipeline.state).toBe('speaking'); // second turn now speaking
    pipeline.cancel();
    await p2;
    // We re-entered capturing for the second turn after barge-in.
    expect(states.filter((s) => s === 'capturing').length).toBe(2);
  });
});
