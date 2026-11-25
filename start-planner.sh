#!/usr/bin/env bash
# ==============================================================================
# CPGP Studio (Content Planer Gam Puko) — Interactive Terminal Launcher
# Step-by-step device check, Node.js LTS installer, GitHub release updater,
# and dependency bootstrap with Space + Enter radio selection menus.
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ------------------------------------------------------------------------------
# Luxury Burgundy ANSI Palette
# ------------------------------------------------------------------------------
RST='\033[0m'
BOLD='\033[1m'
BURG_DEEP='\033[38;2;136;19;55m'
BURG_MAIN='\033[38;2;190;18;60m'
BURG_ROSE='\033[38;2;251;113;133m'
BURG_SOFT='\033[38;2;253;164;175m'
IVORY='\033[38;2;250;250;250m'
MUTED='\033[38;2;156;163;175m'
LINE_CLR='\033[38;2;92;32;48m'
EMERALD='\033[38;2;52;211;153m'
AMBER='\033[38;2;251;191;36m'
CRIMSON='\033[38;2;248;113;113m'
SKY='\033[38;2;56;189;248m'
BG_PILL='\033[48;2;101;18;32m'

REPO_OWNER="renaldyakb"
REPO_NAME="CPGP-Studio"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"

CHECK_ONLY=0
FORWARD_ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--check-only" ]; then
    CHECK_ONLY=1
  else
    FORWARD_ARGS+=("$arg")
  fi
done

get_local_version() {
  if [ -f "package.json" ]; then
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1
  else
    echo "2.0.0"
  fi
}

semver_gt() {
  local a="${1#v}" b="${2#v}"
  local a1 a2 a3 b1 b2 b3
  IFS='.' read -r a1 a2 a3 <<< "${a%%-*}"
  IFS='.' read -r b1 b2 b3 <<< "${b%%-*}"
  a1=${a1:-0}; a2=${a2:-0}; a3=${a3:-0}
  b1=${b1:-0}; b2=${b2:-0}; b3=${b3:-0}
  if [ "$a1" -gt "$b1" ]; then return 0; fi
  if [ "$a1" -lt "$b1" ]; then return 1; fi
  if [ "$a2" -gt "$b2" ]; then return 0; fi
  if [ "$a2" -lt "$b2" ]; then return 1; fi
  if [ "$a3" -gt "$b3" ]; then return 0; fi
  return 1
}

show_banner() {
  local ver="$1"
  clear 2>/dev/null || true
  local root_disp="$SCRIPT_DIR"
  if [ "${#root_disp}" -gt 52 ]; then
    root_disp="...${root_disp: -49}"
  fi
  echo ""
  echo -e "${LINE_CLR}╭────────────────────────────────────────────────────────────────────────╮${RST}"
  printf "${LINE_CLR}│${RST}   ${BURG_ROSE}${BOLD} ██████╗██████╗  ██████╗ ██████╗ ${RST}   ${BG_PILL}${IVORY}${BOLD} STUDIO v%s ${RST}%*s${LINE_CLR}│${RST}\n" "$ver" "$((24 - ${#ver}))" ""
  echo -e "${LINE_CLR}│${RST}   ${BURG_MAIN}${BOLD}██╔════╝██╔══██╗██╔════╝ ██╔══██╗${RST}   ${IVORY}Content Planer Gam Puko${RST}          ${LINE_CLR}│${RST}"
  echo -e "${LINE_CLR}│${RST}   ${BURG_MAIN}${BOLD}██║     ██████╔╝██║  ███╗██████╔╝${RST}   ${MUTED}Multi-Workspace Content Planner${RST}  ${LINE_CLR}│${RST}"
  echo -e "${LINE_CLR}│${RST}   ${BURG_DEEP}${BOLD}██║     ██╔═══╝ ██║   ██║██╔═══╝ ${RST}   ${MUTED}Watermark Studio · Auto-Post${RST}     ${LINE_CLR}│${RST}"
  echo -e "${LINE_CLR}│${RST}   ${BURG_DEEP}${BOLD}╚██████╗██║     ╚██████╔╝██║     ${RST}   ${MUTED}YouTube · TikTok · IG · FB${RST}       ${LINE_CLR}│${RST}"
  echo -e "${LINE_CLR}│${RST}   ${BURG_DEEP} ╚═════╝╚═╝      ╚═════╝ ╚═╝     ${RST}                                    ${LINE_CLR}│${RST}"
  echo -e "${LINE_CLR}├────────────────────────────────────────────────────────────────────────┤${RST}"
  printf "${LINE_CLR}│${RST}  ${MUTED}App Root   :${RST} ${IVORY}%-56s${RST} ${LINE_CLR}│${RST}\n" "$root_disp"
  printf "${LINE_CLR}│${RST}  ${MUTED}Web UI URL :${RST} ${SKY}%-56s${RST} ${LINE_CLR}│${RST}\n" "http://localhost:5173"
  echo -e "${LINE_CLR}╰────────────────────────────────────────────────────────────────────────╯${RST}"
  echo ""
}

step_header() {
  echo -e "  ${BURG_ROSE}${BOLD}[$1]${RST} ${IVORY}${BOLD}$2${RST}"
  echo -e "  ${LINE_CLR}──────────────────────────────────────────────────────────────────────${RST}"
}

info_row() {
  local label="$1" value="$2" color="${3:-$IVORY}"
  printf "    ${MUTED}%-18s${RST} ${LINE_CLR}:${RST} ${color}%s${RST}\n" "$label" "$value"
}

status_ok()   { echo -e "    ${EMERALD}${BOLD}[OK]${RST}  ${IVORY}$1${RST}"; }
status_warn() { echo -e "    ${AMBER}${BOLD}[!]${RST}   ${AMBER}$1${RST}"; }
status_err()  { echo -e "    ${CRIMSON}${BOLD}[X]${RST}   ${CRIMSON}$1${RST}"; }
status_info() { echo -e "    ${SKY}${BOLD}[i]${RST}   ${MUTED}$1${RST}"; }

# Interactive Radio Prompt:
#   Up/Down (or W/S) : Move focus cursor
#   Space            : Select radio option (●)
#   Enter            : Confirm selected option (●)
RADIO_RESULT=0
radio_menu() {
  local title="$1"
  local subtitle="$2"
  shift 2
  local labels=()
  local descs=()
  while [ "$#" -gt 0 ]; do
    labels+=("$1")
    descs+=("$2")
    shift 2
  done

  local count=${#labels[@]}
  local cursor=0
  local selected=0
  local rendered=0

  echo ""
  echo -e "  ${BURG_SOFT}${BOLD}▸ ${title}${RST}"
  if [ -n "$subtitle" ]; then
    echo -e "    ${MUTED}${subtitle}${RST}"
  fi
  echo ""

  if [ ! -t 0 ]; then
    RADIO_RESULT=$selected
    return 0
  fi

  tput civis 2>/dev/null || true
  trap 'tput cnorm 2>/dev/null || true' RETURN

  while true; do
    if [ "$rendered" -gt 0 ]; then
      printf "\033[%dA" "$rendered"
    fi

    rendered=0
    local i
    for ((i = 0; i < count; i++)); do
      local ptr=" "
      local rad="${MUTED}(○)${RST}"
      local lclr="${MUTED}"
      local dclr="${MUTED}"
      if [ "$i" -eq "$cursor" ]; then
        ptr="${BURG_ROSE}${BOLD}❯${RST}"
        lclr="${IVORY}${BOLD}"
        dclr="${BURG_SOFT}"
      fi
      if [ "$i" -eq "$selected" ]; then
        rad="${BURG_ROSE}${BOLD}(●)${RST}"
        lclr="${IVORY}${BOLD}"
      fi
      printf "    %b %b %b%s%b\033[K\n" "$ptr" "$rad" "$lclr" "${labels[$i]}" "$RST"
      rendered=$((rendered + 1))
      if [ -n "${descs[$i]}" ]; then
        printf "          %b%s%b\033[K\n" "$dclr" "${descs[$i]}" "$RST"
        rendered=$((rendered + 1))
      fi
    done

    printf "\033[K\n"
    rendered=$((rendered + 1))
    printf "    ${MUTED}[↑/↓] Pindah  ·  [${IVORY}Spasi${MUTED}] Pilih radio (●)  ·  [${IVORY}Enter${MUTED}] Konfirmasi${RST}\033[K\n"
    rendered=$((rendered + 1))

    local key=""
    IFS= read -rsn1 key || break

    if [ "$key" = $'\x1b' ]; then
      local seq=""
      IFS= read -rsn2 -t 0.1 seq || true
      case "$seq" in
        "[A") cursor=$(((cursor - 1 + count) % count)) ;;
        "[B") cursor=$(((cursor + 1) % count)) ;;
      esac
    elif [ "$key" = "w" ] || [ "$key" = "W" ]; then
      cursor=$(((cursor - 1 + count) % count))
    elif [ "$key" = "s" ] || [ "$key" = "S" ]; then
      cursor=$(((cursor + 1) % count))
    elif [ "$key" = " " ]; then
      selected=$cursor
    elif [ "$key" = "" ]; then
      break
    elif [[ "$key" =~ ^[1-9]$ ]]; then
      local idx=$((key - 1))
      if [ "$idx" -lt "$count" ]; then
        cursor=$idx
        selected=$idx
      fi
    fi
  done

  tput cnorm 2>/dev/null || true
  echo ""
  RADIO_RESULT=$selected
}

get_latest_node_lts() {
  local ver=""
  if command -v curl >/dev/null 2>&1; then
    ver=$(curl -fsSL --max-time 6 "https://nodejs.org/dist/index.json" 2>/dev/null \
      | grep -o '"version":"v[0-9.]*","date":"[^"]*","files":\[[^]]*\],"npm":"[^"]*","v8":"[^"]*","uv":"[^"]*","zlib":"[^"]*","openssl":"[^"]*","modules":"[^"]*","lts":"[^"]*"' \
      | head -n 1 \
      | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)
  fi
  echo "${ver:-v22.14.0}"
}

show_manual_node_tutorial() {
  local lts_ver="$1"
  echo -e "  ${LINE_CLR}╭──────────────────────────────────────────────────────────────────────╮${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${BURG_ROSE}${BOLD}PANDUAN DOWNLOAD & INSTALL MANUAL NODE.JS LTS${RST}                       ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}├──────────────────────────────────────────────────────────────────────┤${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${IVORY}1. Buka situs resmi:${RST} ${SKY}https://nodejs.org/en/download${RST}                 ${LINE_CLR}│${RST}"
  printf "  ${LINE_CLR}│${RST}  ${IVORY}2. Pilih versi${RST} ${EMERALD}${BOLD}LTS terbaru (%s)${RST} ${IVORY}sesuai OS Anda.${RST}%*s${LINE_CLR}│${RST}\n" "$lts_ver" "$((25 - ${#lts_ver}))" ""
  echo -e "  ${LINE_CLR}│${RST}  ${IVORY}3. Jalankan installer (.pkg / .msi / tar.xz) hingga selesai.${RST}        ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${IVORY}4. Buka ulang terminal lalu jalankan${RST} ${BURG_SOFT}./start-planner.sh${RST} ${IVORY}kembali.${RST}    ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}╰──────────────────────────────────────────────────────────────────────╯${RST}"
  echo ""
}

install_node_lts() {
  local lts_ver="$1"
  local os_type
  os_type="$(uname -s)"
  status_info "Menyiapkan instalasi Node.js ${lts_ver} (LTS)..."

  if [ "$os_type" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    status_info "Menggunakan Homebrew (brew install node@22)..."
    brew install node@22 && brew link --overwrite node@22 --force || true
    command -v node >/dev/null 2>&1 && return 0
  elif command -v winget.exe >/dev/null 2>&1; then
    status_info "Menggunakan winget (OpenJS.NodeJS.LTS)..."
    winget.exe install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements || true
    export PATH="$PATH:/c/Program Files/nodejs"
    command -v node >/dev/null 2>&1 && return 0
  elif command -v nvm >/dev/null 2>&1; then
    nvm install --lts && nvm use --lts
    command -v node >/dev/null 2>&1 && return 0
  elif command -v apt-get >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
    status_info "Memasang Node.js LTS via NodeSource (memerlukan sudo)..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
    command -v node >/dev/null 2>&1 && return 0
  fi

  return 1
}

show_manual_ffmpeg_tutorial() {
  echo -e "  ${LINE_CLR}╭──────────────────────────────────────────────────────────────────────╮${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${BURG_ROSE}${BOLD}PANDUAN INSTALL MANUAL FFMPEG (UNTUK WATERMARK STUDIO)${RST}              ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}├──────────────────────────────────────────────────────────────────────┤${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${IVORY}macOS  :${RST} ${SKY}brew install ffmpeg${RST}                                        ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${IVORY}Ubuntu :${RST} ${SKY}sudo apt update && sudo apt install -y ffmpeg${RST}              ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}│${RST}  ${IVORY}Windows:${RST} ${SKY}winget install Gyan.FFmpeg${RST}                                 ${LINE_CLR}│${RST}"
  echo -e "  ${LINE_CLR}╰──────────────────────────────────────────────────────────────────────╯${RST}"
  echo ""
}

install_ffmpeg_unix() {
  local os_type
  os_type="$(uname -s)"
  if [ "$os_type" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    brew install ffmpeg && command -v ffmpeg >/dev/null 2>&1 && return 0
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y ffmpeg && command -v ffmpeg >/dev/null 2>&1 && return 0
  elif command -v winget.exe >/dev/null 2>&1; then
    winget.exe install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements && return 0
  fi
  return 1
}

# ==============================================================================
# MAIN PIPELINE
# ==============================================================================
LOCAL_VERSION="$(get_local_version)"
show_banner "$LOCAL_VERSION"

# ------------------------------------------------------------------------------
# STEP 1: CEK DEVICE
# ------------------------------------------------------------------------------
step_header "1/6" "Pemeriksaan Perangkat & Lingkungan"

OS_NAME="$(uname -s) $(uname -r)"
ARCH_NAME="$(uname -m)"
DISK_FREE="$(df -h "$SCRIPT_DIR" 2>/dev/null | awk 'NR==2 {print $4 " bebas"}' || echo "-")"
MODE_LABEL="Development / Source"
if [ -f "dist/index.html" ] && [ -f "dist-server/server.mjs" ]; then
  MODE_LABEL="Standalone Release (Zero npm install)"
elif [ -f "dist/index.html" ]; then
  MODE_LABEL="Production Release (dist/)"
fi

info_row "Sistem Operasi" "$OS_NAME"
info_row "Arsitektur" "$ARCH_NAME"
info_row "Penyimpanan" "$DISK_FREE"
info_row "Mode Aplikasi" "$MODE_LABEL" "$SKY"
echo ""

# ------------------------------------------------------------------------------
# STEP 2: CEK NODE.JS & AUTO-INSTALL LTS
# ------------------------------------------------------------------------------
step_header "2/6" "Pemeriksaan Runtime Node.js"

NODE_VER=""
NODE_MAJOR=0
NEEDS_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v 2>/dev/null || true)"
  NODE_MAJOR="$(echo "$NODE_VER" | sed -n 's/^v\([0-9]*\).*/\1/p')"
  NODE_MAJOR="${NODE_MAJOR:-0}"
  if [ "$NODE_MAJOR" -ge 20 ]; then
    NEEDS_NODE=0
  fi
fi

if [ "$NEEDS_NODE" -eq 0 ]; then
  NPM_BIN="npm"
  if command -v npm.cmd >/dev/null 2>&1; then NPM_BIN="npm.cmd"; fi
  NPM_VER="$("$NPM_BIN" -v 2>/dev/null || true)"
  status_ok "Node.js ${NODE_VER} terdeteksi (npm v${NPM_VER:-?}), siap digunakan."
else
  LTS_VER="$(get_latest_node_lts)"
  if [ -n "$NODE_VER" ]; then
    status_warn "Node.js terpasang (${NODE_VER}) di bawah syarat minimal v20+. Disarankan upgrade ke ${LTS_VER} LTS."
  else
    status_warn "Node.js belum terpasang di perangkat ini (rekomendasi terbaru: ${LTS_VER} LTS)."
  fi

  radio_menu \
    "Node.js LTS diperlukan untuk menjalankan CPGP Studio" \
    "Gunakan tombol panah ↑/↓, tekan Spasi untuk memilih (●), lalu tekan Enter." \
    "Install Node.js LTS terbaru (${LTS_VER}) sekarang" "Pasang otomatis versi LTS terbaru di perangkat Anda" \
    "Nanti saja (tampilkan tutorial download manual)" "Keluar dan lihat panduan langkah demi langkah instalasi manual"

  if [ "$RADIO_RESULT" -eq 0 ]; then
    if install_node_lts "$LTS_VER"; then
      status_ok "Node.js $(node -v) berhasil terpasang!"
    else
      status_err "Instalasi otomatis tidak tersedia untuk lingkungan ini."
      show_manual_node_tutorial "$LTS_VER"
      exit 1
    fi
  else
    show_manual_node_tutorial "$LTS_VER"
    exit 0
  fi
fi
echo ""

# ------------------------------------------------------------------------------
# STEP 3: CEK 3RD-PARTY PENDUKUNG (FFmpeg, FFprobe, Browser, Git)
# ------------------------------------------------------------------------------
step_header "3/6" "Pemeriksaan 3rd-Party Pendukung (FFmpeg, Browser, Git)"

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  FF_VER="$(ffmpeg -version 2>/dev/null | head -n 1 | awk '{print $3}' || true)"
  status_ok "FFmpeg & FFprobe terdeteksi (${FF_VER:-OK}) - Watermark Studio siap."
else
  status_warn "FFmpeg / FFprobe belum terpasang (diperlukan untuk render Watermark Studio)."
  radio_menu \
    "FFmpeg belum ditemukan di perangkat ini" \
    "Tanpa FFmpeg, Planner & Auto-Post tetap jalan, tetapi Watermark Studio tidak dapat merender video." \
    "Install FFmpeg & FFprobe otomatis sekarang" "Pasang otomatis via Homebrew / apt / winget" \
    "Nanti saja (tampilkan panduan manual & lanjutkan)" "Lihat cara install manual FFmpeg lalu tetap buka CPGP Studio"
  if [ "$RADIO_RESULT" -eq 0 ]; then
    if install_ffmpeg_unix; then
      status_ok "FFmpeg & FFprobe berhasil terpasang!"
    else
      status_warn "Instalasi otomatis FFmpeg tidak tersedia. Berikut panduan manualnya:"
      show_manual_ffmpeg_tutorial
    fi
  else
    show_manual_ffmpeg_tutorial
  fi
fi

if command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1 || [ -d "/Applications/Google Chrome.app" ] || [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
  status_ok "Google Chrome terdeteksi - Auto-Post Browser & MotionProvit siap."
elif command -v microsoft-edge >/dev/null 2>&1 || [ -d "/Applications/Microsoft Edge.app" ] || [ -f "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" ]; then
  status_ok "Microsoft Edge terdeteksi - Auto-Post Browser & MotionProvit siap."
else
  status_warn "Chrome/Edge tidak terdeteksi (opsional, dibutuhkan untuk Auto-Post tanpa API Key)."
fi

if command -v git >/dev/null 2>&1; then
  status_ok "$(git --version) terdeteksi (mendukung auto-update via Git)."
else
  status_info "Git tidak terpasang (opsional - update tetap bisa lewat rilis ZIP GitHub)."
fi
echo ""

# ------------------------------------------------------------------------------
# STEP 4: CEK PEMBARUAN GITHUB
# ------------------------------------------------------------------------------
step_header "4/6" "Pemeriksaan Pembaruan GitHub"
status_info "Memeriksa rilis terbaru di ${REPO_URL} ..."

LATEST_TAG=""
LATEST_VER=""
REL_URL="${REPO_URL}/releases/latest"
DID_UPDATE=0

if command -v curl >/dev/null 2>&1; then
  REL_JSON="$(curl -fsSL --max-time 6 -H "Accept: application/vnd.github+json" -H "User-Agent: CPGP-Studio-Launcher/${LOCAL_VERSION}" "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" 2>/dev/null || true)"
  if [ -n "$REL_JSON" ]; then
    LATEST_TAG="$(echo "$REL_JSON" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    LATEST_VER="${LATEST_TAG#v}"
  fi
fi

if [ -z "$LATEST_VER" ]; then
  status_warn "Tidak dapat menghubungi GitHub (mode offline). Melanjutkan dengan v${LOCAL_VERSION}."
elif semver_gt "$LATEST_VER" "$LOCAL_VERSION"; then
  echo ""
  echo -e "  ${BURG_ROSE}╭──────────────────────────────────────────────────────────────────────╮${RST}"
  echo -e "  ${BURG_ROSE}│${RST}  ${BURG_SOFT}${BOLD}PEMBARUAN TERSEDIA DARI GITHUB${RST}                                      ${BURG_ROSE}│${RST}"
  printf "  ${BURG_ROSE}│${RST}  ${MUTED}Versi Terpasang :${RST} ${IVORY}v%-49s${RST}${BURG_ROSE}│${RST}\n" "$LOCAL_VERSION"
  printf "  ${BURG_ROSE}│${RST}  ${MUTED}Versi Terbaru   :${RST} ${EMERALD}${BOLD}v%-49s${RST}${BURG_ROSE}│${RST}\n" "$LATEST_VER"
  printf "  ${BURG_ROSE}│${RST}  ${MUTED}Halaman Rilis   :${RST} ${SKY}%-50s${RST}${BURG_ROSE}│${RST}\n" "$REL_URL"
  echo -e "  ${BURG_ROSE}╰──────────────────────────────────────────────────────────────────────╯${RST}"

  radio_menu \
    "Versi baru v${LATEST_VER} tersedia. Apa yang ingin Anda lakukan?" \
    "Gunakan panah ↑/↓, tekan Spasi untuk memilih radio (●), lalu tekan Enter." \
    "Update ke v${LATEST_VER} sekarang" "Perbarui otomatis (folder data/ & .cache/ tetap aman)" \
    "Lanjutkan dengan versi saat ini (v${LOCAL_VERSION})" "Lewati pembaruan kali ini dan langsung jalankan CPGP Studio"

  if [ "$RADIO_RESULT" -eq 0 ]; then
    if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
      status_info "Menarik pembaruan via git pull..."
      git fetch --tags origin >/dev/null 2>&1 || true
      if git pull --ff-only origin main; then
        DID_UPDATE=1
        LOCAL_VERSION="$(get_local_version)"
        status_ok "CPGP Studio berhasil diperbarui ke v${LOCAL_VERSION}."
      else
        status_warn "git pull tidak dapat fast-forward. Melanjutkan dengan versi saat ini."
      fi
    else
      status_info "Unduh paket rilis terbaru di: ${REL_URL}"
    fi
  else
    status_info "Pembaruan dilewati. Melanjutkan dengan versi v${LOCAL_VERSION}."
  fi
else
  status_ok "CPGP Studio sudah menggunakan versi terbaru (v${LOCAL_VERSION})."
fi
echo ""

# ------------------------------------------------------------------------------
# STEP 5: VERIFIKASI FILE INTI & DEPENDENCIES
# ------------------------------------------------------------------------------
step_header "5/6" "Pemeriksaan Struktur & Dependencies"

HAS_STANDALONE=0
if [ -f "dist/index.html" ] && [ -f "dist-server/server.mjs" ]; then
  HAS_STANDALONE=1
fi

if [ "$HAS_STANDALONE" -eq 0 ] && [ ! -f "shared/captionParser.ts" ]; then
  status_err "Berkas inti aplikasi tidak ditemukan! Pastikan file arsip rilis diekstrak penuh."
  exit 1
fi

if [ "$HAS_STANDALONE" -eq 1 ] && [ -d "node_modules/@resvg/resvg-js" ] && [ -d "node_modules/patchright" ]; then
  status_ok "Paket rilis mandiri lengkap (100% siap pakai tanpa npm install)."
else
  NPM_CMD="npm"
  if command -v npm.cmd >/dev/null 2>&1; then
    NPM_CMD="npm.cmd"
  fi

  if [ ! -d "node_modules" ] || [ "$DID_UPDATE" -eq 1 ]; then
    if [ -f "dist/index.html" ]; then
      status_info "Memasang dependencies produksi (${NPM_CMD} install --omit=dev)..."
      "$NPM_CMD" install --omit=dev
    else
      status_info "Memasang dependencies aplikasi (${NPM_CMD} install)..."
      "$NPM_CMD" install
    fi
    status_ok "Dependencies berhasil dipasang."
  else
    status_ok "Struktur berkas & node_modules lengkap dan siap."
  fi
fi
echo ""

# ------------------------------------------------------------------------------
# STEP 6: JALANKAN CPGP STUDIO
# ------------------------------------------------------------------------------
step_header "6/6" "Menjalankan CPGP Studio v${LOCAL_VERSION}"

if [ "$CHECK_ONLY" -eq 1 ]; then
  status_ok "Pemeriksaan awal selesai (--check-only aktif, server tidak dijalankan)."
  exit 0
fi

status_info "Membuka server lokal & antarmuka Web UI..."
echo ""
exec node bin/cpgp-studio.mjs "${FORWARD_ARGS[@]}"
