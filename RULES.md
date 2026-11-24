# RULES.md — Project Rules & Coding Conventions (`manager-flow`)

## 1. Core Domain Rules (Jurnal Dunia Content Workflow)
1. **Non-Destructive Content Scanning**:
   - Direktori `D:\RENAL\JURNAL DUNIA\KONTEN` adalah *Source of Truth* untuk aset fisik.
   - Scanner harus membaca secara rekursif baik subfolder bulanan (`KONTEN\November\24.01`) maupun folder langsung (`KONTEN\24.01`).
   - Jangan pernah menghapus atau memindahkan file video/cover pengguna.
2. **Aturan Deteksi File Aset**:
   - **Video Siap Upload (`wm_final`)**: Cocokkan regex `/^wm_final(?:\s*\(\d+\))?\.(mp4|mov|mkv|webm)$/i`. Jika ada `wm_final.mp4` dan `wm_final(1).mp4`, pilih yang memiliki `mtimeMs` terbaru sebagai file utama dan simpan daftar semua kandidatnya.
   - **Video Mentah (`motionprovit`)**: Cocokkan regex `/^motionprovit-([a-z0-9]+)(?:-([0-9]+x[0-9]+))?\.(mp4|mov|mkv|webm)$/i`. Ekstrak `motionprovitId` (misal `1cf3c29a`) dan rasio aspek (misal `9x16`).
   - **Cover / Thumbnail (`cover`)**: Cocokkan regex `/^cover-([a-z0-9]+)(?:-([0-9]+x[0-9]+))?\.(jpg|jpeg|png|webp)$/i`.
   - **Caption (`caption.txt`)**: Baca encoding UTF-8, pisahkan paragraf untuk mendapatkan:
     - `hookTitle` (Paragraf 1 — digunakan sebagai judul card Notion & rekomendasi judul YouTube Shorts)
     - `ctaQuestion` (Paragraf 2 — kalimat pemancing komentar)
     - `hashtags` (Daftar hashtag `#...` di bagian bawah)
   - **File Asing (`otherFiles`)**: File di luar 4 kategori di atas (misalnya `.apk` atau `.exe` pada folder `29.02`) harus dideteksi dan ditampilkan sebagai peringatan (*Stray Files Warning*) di halaman detail agar folder tetap rapi.
3. **Aturan Slot Waktu Upload**:
   - Kode `.01` -> **Slot Siang (11.30 atau 12.00 WIB)** — *Menyasar jam istirahat makan siang saat orang membuka HP sambil santai.*
   - Kode `.02` -> **Slot Malam (19.30 atau 20.00 WIB)** — *Jam prime time saat orang beristirahat di rumah dan punya waktu lebih lama untuk menyimak cerita sejarah hingga habis.*
4. **Aturan Sinkronisasi Status Kanban Otomatis**:
   - Jika `statusLockedManually === false`:
     - Jika semua 4 platform `published` -> `published_all`
     - Jika 1..3 platform `published` -> `partially_published`
     - Jika >= 1 platform `scheduled` -> `scheduled`
     - Jika `hasWmFinal && hasCover && hasCaption` -> `ready_to_upload`
     - Jika `hasRawVideo && hasCover && hasCaption && !hasWmFinal` -> `needs_watermark`
     - Selain itu -> `draft_assets`
   - Jika pengguna memindahkan card secara manual di Kanban Board (misal ke `on_hold`, `scheduled`, dll.), simpan status baru dan perbarui state platform/lock dengan cerdas.

## 2. Technical & UI/UX Standards
1. **Stack**:
   - Frontend: Vite + React 18/19 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`) + `lucide-react`.
   - Backend: Node.js + Express + `chokidar` (terintegrasi langsung sebagai middleware Vite saat development maupun standalone server).
   - Storage: Detailed JSON di `D:\RENAL\JURNAL DUNIA\manager-flow\data\planner-data.json`.
2. **Notion-Like Design System**:
   - Mendukung tampilan bersih ala Notion dengan sidebar/top workspace switcher, properti bergaya Notion (pills, status badges, database table cells, side-peek / full detail modal).
   - Mendukung aksi cepat untuk mempercepat upload manual:
     - **One-Click Copy Caption** (Full Caption, Hook/Judul saja, Caption tanpa hashtag, Hashtags saja).
     - **One-Click Copy Video Path** (`wm_final.mp4` absolute path) agar saat dialog *File Upload* di browser terbuka, pengguna cukup tekan `Ctrl+V` lalu `Enter`.
     - **One-Click Reveal in Windows Explorer** (`explorer.exe /select,"..."`) untuk drag-and-drop file `wm_final.mp4` dan `cover`.
3. **Media Streaming**:
   - Endpoint `/media` wajib mendukung HTTP Range (`206 Partial Content`) agar video `wm_final.mp4` dan `motionprovit-*.mp4` bisa diputar dan di-scrub (maju-mundur) dengan mulus di dalam browser.
4. **Testing & Verification Rule (PENTING — Jangan Jalankan Dev Server / Build)**:
   - **JANGAN PERNAH** menjalankan `npm run dev` (dev server) atau `npm run build` secara otomatis oleh agent.
   - Untuk verifikasi kode, **cukup jalankan pengecekan TypeScript type error (`npx.cmd tsc --noEmit`) dan testing singkat CLI/unit** (seperti `npm.cmd run scan` untuk mengetes scanner & pembuatan JSON).
5. **Graphify Knowledge Graph (`graphify-out/`) untuk Efisiensi Token & Navigasi Dokumen Cepat**:
   - Proyek ini dilengkapi dengan knowledge graph **Graphify** (`graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, `graphify-out/graph.html`) yang memetakan seluruh **file kode** DAN **dokumen proyek** (`AGENTS.md`, `RULES.md`, `PLANNING.md`, `DESIGN.md`).
   - **Instruksi Wajib untuk Agent Ke Depan**:
     1. Sebelum membaca banyak file atau melakukan `grep`/`glob` luas, **cek `graphify-out/GRAPH_REPORT.md` atau query `graphify-out/graph.json` terlebih dahulu** untuk menemukan dokumen terkait dan node kode yang tepat sasaran.
     2. Gunakan bagian *God Nodes*, *Community Clusters*, dan *Document Relationships* di Graphify untuk langsung menuju file atau aturan yang relevan sehingga hemat token dan cepat.
6. **Kewajiban Menggunakan MCP, Membaca Skills, Rules & Anti-Slop Design (`DESIGN.md`)**:
   - **Sering-sering Gunakan MCP**: Selalu gunakan MCP **`context7`**, **`shadcn`** (`npx shadcn@latest mcp`), **`reui`** (`https://mcp.reui.io` / `@reui` registry di `components.json`), dan **`meta_devtools`** (`https://mcp.facebook.com/devtools` — Meta Social Technologies MCP untuk manajemen Meta App, Business Portfolio, izin API, dan pencarian dokumentasi resmi Meta) untuk membaca dokumentasi resmi dan referensi komponen UI yang aman & akurat.
   - **Selalu Cek & Install Component Library dari MCP `https://reui.io/` dan `shadcn/ui`**:
     - Setiap kali membutuhkan komponen UI baru (Table, DataGrid, Badge, Tabs, Sheet, Dialog, Select, Accordion, Tooltip, dll.), **selalu cek terlebih dahulu ketersediaan komponennya melalui MCP `reui` (`https://reui.io/`) dan `shadcn/ui`**.
     - Gunakan registry yang sudah terdaftar di `components.json` (`@reui`: `https://reui.io/r/{style}/{name}.json` dan registry default `shadcn/ui`) agar komponen dapat di-install langsung ke folder komponen project (`npx.cmd shadcn@latest add <nama-komponen>` atau `npx.cmd shadcn@latest add @reui/<nama-komponen>`).
   - **Wajib Baca Skills & Rules Setiap Sesi**: Sebelum menulis atau merombak kode/UI, selalu load dan patuhi:
     - `RULES.md`, `DESIGN.md`, `AGENTS.md`, dan `antislop.md`
     - Skills: `antislop`, `antislop-ui`, `antislop-human`, `antislop-copywriting`, `antislop-layoutmobile`, `antislop-code`, serta `graphify`.
   - **Standar UI Anti-Slop (Clean, Minimalist, Dipilah-pilah untuk Manusia)**:
     - Gunakan komponen modular dari **shadcn/ui** (`src/components/ui/*`) dan **ReUI** (`src/components/reui/*`).
     - **Dilarang keras** menggunakan karakter em dash (`—`) pada teks UI (R-02), emoji dekoratif pada tombol/badge/heading (R-04), ikon AI klise seperti `Sparkles` (R-04), glow berlebihan (R-13), atau glassmorphism berlapis (R-10).
     - **Pilah informasi (Progressive Disclosure)** agar mudah dibaca manusia: kartu Kanban harus ringkas dan fokus, sedangkan detail konten dibagi ke dalam Tab terpisah (Status & Platform, Editor `caption.txt`, File Aset & Catatan).
     - Pastikan kontras warna lulus WCAG AA (4.5:1 teks normal, 3:1 teks besar & batas komponen, diverifikasi dengan `contrast-check.py`) baik di mode Terang (Light) maupun Gelap (Dark).
7. **Larangan Mutlak Model `Gemini 3.1 Flash Image` & Image Generation oleh Agent**:
   - Jika menjalankan agent atau subagent dari model Gemini, **JANGAN PERNAH memilih atau menggunakan model `Gemini 3.1 Flash Image`**.
   - **Agent DILARANG KERAS men-generate / menghasilkan gambar apa pun** (baik cover, ikon, ilustrasi, maupun placeholder gambar) selama pengembangan. Biarkan hanya User yang membuat atau menyediakan aset gambar.
8. **Zero Page Reload pada Setiap Mutasi Data & Persistensi State UI**:
   - **Setiap mutasi data** (klik badge platform `YT`/`TT`/`IG`/`FB`, pindah status Kanban, edit `caption.txt`, simpan preset watermark, render video, atau auto-post) **WAJIB berlangsung secara in-place tanpa refresh halaman** (`fetch` + Optimistic UI state update) agar pengguna tidak kehilangan tab aktif, filter, maupun posisi scroll.
   - **Wajib menjaga `vite.config.ts`**: Seluruh folder data runtime (`data/**`, `graphify-out/**`, profil browser, file JSON database/preset, dan file sementara `.tmp.mp4`) **HARUS selalu diabaikan** oleh watcher Vite (`server.watch.ignored` dan `handleHotUpdate` mengembalikan `[]`) supaya penulisan file JSON oleh backend tidak pernah memicu Vite HMR full-reload.
   - **Persistensi Tab & Preferensi UI**: State tampilan aktif (`viewMode`, `kanbanGroupBy`, `theme`) wajib disimpan di `localStorage` (dan disinkronkan non-destruktif) agar konteks kerja pengguna tetap terjaga.
9. **Navigasi Wajib Berbasis Rute (TanStack Router)**:
   - Setiap layar besar **wajib punya URL sendiri** melalui **TanStack Router** (`src/router.tsx`), bukan state internal yang menumpuk seperti SPA tanpa alamat.
   - Seluruh aplikasi memakai satu shell (`AppShell`) dengan sidebar dua grup:
     - **Konten**: `/` (Ringkasan), `/kanban`, `/tabel`, `/kalender`, `/jadwal`, `/galeri`.
     - **Publishing**: `/auto-post`, `/auto-post/history`, `/auto-post/studio`, `/auto-post/meta`, `/auto-post/youtube`.
   - Gunakan **code-based routing** (`createRoute`) karena repo tidak menjalankan dev server atau build, sehingga berkas hasil codegen file-based routing tidak bisa dihasilkan.
   - **State lintas halaman memakai search param tervalidasi** (`validateSearch`), contoh `/?detail=ID`, `/?caption=ID`, `/?watermark=ID`, serta `/auto-post?item=ID`.
   - State bersama untuk satu subtree **wajib diletakkan di layout route** (`PlannerProvider` di `/` dan `AutoPostProvider` di `/auto-post`) agar berpindah halaman tidak memicu fetch ulang atau memutus SSE.
   - Jangan memakai `history.replaceState` manual untuk mengubah URL; selalu lewat `navigate` dari TanStack Router.
