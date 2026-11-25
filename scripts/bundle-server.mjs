import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(APP_ROOT, 'dist-server');

const ESM_CJS_SHIM_BANNER = [
  "import { createRequire as __cpgpCreateRequire } from 'node:module';",
  "import { fileURLToPath as __cpgpFileURLToPath } from 'node:url';",
  "import __cpgpPath from 'node:path';",
  'const require = __cpgpCreateRequire(import.meta.url);',
  'const __filename = __cpgpFileURLToPath(import.meta.url);',
  'const __dirname = __cpgpPath.dirname(__filename);',
].join('\n');

async function buildServerBundles() {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const commonOptions = {
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    banner: { js: ESM_CJS_SHIM_BANNER },
  };

  console.log('[bundle-server] Compiling server/index.ts -> dist-server/server.mjs ...');
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(APP_ROOT, 'server', 'index.ts')],
    outfile: path.join(OUT_DIR, 'server.mjs'),
    // Keep only native/browser runtime modules external (pre-packed in release node_modules)
    external: ['@resvg/resvg-js', 'patchright', 'patchright-core'],
  });

  console.log('[bundle-server] Compiling server/cli-scan.ts -> dist-server/cli-scan.mjs ...');
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.join(APP_ROOT, 'server', 'cli-scan.ts')],
    outfile: path.join(OUT_DIR, 'cli-scan.mjs'),
    external: [],
  });

  const serverSizeMb = (
    fs.statSync(path.join(OUT_DIR, 'server.mjs')).size /
    (1024 * 1024)
  ).toFixed(2);
  const scanSizeKb = (
    fs.statSync(path.join(OUT_DIR, 'cli-scan.mjs')).size / 1024
  ).toFixed(1);

  console.log(
    `[bundle-server] Done! server.mjs (${serverSizeMb} MB), cli-scan.mjs (${scanSizeKb} KB)`
  );
}

buildServerBundles().catch((err) => {
  console.error('[bundle-server] Failed:', err);
  process.exit(1);
});
