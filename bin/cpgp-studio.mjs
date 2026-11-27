#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isWindows = process.platform === 'win32';
const npmBin = isWindows ? 'npm.cmd' : 'npm';

function readVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf-8')
    );
    return pkg.version || '2.0.0';
  } catch {
    return '2.0.0';
  }
}

const LISTENING_URL_REGEX = /http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/;

function openBrowser(url, delayMs = 300) {
  const timer = setTimeout(() => {
    try {
      let child;
      if (process.platform === 'win32') {
        child = spawn('explorer.exe', [url], {
          detached: true,
          stdio: 'ignore',
        });
      } else if (process.platform === 'darwin') {
        child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      } else {
        child = spawn('xdg-open', [url], {
          detached: true,
          stdio: 'ignore',
        });
      }
      child.on('error', () => {
        // ignore auto-open binary errors
      });
      child.unref();
    } catch {
      // ignore auto-open errors
    }
  }, delayMs);
  timer.unref();
  return timer;
}

function runCommand(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const needsShell = isWindows && /\.(cmd|bat)$/i.test(cmd);
    const child = spawn(cmd, cmdArgs, {
      cwd: APP_DIR,
      stdio: 'inherit',
      shell: needsShell,
    });
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

function runServerCommand(cmd, cmdArgs, fallbackUrl, shouldOpenBrowser) {
  return new Promise((resolve) => {
    const needsShell = isWindows && /\.(cmd|bat)$/i.test(cmd);
    const child = spawn(cmd, cmdArgs, {
      cwd: APP_DIR,
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: needsShell,
    });

    let browserOpened = false;
    let fallbackTimer = null;
    let stdoutBuffer = '';

    const triggerOpenOnce = (targetUrl, delayMs) => {
      if (!shouldOpenBrowser || browserOpened) return;
      browserOpened = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      openBrowser(targetUrl, delayMs);
    };

    if (shouldOpenBrowser) {
      fallbackTimer = setTimeout(() => {
        triggerOpenOnce(fallbackUrl, 0);
      }, 4000);
      fallbackTimer.unref();
    }

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        process.stdout.write(chunk);
        if (!shouldOpenBrowser || browserOpened) return;
        stdoutBuffer += chunk.toString('utf-8');
        if (stdoutBuffer.length > 4096) {
          stdoutBuffer = stdoutBuffer.slice(-2048);
        }
        const cleanText = stdoutBuffer.replace(/\x1b\[[0-9;]*m/g, '');
        const match = cleanText.match(LISTENING_URL_REGEX);
        if (match) {
          triggerOpenOnce(match[0], 300);
        }
      });
    }

    child.on('error', () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      resolve(1);
    });

    child.on('exit', (code) => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      resolve(code ?? 0);
    });
  });
}

async function main() {
  const version = readVersion();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
CPGP Studio v${version} (Content Planer Gam Puko)
Multi-Workspace Local Content Planner, Watermark Studio & Auto-Post Suite

Penggunaan:
  cpgp-studio                 Jalankan CPGP Studio dan buka browser otomatis
  cpgp-studio --no-browser    Jalankan CPGP Studio tanpa membuka tab browser
  cpgp-studio --scan-only     Scan workspace aktif ke database JSON lalu keluar
  cpgp-studio --port <port>   Jalankan pada port tertentu (default: 5173)
  cpgp-studio --version       Tampilkan versi CPGP Studio
  cpgp-studio --update        Cek pembaruan rilis terbaru di GitHub
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`cpgp-studio v${version}`);
    process.exit(0);
  }

  if (args.includes('--update')) {
    console.log(`CPGP Studio terpasang: v${version}`);
    console.log('Memeriksa rilis terbaru di https://github.com/renaldyakb/CPGP-Studio ...');
    try {
      const res = await fetch(
        'https://api.github.com/repos/renaldyakb/CPGP-Studio/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': `CPGP-Studio/${version}`,
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const latest = String(data.tag_name || '').replace(/^v/i, '');
        if (latest && latest !== version) {
          console.log(`Pembaruan tersedia: v${latest}`);
          console.log(`Unduh di: ${data.html_url}`);
          console.log('Atau jalankan: git pull && npm install');
        } else {
          console.log('Anda sudah menggunakan versi terbaru.');
        }
      } else {
        console.log('Belum ada rilis publik atau GitHub API tidak dapat dijangkau.');
      }
    } catch {
      console.log('Gagal menghubungi GitHub. Periksa koneksi internet Anda.');
    }
    process.exit(0);
  }

  const portIdx = args.indexOf('--port');
  const customPort =
    portIdx !== -1 && args[portIdx + 1] ? Number(args[portIdx + 1]) : null;
  const distIndexPath = path.join(APP_DIR, 'dist', 'index.html');
  const bundledServerPath = path.join(APP_DIR, 'dist-server', 'server.mjs');
  const bundledScanPath = path.join(APP_DIR, 'dist-server', 'cli-scan.mjs');
  const hasProdBuild = fs.existsSync(distIndexPath);
  const hasStandaloneServer =
    hasProdBuild && fs.existsSync(bundledServerPath);

  console.log('========================================================================');
  console.log(`   CPGP Studio v${version} (Content Planer Gam Puko)`);
  console.log('   Multi-Workspace Content Planner | Watermark Studio | Auto-Post');
  console.log('========================================================================');

  if (
    !hasStandaloneServer &&
    !fs.existsSync(path.join(APP_DIR, 'shared', 'captionParser.ts'))
  ) {
    console.error(
      '\n[ERROR] Berkas inti aplikasi tidak ditemukan di dalam direktori aplikasi.'
    );
    console.error(
      'Kemungkinan file ZIP rilis belum selesai diekstrak secara penuh.'
    );
    console.error(
      'Silakan ekstrak ulang seluruh isi ZIP ke folder lokal (misal D:\\CPGP-Studio).\n'
    );
    process.exit(1);
  }

  // Standalone release bundle ships pre-compiled server + pre-packed runtime node_modules (ZERO npm install!)
  if (!hasStandaloneServer && !fs.existsSync(path.join(APP_DIR, 'node_modules'))) {
    console.log(
      hasProdBuild
        ? 'Menginstall dependencies produksi (npm install --omit=dev)...'
        : 'Menginstall dependencies (npm install)...'
    );
    const installCode = await runCommand(
      npmBin,
      hasProdBuild ? ['install', '--omit=dev'] : ['install']
    );
    if (installCode !== 0) {
      process.exit(installCode);
    }
  }

  if (args.includes('--scan-only')) {
    const code =
      hasStandaloneServer && fs.existsSync(bundledScanPath)
        ? await runCommand(process.execPath, [bundledScanPath])
        : await runCommand(npmBin, ['run', 'scan']);
    process.exit(code);
  }

  const port = customPort || 5173;
  const url = `http://localhost:${port}`;
  console.log(
    `\n  Mode   : ${
      hasStandaloneServer
        ? 'Standalone Zero-Install Release (dist + dist-server)'
        : hasProdBuild
          ? 'Production Bundle (dist/)'
          : 'Development (Vite)'
    }`
  );
  console.log(`  Web UI : ${url}`);
  console.log('  Tekan Ctrl + C untuk menghentikan server.\n');

  const shouldOpenBrowser = !args.includes('--no-browser');

  if (hasStandaloneServer) {
    process.env.PORT = String(port);
    process.env.CPGP_APP_ROOT = APP_DIR;
    const code = await runServerCommand(
      process.execPath,
      [bundledServerPath],
      url,
      shouldOpenBrowser
    );
    process.exit(code);
  } else if (hasProdBuild) {
    // Legacy production bundle serving dist/ via tsx
    process.env.PORT = String(port);
    const code = await runServerCommand(
      npmBin,
      ['run', 'server'],
      url,
      shouldOpenBrowser
    );
    process.exit(code);
  } else {
    // Run Vite dev middleware server
    const code = await runServerCommand(
      npmBin,
      ['run', 'dev', '--', '--port', String(port)],
      url,
      shouldOpenBrowser
    );
    process.exit(code);
  }
}

void main();
