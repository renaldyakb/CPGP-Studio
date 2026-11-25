import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedAppRoot: string | null = null;

/**
 * Resolves the CPGP application root directory (folder containing package.json)
 * reliably whether executed from TypeScript source (`server/...`) or from a
 * compiled production bundle (`dist-server/server.mjs`).
 */
export function resolveAppRoot(): string {
  if (cachedAppRoot) return cachedAppRoot;

  if (process.env.CPGP_APP_ROOT && fs.existsSync(process.env.CPGP_APP_ROOT)) {
    cachedAppRoot = path.resolve(process.env.CPGP_APP_ROOT);
    return cachedAppRoot;
  }

  let currentDir: string;
  try {
    currentDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    currentDir = process.cwd();
  }

  let cursor = path.resolve(currentDir);
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(cursor, 'package.json'))) {
      cachedAppRoot = cursor;
      return cachedAppRoot;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  cachedAppRoot = process.cwd();
  return cachedAppRoot;
}
