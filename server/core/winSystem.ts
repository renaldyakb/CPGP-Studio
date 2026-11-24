import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PathValidationResult } from '../../shared/types/workspace.ts';
import { findContentFolderPaths, resolveMonthInfo } from '../scanner.ts';

export async function pickWindowsFolder(
  initialDir?: string
): Promise<{ cancelled: boolean; path: string | null }> {
  const safeInitialDir =
    initialDir && initialDir.trim() && fs.existsSync(initialDir.trim())
      ? path.win32.normalize(initialDir.trim()).replace(/'/g, "''")
      : '';

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.Width = 0
$owner.Height = 0
$owner.StartPosition = 'CenterScreen'
$owner.WindowState = 'Minimized'
$owner.ShowInTaskbar = $false

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Pilih Folder Sumber Konten (CPGP)'
$dialog.ShowNewFolderButton = $true
${safeInitialDir ? `$dialog.SelectedPath = '${safeInitialDir}'` : ''}

$result = $dialog.ShowDialog($owner)
$owner.Dispose()

if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.SelectedPath
}
`.trim();

  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', psScript],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const finish = (selectedPath: string | null) => {
      if (settled) return;
      settled = true;
      const trimmed = (selectedPath ?? '').trim();
      if (!trimmed) {
        resolve({ cancelled: true, path: null });
      } else {
        resolve({ cancelled: false, path: path.win32.normalize(trimmed) });
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });

    child.on('error', () => {
      finish(null);
    });

    child.on('close', () => {
      finish(stdout);
    });
  });
}

export function validateContentRootPath(rawPath: string): PathValidationResult {
  const trimmed = (rawPath ?? '').trim();
  if (!trimmed) {
    return {
      exists: false,
      isDirectory: false,
      writable: false,
      normalizedPath: '',
      detectedMonthFolders: [],
      detectedSlotFoldersCount: 0,
      sampleCodes: [],
    };
  }

  const normalizedPath = path.resolve(trimmed);
  const exists = fs.existsSync(normalizedPath);
  if (!exists) {
    return {
      exists: false,
      isDirectory: false,
      writable: false,
      normalizedPath,
      detectedMonthFolders: [],
      detectedSlotFoldersCount: 0,
      sampleCodes: [],
    };
  }

  let isDirectory = false;
  try {
    isDirectory = fs.statSync(normalizedPath).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    return {
      exists: true,
      isDirectory: false,
      writable: false,
      normalizedPath,
      detectedMonthFolders: [],
      detectedSlotFoldersCount: 0,
      sampleCodes: [],
    };
  }

  let writable = false;
  try {
    fs.accessSync(normalizedPath, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  const detectedMonthSet = new Set<string>();
  try {
    const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^\d{1,2}\.\d{2}$/.test(entry.name)) {
        const info = resolveMonthInfo(entry.name);
        if (info.monthName) {
          detectedMonthSet.add(entry.name);
        }
      }
    }
  } catch {
    // Ignore read error
  }

  const slotFolders = findContentFolderPaths(normalizedPath);
  const sampleCodes = slotFolders
    .slice(0, 6)
    .map((p) => path.basename(p));

  return {
    exists: true,
    isDirectory: true,
    writable,
    normalizedPath,
    detectedMonthFolders: Array.from(detectedMonthSet),
    detectedSlotFoldersCount: slotFolders.length,
    sampleCodes,
  };
}
