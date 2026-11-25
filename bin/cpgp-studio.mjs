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
const npxBin = isWindows ? 'npx.cmd' : 'npx';

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

function openBrowser(url) {
  setTimeout(() => {
    try {
      if (process.platform === 'win32') {
        const child = spawn('explorer.exe', [url], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } else if (process.platform === 'darwin') {
        const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
        child.unref();
      } else {
        const child = spawn('xdg-open', [url], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      }
    } catch {
      // ignore auto-open errors
    }
  }, 1800);
}

function runCommand(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: APP_DIR,
      stdio: 'inherit',
      shell: isWindows,
    });
    child.on('exit', (code) => resolve(code ?? 0));
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
        { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `CPGP-Studio/${version}` } }
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

  // Run initial scan before starting server (instant native Node.js in standalone mode!)
  if (hasStandaloneServer && fs.existsSync(bundledScanPath)) {
    await runCommand(process.execPath, [bundledScanPath]);
  } else {
    await runCommand(npmBin, ['run', 'scan']);
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

  if (!args.includes('--no-browser')) {
    openBrowser(url);
  }

  if (hasStandaloneServer) {
    process.env.PORT = String(port);
    process.env.CPGP_APP_ROOT = APP_DIR;
    const code = await runCommand(process.execPath, [bundledServerPath]);
    process.exit(code);
  } else if (hasProdBuild) {
    // Legacy production bundle serving dist/ via tsx
    process.env.PORT = String(port);
    const code = await runCommand(npmBin, ['run', 'server']);
    process.exit(code);
  } else {
    // Run Vite dev middleware server
    const code = await runCommand(npmBin, [
      'run',
      'dev',
      '--',
      '--port',
      String(port),
    ]);
    process.exit(code);
  }
}

void main();
