# Changelog

All notable changes to SAGE-AGENT are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-30

First tagged release. Completes the full build (Phases 0–6): an offline-first,
thick-client mobile AI companion where the device owns all orchestration and the
backend is a stateless proxy. 117 tests passing; `tsc -b` clean.

### Added

- **Phase 0–1 — Foundations.** Domain vocabulary (`shared-types`), Backend v3 SSE
  contract with incremental parser + symmetric serializer (`sse-contract`),
  authoritative two-domain tool registry (`tool-registry`), signal readers +
  Capability Manifest (`arbiter-core`), the stateless SAGE Backend v3 proxy, the
  native `sage-capability` module (RAM/OS/GPU/NPU/thermal + GGUF verification),
  and the full architecture + compliance docs.
- **Phase 2 — Native shell & voice loop.** Platform-agnostic `VoicePipeline`
  state machine with engine interfaces and an injectable-clock latency tracker
  (`voice-core`); device engines (Porcupine wake word, whisper.rn STT, native
  Piper `SageTts` module); capability-gated Home + Voice screens.
- **Phase 3 — Arbiter Core.** `ArbiterRouter` (signal precedence → model +
  local/cloud target), `ReActLoop` (owns the loop; uniform local/cloud inference
  targets; graceful degradation), `ToolDomainRouter`, and a 50-case routing
  benchmark.
- **Phase 4 — Code sandbox.** `JsSandbox` contract, WASM QuickJS runner (CI),
  `SandboxManager` unifying local QuickJS (`execute_js`, `render_prototype`) and
  cloud E2B (`execute_python`), plus a 38-case execution benchmark and a device
  QuickJS JSI binding.
- **Phase 5 — Search & memory.** Offline embedder, vector store, memory
  lifecycle + opaque injection (`memory-core`); device sqlite-vec store via
  op-sqlite + SQLCipher; server-side Tavily → Jina deep research.
- **Phase 6 — Deep OS integrations.** Native `sage-os` module (Contacts,
  Calendar, Reminders, sandboxed File System) with graceful `PERMISSION_DENIED`
  handling; registry expanded to 13 tools (9 mobile / 4 cloud).
- **Tooling.** GitHub Actions CI (typecheck + 117 tests on Node 20 & 22), a
  tag-triggered release workflow, and `docs/device-build.md` (device build, asset,
  and on-device validation guide).

### Notes

- **Constraints (binding):** the device owns the ReAct loop; the ArbiterRouter is
  on-device; `/api/sage/infer` is a stateless proxy; the two-domain registry is
  authoritative; memory is on-device and never synced.
- **Known limitation:** the Piper espeak-ng/piper-phonemize phonemization step is
  the one remaining TODO (`docs/phase-2-report.md`).

[0.1.0]: https://github.com/LG-Gibs/sage-agent/releases/tag/v0.1.0
