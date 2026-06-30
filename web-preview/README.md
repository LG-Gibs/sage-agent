# web-preview — interactive browser preview

An interactive, single-page browser preview of SAGE's screens **wired to the real
`@sage/*` packages** (not a reimplementation). The native React Native app needs a
device; this runs the same platform-agnostic logic live in a browser.

Panels, each calling shipped code:
- **Home** — `deriveFeatureFlags()` gating with live RAM/mic/model toggles.
- **Router** — `ArbiterRouter.route()` over the five signals + a live run of the
  real 50-case routing benchmark.
- **Classify** — `classifyComplexity()` + `extractFeatures()`.
- **Voice** — the real `VoicePipeline` state machine (demo I/O engines — no mic).
- **Sandbox** — the real `createQuickJsWasmSandbox()` running QuickJS via an
  embedded-wasm browser variant (isolated context, enforced limits).
- **Memory** — `MemoryManager.recall()` over a seeded store + the opaque
  `memories[]` payload.

## Build

```bash
# from the repo root: npm install   (esbuild + the QuickJS browser variant are devDeps)
cd web-preview
node build.mjs        # → dist/preview.html (self-contained, publishable)
```

`build.mjs` bundles `entry.ts` with esbuild, aliasing `@sage/*` to their TypeScript
sources and stubbing the Node `quickjs-emscripten` loader (the browser injects an
embedded-wasm module instead). The bundle is inlined into `template.html` as a
module script, producing one static, self-contained page.
