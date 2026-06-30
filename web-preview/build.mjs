import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // sage-agent
const pkg = (p) => path.resolve(root, p);

const result = await esbuild.build({
  entryPoints: [path.resolve(here, 'entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  write: false,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.url': '"https://sage.preview/app"',
  },
  alias: {
    // Resolve the @sage workspace packages straight to their TS sources.
    '@sage/shared-types': pkg('packages/shared-types/src/index.ts'),
    '@sage/sse-contract': pkg('packages/sse-contract/src/index.ts'),
    '@sage/tool-registry': pkg('packages/tool-registry/src/index.ts'),
    '@sage/arbiter-core': pkg('packages/arbiter-core/src/index.ts'),
    '@sage/voice-core': pkg('packages/voice-core/src/index.ts'),
    '@sage/memory-core': pkg('packages/memory-core/src/index.ts'),
    '@sage/sandbox-core': pkg('packages/sandbox-core/src/index.ts'),
    // Keep the Node wasm loader out of the static page (we inject a module).
    'quickjs-emscripten': path.resolve(here, 'stub-quickjs.ts'),
  },
});

const js = result.outputFiles[0].text;
const template = readFileSync(path.resolve(here, 'template.html'), 'utf8');
const html = template.replace('<!--BUNDLE-->', () => `<script type="module">${js}</script>`);

mkdirSync(path.resolve(here, 'dist'), { recursive: true });
writeFileSync(path.resolve(here, 'dist/preview.html'), html);

console.log(`bundle: ${(js.length / 1024).toFixed(0)} KB | page: ${(html.length / 1024).toFixed(0)} KB`);
