# Changelog

All notable changes to SAGE-AGENT are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — Unreleased

### Changed

- **BREAKING — renamed the Arbiter Core package to SageCore.** The directory
  `packages/arbiter-core` is now `packages/core` and the npm name
  `@sage/arbiter-core` is now `@sage/core`.
- **BREAKING — public API renamed:** `ArbiterRouter` → `SageRouter`,
  `IArbiterRouter` → `ISageRouter`, `createArbiterRouter()` → `createSageRouter()`,
  `ArbiterRouterInputs`/`ArbiterRouterOptions` → `SageRouterInputs`/`SageRouterOptions`,
  and the `ArbiterSignals` type (exported from `@sage/shared-types`) → `SageSignals`.
- **BREAKING — the `ReActLoop` config field `arbiter` is now `router`.**
- Updated every call site in `apps/backend`, `apps/mobile`, and `web-preview`,
  plus the workspace config (root `package.json`, `vitest.config.ts`, mobile
  `tsconfig.json`) and the living docs (README, architecture, compliance). The
  internal `router.ts` filename is unchanged.

## [0.1.0] — 2026-06-30

First tagged release. Completes the full build (Phases 0–6): an offline-first,
privacy-first mobile AI companion. The device is the agent; the backend extends
its reach.

### Added

- **Phase 0** — Expo Bare scaffold (New Architecture), native Capability Manifest
  (Swift/Kotlin), five ArbiterRouter signal readers, Gemma 4 2B llama.cpp binding.
- **Phase 1** — full Mermaid system architecture, App Store 2.5.2 compliance
  strategy, SQLCipher + Keychain/Keystore design, upstream-key isolation proof.
- **Phase 2** — VoicePipeline state machine (`@sage/voice-core`); Porcupine wake
  word, Whisper.cpp STT, Piper TTS native Expo modules; barge-in, latency tracking,
  and graceful degradation. Capability-gated Home + Voice UI screens.
- **Phase 3** — ArbiterRouter (5-signal routing, hard overrides, 50-case benchmark),
  ReActLoop (mobile-owned orchestration, graceful degradation hierarchy),
  ToolDomainRouter (13 tools, authoritative two-domain dispatch), CloudInferenceTarget
  (real SSE), LocalInferenceTarget adapter.
- **Phase 4** — `@sage/sandbox-core`: WASM QuickJS sandbox (38-case benchmark, 100%;
  isolation proven), SandboxManager (QuickJS + E2B), E2B Firecracker backend route.
- **Phase 5** — `@sage/memory-core`: offline signed-hashing embedder, sqlite-vec
  RAG pipeline, MemoryManager lifecycle, opaque injection, 100k retrieval-latency
  harness (p95 ≈ 33 ms), session simulation (88.2 % local). Backend Tavily + Jina
  deep research. Privacy audit test.
- **Phase 6** — SageOs native Expo module (Swift + Kotlin) for Contacts, Calendar,
  Reminders, and sandboxed Files. Registry expanded to 13 tools (9 mobile / 4 cloud).
  Native-tool benchmark 100 % (24/24 including PERMISSION_DENIED per tool).
- `web-preview/` — interactive browser preview bundled by esbuild, wiring the real
  `@sage/*` packages into a six-panel dark-themed page.
- `docs/sage-agent-docs.html` — complete BRD/PRD/SDD/TSD documentation suite.

### Architecture

- **Thick-client / thin-server**: the mobile device owns the ReActLoop and the
  SageRouter; the Express backend is a stateless proxy.
- **6 Constitutional Constraints** (binding, not advisory): device owns the loop ·
  SageRouter on-device only · backend = stateless proxy · two-domain tool registry ·
  memory on-device and never synced · no new features on deprecated paths.
- **117 tests passing · `tsc -b` clean.**

### Known limitation

- The Piper espeak-ng/piper-phonemize phonemization step is the one remaining
  TODO (`docs/phase-2-report.md`).

[0.2.0]: https://github.com/LG-Gibs/sage-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/LG-Gibs/sage-agent/releases/tag/v0.1.0
