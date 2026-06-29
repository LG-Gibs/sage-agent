# SAGE-AGENT — Phase 4 Report (Code Sandbox)

Legend: ✅ **Verified here** · 📦 **Code complete, device-bound**.

## Deliverables

| Item | Status | Location |
|------|--------|----------|
| SandboxManager (local QuickJS + cloud E2B paths) | ✅ | `packages/sandbox-core/src/sandboxManager.ts` |
| QuickJS isolated execution (WASM reference impl) | ✅ | `packages/sandbox-core/src/quickjsWasm.ts` |
| QuickJS isolated execution (on-device) | 📦 | mobile `src/sandbox/reactNativeQuickJs.ts` |
| execute_js / render_prototype mobile handlers | ✅ logic / 📦 device | `sandboxManager.mobileHandlers()`; mobile `src/agent/mobileToolHandlers.ts` |
| E2B Firecracker execute_python (cloud, OFFLINE handling) | ✅ contract / 📦 live | `apps/backend/src/routes/tools.ts` (`/execute`); OFFLINE via SandboxManager + ToolDomainRouter |
| QuickJS benchmark suite | ✅ | `packages/sandbox-core/src/benchmark/jsBenchmark.ts` |

## Success criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| QuickJS executes the full benchmark suite ≥99% ⟵ gate | ✅ | **38/38 = 100%** via WASM in CI (`test/quickjs.test.ts`, asserts ≥0.99). |
| QuickJS functions offline; E2B returns OFFLINE when offline | ✅ | QuickJS is fully local (no network at all); `SandboxManager.executePython` + ToolDomainRouter return the OFFLINE envelope offline. |
| Sandbox isolation: QuickJS context cannot access host state | ✅ | `test/quickjs.test.ts` — `process`/`require`/`fetch` are `undefined`, a secret set on the Node host global is invisible to the VM, infinite loops are interrupted by the time limit, runaway memory is contained, thrown errors surface as failed results (no host crash). |

## What runs in this container (✅)

`npm run typecheck` → 0 errors. `npm test` → **101 tests** (was 89; +12 sandbox).
The QuickJS sandbox runs for real through `quickjs-emscripten` (WASM) — the
benchmark and every isolation guarantee are executed, not simulated.

## Design

- **One contract, two engines.** `JsSandbox` (in `sandbox-core`) is implemented
  by the WASM runner (Node/CI/web, the verified reference) and, on device, by a
  react-native-quickjs JSI binding — identical isolation semantics: fresh
  context per run, only a capturing `console.log` injected, enforced
  memory/stack/time limits, zero host bridge. This is the App Store
  2.5.2-compliant isolated context.
- **Bundle hygiene.** The mobile app imports `@sage/sandbox-core/manager` (a
  subpath that excludes `quickjs-emscripten`), so the WASM build never enters
  the React Native bundle; the device uses its native QuickJS binding.
- **Two-domain consistency.** `execute_js` / `render_prototype` are mobile-domain
  (run on-device, server never sees them); `execute_python` is cloud-domain,
  dispatched by the ToolDomainRouter to the backend's E2B route, and returns
  OFFLINE when there's no connectivity.
- **E2B** is implemented in the backend with a dynamically-imported SDK gated on
  `E2B_API_KEY` (the variable specifier keeps `tsc` from requiring the optional
  package). Without a key it returns a clear "not configured" result; with a key
  + the SDK it spins a Firecracker microVM, runs the code, and returns
  stdout/stderr/results.

## Device-bound items (📦)

- `reactNativeQuickJs.ts` — the native QuickJS JsSandbox (verified reference is
  the WASM runner with the identical contract).
- `render_prototype` packaging is verified; the actual locked-down WebView
  render surface is device UI.
- Live E2B execution needs `E2B_API_KEY` + the SDK installed + network to E2B.

## Gate decision

Phase 4 complete; the headline gate (QuickJS ≥99%) passes at **100%**, isolation
is proven, and the OFFLINE contract holds — all executed in CI. **Recommend
proceeding to Phase 5 (Search & Memory: sqlite-vec RAG + Tavily/Jina)** —
`search_local_memory` is the next handler to fill in.
