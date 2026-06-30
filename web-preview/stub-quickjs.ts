/**
 * Browser-bundle stub for `quickjs-emscripten`. The preview injects a
 * singlefile (embedded-wasm) QuickJS module into the REAL
 * `createQuickJsWasmSandbox`, so the default Node `getQuickJS()` loader (which
 * fetches a separate .wasm) must never be bundled into the static page. This
 * stub stands in for it; it is never called because a module is always injected.
 */
export function getQuickJS(): never {
  throw new Error('getQuickJS() is stubbed in the browser preview; a module is injected.');
}
