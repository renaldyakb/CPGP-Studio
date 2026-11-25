#Requires -Version 5.1
<#
  CPGP Studio (Content Planer Gam Puko) — Interactive Windows Terminal Launcher
  Step-by-step device check, Node.js LTS auto-installer, GitHub release updater,
  dependency check, and server bootstrap with interactive Space+Enter radio menus.
#>

param(
  [switch]$CheckOnly,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ForwardArgs
)

$ErrorActionPreference = 'Stop'

# Enable UTF-8 console rendering & native Windows ANSI sequences
try {
  [Console]::InputEncoding  = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding           = [System.Text.UTF8Encoding]::new($false)
} catch {}

try {
  $Host.UI.RawUI.WindowTitle = 'CPGP Studio - Content Planer Gam Puko'
} catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot   = Split-Path -Parent $ScriptDir
Set-Location -LiteralPath $AppRoot

# ==============================================================================
# ANSI Luxury Burgundy Theme Palette
# ==============================================================================
$ESC       = [char]27
$RST       = "$ESC[0m"
$BOLD      = "$ESC[1m"
$DIM       = "$ESC[2m"

$BURG_DEEP = "$ESC[38;2;136;19;55m"
$BURG_MAIN = "$ESC[38;2;190;18;60m"
$BURG_ROSE = "$ESC[38;2;251;113;133m"
$BURG_SOFT = "$ESC[38;2;253;164;175m"
$IVORY     = "$ESC[38;2;250;250;250m"
$MUTED     = "$ESC[38;2;156;163;175m"
$LINE_CLR  = "$ESC[38;2;92;32;48m"
$EMERALD   = "$ESC[38;2;52;211;153m"
$AMBER     = "$ESC[38;2;251;191;36m"
$CRIMSON   = "$ESC[38;2;248;113;113m"
$SKY       = "$ESC[38;2;56;189;248m"
$BG_PILL   = "$ESC[48;2;101;18;32m"

$REPO_OWNER = 'renaldyakb'
$REPO_NAME  = 'CPGP-Studio'
$REPO_URL   = "https://github.com/$REPO_OWNER/$REPO_NAME"

# Ensure TLS 1.2+ for GitHub & Node.js API calls on Windows PowerShell 5.1
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

# ==============================================================================
# UI Helpers
# ==============================================================================
function Get-LocalAppVersion {
  $pkgPath = Join-Path $AppRoot 'package.json'
  if (Test-Path -LiteralPath $pkgPath) {
    try {
      $pkg = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($pkg.version) { return [string]$pkg.version }
    } catch {}
  }
  return '2.0.0'
}

function Format-BoxRow {
  param(
    [string]$Content,
    [int]$InnerWidth = 72,
    [string]$BorderColor = $LINE_CLR,
    [string]$Indent = ''
  )
  $plain = [regex]::Replace($Content, '\x1b\[[0-9;]*m', '')
  $pad   = ' ' * [Math]::Max(0, $InnerWidth - $plain.Length)
  return "${Indent}${BorderColor}│${RST}${Content}${pad}${BorderColor}│${RST}"
}

function Show-Banner {
  param([string]$Version)
  try { Clear-Host } catch {}

  $w = 72
  $top    = "${LINE_CLR}╭" + ('─' * $w) + "╮${RST}"
  $bottom = "${LINE_CLR}╰" + ('─' * $w) + "╯${RST}"
  $sep    = "${LINE_CLR}├" + ('─' * $w) + "┤${RST}"

  $badgeText = " STUDIO v$Version "

  $rootDisplay = $AppRoot
  if ($rootDisplay.Length -gt 54) {
    $rootDisplay = '...' + $rootDisplay.Substring($rootDisplay.Length - 51)
  }
  $urlDisplay = 'http://localhost:5173'

  Write-Host ''
  Write-Host $top
  Write-Host (Format-BoxRow -Content "   ${BURG_ROSE}${BOLD} ██████╗██████╗  ██████╗ ██████╗ ${RST}   ${BG_PILL}${IVORY}${BOLD}$badgeText${RST}" -InnerWidth $w)
  Write-Host (Format-BoxRow -Content "   ${BURG_MAIN}${BOLD}██╔════╝██╔══██╗██╔════╝ ██╔══██╗${RST}   ${IVORY}Content Planer Gam Puko${RST}" -InnerWidth $w)
  Write-Host (Format-BoxRow -Content "   ${BURG_MAIN}${BOLD}██║     ██████╔╝██║  ███╗██████╔╝${RST}   ${MUTED}Multi-Workspace Content Planner${RST}" -InnerWidth $w)
  Write-Host (Format-BoxRow -Content "   ${BURG_DEEP}${BOLD}██║     ██╔═══╝ ██║   ██║██╔═══╝ ${RST}   ${MUTED}Watermark Studio · Auto-Post${RST}" -InnerWidth $w)
  Write-Host (Format-BoxRow -Content "   ${BURG_DEEP}${BOLD}╚██████╗██║     ╚██████╔╝██║     ${RST}   ${MUTED}YouTube · TikTok · IG · FB${RST}" -InnerWidth $w)
  Write-Host (Format-BoxRow -Content "   ${BURG_DEEP} ╚═════╝╚═╝      ╚═════╝ ╚═╝     ${RST}" -InnerWidth $w)
  Write-Host $sep
  Write-Host (Format-BoxRow -Content "  ${MUTED}App Root   :${RST} ${IVORY}$rootDisplay${RST}" -InnerWidth $w)
  Write-Host (Format-BoxRow -Content "  ${MUTED}Web UI URL :${RST} ${SKY}$urlDisplay${RST}" -InnerWidth $w)
  Write-Host $bottom
  Write-Host ''
}

function Write-StepHeader {
  param(
    [string]$StepTag,
    [string]$Title
  )
  Write-Host "  ${BURG_ROSE}${BOLD}[$StepTag]${RST} ${IVORY}${BOLD}$Title${RST}"
  Write-Host ("  ${LINE_CLR}" + ('─' * 70) + "${RST}")
}

function Write-InfoRow {
  param(
    [string]$Label,
    [string]$Value,
    [string]$ValueColor = $IVORY
  )
  $padded = $Label.PadRight(18)
  Write-Host "    ${MUTED}$padded${RST} ${LINE_CLR}:${RST} $ValueColor$Value${RST}"
}

function Write-StatusOk {
  param([string]$Message)
  Write-Host "    ${EMERALD}${BOLD}[OK]${RST}  ${IVORY}$Message${RST}"
}

function Write-StatusWarn {
  param([string]$Message)
  Write-Host "    ${AMBER}${BOLD}[!]${RST}   ${AMBER}$Message${RST}"
}

function Write-StatusErr {
  param([string]$Message)
  Write-Host "    ${CRIMSON}${BOLD}[X]${RST}   ${CRIMSON}$Message${RST}"
}

function Write-StatusInfo {
  param([string]$Message)
  Write-Host "    ${SKY}${BOLD}[i]${RST}   ${MUTED}$Message${RST}"
}

<#
  Interactive Radio Prompt:
    ↑ / ↓ (or W / S) : Move focus cursor
    Space            : Select radio option (●)
    Enter            : Confirm selected option (●)
#>
function Show-RadioMenu {
  param(
    [string]$Title,
    [string]$Subtitle = '',
    [hashtable[]]$Options,
    [int]$DefaultSelected = 0
  )

  $cursorIdx   = $DefaultSelected
  $selectedIdx = $DefaultSelected
  $count       = $Options.Count

  Write-Host ''
  Write-Host "  ${BURG_SOFT}${BOLD}▸ $Title${RST}"
  if ($Subtitle) {
    Write-Host "    ${MUTED}$Subtitle${RST}"
  }
  Write-Host ''

  # Non-interactive fallback
  if ([Console]::IsInputRedirected) {
    return $selectedIdx
  }

  $startTop = [Console]::CursorTop
  $prevCursorVisible = $true
  try {
    $prevCursorVisible = [Console]::CursorVisible
    [Console]::CursorVisible = $false
  } catch {}

  $linesRendered = 0

  try {
    while ($true) {
      # Ensure we have room if scrolling happened near bottom of terminal buffer
      $totalLinesNeeded = ($count * 2) + 2
      if ($linesRendered -gt 0) {
        $targetTop = [Math]::Max(0, [Console]::CursorTop - $linesRendered)
        [Console]::SetCursorPosition(0, $targetTop)
      }

      $linesRendered = 0
      for ($i = 0; $i -lt $count; $i++) {
        $opt       = $Options[$i]
        $isFocused = ($i -eq $cursorIdx)
        $isPicked  = ($i -eq $selectedIdx)

        $pointer = if ($isFocused) { "${BURG_ROSE}${BOLD}❯${RST}" } else { ' ' }
        $radio   = if ($isPicked)  { "${BURG_ROSE}${BOLD}(●)${RST}" } else { "${MUTED}(○)${RST}" }
        $labelCl = if ($isFocused -or $isPicked) { "${IVORY}${BOLD}" } else { "${MUTED}" }

        $line1 = "    $pointer $radio $labelCl$($opt.Label)${RST}"
        Write-Host ($line1 + "$ESC[K")
        $linesRendered++

        if ($opt.Description) {
          $descCl = if ($isFocused) { $BURG_SOFT } else { $MUTED }
          $line2  = "          ${descCl}$($opt.Description)${RST}"
          Write-Host ($line2 + "$ESC[K")
          $linesRendered++
        }
      }

      Write-Host ("$ESC[K")
      $linesRendered++
      Write-Host ("    ${MUTED}[↑/↓] Pindah  ·  [${IVORY}Spasi${MUTED}] Pilih radio (●)  ·  [${IVORY}Enter${MUTED}] Konfirmasi${RST}$ESC[K")
      $linesRendered++

      $keyInfo = [Console]::ReadKey($true)
      $key     = $keyInfo.Key

      if ($key -eq [ConsoleKey]::UpArrow -or $key -eq [ConsoleKey]::W) {
        $cursorIdx = ($cursorIdx - 1 + $count) % $count
      } elseif ($key -eq [ConsoleKey]::DownArrow -or $key -eq [ConsoleKey]::S) {
        $cursorIdx = ($cursorIdx + 1) % $count
      } elseif ($key -eq [ConsoleKey]::Spacebar) {
        $selectedIdx = $cursorIdx
      } elseif ($key -eq [ConsoleKey]::Enter) {
        break
      } elseif ($key -ge [ConsoleKey]::D1 -and $key -le [ConsoleKey]::D9) {
        $num = [int]$key - [int][ConsoleKey]::D1
        if ($num -lt $count) {
          $cursorIdx   = $num
          $selectedIdx = $num
        }
      }
    }
  } finally {
    try { [Console]::CursorVisible = $prevCursorVisible } catch {}
  }

  Write-Host ''
  return $selectedIdx
}

function Refresh-SessionPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath    = [Environment]::GetEnvironmentVariable('Path', 'User')
  $combined    = @($machinePath, $userPath, "$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs") |
    Where-Object { $_ -and $_.Trim().Length -gt 0 }
  $env:Path = ($combined -join ';')
}

function Compare-SemVer {
  param([string]$A, [string]$B)
  $pa = ($A -replace '^v', '' -split '[.\-]') | ForEach-Object { $n = 0; [void][int]::TryParse($_, [ref]$n); $n }
  $pb = ($B -replace '^v', '' -split '[.\-]') | ForEach-Object { $n = 0; [void][int]::TryParse($_, [ref]$n); $n }
  for ($i = 0; $i -lt 3; $i++) {
    $va = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
    $vb = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
    if ($va -gt $vb) { return 1 }
    if ($va -lt $vb) { return -1 }
  }
  return 0
}

function Get-LatestNodeLtsInfo {
  $fallback = @{ Version = 'v22.14.0'; Codename = 'LTS' }
  try {
    $list = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 6 -UseBasicParsing
    foreach ($entry in $list) {
      if ($entry.lts -and $entry.lts -ne $false) {
        return @{
          Version  = [string]$entry.version
          Codename = [string]$entry.lts
        }
      }
    }
  } catch {}
  return $fallback
}

function Show-ManualNodeTutorial {
  param([hashtable]$LtsInfo)
  $w = 70
  $ltsLabel = "LTS terbaru ($($LtsInfo.Version) $($LtsInfo.Codename))"
  Write-Host ("  ${LINE_CLR}╭" + ('─' * $w) + "╮${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${BURG_ROSE}${BOLD}PANDUAN DOWNLOAD & INSTALL MANUAL NODE.JS LTS${RST}")
  Write-Host ("  ${LINE_CLR}├" + ('─' * $w) + "┤${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}1. Buka situs resmi:${RST} ${SKY}https://nodejs.org/en/download${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}2. Pilih versi${RST} ${EMERALD}${BOLD}$ltsLabel${RST} ${IVORY}(.msi)${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}3. Jalankan file .msi lalu klik Next sampai selesai.${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "     ${MUTED}(Pastikan opsi 'Add to PATH' tetap tercentang)${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}4. Tutup terminal ini lalu klik 2x${RST} ${BURG_SOFT}start-planner.bat${RST} ${IVORY}kembali.${RST}")
  Write-Host ("  ${LINE_CLR}╰" + ('─' * $w) + "╯${RST}")
  Write-Host ''
  Write-Host "  ${MUTED}Tekan tombol apa saja untuk keluar...${RST}"
  if (-not [Console]::IsInputRedirected) {
    [void][Console]::ReadKey($true)
  }
}

function Install-NodeJsLts {
  param([hashtable]$LtsInfo)
  $ver = $LtsInfo.Version

  Write-StatusInfo "Menyiapkan instalasi Node.js $ver (LTS)..."

  # Method 1: Windows Package Manager (winget)
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-StatusInfo 'Menggunakan winget (OpenJS.NodeJS.LTS)...'
    Write-Host ''
    & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
      Refresh-SessionPath
      if (Get-Command node -ErrorAction SilentlyContinue) {
        return $true
      }
    }
    Write-StatusWarn 'Winget belum menyelesaikan instalasi. Mencoba installer resmi .msi dari nodejs.org...'
  }

  # Method 2: Direct official Node.js LTS MSI installer
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  $msiName = "node-$ver-$arch.msi"
  $msiUrl  = "https://nodejs.org/dist/$ver/$msiName"
  $msiPath = Join-Path $env:TEMP $msiName

  try {
    Write-StatusInfo "Mengunduh $msiUrl ..."
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing -TimeoutSec 120
    Write-StatusInfo 'Menjalankan Windows Installer (Node.js LTS)...'
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$msiPath`" /qb" -Wait -PassThru
    try { Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue } catch {}

    if ($proc.ExitCode -eq 0) {
      Refresh-SessionPath
      if (Get-Command node -ErrorAction SilentlyContinue) {
        return $true
      }
    }
  } catch {
    Write-StatusErr "Gagal mengunduh/memasang installer Node.js: $($_.Exception.Message)"
  }

  return $false
}

function Show-ManualFfmpegTutorial {
  $w = 70
  Write-Host ("  ${LINE_CLR}╭" + ('─' * $w) + "╮${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${BURG_ROSE}${BOLD}PANDUAN INSTALL MANUAL FFMPEG (UNTUK WATERMARK STUDIO)${RST}")
  Write-Host ("  ${LINE_CLR}├" + ('─' * $w) + "┤${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}1. Buka:${RST} ${SKY}https://www.gyan.dev/ffmpeg/builds/${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}2. Unduh${RST} ${EMERALD}${BOLD}ffmpeg-release-essentials.zip${RST} ${IVORY}lalu ekstrak (misal C:\ffmpeg)${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}3. Tambahkan folder${RST} ${BURG_SOFT}C:\ffmpeg\bin${RST} ${IVORY}ke System Environment PATH.${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $w -Content "  ${IVORY}4. Atau via terminal:${RST} ${SKY}winget install Gyan.FFmpeg${RST}")
  Write-Host ("  ${LINE_CLR}╰" + ('─' * $w) + "╯${RST}")
  Write-Host ''
}

function Install-FfmpegWindows {
  Write-StatusInfo 'Menyiapkan instalasi FFmpeg & FFprobe (Gyan.FFmpeg)...'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-StatusInfo 'Memasang otomatis via winget (Gyan.FFmpeg)...'
    Write-Host ''
    & winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
      Refresh-SessionPath
      if ((Get-Command ffmpeg -ErrorAction SilentlyContinue) -and (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
        return $true
      }
    }
  }
  return $false
}

function Install-ChromeWindows {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-StatusInfo 'Memasang Google Chrome via winget (Google.Chrome)...'
    Write-Host ''
    & winget install --id Google.Chrome -e --accept-package-agreements --accept-source-agreements
    return ($LASTEXITCODE -eq 0)
  }
  return $false
}

function Invoke-GitHubSelfUpdate {
  param(
    [string]$TargetTag,
    [string]$ZipDownloadUrl
  )

  # Case A: Git repository checkout
  $gitCmd = Get-Command git -ErrorAction SilentlyContinue
  if ($gitCmd -and (Test-Path -LiteralPath (Join-Path $AppRoot '.git'))) {
    Write-StatusInfo 'Repo Git terdeteksi. Menarik pembaruan via git pull...'
    & git fetch --tags origin 2>&1 | Out-Null
    & git pull --ff-only origin main
    if ($LASTEXITCODE -eq 0) {
      Write-StatusOk "Source code berhasil diperbarui ke $TargetTag via Git."
      return $true
    }
    Write-StatusWarn 'git pull tidak dapat fast-forward (mungkin ada perubahan lokal).'
    return $false
  }

  # Case B: Production Release ZIP Bundle (preserve data/ & .cache/)
  if (-not $ZipDownloadUrl) {
    Write-StatusWarn "File ZIP rilis untuk $TargetTag belum tersedia di GitHub Releases."
    Write-StatusInfo "Silakan cek manual di: $REPO_URL/releases/latest"
    return $false
  }

  $tmpZip = Join-Path $env:TEMP "cpgp-update-$TargetTag.zip"
  $tmpDir = Join-Path $env:TEMP "cpgp-update-$TargetTag"

  try {
    Write-StatusInfo "Mengunduh rilis $TargetTag dari GitHub..."
    Invoke-WebRequest -Uri $ZipDownloadUrl -OutFile $tmpZip -UseBasicParsing -TimeoutSec 180

    if (Test-Path -LiteralPath $tmpDir) {
      Remove-Item -LiteralPath $tmpDir -Recurse -Force
    }
    Write-StatusInfo 'Mengekstrak paket rilis...'
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force

    # Locate extracted root folder (CPGP-Studio-vX.Y.Z or direct)
    $sourceRoot = $tmpDir
    $subDirs = Get-ChildItem -LiteralPath $tmpDir -Directory
    if ($subDirs.Count -eq 1 -and (Test-Path -LiteralPath (Join-Path $subDirs[0].FullName 'package.json'))) {
      $sourceRoot = $subDirs[0].FullName
    }

    Write-StatusInfo 'Menyalin pembaruan (folder data/ dan .cache/ tetap aman)...'
    $protected = @('data', '.cache', 'node_modules', '.git')
    $entries = Get-ChildItem -LiteralPath $sourceRoot -Force
    foreach ($entry in $entries) {
      if ($protected -contains $entry.Name) { continue }
      $dest = Join-Path $AppRoot $entry.Name
      if ($entry.PSIsContainer) {
        if (Test-Path -LiteralPath $dest) {
          Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
        }
        Copy-Item -LiteralPath $entry.FullName -Destination $dest -Recurse -Force
      } else {
        Copy-Item -LiteralPath $entry.FullName -Destination $dest -Force
      }
    }

    Write-StatusOk "CPGP Studio berhasil diperbarui ke $TargetTag!"
    return $true
  } catch {
    Write-StatusErr "Gagal memperbarui otomatis: $($_.Exception.Message)"
    return $false
  } finally {
    try { Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
  }
}

# ==============================================================================
# MAIN LAUNCHER PIPELINE
# ==============================================================================
$localVersion = Get-LocalAppVersion
Show-Banner -Version $localVersion

# ------------------------------------------------------------------------------
# STEP 1: CEK DEVICE
# ------------------------------------------------------------------------------
Write-StepHeader -StepTag '1/6' -Title 'Pemeriksaan Perangkat & Lingkungan'

$osCaption = 'Windows'
$osBuild   = [Environment]::OSVersion.Version.Build
$ramGb     = '-'
$cpuName   = $env:PROCESSOR_IDENTIFIER
try {
  $osCim = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
  if ($osCim) {
    $osCaption = "$($osCim.Caption.Trim()) (Build $($osCim.BuildNumber))"
    $ramGb     = '{0:N1} GB' -f ($osCim.TotalVisibleMemorySize / 1MB)
  }
} catch {}
try {
  $cpuCim = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cpuCim -and $cpuCim.Name) { $cpuName = $cpuCim.Name.Trim() }
} catch {}

$archLabel = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } elseif ([Environment]::Is64BitOperatingSystem) { 'x64 (64-bit)' } else { 'x86 (32-bit)' }

$freeDiskLabel = '-'
try {
  $driveLetter = (Split-Path -Qualifier $AppRoot).TrimEnd(':')
  $psDrive = Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue
  if ($psDrive -and $psDrive.Free) {
    $freeDiskLabel = '{0:N1} GB bebas (Drive {1}:)' -f ($psDrive.Free / 1GB), $driveLetter
  }
} catch {}

$browsers = @()
if ((Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe") -or (Test-Path "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") -or (Test-Path "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")) {
  $browsers += 'Google Chrome'
}
if ((Test-Path "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") -or (Test-Path "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe")) {
  $browsers += 'Microsoft Edge'
}
$browserLabel = if ($browsers.Count -gt 0) { $browsers -join ', ' } else { 'Tidak terdeteksi (opsional)' }

$hasProdBuild = Test-Path -LiteralPath (Join-Path $AppRoot 'dist\index.html')
$modeLabel    = if ($hasProdBuild) { 'Production Release (dist/)' } else { 'Development / Source' }

Write-InfoRow -Label 'Sistem Operasi' -Value $osCaption
Write-InfoRow -Label 'Arsitektur'     -Value $archLabel
Write-InfoRow -Label 'Prosesor'       -Value $cpuName
Write-InfoRow -Label 'Memori RAM'     -Value $ramGb
Write-InfoRow -Label 'Penyimpanan'    -Value $freeDiskLabel
Write-InfoRow -Label 'Browser Lokal'  -Value $browserLabel -ValueColor $(if ($browsers.Count -gt 0) { $EMERALD } else { $AMBER })
Write-InfoRow -Label 'Mode Aplikasi'  -Value $modeLabel -ValueColor $SKY
Write-Host ''

# ------------------------------------------------------------------------------
# STEP 2: CEK NODE.JS & AUTO-INSTALL LTS
# ------------------------------------------------------------------------------
Write-StepHeader -StepTag '2/6' -Title 'Pemeriksaan Runtime Node.js'

Refresh-SessionPath
$nodeCmd      = Get-Command node -ErrorAction SilentlyContinue
$nodeVersion  = $null
$nodeMajor    = 0
$needsNode    = $true

if ($nodeCmd) {
  try {
    $nodeVersion = (& node -v 2>$null).Trim()
    if ($nodeVersion -match '^v(\d+)') {
      $nodeMajor = [int]$Matches[1]
    }
    if ($nodeMajor -ge 20) {
      $needsNode = $false
    }
  } catch {}
}

if (-not $needsNode) {
  $npmVer = ''
  try { $npmVer = (& npm.cmd -v 2>$null).Trim() } catch {}
  Write-StatusOk "Node.js $nodeVersion terdeteksi$(if ($npmVer) { " (npm v$npmVer)" }), siap digunakan."
} else {
  $ltsInfo = Get-LatestNodeLtsInfo
  if ($nodeVersion) {
    Write-StatusWarn "Node.js terpasang ($nodeVersion) di bawah syarat minimal v20+. Disarankan upgrade ke $($ltsInfo.Version) LTS."
  } else {
    Write-StatusWarn "Node.js belum terpasang di perangkat ini (rekomendasi terbaru: $($ltsInfo.Version) $($ltsInfo.Codename))."
  }

  $nodeChoice = Show-RadioMenu `
    -Title 'Node.js LTS diperlukan untuk menjalankan CPGP Studio' `
    -Subtitle 'Gunakan tombol panah ↑/↓, tekan Spasi untuk memilih (●), lalu tekan Enter.' `
    -Options @(
      @{
        Label       = "Install Node.js LTS terbaru ($($ltsInfo.Version)) sekarang"
        Description = 'Unduh & pasang otomatis versi LTS resmi dari nodejs.org / winget'
      },
      @{
        Label       = 'Nanti saja (tampilkan tutorial download manual)'
        Description = 'Keluar dan lihat panduan langkah demi langkah instalasi manual'
      }
    )

  if ($nodeChoice -eq 0) {
    $installed = Install-NodeJsLts -LtsInfo $ltsInfo
    if ($installed) {
      $newVer = (& node -v 2>$null).Trim()
      Write-StatusOk "Node.js $newVer berhasil terpasang dan aktif di sesi ini!"
    } else {
      Write-StatusErr 'Instalasi otomatis Node.js belum berhasil.'
      Show-ManualNodeTutorial -LtsInfo $ltsInfo
      exit 1
    }
  } else {
    Show-ManualNodeTutorial -LtsInfo $ltsInfo
    exit 0
  }
}
Write-Host ''

# ------------------------------------------------------------------------------
# STEP 3: CEK 3RD-PARTY PENDUKUNG (FFmpeg, FFprobe, Browser, Git)
# ------------------------------------------------------------------------------
Write-StepHeader -StepTag '3/6' -Title 'Pemeriksaan 3rd-Party Pendukung (FFmpeg, Browser, Git)'

# 3A. FFmpeg & FFprobe (Watermark Studio & Media Probe)
$ffmpegCmd  = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobeCmd = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($ffmpegCmd -and $ffprobeCmd) {
  $ffFirstLine = ''
  try {
    $rawFf = (& ffmpeg -version 2>$null | Select-Object -First 1)
    if ($rawFf -match 'ffmpeg version\s+([^\s]+)') {
      $ffFirstLine = $Matches[1]
    }
  } catch {}
  Write-StatusOk "FFmpeg & FFprobe terdeteksi$(if ($ffFirstLine) { " ($ffFirstLine)" }) - Watermark Studio siap."
} else {
  Write-StatusWarn 'FFmpeg / FFprobe belum terpasang (diperlukan untuk render Watermark Studio).'
  $ffChoice = Show-RadioMenu `
    -Title 'FFmpeg belum ditemukan di perangkat ini' `
    -Subtitle 'Tanpa FFmpeg, fitur Planner & Auto-Post tetap jalan, tetapi Watermark Studio tidak bisa merender video.' `
    -Options @(
      @{
        Label       = 'Install FFmpeg & FFprobe otomatis sekarang (winget)'
        Description = 'Pasang Gyan.FFmpeg resmi dan aktifkan langsung di sesi ini'
      },
      @{
        Label       = 'Nanti saja (tampilkan panduan manual & lanjutkan)'
        Description = 'Lihat cara install manual FFmpeg lalu tetap buka CPGP Studio'
      }
    )

  if ($ffChoice -eq 0) {
    if (Install-FfmpegWindows) {
      Write-StatusOk 'FFmpeg & FFprobe berhasil terpasang dan aktif!'
    } else {
      Write-StatusWarn 'Instalasi otomatis FFmpeg belum berhasil. Berikut panduan manualnya:'
      Show-ManualFfmpegTutorial
    }
  } else {
    Show-ManualFfmpegTutorial
  }
}

# 3B. Browser Lokal (Chrome / Edge untuk Auto-Post tanpa API Key & Add-on MotionProvit)
if ($browsers.Count -gt 0) {
  Write-StatusOk "Browser lokal terdeteksi ($($browsers -join ', ')) - Auto-Post & MotionProvit siap."
} else {
  Write-StatusWarn 'Google Chrome / Microsoft Edge tidak terdeteksi (dibutuhkan untuk Auto-Post Browser & MotionProvit).'
  $brChoice = Show-RadioMenu `
    -Title 'Browser Chrome / Edge belum ditemukan' `
    -Subtitle 'Pilih untuk memasang Google Chrome otomatis atau lanjutkan tanpa Auto-Post Browser.' `
    -Options @(
      @{
        Label       = 'Install Google Chrome otomatis sekarang (winget)'
        Description = 'Disarankan agar Auto-Post 4 platform tanpa API Key langsung siap pakai'
      },
      @{
        Label       = 'Nanti saja, lanjutkan ke CPGP Studio'
        Description = 'Anda tetap bisa memakai Content Planner & Watermark Studio'
      }
    )
  if ($brChoice -eq 0) {
    if (Install-ChromeWindows) {
      Write-StatusOk 'Google Chrome berhasil terpasang!'
    } else {
      Write-StatusWarn 'Install Chrome manual di https://www.google.com/chrome/ lalu jalankan ulang.'
    }
  }
}

# 3C. Git (Opsional untuk update source repo)
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
  $gitVer = ''
  try { $gitVer = (& git --version 2>$null).Trim() } catch {}
  Write-StatusOk "$gitVer terdeteksi (mendukung auto-update via Git)."
} else {
  Write-StatusInfo 'Git tidak terpasang (opsional - update tetap bisa otomatis lewat rilis ZIP GitHub).'
}
Write-Host ''

# ------------------------------------------------------------------------------
# STEP 4: CEK PEMBARUAN GITHUB
# ------------------------------------------------------------------------------
Write-StepHeader -StepTag '4/6' -Title 'Pemeriksaan Pembaruan GitHub'
Write-StatusInfo "Memeriksa rilis terbaru di $REPO_URL ..."

$latestVersion = $null
$latestTag     = $null
$releaseUrl    = "$REPO_URL/releases/latest"
$zipAssetUrl   = $null
$checkOk       = $false

try {
  $headers = @{
    'Accept'     = 'application/vnd.github+json'
    'User-Agent' = "CPGP-Studio-Launcher/$localVersion"
  }
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest" -Headers $headers -TimeoutSec 6 -UseBasicParsing
  if ($rel -and $rel.tag_name) {
    $latestTag     = [string]$rel.tag_name
    $latestVersion = $latestTag -replace '^v', ''
    if ($rel.html_url) { $releaseUrl = [string]$rel.html_url }
    if ($rel.assets) {
      $zipAsset = $rel.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1
      if ($zipAsset) { $zipAssetUrl = [string]$zipAsset.browser_download_url }
    }
    $checkOk = $true
  }
} catch {
  # Fallback to tags endpoint if latest release hasn't finished publishing
  try {
    $headers = @{
      'Accept'     = 'application/vnd.github+json'
      'User-Agent' = "CPGP-Studio-Launcher/$localVersion"
    }
    $tags = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/tags?per_page=5" -Headers $headers -TimeoutSec 5 -UseBasicParsing
    if ($tags -and $tags.Count -gt 0 -and $tags[0].name) {
      $latestTag     = [string]$tags[0].name
      $latestVersion = $latestTag -replace '^v', ''
      $checkOk       = $true
    }
  } catch {}
}

$didUpdate = $false

if (-not $checkOk) {
  Write-StatusWarn "Tidak dapat menghubungi GitHub (mode offline). Melanjutkan dengan v$localVersion."
} elseif ((Compare-SemVer $latestVersion $localVersion) -gt 0) {
  $uw = 70
  $relUrlShort = if ($releaseUrl.Length -gt 48) { $releaseUrl.Substring(0, 45) + '...' } else { $releaseUrl }
  Write-Host ''
  Write-Host ("  ${BURG_ROSE}╭" + ('─' * $uw) + "╮${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $uw -BorderColor $BURG_ROSE -Content "  ${BURG_SOFT}${BOLD}PEMBARUAN TERSEDIA DARI GITHUB${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $uw -BorderColor $BURG_ROSE -Content "  ${MUTED}Versi Terpasang :${RST} ${IVORY}v$localVersion${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $uw -BorderColor $BURG_ROSE -Content "  ${MUTED}Versi Terbaru   :${RST} ${EMERALD}${BOLD}v$latestVersion${RST}")
  Write-Host (Format-BoxRow -Indent '  ' -InnerWidth $uw -BorderColor $BURG_ROSE -Content "  ${MUTED}Halaman Rilis   :${RST} ${SKY}$relUrlShort${RST}")
  Write-Host ("  ${BURG_ROSE}╰" + ('─' * $uw) + "╯${RST}")

  $updateChoice = Show-RadioMenu `
    -Title "Versi baru v$latestVersion tersedia. Apa yang ingin Anda lakukan?" `
    -Subtitle 'Gunakan panah ↑/↓, tekan Spasi untuk memilih radio (●), lalu tekan Enter.' `
    -Options @(
      @{
        Label       = "Update ke v$latestVersion sekarang"
        Description = 'Unduh & terapkan versi terbaru otomatis (data workspace tetap aman)'
      },
      @{
        Label       = "Lanjutkan dengan versi saat ini (v$localVersion)"
        Description = 'Lewati pembaruan kali ini dan langsung buka CPGP Studio'
      }
    )

  if ($updateChoice -eq 0) {
    $didUpdate = Invoke-GitHubSelfUpdate -TargetTag $latestTag -ZipDownloadUrl $zipAssetUrl
    if ($didUpdate) {
      $localVersion = Get-LocalAppVersion
    }
  } else {
    Write-StatusInfo "Pembaruan dilewati. Melanjutkan dengan versi v$localVersion."
  }
} else {
  Write-StatusOk "CPGP Studio sudah menggunakan versi terbaru (v$localVersion)."
}
Write-Host ''

# ------------------------------------------------------------------------------
# STEP 5: VERIFIKASI FILE INTI & DEPENDENCIES (node_modules)
# ------------------------------------------------------------------------------
Write-StepHeader -StepTag '5/6' -Title 'Pemeriksaan Struktur & Dependencies'

if (-not (Test-Path -LiteralPath (Join-Path $AppRoot 'shared\captionParser.ts'))) {
  Write-StatusErr 'Folder "shared" tidak ditemukan!'
  Write-StatusInfo 'Pastikan file ZIP rilis sudah diekstrak penuh (Extract All) ke folder lokal seperti D:\CPGP-Studio.'
  Write-Host ''
  Write-Host "  ${MUTED}Tekan tombol apa saja untuk keluar...${RST}"
  if (-not [Console]::IsInputRedirected) { [void][Console]::ReadKey($true) }
  exit 1
}

$hasNodeModules = Test-Path -LiteralPath (Join-Path $AppRoot 'node_modules')
$hasProdBuild   = Test-Path -LiteralPath (Join-Path $AppRoot 'dist\index.html')

if (-not $hasNodeModules -or $didUpdate) {
  if ($hasProdBuild) {
    Write-StatusInfo 'Memasang dependencies produksi (npm install --omit=dev)...'
    & npm.cmd install --omit=dev
  } else {
    Write-StatusInfo 'Memasang dependencies aplikasi (npm install)...'
    & npm.cmd install
  }
  if ($LASTEXITCODE -ne 0) {
    Write-StatusErr 'Gagal menginstall dependencies dengan npm.'
    Write-StatusInfo 'Periksa koneksi internet Anda lalu jalankan ulang start-planner.bat.'
    Write-Host ''
    Write-Host "  ${MUTED}Tekan tombol apa saja untuk keluar...${RST}"
    if (-not [Console]::IsInputRedirected) { [void][Console]::ReadKey($true) }
    exit 1
  }
  Write-StatusOk 'Dependencies berhasil dipasang.'
} else {
  Write-StatusOk 'Struktur berkas & node_modules lengkap dan siap.'
}
Write-Host ''

# ------------------------------------------------------------------------------
# STEP 6: JALANKAN CPGP STUDIO
# ------------------------------------------------------------------------------
Write-StepHeader -StepTag '6/6' -Title "Menjalankan CPGP Studio v$localVersion"

if ($CheckOnly) {
  Write-StatusOk 'Pemeriksaan awal selesai (--CheckOnly aktif, server tidak dijalankan).'
  exit 0
}

Write-StatusInfo 'Membuka server lokal & antarmuka Web UI...'
Write-Host ''

& node (Join-Path $AppRoot 'bin\cpgp-studio.mjs') @ForwardArgs
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Host ''
  Write-StatusErr "CPGP Studio berhenti dengan kode keluar: $exitCode"
  Write-Host "  ${MUTED}Tekan tombol apa saja untuk menutup jendela...${RST}"
  if (-not [Console]::IsInputRedirected) { [void][Console]::ReadKey($true) }
}
exit $exitCode
