# SAGE-AGENT

**An offline-first, thick-client mobile AI companion. The device is the agent; the backend extends its reach.**

SAGE-AGENT combines Siri-grade OS integration, Replit-grade code execution, and
Perplexity-grade synthesis — with the core experience (voice, memory, simple
tasks, basic code execution) running entirely on-device. Cloud services extend
capability; they are never required for the app to be useful.

> **The Prime Directive:** every feature defines its offline behavior *before*
> its online behavior. A feature without a documented offline path is not a
> complete feature.

## Constitutional constraints (binding)

1. **The device owns the ReAct loop.** The server runs exactly one inference cycle per request — it never plans, loops, or holds state.
2. **The ArbiterRouter is fully on-device.** The server does an allowlist check, not a routing decision.
3. **`POST /api/sage/infer` is a stateless proxy:** validate, forward, stream, return.
4. **The two-domain tool registry is authoritative.** Mobile tools never run on the server; cloud tools fail when offline.
5. **Memory is on-device and never synced.** The backend treats `memories[]` as opaque prompt text.
6. **No new features on deprecated paths** (`/api/sage/agent`, `calculateRoute()`, the `vm` sandbox, native mocks).

## Monorepo layout

```
sage-agent/
├── packages/
│   ├── shared-types/     # canonical vocabulary: messages, tools, signals, capability, errors
│   ├── sse-contract/     # Backend v3 SSE event types + incremental parser + symmetric serializer
│   ├── tool-registry/    # authoritative two-domain registry (6 mobile / 4 cloud) + integrity check
│   ├── arbiter-core/     # signals, classifier, manifest, gating, ArbiterRouter, ReActLoop, ToolDomainRouter (Phase 3)
│   ├── voice-core/       # voice loop state machine + engine interfaces + latency tracker (Phase 2)
│   ├── sandbox-core/     # JsSandbox + WASM QuickJS runner + SandboxManager + benchmark (Phase 4)
│   └── memory-core/      # offline embedder + vector store + lifecycle + injection + RAG benchmark (Phase 5)
├── apps/
│   ├── backend/          # SAGE Backend v3 — stateless Express proxy + cloud tool runtime
│   └── mobile/           # Expo Bare RN app (New Architecture) + native SageCapability module (Swift/Kotlin)
└── docs/
    ├── architecture.md       # Phase 1: full Mermaid architecture + flows
    ├── compliance.md         # Phase 1: security + App Store 2.5.2 strategy
    └── phase-0-1-report.md    # gate report: verified vs device-bound
```

The platform-agnostic packages hold the orchestration logic behind typed
interfaces, so the governance-gate behavior is **unit-testable with no device or
native toolchain**. The mobile app wires the same packages to real native
bindings; the backend stays dumb.

## Quickstart (backend + shared packages)

```bash
npm install        # installs packages/* and apps/backend (mobile is separate)
npm run typecheck  # tsc -b across everything → 0 errors
npm test           # 43 tests, incl. a live backend SSE smoke test

# Run the backend (mock upstream — no API keys needed):
npm run backend:dev      # http://localhost:8787 ; GET /health
```

To use a real upstream, copy `apps/backend/.env.example` to `.env` and set
`SAGE_UPSTREAM_PROVIDER=openrouter` (or `azure-foundry`) with the key. **Upstream
keys live only on the server and never reach the device.**

## Mobile app

The Expo Bare app is installed and run with the mobile toolchain — see
[`apps/mobile/README.md`](apps/mobile/README.md). It is intentionally excluded
from the npm workspace install.

## Tech stack

React Native (Expo Bare, New Architecture / Fabric+JSI) · llama.cpp GGUF via
llama.rn (Gemma 4 2B/9B) · Picovoice Porcupine + Whisper.cpp + Piper (Phase 2) ·
WatermelonDB + sqlite-vec + MMKV + SQLCipher · QuickJS + E2B Firecracker · Express (SAGE Backend v3).

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Environment & capability detection | ✅ delivered |
| 1 | Architecture & compliance | ✅ delivered |
| 2 | Native shell & voice loop | ✅ delivered |
| 3 | Arbiter Core (router, ReActLoop, dispatch) | ✅ delivered |
| 4 | Code sandbox (QuickJS / E2B) | ✅ delivered |
| 5 | Search & memory (sqlite-vec / Tavily) | ✅ delivered |
| 6 | Deep OS integrations | ⏳ next |

See `docs/phase-0-1-report.md` for the detailed gate report.
