# @sage/mobile — SAGE-AGENT (Expo Bare, New Architecture)

The mobile app **is** the agent. This package is intentionally **excluded from
the root npm workspace** because React Native / Expo manage their own dependency
tree; install and run it with the mobile toolchain.

## Prerequisites

- Node ≥ 20, and the platform toolchains: **Xcode** (iOS) / **Android Studio** (Android)
- A physical device or simulator/emulator (on-device inference and the voice
  loop want real hardware)

## Install & run

```bash
cd apps/mobile
npm install                 # Expo SDK 51, llama.rn, native deps
npx expo prebuild --clean   # generates ios/ and android/ with New Architecture on
npx expo run:ios            # build + launch on iOS
npx expo run:android        # build + launch on Android
```

New Architecture (Fabric/JSI) is enabled via `app.json`
(`expo.newArchEnabled: true` + `expo-build-properties`).

## What's in here (Phase 0)

- `App.tsx` — capability-aware boot screen: reads all five SageRouter signals,
  assembles the Capability Manifest, and reports verified hardware data.
- `modules/sage-capability/` — a local **Expo native module** (Swift + Kotlin)
  probing RAM, OS, GPU backend (Metal/Vulkan), ML accelerator (Core ML/NNAPI),
  NPU, thermal state, and verifying installed GGUF files by magic bytes.
- `src/signals/` — native-backed signal readers (NetInfo, expo-battery + thermal
  guard, encrypted MMKV settings). Complexity uses the shared classifier.
- `src/capability/nativeProbe.ts` — adapts the native module to the
  `NativeCapabilityProbe` interface (with a degraded JS fallback).
- `src/inference/localEngine.ts` — llama.cpp (via llama.rn) local inference +
  `firstTokenProbe()`.

## Monorepo resolution

`metro.config.js` watches the workspace root and resolves the `@sage/*` packages
directly from their TypeScript sources (no build step). `tsconfig.json` mirrors
this with `paths`.

## Device-bound validation (Phase 0 A→B gate)

On-device numbers cannot be produced in CI. To validate:

1. Launch the app — confirm the boot screen reports accurate RAM/GPU/NPU and a
   valid five-signal vector on **both** iOS and Android.
2. Place a Gemma 4 2B GGUF at the app's `Documents/models/gemma-4-2b-q4.gguf`
   (iOS) or `filesDir/models/gemma-4-2b-q4.gguf` (Android); relaunch so the
   manifest verifies it.
3. Call `firstTokenProbe(model)` and read `ttftMs` — the first-token metric.

See `../../docs/phase-0-1-report.md`.
