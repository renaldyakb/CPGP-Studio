# AGENTS.md — Jurnal Dunia Content Planner (`manager-flow`)

## 1. Project Overview
**Jurnal Dunia Content Planner (`manager-flow`)** adalah aplikasi Web UI lokal bergaya **Notion** (Kanban Board, Table Database, Schedule Slot Matrix, Gallery, dan Detail Content Page/Side-Peek) yang dibangun menggunakan **Vite + React + TypeScript + Tailwind CSS v4** dengan backend **Node.js (Express)** dan penyimpanan database **JSON detail (`data/planner-data.json`)**.

Aplikasi ini otomatis melakukan scanning dan sinkronisasi dua arah dengan direktori konten utama:
- **Workspace Root:** `D:\RENAL\JURNAL DUNIA`
- **Content Source Folder:** `D:\RENAL\JURNAL DUNIA\KONTEN` (mendukung subfolder bulan seperti `KONTEN\November\24.01`, `24.02`, dst.)
- **Application Root:** `D:\RENAL\JURNAL DUNIA\manager-flow`

---

## 2. Aturan Penamaan Folder & Jadwal Upload (`DD.SLOT`)
Setiap folder konten menggunakan format kode **`DD.SLOT`** (contoh: `24.01`, `24.02`, `25.01`):
- **`DD` (2 digit pertama)**: Tanggal upload dalam bulan tersebut (misal `24` = Tanggal 24).
- **`SLOT` (2 digit setelah titik)**: Target jam upload harian:
  - **`01` — Slot Siang (11.30 – 12.00 WIB)**:
    - *Rekomendasi Strategis*: Menyasar jam istirahat makan siang saat audiens membuka HP sambil santai.
  - **`02` — Slot Malam / Prime Time (19.30 – 20.00 WIB)**:
    - *Rekomendasi Strategis*: Jam *prime time* saat orang beristirahat di rumah dan punya waktu lebih lama untuk menyimak cerita sejarah hingga habis.

---

## 3. Struktur Aset File di Dalam Folder Konten
Setiap folder kode konten (misal `KONTEN\November\24.01`) berisi file dengan konvensi berikut:
1. **`motionprovit-[id].mp4` atau `motionprovit-[id]-[aspect-ratio].mp4`**
   - Video mentah (raw) yang sudah disiapkan namun **belum ada watermark**.
   - Contoh: `motionprovit-1cf3c29a.mp4`, `motionprovit-a2e71a88-9x16.mp4`.
2. **`cover-[id]-[aspect-ratio].jpg|png|webp`**
   - Gambar cover / thumbnail video (biasanya rasio `9x16`).
   - Contoh: `cover-1cf3c29a-9x16.jpg`.
3. **`caption.txt`**
   - File teks caption yang terdiri dari 3 bagian:
     1. **Hook / Judul Pertanyaan** (Paragraf 1)
     2. **CTA / Pertanyaan Diskusi Komentar** (Paragraf 2, diakhiri *"Tulis di komentar."*)
     3. **Hashtags** (Baris terakhir berisi tagar seperti `#edukasi #jurnaldunia`)
4. **`wm_final.mp4` atau `wm_final(1).mp4` (atau `wm_final (1).mp4`)**
   - File video final yang **sudah diberi watermark** dan **siap di-upload** ke **YouTube Shorts, TikTok, Instagram Reels, dan Facebook Reels**.

> **Syarat Konten Siap Upload (`isUploadReady = true`)**:
> Wajib memiliki minimal 3 komponen utama siap upload: **`wm_final` (atau `wm_final(1)`)**, **`cover`**, dan **`caption.txt`**.

---

## 4. Arsitektur Kanban Status & Multi-Platform Tracking

### A. Status Kanban Utama (`workflowStatus`)
1. **`draft_assets` ("1. Aset Belum Lengkap")** — *Auto*: File dasar (`cover`, `caption.txt`, atau `motionprovit`) belum lengkap.
2. **`needs_watermark` ("2. Menunggu Watermark / wm_final")** — *Auto*: `motionprovit`, `cover`, dan `caption.txt` sudah ada, tetapi file `wm_final` belum tersedia (contoh: folder `27.01` s/d `29.02`).
3. **`ready_to_upload` ("3. Siap Upload (WM Ready)")** — *Auto*: `wm_final`, `cover`, dan `caption.txt` sudah lengkap dan siap di-upload manual ke 4 platform (contoh: folder `24.01` s/d `26.02`).
4. **`scheduled` ("4. Terjadwal di Studio")** — *Manual/Auto*: Minimal 1 platform sudah masuk antrean *Scheduled* di aplikasi/Studio.
5. **`partially_published` ("5. Terupload Sebagian")** — *Auto/Manual*: Sudah terupload di 1–3 platform, namun belum semua 4 platform selesai.
6. **`published_all` ("6. Selesai (All 4 Platforms)")** — *Auto/Manual*: Sudah terupload ke **YouTube Shorts, TikTok, Instagram Reels, dan Facebook**.
7. **`on_hold` ("7. Revisi / Hold")** — *Manual*: Konten ditahan sementara karena perlu revisi audio/watermark/caption.

### B. Target Platform Sosial Media
Setiap konten melacak status upload independen untuk 4 platform:
- `yt_shorts` (**YouTube Shorts**)
- `tiktok` (**TikTok**)
- `ig_reels` (**Instagram Reels**)
- `fb_reels` (**Facebook Reels / Page**)

Status per platform:
- `not_started` (Belum Upload)
- `uploaded_draft` (Draft di Studio)
- `scheduled` (Terjadwal sesuai jam slot 01/02)
- `published` (Sudah Tayang / Live)
- `issue` (Kendala / Revisi)

---

## 5. Panduan untuk AI Agent & Developer
- **Jangan menghapus file di dalam `D:\RENAL\JURNAL DUNIA\KONTEN`**. Operasi tulis ke folder `KONTEN` hanya boleh dilakukan pada `caption.txt` saat pengguna mengedit dan menyimpan caption dari UI.
- **Database JSON (`data/planner-data.json`)** menggabungkan `autoMetadata` (hasil scan otomatis dari disk) dan `userProperties` (status Kanban, checklist, status per platform, link post, catatan, tag). Saat melakukan re-scan, `userProperties` tidak boleh hilang/tertimpa.
- Gunakan **MCP Context7** setiap kali membutuhkan referensi dokumentasi library (Vite, React, Tailwind CSS, Express, Lucide).
- Gunakan **Subagents** untuk membagi pekerjaan secara modular (Scanner/Backend, Kanban/Table UI, Detail Modal & Media Preview).
- **Aturan Verifikasi & Server**: JANGAN menjalankan `npm run dev` (dev server) atau `npm run build`. Cukup jalankan typecheck (`npx.cmd tsc --noEmit`) dan testing singkat (`npm.cmd run scan`).
- **WAJIB Cek Graphify (`graphify-out/`) untuk Kode & Dokumen Terkait**:
  - Setiap agent yang bekerja pada proyek ini ke depannya **WAJIB memeriksa `graphify-out/GRAPH_REPORT.md` dan `graphify-out/graph.json` terlebih dahulu** (atau menjalankan `/graphify query "..."`) baik untuk mencari **dokumen terkait** (`AGENTS.md`, `RULES.md`, `PLANNING.md`, `DESIGN.md`) maupun **hubungan antar-file kode** (`server/*`, `src/*`).
  - Ini memastikan pembacaan dokumen dan kode berjalan sangat cepat, tepat sasaran, dan hemat token tanpa perlu menebak-nebak file.
- **Sering-sering Gunakan MCP & Selalu Baca Skills + Rules**:
  - Aktif gunakan MCP **`context7`**, **`shadcn`** (`npx shadcn@latest mcp`), **`reui`** (`https://mcp.reui.io` / `@reui` registry), dan **`meta_devtools`** (`https://mcp.facebook.com/devtools` — Meta Social Technologies MCP) setiap kali membangun atau memperbarui komponen UI maupun integrasi Meta Graph API (Facebook/Instagram Reels).
  - **Selalu Cek & Install Komponen Langsung dari MCP ReUI (`https://reui.io/`) dan `shadcn/ui`**: Sebelum membuat komponen UI baru, wajib cek katalog komponen yang tersedia di MCP ReUI dan shadcn/ui, lalu install langsung ke dalam project (`src/components/ui` atau `src/components/reui`) menggunakan konfigurasi `components.json` (`npx.cmd shadcn@latest add <component>` atau `npx.cmd shadcn@latest add @reui/<component>`).
  - Selalu baca `RULES.md`, `DESIGN.md`, dan load skills (`antislop`, `antislop-ui`, `antislop-human`, `antislop-copywriting`, `antislop-layoutmobile`, `antislop-code`, `graphify`) agar hasil kode dan desain bebas dari AI-slop, bersih, minimalis, dan terpilah rapi untuk manusia.
- **LARANGAN Model `Gemini 3.1 Flash Image` & Generate Gambar oleh Agent**:
  - Jika menggunakan agent/subagent dari model Gemini, **DILARANG KERAS memakai model `Gemini 3.1 Flash Image`**.
  - **DILARANG menghasilkan gambar apa pun oleh agent** untuk pengembangan (jangan memanggil tool image generator). Seluruh pembuatan atau penyediaan gambar hanya dilakukan oleh User.
- **Zero Page Reload pada Mutasi Data & Persistensi Tab Aktif**:
  - Setiap mutasi data (`PATCH`/`PUT`/`POST` ke JSON atau `caption.txt`) wajib menggunakan update state React in-place (Optimistic UI) **tanpa refresh halaman** dan tanpa mereset tab aktif (`Kanban`/`Tabel`/`Kalender`/`Jadwal`/`Galeri`).
  - Folder `data/**` dan file runtime JSON harus selalu dikecualikan di `vite.config.ts` (`server.watch.ignored` + `handleHotUpdate`) agar tidak memicu full-reload Vite saat backend menulis file.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `antislop.md` (core) and then the skill for the task:
- UI / visual: `skills/antislop-ui/SKILL.md`
- Copy & text: `skills/antislop-copywriting/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
- Code comments: `skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: download `antislop.md` again, or run `npx antislop-ai --update` if it was installed as skill folders.
<!-- antislop:end -->
