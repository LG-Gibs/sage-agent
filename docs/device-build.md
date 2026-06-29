# SAGE-AGENT — Device Build & Run Guide

> The device **is** the agent. Everything in this repo that is unit-tested in CI
> is the orchestration logic; the parts that can only run on real hardware —
> on-device LLM inference, the voice loop, the QuickJS JSI sandbox, sqlite-vec
> retrieval, and the native OS integrations — are built and validated here.

This guide takes you from a clean checkout to a running build on a physical
iOS/Android device, and through the per-phase on-device acceptance checks. The
platform-agnostic packages already pass `tsc -b` and 117 tests in CI; this is
how you exercise the `📦 device-bound` half of the system.

CI counterpart: `.github/workflows/ci.yml` (typecheck + tests, no device).
Per-phase gate detail: `docs/phase-0-1-report.md` … `docs/phase-6-report.md`.

---

## 0. Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node ≥ 20** | Same floor as the workspace (`engines.node`). |
| **A physical device** (recommended) | On-device inference, the voice loop, and thermal/RAM gating want real hardware. Simulators/emulators boot the app but can't validate first-token latency or GPU offload. |
| **iOS:** Xcode 15+, CocoaPods, an Apple developer signing identity | Deployment target **iOS 15.1** (`app.json` → `expo-build-properties`). |
| **Android:** Android Studio, JDK 17, an SDK with API 34 | `minSdkVersion 26`, `compile/targetSdkVersion 34`. |
| **Watchman** (optional) | Faster Metro file watching on macOS. |

The mobile app is **Expo Bare Workflow with the New Architecture (Fabric/JSI)
enabled** — JSI is required for `llama.rn`, `whisper.rn`, `react-native-quickjs`,
and `op-sqlite`.

---

## 1. Install the mobile workspace

`apps/mobile` is **deliberately excluded from the root npm workspaces** — React
Native / Expo pin and resolve their own dependency tree. Install it on its own
with the mobile toolchain:

```bash
# from the repo root
cd apps/mobile
npm install            # Expo SDK 51 + llama.rn, whisper.rn, porcupine, op-sqlite, quickjs, mmkv …
```

`metro.config.js` watches the monorepo root and resolves the `@sage/*` packages
directly from their TypeScript sources (no build step); `tsconfig.json` mirrors
this with `paths`. You do **not** need to `npm install` at the repo root to run
the app — that root install is only for the testable packages + backend.

---

## 2. Configure the environment

The app reads `EXPO_PUBLIC_*` variables at build time. Create
`apps/mobile/.env` (git-ignored):

```bash
# Where the device reaches SAGE Backend v3 for cloud inference + cloud tools.
# The device NEVER talks to upstream providers directly — only to this backend.
# Local dev: your machine's LAN IP (NOT localhost — that's the phone itself).
EXPO_PUBLIC_SAGE_BACKEND_URL=http://192.168.1.50:8787

# On-device Porcupine wake-word *license* key (NOT an LLM/cloud key; no audio
# ever leaves the device). Optional — without it the app falls back to
# push-to-talk. Get one from the Picovoice Console.
EXPO_PUBLIC_PICOVOICE_KEY=
```

| Variable | Default | Effect |
|----------|---------|--------|
| `EXPO_PUBLIC_SAGE_BACKEND_URL` | `https://api.sage.iterativ.app` | Cloud inference/tool endpoint (`src/agent/sageConfig.ts`). |
| `EXPO_PUBLIC_PICOVOICE_KEY` | _(empty)_ | Enables always-on "Hey Sage"; empty → push-to-talk only (`src/voice/voiceConfig.ts`). |

> **Trust boundary:** upstream API keys (OpenRouter / Azure Foundry / Tavily /
> Jina / E2B) live **only on the backend**, never in the app. See
> `apps/backend/.env.example`.

---

## 3. Native model & voice assets

These binaries are large and **git-ignored** (`*.gguf`, `*.onnx`, `*.ppn`,
`models/`). You supply them on the device; the app refuses to load an
unverified model (GGUF magic-byte check in the native capability module).

| Asset | Used by | Placement |
|-------|---------|-----------|
| **LLM GGUF** — Gemma 4 2B (q4) | `llama.rn` local inference (`src/inference/localEngine.ts`) | iOS: `Documents/models/gemma-4-2b-q4.gguf` · Android: `filesDir/models/gemma-4-2b-q4.gguf`. A 9B GGUF is gated on RAM ≥ 8 GB. |
| **Whisper GGUF** — e.g. `ggml-base.en.bin` | `whisper.rn` STT (`src/voice/stt.ts`) | Same on-device `models/` dir; loaded by verified path. |
| **Piper voice** — `en_US-amy-medium.onnx` + `.onnx.json` | `SageTts` native module (`src/voice/tts.ts`) | Bundled as a native asset; referenced by `PIPER_VOICE_ID`. |
| **Wake word** — `hey-sage.ppn` | Porcupine (`src/voice/wakeWord.ts`) | Bundled asset; generate in the Picovoice Console. Requires `EXPO_PUBLIC_PICOVOICE_KEY`. |

Pushing the LLM/Whisper models to the device for a dev build:

```bash
# iOS simulator/device container (path varies; use Xcode > Devices, or:)
xcrun simctl get_app_container booted co.iterativ.sage data
#   → copy your .gguf into <container>/Documents/models/

# Android
adb push gemma-4-2b-q4.gguf /data/local/tmp/
adb shell run-as co.iterativ.sage mkdir -p files/models
adb shell run-as co.iterativ.sage cp /data/local/tmp/gemma-4-2b-q4.gguf files/models/
```

Relaunch after placing a model so the Capability Manifest re-verifies it.

---

## 4. Prebuild & run

```bash
cd apps/mobile

# Generate native ios/ and android/ projects with New Architecture ON.
npx expo prebuild --clean

# Build + launch on a connected device / simulator:
npx expo run:ios          # add --device to target a physical iPhone
npx expo run:android
```

New Architecture is enabled via `app.json` (`expo.newArchEnabled: true` +
`expo-build-properties`). The first native build is slow (Pods / Gradle +
JSI native modules); subsequent runs are incremental.

---

## 5. Native modules in this app

Three local **Expo native modules** (real Swift + Kotlin, behind one TS
interface each) are compiled into the binary by `expo prebuild`:

| Module | Surface | Implementation |
|--------|---------|----------------|
| `modules/sage-capability` | RAM · OS · GPU backend (Metal/Vulkan) · ML accelerator (Core ML/NNAPI) · NPU · thermal state · GGUF magic-byte verification | `SageCapabilityModule.swift` / `.kt` |
| `modules/sage-tts` | Piper (VITS ONNX) synthesis + native audio playback; emits `onSpeakStart` at first audio frame for latency | `SageTtsModule.swift` / `.kt` (ONNX Runtime) |
| `modules/sage-os` | Contacts (read/search) · Calendar events · Reminders · sandboxed File System | `SageOsModule.swift` (Contacts/EventKit/FileManager) · `.kt` (ContactsContract/CalendarContract/app-private files) |

The device also uses a `react-native-quickjs` JSI binding (sandbox) and
`op-sqlite` + SQLCipher (encrypted sqlite-vec store) — installed in step 1.

---

## 6. Permissions

Declared in `app.json` and surfaced through the app's runtime permission flow:

- **iOS** `Info.plist` usage strings: Contacts, Calendars, Reminders, Microphone, Speech Recognition.
- **Android**: `READ_CONTACTS`, `READ_CALENDAR`, `WRITE_CALENDAR`, `RECORD_AUDIO`.

A denied permission is **never** a crash: native code throws
`permission_denied:<scope>`, which `src/os/osTools.ts` maps to the canonical
`PERMISSION_DENIED` tool result; the ReActLoop appends it and continues.

---

## 7. On-device validation checklist

Run these on **both** an iOS and an Android device. ✅ items are already proven
in CI; the checks below are the `📦` device-bound half.

| Phase | What to verify | How |
|-------|----------------|-----|
| **0 — Capability boot** | Boot screen reports accurate RAM/OS/GPU/NPU/thermal and a valid five-signal vector; app reaches `ready` only with a verified model. | Launch; read the Home screen diagnostics. |
| **0 — First token** (A→B gate) | Gemma 4 2B produces a first token; record `ttftMs`. | Place the GGUF (step 3), relaunch, call `firstTokenProbe(model)` / run a local turn. |
| **2 — Voice loop, offline** | Wake word → Whisper STT → local-llama responder → Piper TTS all run in airplane mode. | Enable airplane mode; say "Hey Sage" (or push-to-talk) and complete a turn. |
| **2 — Voice latency** | `sttMs + ttsStartMs ≤ 500 ms`. | The Voice screen shows `sttMs`, `ttsStartMs`, and "Voice I/O within 500ms" per turn. |
| **3 — Routing** | Offline/critical-battery/sensitive/prefer-local turns stay **local**; cloud turns hit `/api/sage/infer` when online. | Toggle network/battery/privacy and watch the chosen target/model. |
| **4 — Sandbox** | `execute_js` runs in the QuickJS JSI context; `render_prototype` renders. | Ask Sage to run a small JS snippet / render a prototype. |
| **5 — Memory** | `search_local_memory` returns top-k from the encrypted sqlite-vec store; recalled memories pre-inject into the next turn. | Seed a fact, then ask about it offline. |
| **6 — OS tools** | Contacts/Calendar/Reminders/Files work; denying a permission yields a graceful `PERMISSION_DENIED` (no crash). | Exercise each tool; deny one permission and confirm the loop continues. |

---

## 8. Pairing with SAGE Backend v3 (cloud half)

The device's cloud target needs a reachable backend. From the repo root:

```bash
npm install              # root: installs packages/* + apps/backend (one time)
npm run backend:dev      # http://localhost:8787 ; GET /health → { ok: true, provider: "mock" }
```

Point the app at your machine's **LAN IP** (set `EXPO_PUBLIC_SAGE_BACKEND_URL`
in step 2) — `localhost` on the phone is the phone itself. The default `mock`
upstream needs no keys and lets you exercise the full cloud path offline-style.
To use a real provider, copy `apps/backend/.env.example` → `.env` and set
`SAGE_UPSTREAM_PROVIDER=openrouter` (or `azure-foundry`) with the key. Cloud
tools (`web_search`, `fetch_webpage`, `execute_python`, `deep_research`) are
gated on their respective server-side keys (`TAVILY_API_KEY`, `JINA_API_KEY`,
`E2B_API_KEY`).

---

## 9. Troubleshooting

- **`requireNativeModule('SageTts'/'SageCapability'/'SageOs')` returns null / TTS unavailable** — you skipped `expo prebuild` or ran a managed/Expo Go build. These are local native modules; you must `prebuild` and `run:ios`/`run:android`.
- **"Refusing to load unverified model"** — the GGUF failed the magic-byte check or isn't at the expected path. Re-push it (step 3) and relaunch.
- **Wake word never fires** — `EXPO_PUBLIC_PICOVOICE_KEY` is empty or `hey-sage.ppn` isn't bundled; the app is in push-to-talk fallback (by design).
- **Cloud turns hang / fail** — the phone can't reach `EXPO_PUBLIC_SAGE_BACKEND_URL`. Use the LAN IP, confirm `GET /health`, same Wi-Fi, firewall open on 8787.
- **`MODEL_NOT_ALLOWED` (403) from the backend** — the requested model isn't in `SAGE_ALLOWED_MODELS` (Constraint 2). Add it to the backend allowlist.
- **New Architecture build errors** — ensure `newArchEnabled: true` survived `prebuild --clean`, Pods reinstalled (`cd ios && pod install`), and Gradle used JDK 17.

---

## 10. Known limitations (v0.1.0)

- **Piper phonemization** — native audio playback and the ONNX synthesis path
  are wired, but the **espeak-ng / piper-phonemize** phonemization step is the
  one remaining TODO in `modules/sage-tts` (see `docs/phase-2-report.md`).
- **On-device embedder** — ships the offline signed-hashing embedder; a neural
  embedding GGUF can be dropped in behind the same interface (`docs/phase-5-report.md`).
