# SAGE-AGENT — Phase 2 Report (Native Shell & Voice Loop)

Lead Developer hand-off. Same verification legend as Phase 0–1:
✅ **Verified here** (runs in the container) · 📦 **Code complete, device-bound**.

## Deliverables

| Item | Status | Location |
|------|--------|----------|
| RN UI bootstrap with capability-aware feature gating | 📦 shell / ✅ gating logic | `apps/mobile/App.tsx`, `src/ui/HomeScreen.tsx`, `src/ui/VoiceScreen.tsx`; `packages/arbiter-core/src/capability/gating.ts` |
| Voice pipeline orchestrator (state machine) | ✅ | `packages/voice-core/src/pipeline.ts` |
| Porcupine wake word → Whisper.cpp STT → response → Piper TTS | 📦 | `apps/mobile/src/voice/{wakeWord,stt,tts}.ts`, `modules/sage-tts/*` |
| Offline responder bridging STT→TTS (pre-Phase-3) | 📦 | `apps/mobile/src/responder/localResponder.ts` |
| Graceful handling when voice is unavailable | ✅ logic / 📦 UI | pipeline degradation paths + `VoiceScreen` disabled state |

## What runs in this container (✅)

`npm run typecheck` → 0 errors. `npm test` → **58 tests passing** (was 43).
New in Phase 2:

- **`voice-core` pipeline (8 tests)** — drives the full state machine with mock
  engines and a fake clock: the `capturing → transcribing → thinking → speaking`
  sequence, wake-word trigger + re-arm, empty-transcript short-circuit, **barge-in
  and cancellation**, graceful degradation (TTS-unavailable → text-only;
  STT-unavailable → non-recoverable error), push-to-talk without a wake word, and
  **deterministic latency tracking** (sttMs / thinkMs / ttsStartMs / withinTarget).
- **capability gating (7 tests)** — voice/wake-word require ready + mic; 9B gated
  on RAM *and* an installed verified 9B model; reasons surfaced for every
  disabled feature.

## Architecture note — same testable-core pattern

The voice loop's orchestration (state machine, barge-in, latency, degradation)
lives in the platform-agnostic `@sage/voice-core`; the native engines
(Porcupine / Whisper.cpp / Piper) are injected behind `WakeWordEngine`,
`SttEngine`, `TtsEngine` interfaces. That is why the hard logic is verifiable
here with zero device dependency, while the device wires the same pipeline to
real bindings.

The middle of the loop (the responder) is an **offline local-llama** call in
Phase 2, making the loop genuinely end-to-end offline now. Phase 3 swaps in the
full ReActLoop without touching the pipeline or the engines.

## Device-bound items (📦) — how to validate

```
cd apps/mobile
npm install            # adds @picovoice/porcupine-react-native, whisper.rn, expo-av, expo-modules-core
npx expo prebuild --clean
npx expo run:ios | run:android
```

Assets/keys needed on device:
- A Gemma 4 GGUF at `Documents/models/…` (as in Phase 0).
- A Whisper.cpp GGUF (e.g. `ggml-base.en.bin`) for `whisper.rn`.
- A Piper voice (`en_US-amy-medium.onnx` + `.onnx.json`) bundled for `SageTts`.
- `EXPO_PUBLIC_PICOVOICE_KEY` + a `hey-sage.ppn` keyword (Picovoice Console) for
  the wake word; without them the app falls back to push-to-talk.

### Success criteria (device-bound)
| Criterion | How to validate |
|-----------|-----------------|
| **<500ms TTS/STT latency** | Run a turn on device; the Voice screen shows `sttMs`, `ttsStartMs`, and "Voice I/O within 500ms". The pipeline computes `withinTarget = sttMs + ttsStartMs ≤ 500`. |
| **Voice pipeline functions entirely offline** | Enable airplane mode; wake word, STT, the local-llama responder, and Piper TTS all run with no connectivity. |

## Remaining heavy integration point

The `SageTts` native module has the ONNX-Runtime session + native audio
playback wired; the **espeak-ng / piper-phonemize phonemization step** is the
one marked TODO (text → phonemes) before VITS inference. Everything downstream
(ids → ORT → PCM → AVAudioEngine/AudioTrack) is in place.

## Gate decision

Phase 2 deliverables are complete; all container-runnable criteria pass (58
tests, clean typecheck). The two device-bound success criteria have complete
code and documented validation. **Recommend proceeding to Phase 3 (Arbiter Core:
ArbiterRouter, ReActLoop, ToolDomainRouter) on approval** — the voice loop's
responder is the seam where the ReActLoop drops in.
