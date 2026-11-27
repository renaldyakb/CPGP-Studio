# Changelog: CPGP (Content Planer Gam Puko)

Seluruh perubahan besar pada proyek **CPGP** dicatat dalam dokumen ini menggunakan format Semantic Versioning (`MAJOR.MINOR.PATCH`).

---

## [v2.12.2] - 2026-11-27 (Auto-Detect Meta Thumbnail Observer, Redesigned Auto-Post / Tabel / Kalender UX & Windows Watcher Stability)

### Peningkatan UX, UI & Aksesibilitas (Improved)
- **Redesign `/auto-post` (Dasbor, Riwayat & Log, Browser Studio / CDP) (`src/components/autopost/*`)**:
  - **Modal Detail & Caption In-Place**: Klik tombol **Detail** atau **Caption** di `/auto-post` kini membuka `ContentDetailModal` langsung di halaman `/auto-post` tanpa redirect ke `/?detail=` atau `/?caption=`, menjaga konteks jadwal dan pilihan platform tetap utuh.
  - **Navigasi Sub-Tab & Strip Koneksi Cepat**: Menambahkan bar navigasi horizontal (`Dasbor`, `Riwayat & Log`, `Browser Studio / CDP`, `Meta API`, `YouTube API`) beserta penanda status koneksi aktif dan filter cepat antrean (`Siap Kirim`, `Perlu WM`, `Tayang`).
  - **Pemilihan Multi-Platform Fleksibel & Log Live**: Menambahkan checkbox target per platform (bebas kirim ke kombinasi apa pun), label engine yang selalu terlihat (`Meta API`, `YouTube API`, `Chrome CDP`, `Browser`), panel proses aktif di posisi teratas dengan tombol **Log** live yang bisa diperluas dan tombol **Coba Lagi** 1-klik, serta tombol 1-klik **Salin Target Shortcut** Chrome CDP di `/auto-post/studio`.
  - **Kontras WCAG AA & Responsif**: Menghapus seluruh teks rendah-kontras `text-muted-foreground/75`, menambahkan `min-w-0` pada `SidebarInset` (`src/components/ui/sidebar.tsx`), dan tampilan kartu responsif di tablet/mobile (0px horizontal overflow di `1440px`, `768px`, `390px`).
- **Pembaruan `/tabel` & `/kalender` (`src/components/TableView.tsx`, `src/components/CalendarView.tsx`, `src/routes/planner/CalendarPage.tsx`)**:
  - **`/tabel`**: Bar filter cepat (`Semua`, `Siap Upload`, `Perlu WM`, `Selesai`), urutan kronologis akurat (`isoDate` + `folderCode`) dengan `aria-sort`, tombol aksi cepat 1-klik (`WM` / `Post`) di tiap baris, serta kartu responsif untuk tablet & mobile.
  - **`/kalender`**: Menampilkan status publikasi nyata (tidak hanya status WM) di seluruh tampilan Bulan/Minggu/Hari (`4/4` hijau + centang ganda, `1/4..3/4` atau `Jdw` biru) dan tampilan **Agenda** (thumbnail 9:16, 4 lencana platform individual, serta tombol cepat `Post`/`WM`), lengkap dengan 6 filter status interaktif (`Semua`, `Terpublish 4/4`, `Sebagian / Jadwal`, `Siap Upload`, `Perlu WM`, `Hold / Draft`).

### Perbaikan Stabilitas & Anti-Bot Browser (Fixed)
- **Deteksi Otomatis Thumbnail Meta Business Suite via `MutationObserver` (`server/autopost/browserPublishers.ts`)**:
  - Menghilangkan scroll berulang yang gelisah saat menunggu bagian Thumbnail FB+IG muncul. Kini browser menunggu diam secara pasif hingga 120 detik dengan `MutationObserver` read-only, langsung mendeteksi saat tombol `Upload image` muncul dan aktif (meski di bawah fold), scroll 1x secara halus, lalu menunggu progressbar upload cover selesai sebelum lanjut ke tab berikutnya.
  - Memperluas waktu tunggu sabar tombol `Edit cover` TikTok menjadi 45 detik.
- **Mencegah Crash `chokidar EBUSY` di Windows (`server/api.ts`)**:
  - Menambahkan `ignorePermissionErrors: true` dan listener `.on('error')` pada `chokidar.watch()` agar kunci file sementara dari Windows Explorer/antivirus di folder `KONTEN` tidak pernah menjatuhkan server.

---

## [v2.12.1] - 2026-11-27 (Meta API Cover Upload, Real-Time Terminal Logs, All-Platform Browser Cover & Human-Like Anti-Bot v2)

### Perbaikan & Peningkatan (Fixed / Improved)
- **Upload Cover Otomatis di Semua Platform Mode Browser (Langsung & Jadwalkan) (`server/autopost/browserPublishers.ts`)**:
  - **TikTok Studio**: Menambahkan alur lengkap `uploadTikTokCover()` (`Edit cover` -> tab `Upload cover` -> unggah `cover-*.jpg` -> `Confirm`) untuk mode Langsung maupun Jadwalkan.
  - **Meta Business Suite (FB & IG Reels)**: Memperluas label pencarian thumbnail (`Upload image`, `Upload photo`, `Unggah gambar`, `Unggah foto`, `Edit cover`, `Add thumbnail`), polling hingga 16 detik sambil scroll natural pada panel kiri, serta konfirmasi otomatis tombol `Save` / `Simpan` / `Apply` bila modal crop muncul.
  - **YouTube Studio**: Memperbaiki selector `#file-loader` menjadi `input#file-loader[type="file"]` + tombol `Upload file` via `filechooser` dengan log diagnostik jelas bila thumbnail kustom dinonaktifkan YouTube untuk Shorts web.
- **Perilaku Browser Lebih Manusiawi (`Anti-Bot v2`) (`server/autopost/browserPublishers.ts`)**:
  - Mengganti gerakan kursor garis lurus dengan lintasan **kurva kubik Bézier** (`humanMoveMouse`) berkecepatan *ease-in-out*, getaran mikro tangan, dan koreksi halus.
  - Menggunakan durasi tahan klik asli (`mousedown` -> `45-115ms` -> `mouseup`), putaran roda mouse bertahap (`humanScrollWheel`), distribusi jeda Gaussian (`humanDelay` + `humanIdleDrift`), serta ketikan manusiawi (`humanTypeText`) tanpa delay konstan.
- **Meta Graph API Cover Custom, Instagram `rupload` & Log Terminal (`server/autopost/metaApi.ts`, `server/autopost/queue.ts`, `src/components/autopost/parts/ActivityFeed.tsx`, `src/components/autopost/useAutoPostData.ts`)**:
  - Menambahkan upload cover lokal otomatis untuk **Facebook Reels** (`POST /{video_id}/thumbnails`, `is_preferred=true`) dan **Instagram Reels** (`cover_url` melalui staging foto sementara `published=false&temporary=true` pada Meta CDN yang dibersihkan otomatis setelah publish).
  - Menormalkan URL `https://` pada `uploadUri`, beralih ke streaming biner `node:https` dengan progress MB/% real-time & timeout inaktivitas 90 detik, menangani respons semu `HTTP 400 ProcessingFailedError` pada `ig-api-upload` dengan pemeriksaan `video_status`, serta menambahkan izin `business_management` ke `META_OAUTH_SCOPES`.
  - Mencetak log Auto-Post ber-timestamp secara real-time ke terminal (`[AutoPost HH:mm:ss][folder][platform:engine]`) dan menampilkan toast + kartu gagal di Dasbor agar penyebab error langsung terlihat.

---

## [v2.12.0] - 2026-11-27 (Full-Stack Performance, Stability, Multi-Workspace Isolation & Anti-Bot Hardening)

### Performa & Stabilitas Kritis (Fixed / Improved)
- **Menghentikan Badai SSE ~130 req/detik & Socket Exhaustion Chrome (`src/components/autopost/useAutoPostData.ts`, `src/components/autopost/AutoPostLayout.tsx`, `src/hooks/usePlannerItems.ts`, `src/lib/managedEventSource.ts`, `server/api.ts`)**:
  - Memindahkan callback `onToast` & `onPlannerSync` ke `useRef` agar `EventSource('/api/autopost/events')` hanya dibuka 1x per sesi (turun dari ~874 request/8 detik menjadi 1 request).
  - Menghapus duplikat `EventSource('/api/events')` di `AutoPostLayout`, menormalkan format SSE menjadi 1 frame `data:` per event, serta menambahkan `openManagedEventSource()` untuk menutup koneksi `EventSource` secara deterministik saat `pagehide`/`beforeunload` agar pool 6 koneksi HTTP/1.1 Chrome tidak pernah hang saat navigasi berulang.
  - Memperbaiki deadlock graceful shutdown (`Ctrl+C` / `SIGINT` / `SIGTERM`) di `server/index.ts` & `server/api.ts` dengan memutus stream SSE di awal `shutdownApiRouter()` (waktu berhenti ~19ms).
- **Cache RAM `mtime`-Aware, Penulisan Atomik & Scanner Aman (`server/storage.ts`, `server/workspaces/registry.ts`, `server/watermark/presets.ts`, `server/watermark/fonts.ts`, `server/autopost/config.ts`, `server/scanner.ts`)**:
  - Menambahkan cache in-memory berbasis `mtimeMs` + `size` pada database planner, registry workspace, preset/font watermark, konfigurasi/kapabilitas Auto-Post, dan pengecekan versi GitHub, serta eviksi penuh saat workspace dihapus (`DELETE /api/workspaces/:id`).
  - Membatasi kedalaman & jumlah direktori `findContentFolderPaths()` (`maxDepth = 3`, `maxDirsVisited = 200` pada validasi path) agar mengetik path root seperti `D:\` selesai <60ms tanpa freeze.
  - Mengabaikan seluruh dotfile & berkas sementara `.wm_tmp_*.tmp.mp4` / `.wm_staging_*.tmp` di `scanner.ts`, serta membatasi pengecualian nama direktori `isIgnoredWatchPath()` hanya pada segmen relatif di dalam `contentRootPath` (sehingga folder induk bernama `Data` tetap mendukung live-sync).
- **FFmpeg Render Tanpa Freeze, `/media/*` ETag/304 & Cross-Platform (`server/watermark/renderer.ts`, `server/api.ts`, `server/index.ts`, `bin/cpgp-studio.mjs`)**:
  - Memindahkan file output sementara FFmpeg ke direktori tujuan agar rename bersifat O(1) tanpa copy lintas drive, lengkap dengan retry backoff `EBUSY`/`EPERM`/`EACCES` untuk mode `overwrite_source` di Windows.
  - Menambahkan `ETag` + `304 Not Modified`, clamping `Range` `206`, `res.on('close', () => stream.destroy())`, dan guard traversal `path.relative()` pada `/media/*` serta cache-bust `?v=<mtimeMs>`.
  - Menambahkan fallback port otomatis `EADDRINUSE` (`PORT + 1..5`) di `server/index.ts` yang otomatis terdeteksi oleh `bin/cpgp-studio.mjs`, header `Cache-Control` produksi (`immutable` untuk `assets/*`, `no-cache` untuk `index.html`), dukungan font/browser/explorer lintas OS (Windows, macOS, Linux), dan pengikatan aman ke `127.0.0.1` + validasi CORS lokal (termasuk IPv6 `[::1]`) + validasi domain SSRF `motion.clipprovit.com`.

### Anti-Bot Auto-Post & Meta Graph API (`server/autopost/*`, `src/components/autopost/pages/StudioPage.tsx`)
- **Hardening Anti-Bot Mode Browser**:
  - Menghapus 100% mutasi atribut DOM (`data-cpgp-*`) dan klik sintetik `el.click()`; mengganti dengan `humanClick()` berbasis gerakan pointer bertahap (`isTrusted: true`) lengkap dengan cek visibilitas, viewport, dan `elementFromPoint`.
  - Memperbaiki klasifikasi input jadwal 2 baris Facebook + Instagram serta pemilihan target channel di Meta Business Suite, menambahkan jeda cooldown acak 45-75 detik antar upload browser, pemanasan navigasi natural, shortcut `Meta+A` di macOS, dan penutupan tab otomatis setelah publish selesai/dibatalkan.
  - Menambahkan opsi **Sambung Chrome Harian (CDP URL)** (`chromium.connectOverCDP`) di halaman Studio agar pengguna dapat memakai profil Chrome sehari-hari tanpa checkpoint bot.
- **Meta Graph API Reels**:
  - Menggunakan streaming upload (`Readable.toWeb`) tanpa duplikasi buffer RAM, memperbaiki parameter penjadwalan Facebook Reels (`video_state=SCHEDULED` + batas 29 hari tanpa `published=false`), mengisolasi cache page token per workspace, dan memblokir penjadwalan palsu pada Instagram Graph API.

### UI, Isolasi Multi-Workspace & Code-Splitting (`src/*`, `vite.config.ts`, `index.html`)
- **Isolasi State Multi-Workspace & Deep-Link**:
  - Memperbaiki reset state lintas workspace pada `WatermarkPage` (dengan tetap menjaga deep-link `/watermark?item=`), `MotionProvitPage`, `StudioPage`, `MetaApiPage`, `YouTubeApiPage`, `useAutoPostData`, dan `App.tsx` (rollback per-item).
  - Menambahkan guard pra-onboarding zero-flash di `/auto-post`, dukungan deep-link `/auto-post?item=...&platform=...` dengan bar **Fokus platform**, persistensi cookie `sidebar_state`, pencegahan reset form modal saat SSE masuk, dan favicon inline SVG CPGP (0 error 404).
- **Code-Splitting & Pembersihan Paket**:
  - Memecah 13 rute halaman dengan `React.lazy` + `Suspense` dan `manualChunks` bebas circular dependency, serta menghapus 3 berkas mati dan 4 dependensi tidak terpakai (`recharts`, `react-resizable-panels`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`).

---

## [v2.11.2] - 2026-11-27 (Fix Infinite `/api/workspaces` + `/api/planner` SSE Fetch Loop in Release Bundle)

### Perbaikan (Fixed — Direproduksi & Diverifikasi Langsung pada Rilis GitHub)
- **Menghentikan Infinite Loop Chokidar Watcher -> `planner.json` -> SSE (`server/api.ts`, `server/scanner.ts`)**:
  - **Akar Masalah**: Saat folder konten workspace mencakup (atau berada di induk dari) folder internal aplikasi `data/`, `chokidar.watch(targetRoot)` ikut memantau perubahan `data/workspaces/<id>/planner.json`. Setiap kali `syncDatabaseWithDisk()` menulis `planner.json`, watcher mendeteksi perubahan tersebut setiap ~650ms (`awaitWriteFinish` 300ms + debounce 300ms) -> memicu scan ulang -> mem-broadcast SSE `planner-updated` -> frontend me-fetch `/api/workspaces` & `/api/planner` terus-menerus tanpa henti.
  - **Solusi**: Menambahkan `isIgnoredWatchPath()` di `chokidar.watch()` dan `triggerDebouncedScan()` untuk mengecualikan seluruh direktori internal (`data/`, `.cache/`, `node_modules/`, `dist/`, `dist-server/`, `.git/`, `browser-profile/`) serta seluruh berkas JSON runtime (`planner.json`, `workspaces.json`, `autopost-config.json`, `watermark-presets.json`, `motionprovit-*.json`, `*.tmp`, `*.part`), ditambah guard cooldown 800ms dan pengecualian folder internal di `findContentFolderPaths()`.
  - Melewati `syncDatabaseWithDisk()` saat startup bila workspace belum dikonfigurasi (menunggu Onboarding) agar tidak membuat file `__pending_onboarding__/planner.json` yang tidak perlu.
- **Debounce & Pemisahan Event SSE di Frontend (`src/App.tsx`)**:
  - Event `planner-updated` kini hanya menyegarkan `fetchPlanner()` (dengan debounce 300ms) tanpa memanggil `fetchWorkspaces()` berulang kali; `fetchWorkspaces()` hanya dipanggil pada event pergantian workspace (`workspace-switched` / `workspace-activated`).

---

## [v2.11.1] - 2026-11-26 (Fix Windows Path Space Bug in Standalone Release CLI Launcher)

### Perbaikan (Fixed)
- **Perbaikan Error `'C:\Program' is not recognized` di Mode Standalone (`bin/cpgp-studio.mjs`)**:
  - Memperbaiki `runCommand()` agar hanya mengaktifkan `shell: true` untuk skrip `.cmd`/`.bat` (`npm.cmd`), dan menjalankan binary `node.exe` (`process.execPath`) secara langsung dengan `shell: false`.
  - Menghilangkan kegagalan saat `node.exe` berada di `C:\Program Files\nodejs\node.exe` atau saat folder ekstrak mengandung spasi, sekaligus menghilangkan peringatan `DEP0190`.

---

## [v2.11.0] - 2026-11-26 (100% Zero `npm install` Standalone Multi-OS Release Bundles)

### Fitur Baru & Peningkatan (Added / Improved)
- **Kompilasi Backend Mandiri (`scripts/bundle-server.mjs`, `server/core/appPaths.ts`, `server/autopost/youtubeApi.ts`)**:
  - Mengompilasi seluruh backend (`server/index.ts` -> `dist-server/server.mjs` dan `server/cli-scan.ts` -> `dist-server/cli-scan.mjs`) menggunakan `esbuild`, sehingga tidak lagi membutuhkan `tsx` atau 300+ paket `node_modules` saat dijalankan di rilis.
  - Memangkas impor `googleapis` menjadi hanya sub-modul `youtube` (`googleapis/build/src/apis/youtube/index.js`) sehingga ukuran bundle turun drastis (~234 MB dihemat) dengan fitur YouTube Data API v3 tetap 100% utuh.
  - Menambahkan `resolveAppRoot()` (`server/core/appPaths.ts`) agar path `dist/`, `data/`, dan `package.json` selalu konsisten baik saat berjalan dari TypeScript source maupun `dist-server/server.mjs`.
- **Paket Rilis Multi-OS Tanpa `npm install` (`.github/workflows/release.yml`)**:
  - GitHub Actions kini memproduksi 3 paket siap pakai per sistem operasi dengan `node_modules/` ultra-ramping (hanya 2 modul runtime native `@resvg/resvg-js` dan `patchright`) yang sudah terpasang di dalam arsip:
    - **`CPGP-Studio-vX.Y.Z-win-x64.zip`** (Windows)
    - **`CPGP-Studio-vX.Y.Z-macos-arm64.tar.gz`** (macOS Apple Silicon)
    - **`CPGP-Studio-vX.Y.Z-linux-x64.tar.gz`** (Linux)
  - Dilengkapi smoke-test otomatis pada masing-masing OS (`cli-scan.mjs`, `@resvg/resvg-js`, `patchright`) sebelum rilis dipublikasikan.
- **Startup Instan Tanpa `npm install` (`bin/cpgp-studio.mjs`, `scripts/launcher.ps1`, `start-planner.sh`)**:
  - Mendeteksi paket rilis mandiri (`dist/` + `dist-server/server.mjs` + runtime `node_modules`) lalu langsung menjalankan `node dist-server/server.mjs` dalam hitungan detik tanpa perlu `npm install` maupun koneksi internet.

---

## [v2.10.0] - 2026-11-26 (First-Run Luxury Burgundy 4-Step Onboarding Stepper & Dynamic Workspace Folder Naming)

### Fitur Baru & Peningkatan (Added / Improved)
- **Halaman Onboarding 4 Langkah Interaktif (`src/components/workspace/OnboardingWizard.tsx`, `src/App.tsx`)**:
  - Pada instalasi baru (build rilis tanpa `data/workspaces.json` atau data lama), CPGP tidak lagi membuat workspace bawaan secara diam-diam. Pengguna langsung disambut halaman penuh **Onboarding 4 Langkah** bertema **Luxury Burgundy** (lengkap dengan toggle Light/Dark mode dan panel **Pratinjau Studio Live**):
    1. **`01 Identitas`**: Isi Nama Workspace / Channel, Handle Watermark (otomatis diturunkan dari nama workspace), dan Deskripsi singkat opsional.
    2. **`02 Folder`**: Lokasi Folder Induk (`Pilih Folder` via Explorer + default `<AppRoot>\KONTEN`), **nama folder otomatis mengikuti Nama Workspace yang diisi** (`<Folder Induk>\<Nama Workspace>`), validasi path real-time, serta pratinjau pohon folder termasuk folder tahun-bulan inisialisasi (`2026-November`).
    3. **`03 Alur Kerja`**: Pilih kebijakan watermark (`File wm_final.mp4 terpisah`, `Video langsung siap upload`, atau `Timpa video asli`), aktifkan platform target (`YouTube Shorts`, `TikTok`, `Instagram Reels`, `Facebook Reels`), dan hashtag bawaan.
    4. **`04 Siap Mulai`**: Ringkasan konfigurasi lengkap sebelum tombol **`Buat Workspace & Masuk Studio`** membuat folder dan langsung masuk ke dashboard tanpa reload halaman.
- **Registry Bersih untuk Instalasi Baru (`server/workspaces/registry.ts`, `server/api.ts`)**:
  - Instalasi baru kini memulai dengan `onboardingCompleted: false` dan daftar workspace kosong tanpa memicu error di endpoint `/api/planner` maupun chokidar watcher (sementara pengguna lama yang sudah memiliki `data/workspaces.json` atau folder `KONTEN` lama tetap termigrasi utuh 100%).
- **Pembersihan Placeholder Netral di Seluruh Aplikasi (`WorkspaceModal.tsx`, `CreateContentModal.tsx`, `WatermarkPage.tsx`, `MetaApiPage.tsx`, `shared/rulePresets.ts`, `src/types/watermark.ts`)**:
  - Menghapus seluruh placeholder & nilai bawaan `Jurnal Dunia` / `@jurnaldunia_` di UI dan menggantinya dengan placeholder netral (`Kanal Sains`, `@channel_anda`, `#edukasi #konten`).

---

## [v2.9.0] - 2026-11-26 (Fast Zero-Quality-Loss Watermark Render, Multi-GPU NVENC/QSV/AMF Support & Launcher 3rd-Party Checks)

### Fitur Baru & Peningkatan (Added / Improved)
- **Opsi Kecepatan Render Tanpa Mengurangi Kualitas (`server/watermark/renderer.ts`, `queue.ts`, `WatermarkPage.tsx`)**:
  - Menambahkan 3 pilihan **`Kecepatan Render`** di Watermark Studio dengan default **`Cepat (HQ)`** (kualitas visual tetap setara CRF 16 / CQ 17 / ICQ 17, audio lossless `-c:a copy`, hanya trade-off ukuran file sedikit lebih besar demi render **3x–5x lebih cepat**):
    - **`Cepat (HQ)`**: `veryfast` (x264 / QSV), `p3` (NVENC), `speed` (AMF) + pre-konversi watermark statis `[1:v]format=yuva420p[wm];[0:v][wm]overlay=0:0:format=yuv420:eval=init` + `-hwaccel auto`.
    - **`Seimbang`**: `medium` / `p5` / `balanced`.
    - **`Hemat Ukuran`**: `slow` / `p7` / `quality` (ukuran file paling kecil dengan kualitas visual identik).
- **Dukungan Multi-GPU Hardware Encoder (`NVENC` + `Intel QuickSync QSV` + `AMD AMF` + `CPU x264`)**:
  - `detectWatermarkCapabilities()` kini memindai paralel `h264_nvenc`, `h264_qsv`, dan `h264_amf`, lalu memilih GPU tercepat yang tersedia secara otomatis (`Otomatis`) — di perangkat dengan NVIDIA driver lama yang belum mendukung NVENC 13.1, sistem otomatis beralih ke **Intel QuickSync GPU (`h264_qsv`)** (~21 detik/video dibanding ~90–110 detik sebelumnya di CPU `slow`).
- **Pemeriksaan 3rd-Party Pendukung di Launcher (`scripts/launcher.ps1`, `start-planner.sh`)**:
  - Menambahkan langkah **`[3/6]` Pemeriksaan 3rd-Party Pendukung (FFmpeg & FFprobe, Browser Chrome/Edge, Git)** agar pengguna baru langsung siap pakai:
    - Jika **FFmpeg / FFprobe** belum terpasang -> menampilkan Radio Menu (`Spasi` + `Enter`) untuk install otomatis (`winget install Gyan.FFmpeg` / `brew` / `apt`) atau menampilkan kotak panduan manual lengkap lalu tetap melanjutkan.
    - Jika **Chrome / Edge** belum terpasang -> menawarkan instalasi otomatis `Google.Chrome` via `winget` atau lanjutkan tanpa Auto-Post Browser.
    - Menampilkan status **Git** (opsional) secara informatif.

---

## [v2.8.0] - 2026-11-26 (Interactive Luxury Burgundy Terminal Launcher: Device Check, Node.js LTS Auto-Installer & GitHub Updater)

### Fitur Baru (Added)
- **Interactive Terminal Launcher CPGP (`start-planner.bat`, `scripts/launcher.ps1`, `start-planner.sh`)**:
  - Tampilan terminal modern bertema **Luxury Burgundy** dengan **ASCII Wordmark CPGP**, kotak border Unicode presisi, dan alur 5 tahap terstruktur:
    1. **`[1/5]` Pemeriksaan Perangkat & Lingkungan**: Menampilkan OS + Build, Arsitektur (`x64`/`ARM64`), Prosesor, RAM, Kapasitas Disk bebas, deteksi Browser Lokal (`Chrome`/`Edge`), dan Mode Aplikasi (`Production Release` / `Development`).
    2. **`[2/5]` Pemeriksaan Runtime Node.js (v20+ LTS)**: Jika Node.js belum terpasang atau di bawah v20, otomatis mengecek versi **Node.js LTS terbaru** dari `nodejs.org/dist/index.json` dan menampilkan **Radio Menu interaktif (`↑/↓` pindah, `Spasi` pilih `(●)`, `Enter` konfirmasi)**:
       - **Install Node.js LTS terbaru otomatis sekarang** (via `winget OpenJS.NodeJS.LTS` atau fallback installer `.msi` resmi dari `nodejs.org`, lalu refresh `PATH` otomatis di sesi yang sama; atau Homebrew/nvm/NodeSource di macOS/Linux).
       - **Nanti saja** -> menampilkan kotak panduan langkah demi langkah download & instalasi manual Node.js LTS.
    3. **`[3/5]` Pemeriksaan Pembaruan GitHub (`renaldyakb/CPGP-Studio`)**: Otomatis membandingkan versi lokal dengan rilis terbaru GitHub. Jika ada versi lebih baru, menampilkan **notifikasi pembaruan + Radio Menu (`Spasi` + `Enter`)** untuk memilih **Update sekarang** (via `git pull` atau unduh & ekstrak ZIP rilis aman tanpa menyentuh `data/` dan `.cache/`) atau **Lanjutkan dengan versi saat ini**.
    4. **`[4/5]` Pemeriksaan Struktur & Dependencies (`node_modules`)**: Memastikan folder `shared/` utuh dan otomatis menjalankan `npm install` / `npm install --omit=dev` bila belum terpasang atau baru diperbarui.
    5. **`[5/5]` Menjalankan CPGP Studio (`bin/cpgp-studio.mjs`)**: Mendukung flag `--CheckOnly` / `--check-only` untuk diagnostik cepat tanpa menyalakan server.
- **Bundling Release GitHub Actions (`.github/workflows/release.yml`)**: Menyertakan folder `scripts/` (`scripts/launcher.ps1`) ke dalam paket ZIP & TAR.GZ rilis otomatis.

---

## [v2.7.1] - 2026-11-26 (Fix Reactive Style/Search Filter Counts & Scoped Download on MotionProvit Page)

### Perbaikan (Fixed)
- **Sinkronisasi Counter Filter Gaya & Status Impor (`src/routes/planner/MotionProvitPage.tsx`)**:
  - Memperbaiki counter **`Baru (N)`** / **`Semua (M)`**, tombol **`Pilih Semua Baru (N)`**, **`Unduh Semua Baru (N)`**, serta angka pada setiap pill gaya (misal **`Koran Lama`**) agar langsung menyesuaikan secara real-time mengikuti filter gaya dan pencarian aktif.
  - Saat memilih gaya tertentu (contoh **`Koran Lama`**), **`Pilih Semua Baru`** dan **`Unduh Semua Baru`** kini hanya memilih/mengunduh video baru dari gaya tersebut, bukan mencampur semua gaya lain.

---

## [v2.7.0] - 2026-11-26 (Canonical `YYYY-Bulan` Year-Month Folders, Auto New-Year Rollover, Legacy Migration & Chronological Slot Assignment)

### Fitur Baru & Peningkatan (Added / Improved)
- **Konvensi Folder Tahun-Bulan `YYYY-Bulan` & Rollover Tahun Baru Otomatis (`server/scanner.ts`, `server/core/contentCreator.ts`, `server/addons/motionprovitScraper.ts`)**:
  - Setiap folder bulan kini menggunakan format kanonik **`YYYY-Bulan`** (contoh: `2026-November`, `2026-Desember`, dan otomatis membuat **`2027-Januari`** ketika jadwal melewati 31 Desember 2026).
  - Menambahkan **`migrateLegacyMonthFoldersOnDisk()`** dengan fallback anti-`EPERM` Windows yang otomatis memigrasikan folder bulan lama (`November` -> `2026-November`, `Desember` -> `2026-Desember`) sambil mempertahankan 100% metadata `userProperties` (`publishedUrl`, status 4 platform, checklist, catatan, tag) di `planner.json` tanpa kehilangan data.
- **Inisialisasi Tahun Otomatis pada Workspace Baru (`server/workspaces/registry.ts`)**:
  - `defaultYear` pada workspace baru kini otomatis membaca tahun inisialisasi saat ini (`new Date().getFullYear()`) dan langsung membuatkan folder tahun-bulan awal (`<tahun>-<Bulan>`) di `contentRootPath` saat workspace diinisialisasi.
- **Penjadwalan Berurutan Anti-Acak & Info Jelas di MotionProvit (`contentCreator.ts`, `motionprovitScraper.ts`, `MotionProvitPage.tsx`, `CreateContentModal.tsx`)**:
  - Memperbaiki `suggestNextAvailableSlot()` dan `allocateNextAvailableSlots()` agar menggunakan kalender riil (menghormati 28/29/30/31 hari per bulan dan pergantian tahun) dan **selalu melanjutkan urutan slot kosong setelah konten terakhir** (tidak pernah mengikuti tanggal unduh/render MotionProvit).
  - Menambahkan banner informasi penjadwalan berurutan di halaman **Add-on MotionProvit** yang menampilkan **Slot Terakhir -> Slot Berikutnya Otomatis**, tombol **`Reset Urutan`**, serta pratinjau target folder `YYYY-Bulan DD.SLOT` di tiap kartu terpilih.

---

## [v2.6.4] - 2026-11-25 (100% Background Silent MotionProvit Downloads & Sync — Zero Browser Popups)

### Peningkatan (Improved)
- **Unduh & Sinkron 100% di Belakang Layar Tanpa Membuka Chrome (`server/addons/motionprovitScraper.ts`)**:
  - **Batch Download Video MP4 + Cover 9:16 + Caption**: Menggunakan Node.js HTTP streaming (`Readable.fromWeb` -> disk) memakai cookies sesi tersimpan di workspace (`motionprovit-session.json`) langsung ke endpoint resmi MotionProvit:
    - Video MP4: `/api/jobs/{id}/download?ratio={aspect}` -> `motionprovit-{shortId}.mp4`
    - Cover 9:16 Artwork JPG: `/api/jobs/{id}/cover?ratio={aspect}&art=1` (dengan fallback `format=jpg` & thumbnail) -> `cover-{shortId}-{aspect}.jpg`
    - Caption: `/api/jobs/{id}/kit?download=caption&opener=1` -> `caption.txt`
  - **Cek Sesi & Sinkron Daftar (`Cek Baru` / `Sinkron Semua`)**: Kini juga berjalan 100% di belakang layar lewat HTTP SSR parsing tanpa membuka jendela Chrome (browser hanya dibuka apabila sesi kedaluwarsa dan perlu login ulang).
- **Opsi Unduh Semua vs Unduh Terpilih (`MotionProvitPage.tsx`)**:
  - Menambahkan tombol **`Unduh Semua Baru (N)`** berdampingan dengan **`Unduh Terpilih (M)`** (mengikuti checklist kartu & pilihan berkas `Video MP4`, `Cover 9:16`, `Caption`) beserta keterangan berjalan di belakang layar.

---

## [v2.6.3] - 2026-11-25 (MotionProvit Root Disk Cache, Incremental Sync, Anti-Burst Rate Limiter & Human Jitter)

### Peningkatan (Improved)
- **Disk Cache Thumbnail Permanen di Root Project (`.cache/motionprovit-thumbs/<workspaceId>/`)**:
  - Setiap thumbnail yang sudah dimuat otomatis disimpan ke disk di folder `.cache/motionprovit-thumbs/<workspaceId>/` (diabaikan oleh `.gitignore` dan `vite.config.ts` agar aman dari git dan tidak memicu HMR reload), sehingga setelah restart server pun thumbnail lama tidak di-request ulang ke MotionProvit.
  - Menambahkan endpoint `POST /api/addons/motionprovit/cache/clear` dan tombol **`Bersihkan Cache`** (lengkap dengan info jumlah berkas, ukuran KB, dan lokasi folder) langsung di halaman Add-on MotionProvit.
- **Incremental Sync (`Cek Baru`) vs `Sinkron Semua` & Cooldown 30 Detik**:
  - Tombol **`Cek Baru`** kini secara default melakukan sinkronisasi inkremental (cukup 1 halaman `/app/jobs?hal=1&per=24` dan berhenti otomatis saat bertemu `#ID` yang sudah ada di cache lokal), sementara tombol ikon **`Sinkron Semua`** tersedia jika ingin memindai ulang seluruh halaman.
  - Dilengkapi cooldown perlindungan **30 detik** antar sinkronisasi agar tidak memicu proteksi rate-limit.
- **Anti-Burst Rate Limiter & Jeda Acak Manusiawi (`server/addons/motionprovitScraper.ts`)**:
  - Pembatasan antrean fetch thumbnail baru maksimal **2 paralel** (`PQueue`) + deduplikasi request + jeda acak `160-380ms`.
  - Jeda acak `2.2-4.2 detik` antar halaman saat sinkron penuh dan `2.8-5.2 detik` antar video saat batch download.

---

## [v2.6.2] - 2026-11-25 (Fix Chrome Auto-Opening When Paginating MotionProvit List)

### Perbaikan (Fixed)
- **Proxy Thumbnail Tanpa Membuka Chrome (`server/addons/motionprovitScraper.ts`)**:
  - Memperbaiki bug di mana berpindah ke halaman 2/3/4 di daftar Add-on MotionProvit memicu Chrome terbuka otomatis karena `fetchMotionProvitImageBuffer()` sebelumnya memanggil `getOrLaunchBrowserContext()`.
  - Kini thumbnail diambil murni lewat HTTP `fetch()` Node.js memakai cookies sesi tersimpan di `motionprovit-session.json` ditambah cache memori 30 menit (maks 200 gambar) sehingga perpindahan halaman berlangsung instan tanpa pernah memunculkan jendela Chrome.

---

## [v2.6.1] - 2026-11-25 (MotionProvit Full Multi-Page Pagination, Official Kit Caption/Cover Endpoints & Exact ID Matching)

### Peningkatan & Perbaikan (Improved / Fixed — Live-Tested on 49/49 MotionProvit Videos)
- **Scraping Multi-Halaman MotionProvit (`server/addons/motionprovitScraper.ts`)**:
  - Memindai seluruh halaman `/app/jobs?hal=<n>&per=48` secara otomatis berdasarkan metadata `<nav aria-label="Halaman daftar render">` (`Menampilkan 1-12 dari 49 render`), sehingga seluruh video (49/49) dan seluruh gaya (`Koran Lama`, `Mode Thinking`, `Explainer 3D`, `Sains Papan Tulis`, dll.) terbaca utuh tanpa terpotong di halaman pertama.
  - Memperbaiki ekstraksi `#shortId` (8 karakter langsung dari UUID) sehingga pendeteksian video yang sudah ada di workspace (`alreadyImported`) 100% akurat (terverifikasi mendeteksi 12 video yang sudah ada di folder `KONTEN`).
- **Unduh Langsung dari Endpoint Resmi Paket Posting MotionProvit**:
  - Mengunduh **`caption.txt`** asli langsung dari `/api/jobs/{id}/kit?download=caption&opener=1` dan **Cover 9:16 Artwork JPG** dari `/api/jobs/{id}/cover?ratio=9x16&art=1` (dengan fallback `format=jpg` & tombol `Unduh JPG`).
- **Kontrol Pagination di Halaman Add-on MotionProvit (`MotionProvitPage.tsx`)**:
  - Menambahkan pagination bar (`Menampilkan 1-12 dari N video`, tombol `Sebelumnya` / nomor halaman `1 2 3 ...` / `Berikutnya`, pemilih **`12 / 24 / 48 per halaman`**), serta tombol **`Pilih Halaman Ini`** di samping `Pilih Semua Baru` dan `Pilih Semua`.

---

## [v2.6.0] - 2026-11-25 (Optional Add-on: MotionProvit Scraper, Workspace Credentials & Selective Batch Importer)

### Fitur Baru (Added)
- **Add-on Khusus MotionProvit (`server/addons/motionprovitConfig.ts`, `server/addons/motionprovitScraper.ts`, `src/routes/planner/MotionProvitPage.tsx`)**:
  - Menu opsional **`Add-ons -> MotionProvit`** (`/addons/motionprovit`, juga tersedia di Command Palette `Ctrl+K`) untuk mengambil data video render dari `https://motion.clipprovit.com/app/jobs` dan detail `https://motion.clipprovit.com/app/jobs/{id}` menggunakan engine browser lokal `patchright` (mendukung NextAuth `/api/auth/session`, `/api/sec/hello`, dan Cloudflare Turnstile).
  - **Autentikasi & Penyimpanan Kredensial Per Workspace**: Mendukung login via form **Email & Password** (`POST /api/addons/motionprovit/login`) maupun **Login via Browser** (`POST /api/addons/motionprovit/open-login` + `Cek Sesi`), dengan kredensial (`motionprovit-config.json`) dan cookies sesi (`motionprovit-session.json`) tersimpan terisolasi di masing-masing workspace (`data/workspaces/<id>/`).
  - **Pratinjau Daftar Video Tanpa Mengunduh (`POST /api/addons/motionprovit/jobs/fetch`)**: Memindai seluruh video di `/app/jobs` (gabungan intercept JSON API + DOM scraping), menampilkan kartu preview (thumbnail via proxy terautentikasi `/api/addons/motionprovit/thumb`, judul, `#ID`, gaya, rasio, durasi, tanggal), filter gaya & pencarian, serta otomatis menandai video yang **sudah ada di CPGP** (`Di CPGP: DD.SLOT`) dibanding video **`Baru`**.
  - **Unduh Selektif & Auto-Assign ke Tanggal/Slot Kosong (`POST /api/addons/motionprovit/import`)**: Pengguna bebas memilih video tertentu atau semua video baru, memilih jenis berkas yang ingin diunduh (`Video MP4`, `Cover 9:16`, `Caption`), serta mengatur **Tanggal Mulai (`DatePicker`)** dan **Slot Awal (`01` / `02`)** dengan pratinjau slot target live (`-> November 30.01`, dst.). Sistem otomatis membuat folder konten untuk tanggal/slot yang belum ada (`motionprovit-{id}.mp4`, `cover-{id}-9x16.jpg`, `caption.txt`) dan langsung menyinkronkan Planner CPGP tanpa reload halaman.

---

## [v2.5.0] - 2026-11-25 (AI-Generated Content Disclosure Alert Dialog, Workspace Default & Auto-Toggle on Platforms)

### Fitur Baru (Added)
- **Dialog Konfirmasi Konten AI-Generated Sebelum Upload (`AiContentAlertDialog.tsx`, `src/components/ui/alert-dialog.tsx`)**:
  - Secara default (`Tanya tiap upload`), setiap kali pengguna menekan tombol Auto-Post atau Jadwalkan (baik semua platform, per platform, gabungan `FB + IG`, maupun dari tabel `Antrean Konten`), CPGP menampilkan **`AlertDialog`** konfirmasi **"Tandai sebagai Konten AI-Generated?"** dengan pilihan **`Bukan AI`**, **`Tandai AI-Generated`**, serta sakelar opsional **`Jadikan default workspace`**.
- **Pengaturan Default & Override Cepat (`DashboardPage.tsx`, `NextContentCard.tsx`, `StudioPage.tsx`, `server/autopost/config.ts`)**:
  - Menambahkan pengaturan workspace `aiContentDisclosure` (`ask` = Tanya tiap upload, `always_ai` = Selalu tandai AI, `always_non_ai` = Selalu bukan AI) yang bisa diatur baik langsung dari kartu **Konten Berikutnya** (`AI: Tanya | Ya | Tidak`) maupun di **`Koneksi -> Browser`**.
- **Otomatisasi Label AI di Studio Sosial Media (`server/autopost/browserPublishers.ts`, live-tested)**:
  - **YouTube Studio (`configureYouTubeAiDisclosure`)**: Otomatis membuka **`Show more`** pada tahap `Details` dan memilih radio **`VIDEO_HAS_ALTERED_CONTENT_YES`** (*Altered content: Yes*) saat ditandai AI, atau **`VIDEO_HAS_ALTERED_CONTENT_NO`** saat bukan AI — terkonfirmasi aktif (`aria-checked="true"`).
  - **TikTok Studio (`configureTikTokAiLabel`)**: Otomatis membuka **`Show more`** dan mengaktifkan sakelar **`AI-generated content`** (`.Switch__content` -> `aria-checked="true"`, `data-state="checked"`) termasuk menangani modal konfirmasi jika muncul.
  - **Meta Business Suite (`configureMetaAiLabel`)**: Pengecekan non-fatal untuk sakelar label AI di composer Reels (jika tersedia di Meta Business Suite web akan otomatis diaktifkan; jika belum tersedia di web composer, mencatat info transparan tanpa menghambat upload).

---

## [v2.4.1] - 2026-11-25 (Live-Tested Meta Business Suite, YouTube & TikTok Auto-Post & Scheduling Fixes)

### Perbaikan (Fixed — Diverifikasi Langsung di Chrome Asli)
- **Perbaikan Total Alur Meta Business Suite (`server/autopost/browserPublishers.ts`)**:
  - **Root Cause 1 — Dropdown `"Post to"` memakai ARIA Listbox**: Mengubah `selectMetaBusinessPostTargets()` agar menargetkan struktur asli Meta Business Suite (`[role="listbox"][aria-multiselectable="true"] [role="option"][aria-selected]`) alih-alih `<input type="checkbox">`, sehingga pemilihan FB saja, IG saja, maupun FB + IG sekaligus kini 100% akurat.
  - **Root Cause 2 — `ReferenceError: __name is not defined` di `page.evaluate`**: Menghapus seluruh deklarasi fungsi helper di dalam callback `page.evaluate(...)` agar `tsx`/`esbuild` (`keepNames`) tidak menyuntikkan `__name(...)` ke konteks browser.
  - **Root Cause 3 — IG-Only Melewati Langkah Edit**: Menambahkan guard `isAlreadyOnShareStep()` pada loop wizard Meta sehingga saat mode **Instagram saja** (yang langsung melompat dari `Create` ke `Share` tanpa tahap `Edit`), tombol **`Share`** tidak pernah salah diklik sebagai `Next`.
  - **Root Cause 4 — Pemilihan Tanggal & Scroll Step 3 (`configureMetaBusinessSchedule`)**: Mereset posisi scroll ke atas (`scrollTop = 0`) sebelum mengklik tab **`Schedule`** agar tidak tertutup sticky header, memilih tanggal langsung melalui kalender `[role="grid"]` (karena mengetik + Enter di GeoDateInput Meta kembali ke hari ini), dan menggunakan tombol footer paling kanan (`footerButtons.last()`) agar tidak tergeser oleh tombol `Give us feedback` / `Back`.
  - **Prioritas `<a role="link">Upload Image</a>`**: Memprioritaskan tautan biru `a[role="link"]` pada langkah kedua upload cover 9:16.
- **Perbaikan Matching Jam YouTube Studio**: Menggunakan regex `\s+` saat mencocokkan opsi jam di dropdown YouTube (`tp-yt-paper-item`) agar kompatibel dengan karakter narrow no-break space (`\u202f`, misal `7:30\u202fPM`).

---

## [v2.4.0] - 2026-11-25 (Native Social Media Scheduling Across TikTok, YouTube Shorts, Facebook & Instagram Reels + Web UI Date/Time Override)

### Fitur Baru (Added)
- **Penjadwalan Native Langsung di 4 Platform Sosial Media (`server/autopost/browserPublishers.ts`, `youtubeApi.ts`)**:
  - **TikTok Studio (`configureTikTokSchedule`)**: Memilih radio **`Schedule`** di bawah `When to post`, otomatis menekan **`Allow`** pada modal konfirmasi `"Allow your video to be saved for scheduled posting?"`, mengatur tanggal via kalender `div.calendar-wrapper`, menyetel jam & menit (otomatis dibulatkan ke kelipatan 5 menit, memperbaiki bug format menit `social-auto-upload`), dan mendukung klik otomatis tombol **`Schedule`**.
  - **YouTube Studio (`configureYouTubeSchedule`)**: Membuka panel **`Schedule`** di tahap `Visibility`, otomatis mendeteksi format tanggal & jam locale (`MMM d, yyyy` / `d MMM yyyy`, `12h AM/PM` / `24h`), menyetel tanggal via `#datepicker-trigger` dan jam via `#time-of-day-container` (kelipatan 15 menit), lalu menunggu upload 100% dan menekan tombol **`Schedule`** (`#done-button`). Mendukung juga `publishAt` saat memakai YouTube Data API v3.
  - **Meta Business Suite FB / IG / FB+IG (`configureMetaBusinessSchedule`)**: Memilih tab **`Schedule`** di bawah `Scheduling options` pada Langkah 3 (`Share`), lalu otomatis mengisi **semua baris tanggal & jam** (baik 1 baris untuk FB/IG saja maupun **2 baris terpisah Facebook & Instagram** saat upload gabungan `FB + IG`), serta mendukung klik otomatis tombol **`Schedule`**.
- **Override Tanggal & Jam Jadwal di Web UI CPGP (`NextContentCard.tsx`, `PlatformStatusList.tsx`, `DashboardPage.tsx`)**:
  - Menambahkan kontrol **`Sekarang` | `Jadwalkan`** berdampingan dengan **`Tinjau` | `Langsung`**.
  - Saat **`Jadwalkan`** aktif, otomatis terisi dari tanggal & slot konten (`01` = `11:30`, `02` = `19:30`), dan dapat langsung di-override memakai **`DatePicker`**, input jam 24-jam, tombol cepat **`11:30`** / **`19:30`**, serta tombol **Reset ke slot folder** lengkap dengan peringatan batas minimum 20 menit untuk Meta & TikTok.
  - Berlaku untuk semua tombol: **`Jadwalkan (N Platform)`**, tombol per platform (**YouTube**, **TikTok**, **Instagram**, **Facebook** — baik mode tinjau maupun langsung jadwalkan), tombol gabungan **`Jadwalkan FB + IG`**, dan tombol aksi di tabel **Antrean Konten**.
- **Sinkronisasi Status `scheduled` & `scheduledTime` ke Planner (`server/autopost/queue.ts`, `server/api.ts`)**:
  - Endpoint `POST /api/autopost/trigger` menerima parameter `scheduledAt`. Saat penjadwalan selesai (atau dikonfirmasi dari mode tinjau), status platform di `planner.json` otomatis diperbarui menjadi **`scheduled`** beserta jam `scheduledTime` yang tampil di tooltip badge `Jadwal`.

---

## [v2.3.1] - 2026-11-25 (1-Click Direct Publish per Platform & Synced Publish/Review Mode)

### Peningkatan (Improved)
- **Tombol Langsung Publish (Tanpa Tinjau) di Setiap Platform (`PlatformStatusList.tsx`)**:
  - Setiap baris platform (**YouTube**, **TikTok**, **Instagram**, **Facebook**) kini memiliki 2 aksi cepat yang jelas: **`Tinjau`** (ikon mata) dan **`Langsung Publish`** (ikon kirim, langsung upload dan klik Publish/Post/Share tanpa berhenti untuk review).
  - Tombol gabungan **`Publish FB + IG`** / **`Tinjau FB + IG`** di footer kartu mengikuti mode aktif yang dipilih.
- **Sinkronisasi & Persistensi Mode `Tinjau` / `Langsung` (`DashboardPage.tsx`, `NextContentCard.tsx`)**:
  - Memperbaiki masalah sebelumnya di mana toggle **`Tinjau` | `Langsung`** hanya memengaruhi tombol di `NextContentCard` sementara tombol per platform dan tabel **Antrean Konten** selalu memakai mode `review`.
  - Kini pilihan **`Tinjau` | `Langsung`** tersinkronisasi di seluruh halaman Dashboard (kartu utama, **`FB + IG`**, dan tombol Play di tabel **Antrean Konten**) serta otomatis tersimpan sebagai `defaultMode` workspace.

---

## [v2.3.0] - 2026-11-25 (Unified Meta Business Suite Auto-Post for Facebook & Instagram Reels)

### Fitur Baru & Peningkatan (Added / Improved)
- **Unifikasi Upload Facebook & Instagram Reels via Meta Business Suite (`server/autopost/browserPublishers.ts`)**:
  - Menghapus alur login & upload terpisah ke `instagram.com`. Kini baik **Facebook Reels**, **Instagram Reels**, maupun **Facebook + Instagram sekaligus** berjalan dari satu gerbang **Meta Business Suite** (`business.facebook.com/latest/composer/`).
  - Menambahkan `selectMetaBusinessPostTargets()` untuk membuka dropdown `"Post to"` (`Post to Facebook and Instagram`) dan mengatur checkbox Facebook & Instagram secara otomatis sesuai target (mendukung FB saja, IG saja, atau keduanya sekaligus; mengaktifkan target yang diinginkan terlebih dahulu sebelum menonaktifkan target lain agar tidak diblokir validasi Meta, serta otomatis berhenti di mode tinjau jika akun IG belum terhubung ke Facebook Page).
  - Tetap mendukung upload Cover 9:16 2-langkah (`Upload image` -> `Upload Image`), pengisian deskripsi/caption, wizard 3 langkah (`Create` -> `Edit` -> `Share`), serta mode `Tinjau` dan `Langsung`.
- **Penggabungan Batch Otomatis FB + IG (`server/autopost/queue.ts`)**:
  - Saat mengirim **FB + IG** bersamaan (atau **Kirim ke Semua** dengan engine browser), antrean otomatis menggabungkan keduanya menjadi **1 sesi Meta Business Suite** yang menyinkronkan progress, konfirmasi review, pembatalan, serta status `published` ke kedua platform di `planner.json`.
- **Penyederhanaan Sesi Browser Studio & Tombol Cepat `FB + IG` (`browserSession.ts`, `StudioPage.tsx`, `PlatformStatusList.tsx`, `useAutoPostData.ts`)**:
  - Menghilangkan kartu sesi login `Instagram` terpisah di `Koneksi -> Browser`. Kini hanya ada 3 sesi browser: **YouTube Studio**, **TikTok Studio**, dan **Meta Business (Facebook & Instagram Reels)**; `Buka Semua` dan `Cek Sesi` hanya membuka/memeriksa Meta Business Suite satu kali tanpa duplikasi.
  - Menambahkan tombol cepat **`FB + IG`** di footer kartu **Status Platform** untuk langsung mengunggah ke Facebook & Instagram sekaligus via Meta Business Suite.
  - Memperbaiki penggabungan status cek sesi per kartu agar tidak menimpa hasil cek sesi studio lainnya.

---

## [v2.2.2] - 2026-11-25 (Fix 2-Step "Upload image" -> "Upload Image" Thumbnail Flow on Facebook Reels)

### Perbaikan (Fixed)
- **Alur 2-Langkah Tombol `Upload image` -> `Upload Image` di Meta Business Suite**: Memperbaiki `uploadFacebookReelCover()` di `server/autopost/browserPublishers.ts` agar setelah mengklik tab `Upload image`, sistem langsung memprioritaskan klik tombol/tautan biru kedua **`Upload Image`** yang muncul di panel bawahnya (memicu `filechooser` secara presisi), serta membatasi fallback `<input type="file" accept="image/*">` hanya di dalam `reelSurface` agar tidak menyuntikkan gambar ke input tersembunyi milik composer lama.

---

## [v2.2.1] - 2026-11-25 (Auto-Upload Custom 9:16 Cover Thumbnail on Facebook Reels)

### Peningkatan (Improved)
- **Upload Cover Otomatis di Meta Business Suite (Facebook Reels)**: Menambahkan `uploadFacebookReelCover()` di `server/autopost/browserPublishers.ts` yang otomatis menggulir ke bagian **Thumbnail**, mengklik tombol **`Upload image`** (`Unggah gambar` / multi-bahasa), dan menyuntikkan file `cover-*.jpg` langsung melalui `filechooser` maupun `input[type="file"][accept*="image"]` sebelum melangkah ke tahap Edit & Share.

---

## [v2.2.0] - 2026-11-25 (Zero-API-Key Browser Auto-Post Engine v2 — Ported from social-auto-upload)

### Fitur Baru & Peningkatan (Added / Improved)
- **Upgrade Total 4 Publisher Browser Lokal (`server/autopost/browserPublishers.ts`)**:
  - Mengadopsi arsitektur selector struktural bebas-bahasa (berfungsi di UI Bahasa Indonesia maupun Inggris) dan verifikasi jaringan dari `dreammis/social-auto-upload` langsung ke engine TypeScript `patchright` CPGP (tanpa perlu install Python dan tanpa wajib API Key):
    - **Instagram Reels**: Handler popup notifikasi otomatis (`page.addLocatorHandler`), injeksi video langsung (`input[type="file"][accept*="video/mp4"]`), **upload Cover 9:16 otomatis** di tahap Edit, navigasi wizard struktural (`._ac76`), dan verifikasi publikasi via respons `POST /api/v1/media/configure*` untuk mengambil URL live `instagram.com/reel/...`.
    - **Facebook Page Reels (Meta Business Suite)**: Navigasi langsung ke `business.facebook.com/latest/composer/`, pembersihan otomatis tooltip `GeoGuidanceCard`, upload via `filechooser` yang otomatis berpindah ke wizard 3 langkah `lib:bizweb_create_reel`, dan verifikasi via GraphQL `BusinessComposerStoryCreationMutation`.
    - **YouTube Shorts**: Navigasi langsung ke `youtube.com/upload`, pengisian `.fill()` + blur aman (mencegah dropdown `#` menutupi tombol), **upload Thumbnail/Cover 9:16 otomatis**, pemilihan `VIDEO_MADE_FOR_KIDS_NOT_MFK`, dan **menunggu progress upload 100%** sebelum menekan `#done-button`.
    - **TikTok Studio**: Deteksi otomatis iframe (`iframe[data-tt="Upload_index_iframe"]`) vs halaman langsung, pengisian caption Draft.js via `keyboard.insertText`, deteksi tombol Post aktif + penanganan modal konfirmasi `Post now`.
- **Cek Status Login 4 Platform Secara Live (`POST /api/autopost/check-sessions` & `StudioPage.tsx`)**:
  - Tombol **`Cek Sesi`** (semua platform sekaligus atau per platform) untuk memverifikasi status sesi login asli di Chrome/Edge lokal (`Aktif` / `Perlu Login`) tanpa perlu API Key.

---

## [v2.1.1] - 2026-11-25 (Meta API 8-Step Flow, Long-Lived Token Exchange & Connection Test)

### Fitur Baru & Peningkatan (Added / Improved)
- **Otomatisasi Tukar Short-Lived -> Long-Lived & Permanent Page Token (`POST /api/autopost/meta/exchange-token`)**:
  - Menyimpan `App ID` & `App Secret` secara aman di backend (`data/workspaces/<id>/autopost-config.json`, tidak pernah diekspos ke JavaScript frontend).
  - Menukar token `EAA...` dari Graph API Explorer menjadi **Long-Lived User Token (~60 hari)** via `fb_exchange_token`, lalu otomatis mengambil **Permanent `PAGE_ACCESS_TOKEN`**, `PAGE_ID`, dan `IG_USER_ID` (termasuk fallback `GET /{PAGE_ID}?fields=instagram_business_account`).
- **Login OAuth Meta 1-Klik (`GET /api/autopost/meta/auth-url` & `/callback`)**:
  - Otorisasi langsung dengan 7 permission resmi (`instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `publish_video`).
- **Diagnostik Tes Koneksi FB & IG (`POST /api/autopost/meta/test-connection`)**:
  - Memverifikasi Facebook Page, akun Instagram Business (`@username` & jumlah post), masa berlaku token (`Expires: Never` vs tanggal expired), serta daftar permission yang sudah aktif atau masih kurang sebelum Auto-Post dijalankan.
- **Dokumentasi Tutorial Lengkap (`docs/META_API_GUIDE.md`) & Panduan 8 Langkah di UI (`MetaApiPage.tsx`)**:
  - Panduan terstruktur Langkah 0 hingga Langkah 8 lengkap dengan tombol 1-klik `Salin daftar permission`, tabel ringkasan variabel, dan troubleshooting.

---

## [v2.1.0] - 2026-11-25 (Minimalist UI Polish, `/watermark` Route, `Ctrl+K` Command Palette & Date Pickers)

### Fitur Baru & Peningkatan (Added / Improved)
- **Command Palette Global (`Ctrl + K`)**: Pencarian cepat halaman, aksi produksi, penggantian tema, dan perpindahan workspace dari keyboard menggunakan komponen resmi `shadcn/ui` `Command`, `Dialog`, dan `Kbd`.
- **Halaman Penuh Watermark Studio (`/watermark`)**: Mempromosikan Watermark Studio dari modal sempit menjadi rute penuh `/watermark` dengan tata letak 2 kolom lega, `Select` resmi `shadcn/ui`, 3 tab 1-kata (`Preset`, `Posisi`, `Gaya`), bar aksi preset ber-ikon + Tooltip, dan 1 tombol CTA burgundy utama.
- **Komponen `DatePicker` & `DateRangePicker` Resmi `shadcn/ui`**: Mengganti input tanggal manual pada modal **Buat Konten Baru** (`Tunggal` & `Batch`) serta menambahkan filter rentang tanggal di halaman **Riwayat Auto-Post** dengan locale Bahasa Indonesia (`date-fns/locale/id`).
- **Rombak Ringkasan (`/`) & Poles Semua Tampilan**:
  - Menghapus banner workspace duplikat, 4 kartu teks panjang, dan 8 tile navigasi berulang di `/`, menggantinya dengan **Quick Tools Bar** 1 baris dan feed operasional bersih.
  - Meringkas label sidebar dan judul kolom Kanban menjadi 1–2 kata (`Draft`, `Watermark`, `Siap`, `Terjadwal`, `Sebagian`, `Selesai`, `Hold`), menerapkan `font-light` untuk teks sekunder, menyatukan `PlatformToggleStrip` dalam satu bar halus, dan mengganti `<select>` status di Tabel & Auto-Post menjadi `Select` resmi `shadcn/ui`.
  - Menghapus duplikasi tombol `+ Konten Baru` di `PlannerToolbar`, memperbaiki horizontal scrollbar bocor di sidebar, dan menambahkan tautan aksesibilitas `Langsung ke konten` (`#main-content`).

---

## [v2.0.3] - 2026-11-25 (Slider Rail & Scrollbar Contrast Fix)

### Perbaikan (Fixed)
- **Fix Rel `Slider` Hilang / Menyatu dengan Background**: Menambahkan `@custom-variant` Tailwind CSS v4 untuk atribut Base UI (`data-horizontal`, `data-vertical`, `data-checked`, `data-unchecked`, `data-open`, `data-closed`, `data-active`, `data-disabled`) di `src/index.css` dan memperjelas rel slider (`h-2`, warna rel `#dfd5d8` / `#35282c`, indikator burgundy `#7f1d1d` / `#be123c`, thumb `size-4`).
- **Kontras Scrollbar Light & Dark Mode**: Memperjelas rel dan thumb scrollbar global (`src/index.css`) serta `ScrollArea` (`src/components/ui/scroll-area.tsx`) agar mudah terlihat di mode terang maupun mode gelap.

---

## [v2.0.2] - 2026-11-25 (Windows Batch Launcher Fix)

### Perbaikan (Fixed)
- **Fix `start-planner.bat` Langsung Tertutup di Windows**: Menghapus tanda kurung `()` di dalam blok `if (...)` yang menyebabkan syntax error `. was unexpected at this time` pada `cmd.exe`, menggantinya dengan label `goto` yang 100% aman.
- **Line Endings Otomatis (`.gitattributes` & GitHub Release Workflow)**: Memastikan `start-planner.bat` selalu menggunakan CRLF (`\r\n`) dan `start-planner.sh` / `bin/cpgp-studio.mjs` selalu menggunakan LF (`\n`) di dalam bundel ZIP/TAR rilis.

---

## [v2.0.1] - 2026-11-25 (Production Release Bundle & Launcher Fix)

### Perbaikan (Fixed)
- **Production Mode pada `start-planner.bat` & `start-planner.sh`**: Memanggil `bin/cpgp-studio.mjs` yang langsung melayani folder hasil build `dist/` via `server/index.ts` (tanpa menjalankan `vite dev` saat dijalankan dari paket rilis).
- **Dependensi `tsx` di `dependencies`**: Memindahkan `tsx` dari `devDependencies` ke `dependencies` agar `npm install --omit=dev` pada paket rilis langsung berjalan tanpa error.
- **Bundel Rilis Lebih Ringkas & Terverifikasi**: Workflow GitHub Actions sekarang hanya menyertakan file runtime (`dist/`, `server/`, `shared/`, `src/types/`, `bin/`, launcher) serta melakukan verifikasi integritas file sebelum mengemas `.zip` dan `.tar.gz`.
- **Validasi Ekstraksi ZIP di Launcher**: Menampilkan pesan jelas apabila paket ZIP belum diekstrak secara penuh (misal terpotong oleh sinkronisasi OneDrive).

---

## [v2.0.0] - 2026-11-25 (Multi-Workspace & Luxury Burgundy Release)

### Highlight Rilis
**CPGP v2.0.0** mentransformasi aplikasi dari *single-channel planner* menjadi **Multi-Workspace Local Content Studio** dengan identitas visual **Luxury Burgundy Minimalist**. Setiap kreator kini dapat mengelola banyak channel/workspace sekaligus di satu komputer lokal, memilih aturan file yang fleksibel (`wm_final.mp4` wajib, video langsung, atau timpa file asli), serta membuat struktur folder konten langsung dari antarmuka web.

### Fitur Baru (Added)
- **Identitas Brand CPGP & Tema Luxury Burgundy Minimalist**:
  - Highlight utama pada brand **CPGP** (*Content Planer Gam Puko*) dengan palet merah burgundy (`#651220` / `#7F1D1D` pada Light Mode, `#881337` / `#FDA4AF` pada Dark Mode) dan gradasi burgundy khas (`--gradient-burgundy`) yang telah terverifikasi kontras WCAG AAA (`9.57:1` hingga `12.65:1`).
- **Arsitektur Multi-Workspace Berbasis JSON Lokal (`data/workspaces.json`)**:
  - Setiap workspace memiliki konfigurasi aturan file, database planner (`planner.json`), preset watermark (`watermark-presets.json`), dan konfigurasi auto-post yang terisolasi di `data/workspaces/<workspaceId>/`.
  - **Migrasi Otomatis 0% Kehilangan Data**: Data `v1.0.0` (`D:\RENAL\JURNAL DUNIA\KONTEN`) otomatis dimigrasikan menjadi workspace default **`Jurnal Dunia`** saat pertama kali dijalankan.
- **Workspace Switcher & Onboarding Wizard 3 Langkah (`WorkspaceModal.tsx`)**:
  - Dropdown pemilih workspace di puncak sidebar kiri untuk berpindah antar-channel secara instan tanpa reload halaman.
  - **Native Windows Folder Picker (`POST /api/system/pick-folder`)**: Tombol untuk membuka dialog *Browse Folder* asli Windows langsung dari browser beserta validator isi folder (`POST /api/system/validate-path`).
  - **Salin Preset Watermark Antar-Workspace**: Menyalin gaya watermark dari workspace lama ke workspace baru dan otomatis mengganti teks `@handle`.
- **3 Mode Aturan Video & Watermark (`watermarkPolicy`)**:
  1. `separate_wm_file` (*Standar Jurnal Dunia*): Wajib memiliki `wm_final.mp4` terpisah dari video mentah (`motionprovit-*`) untuk berstatus `Siap Upload`.
  2. `direct_or_wm` (*Kreator Standar*): File video `.mp4` apa pun di dalam folder langsung terbaca `Siap Upload` tanpa wajib `wm_final.mp4`.
  3. `overwrite_source` (*Hemat Disk / Timpa File*): Hasil render di Watermark Studio langsung menimpa (*overwrite*) file video sumber secara atomik dan menandainya siap upload.
- **Generator Konten ke Hardisk (`CreateContentModal.tsx`)**:
  - **Smart Slot Finder (`GET /api/items/suggest-slot`)**: Otomatis mendeteksi dan menyarankan tanggal serta slot jam kosong berikutnya (misal setelah `29.02` otomatis menyarankan `30.01`).
  - **Buat 1 Konten Baru (`POST /api/items/create`)**: Membuat folder fisik `<Root>\<Bulan>\<DD.SLOT>\` beserta file `caption.txt` terstruktur langsung dari Web UI.
  - **Batch Slot Generator (`POST /api/items/batch-generate`)**: Men-generate kerangka folder konten dan template `caption.txt` untuk rentang tanggal (misal 1 minggu atau 1 bulan penuh) dalam sekali klik.
- **Panduan Visual Ringkas & Kontekstual (`QuickGuideModal.tsx`)**:
  - Diagram pohon folder dinamis dan panduan singkat anti-bertele-tele yang otomatis menyesuaikan dengan lokasi folder, `@handle`, dan aturan file dari workspace yang sedang aktif.

### Perombakan & Peningkatan (Changed / Improved)
- **Modularisasi Shared Code (`shared/`)**:
  - Menyatukan parser dan komposer caption Unicode ke `shared/captionParser.ts`, definisi preset aturan ke `shared/rulePresets.ts`, dan tipe workspace ke `shared/types/workspace.ts`.
- **Dynamic File Watcher (`chokidar`)**:
  - Watcher file otomatis berpindah memantau folder `contentRootPath` milik workspace yang sedang aktif setiap kali pengguna berganti workspace.
- **Halaman Detail Konten (`ContentDetailModal.tsx`)**:
  - Dirampingkan menjadi *Slide-Over Sheet / Fullscreen Workbench* dengan bar aksi full-ikon ber-Tooltip dan 3 tab terpartisi (`Publikasi & Platform`, `Caption (caption.txt)`, `Berkas, Checklist & Catatan`).

---

## [v1.0.0] - 2026-11-24 (Initial Jurnal Dunia Release)

### Fitur Awal
- **Auto-Scanner Folder `KONTEN`**: Pemindaian rekursif folder `DD.SLOT` (`01` Siang `11.30 WIB` & `02` Malam `19.30 WIB`), deteksi `motionprovit-*`, `cover-*`, `caption.txt`, dan `wm_final.mp4`.
- **5 Tampilan Kerja Ala Notion**: Papan Kanban (`@reui/kanban`), Tabel Database, Kalender Event (`@reui/event-calendar`), Matriks Jadwal Slot Harian, dan Galeri Vertikal 9:16.
- **Two-Way `caption.txt` Disk Sync**: Edit caption langsung di Web UI dan simpan kembali ke file fisik `caption.txt` di hardisk.
- **Custom Watermark Studio (`@resvg/resvg-js` + FFmpeg)**: Pratinjau SVG 100% WYSIWYG di atas video 9:16, drag-and-drop posisi, manajemen preset, dan render batch lossless-audio (`-c:a copy`, `libx264 CRF 16` / `h264_nvenc`).
- **Dasbor Auto-Post 4 Platform (TanStack Router)**: Integrasi pemicu manual untuk YouTube Shorts (`googleapis` / browser), TikTok (`patchright` persistent profile), Instagram Reels (`Meta Graph API` / browser), dan Facebook Reels (`Meta Graph API` / browser).
