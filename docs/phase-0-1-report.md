# SAGE-AGENT — Phase 0 & Phase 1 Report

Lead Developer hand-off for the A→B governance gate. This records exactly what
was built, what is **verified in this environment**, and what is **device-bound**
(shipped as code + harness + run instructions, never as fabricated numbers).

## Verification legend

- ✅ **Verified here** — runs in the Linux container (`npm test`, `npm run typecheck`).
- 📦 **Code complete, device-bound** — real source delivered; must be run on
  Xcode/Android Studio + hardware to produce numbers.

## Phase 0 — Environment & Capability Detection

### Deliverables
| Item | Status | Location |
|------|--------|----------|
| Expo Bare scaffold, New Architecture enabled | 📦 | `apps/mobile/app.json` (`newArchEnabled: true`, build-properties), `metro.config.js`, `babel.config.js` |
| Capability Manifest (RAM, OS, GGUF verify, NPU/GPU) | ✅ core / 📦 native | `packages/core/src/capability/*`, `apps/mobile/modules/sage-capability/*` |
| Five SageRouter signal readers | ✅ logic / 📦 native | `packages/core/src/signals/*`, `apps/mobile/src/signals/*` |
| Local inference binding (first token) | 📦 | `apps/mobile/src/inference/localEngine.ts` (llama.rn) |

### Success criteria
| Criterion | Status | Evidence |
|-----------|--------|----------|
| App launches & reports verified capability data (iOS + Android) | 📦 | `App.tsx` boot screen renders the manifest; native probes implemented per-platform. Run on device. |
| All five signals return valid values at cold start | ✅ | `packages/core/test/signals.test.ts` — validates the full vector + out-of-domain rejection + resilient fallback. |
| **Gemma 4 2B produces a first token (iOS + Android)** ⟵ A→B gate | 📦 | `firstTokenProbe()` in `localEngine.ts`. See "On-device validation" below. |

## Phase 1 — Architecture & Compliance

| Deliverable | Status | Location |
|-------------|--------|----------|
| Full Mermaid system architecture (all components + flows) | ✅ | `docs/architecture.md` (7 diagrams) |
| Security & App Store 2.5.2 compliance strategy | ✅ | `docs/compliance.md` |
| SQLCipher coverage statement | ✅ | `docs/compliance.md §2`, `apps/mobile/src/storage/secureSettings.ts` |
| Keychain/Keystore for session tokens | ✅ | `docs/compliance.md §3` |
| Confirmation no upstream keys reach the device | ✅ | `docs/compliance.md §4`, `apps/backend/src/allowlist.ts`, `.env.example` |

## What runs in this container (✅)

```
npm install      # workspaces + backend deps (mobile excluded by design)
npm run typecheck   # tsc -b across all packages + backend → 0 errors
npm test            # 43 tests across 6 files, all passing
```

Test coverage proving the constitutional contracts:

- **SSE contract (13 tests)** — all five event types (`chunk`/`tool_call`/`done`/
  `error`/`heartbeat`), partial-chunk reassembly, CRLF, unknown-event tolerance,
  malformed-payload rejection, and serializer↔parser round-trip.
- **Two-domain registry (8 tests)** — exactly 6 mobile / 4 cloud, correct
  domain per tool, offline-behavior consistency, integrity assertion (C4).
- **Signal readers (5 tests)** — valid cold-start vector, override handling,
  out-of-domain rejection, resilient degraded fallback.
- **Complexity classifier (5 tests)** — simple/moderate/complex bucketing,
  determinism, feature extraction.
- **Capability manifest (6 tests)** — assembly, 8GB→9B gate, iOS Metal/Core ML
  vs Android Vulkan/NNAPI, `ready` derivation (needs verified model + signals).
- **Backend SSE smoke (6 tests)** — live Express server: heartbeat→chunks→done,
  domain-stamped tool_call, memory injection, allowlist 403 (C2), 400 validation.
  The test decodes the stream with the *contract's own* decoder, proving
  device↔server wire compatibility end to end.

## Device-bound items (📦) — how to validate

These require a mobile toolchain and are out of scope to *run* here; the code is
complete.

1. **Build the app**
   ```
   cd apps/mobile
   npm install          # or: pnpm/yarn — installs Expo + llama.rn + native deps
   npx expo prebuild --clean
   npx expo run:ios     # Xcode + device/simulator
   npx expo run:android # Android Studio + device/emulator
   ```
2. **Capability manifest** — launch; the boot screen shows platform, RAM, GPU
   (Metal/Vulkan), ML accelerator (Core ML/NNAPI), NPU, 9B eligibility, verified
   model count, and the five live signals.
3. **First token (A→B gate)** — push a Gemma 4 2B GGUF to the app's
   `Documents/models/gemma-4-2b-q4.gguf` (iOS) / `filesDir/models/…` (Android),
   relaunch so the manifest verifies it, then call `firstTokenProbe(model)` and
   read `ttftMs`. Repeat on an iOS and an Android device.

## Deferred to later phases (per the cadence)

- SageRouter routing engine + 50-case benchmark, ReActLoop, ToolDomainRouter
  dispatch (Phase 3 — interfaces already exported).
- Voice loop: Porcupine/Whisper.cpp/Piper (Phase 2).
- QuickJS + E2B SandboxManager (Phase 4).
- sqlite-vec RAG + Tavily/Jina online pipeline (Phase 5).
- Native OS tool bridges: contacts/calendar/reminders/files (Phase 6).

## Gate decision

Phase 0 deliverables and Phase 1 documents are complete. All container-runnable
success criteria pass. The single A→B gate that is intrinsically device-bound
(first token on hardware) has complete code and a documented validation
procedure. **Recommend proceeding to Phase 2 (Native Shell & Voice Loop) on
approval.**
