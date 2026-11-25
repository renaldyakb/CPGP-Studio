# Changelog: CPGP (Content Planer Gam Puko)

Seluruh perubahan besar pada proyek **CPGP** dicatat dalam dokumen ini menggunakan format Semantic Versioning (`MAJOR.MINOR.PATCH`).

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
