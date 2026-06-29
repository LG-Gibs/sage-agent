# SAGE-AGENT — Phase 3 Report (Arbiter Core, ReActLoop & ToolDomainRouter)

Legend: ✅ **Verified here** · 📦 **Code complete, device-bound**.

## Deliverables

| Item | Status | Location |
|------|--------|----------|
| ArbiterRouter — 5-signal engine: hard overrides, soft guidance, default path | ✅ | `packages/arbiter-core/src/router.ts` |
| ReActLoop — mobile-owned orchestration (local + cloud), graceful degradation | ✅ | `packages/arbiter-core/src/agent/reactLoop.ts` |
| ToolDomainRouter — two-domain dispatch for all 10 tools | ✅ | `packages/arbiter-core/src/agent/toolDomainRouter.ts` |
| SSE stream parser — all five event types incl. heartbeat | ✅ | `packages/sse-contract` (Phase 1) consumed by `agent/cloudTarget.ts` |
| Two-domain tool registry (typed, complete) | ✅ | `packages/tool-registry` (Phase 1) |
| Cloud inference target (real fetch + SSE) | ✅ | `packages/arbiter-core/src/agent/cloudTarget.ts` |
| Local inference target adapter + tool-call parsing | ✅ logic / 📦 engine | `agent/localTarget.ts`; mobile `src/agent/localInferenceTarget.ts` |
| On-device ReActLoop composition + voice responder seam | 📦 | mobile `src/agent/{createReActLoop,reactResponder,cloudToolClient,mobileToolHandlers,signalsCache}.ts` |

## Success criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| ArbiterRouter classifies 10 distinct scenarios ⟵ A→B gate | ✅ | `test/router.test.ts` — offline, critical battery, sensitive, prefer_local, poor+simple, low+moderate, cloud defaults (simple→efficient, complex→capable), prefer_cloud override, stacked overrides. |
| ArbiterRouter ≥85% agreement on 50-case benchmark ⟵ B→C gate | ✅ | `test/routingBenchmark.test.ts` + `benchmark/routingCases.ts` — 50 expert-labelled cases; **100% agreement** (≥85% required). |
| ReActLoop completes 5 task types (research, code, contacts, calendar, RAG) | ✅ | `test/reactLoop.test.ts` — each runs tool_call → dispatch → result → final text. |
| ToolDomainRouter routes all 10 tools; cloud→OFFLINE when offline | ✅ | `test/toolDomainRouter.test.ts` — correct domain per tool, registry authority over the call's stamp, OFFLINE envelope offline. |
| SSE parses all five event types incl. heartbeat | ✅ | `sse-contract` parser tests (13) + the live integration below. |
| ReActLoop ≥99% tool-loop completion across the suite | ✅ | `test/reactLoop.test.ts` — 25-scenario suite completes 100%. |

## What runs in this container (✅)

`npm run typecheck` → 0 errors. `npm test` → **89 tests passing** (was 58).
New in Phase 3 (31 tests): router (12), 50-case benchmark (2), ToolDomainRouter
(6), ReActLoop (9), and a **live backend integration** (2) where the real
`createCloudTarget` drives the ReActLoop end-to-end over an actual
`/api/sage/infer` SSE stream — proving heartbeat→chunk→done handling, the
device↔server contract, and that a non-allowlisted model surfaces
`MODEL_NOT_ALLOWED` (Constraint 2) rather than silently degrading.

## Design highlights

- **Routing precedence (Constraint 2):** hard overrides (offline / critical /
  sensitive / prefer_local) → always local; explicit prefer_cloud → cloud
  (skips soft heuristics); soft guidance (poor+simple, low+non-complex) → local;
  else default cloud tiered by complexity. Local decisions **never** escalate to
  cloud — privacy/offline routes stay on device by construction.
- **Graceful degradation** honors the router's chosen model as the entry point,
  then descends cloud→cloud-efficient→local-default→local-efficient on
  *retryable* failure; non-retryable errors surface immediately.
- **Uniform targets:** local (llama.cpp) and cloud (SSE) implement one
  `InferenceTarget` interface yielding a normalized event stream, so the loop is
  identical across both (Constraint 1: the device owns the loop).
- **Registry is authoritative:** the ToolDomainRouter dispatches by the
  registry's domain, not the domain the model stamped on the call.

## Device-bound items (📦)

The orchestration is fully tested with mock/real targets here. On device:
`src/agent/localInferenceTarget.ts` wraps the llama.rn engine; the
ReActLoop is composed in `src/agent/createReActLoop.ts` and wired into the voice
loop's responder seam (`reactResponder.ts`) — replacing the Phase 2 single-shot
responder so each spoken turn is now routed and tool-capable. Mobile tool
handlers are present as clean UNSUPPORTED stubs until their phases (4–6).

## Gate decision

Phase 3 deliverables complete; all container-runnable success criteria pass
(89 tests, clean typecheck), including both governance gates (10-scenario
classification and ≥85% benchmark). **Recommend proceeding to Phase 4 (Code
Sandbox: QuickJS + E2B)** — `execute_js` / `render_prototype` / `execute_python`
are the first handlers to fill in.
