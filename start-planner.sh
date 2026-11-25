#!/usr/bin/env bash
# ==============================================================================
# CPGP Studio (Content Planer Gam Puko) - One-Click Bash Launcher
# Multi-Workspace Content Planner | Watermark Studio | Auto-Post Suite
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BURGUNDY='\033[1;35m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
RED='\033[1;31m'
GRAY='\033[0;90m'
RESET='\033[0m'

clear 2>/dev/null || true
echo -e "${BURGUNDY}========================================================================${RESET}"
echo -e "${BURGUNDY}   CPGP STUDIO (Content Planer Gam Puko)${RESET}"
echo -e "${GRAY}   Multi-Workspace Content Planner | Watermark Studio | Auto-Post${RESET}"
echo -e "${BURGUNDY}========================================================================${RESET}"
echo -e "  App Folder : ${CYAN}${SCRIPT_DIR}${RESET}"
echo -e "  Registry   : ${CYAN}data/workspaces.json${RESET}"
echo -e "  Web UI URL : ${GREEN}http://localhost:5173${RESET}"
echo -e "${BURGUNDY}------------------------------------------------------------------------${RESET}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js tidak ditemukan! Pastikan Node.js v20+ sudah terinstall.${RESET}"
  read -r -p "Tekan Enter untuk keluar..."
  exit 1
fi

if [ ! -f "shared/captionParser.ts" ]; then
  echo -e "${RED}[ERROR] Folder 'shared' tidak ditemukan! Pastikan file ZIP rilis diekstrak secara penuh.${RESET}"
  read -r -p "Tekan Enter untuk keluar..."
  exit 1
fi

NPM_CMD="npm"
if command -v npm.cmd >/dev/null 2>&1; then
  NPM_CMD="npm.cmd"
fi

echo -e "${GRAY}[1/2] Memeriksa dependencies (node_modules)...${RESET}"
if [ ! -d "node_modules" ]; then
  if [ -f "dist/index.html" ]; then
    echo -e "${BURGUNDY}      Mode rilis terdeteksi. Menjalankan ${NPM_CMD} install --omit=dev...${RESET}"
    "$NPM_CMD" install --omit=dev
  else
    echo -e "${BURGUNDY}      Menginstall dependencies dengan ${NPM_CMD} install...${RESET}"
    "$NPM_CMD" install
  fi
else
  echo -e "${GREEN}      [OK] Dependencies siap.${RESET}"
fi

echo ""
echo -e "${GRAY}[2/2] Menjalankan CPGP Studio CLI (bin/cpgp-studio.mjs)...${RESET}"
node bin/cpgp-studio.mjs "$@"
