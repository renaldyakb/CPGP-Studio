# DESIGN.md: CPGP (Content Planer Gam Puko)

## 1. Identity & Brand Direction
- **Brand Name**: **CPGP** (subtitle kecil yang tidak ditonjolkan: *Content Planer Gam Puko*). Singkatan **CPGP** selalu menjadi fokus identitas utama di sidebar header, `<title>` halaman, onboarding, dan dokumentasi rilis GitHub.
- **Audience**: Kreator dan produser konten video pendek multi-channel (YouTube Shorts, TikTok, Instagram Reels, Facebook Reels) yang mengelola banyak workspace lokal (termasuk workspace pertama: *Jurnal Dunia*).
- **Design Language**: Luxury Burgundy Minimalist Workspace (berbasis **shadcn/ui** dan **ReUI**). Bersih, lapang, terpartisi rapi, dengan identitas merah burgundy yang mewah serta gradasi burgundy khas yang terukur.
- **Dial**: `ENERGY 2 / RHYTHM 2 / MOTION 1`

## 2. Color Palette: Luxury Burgundy & Clean Neutral (WCAG AA Verified, R-01, R-25, R-29)
Menggunakan 2 warna netral hangat + 1 aksen utama **Luxury Burgundy** (beserta 1 gradasi burgundy khas untuk elemen identitas utama seperti CTA utama, emblem CPGP, dan header kartu hero/onboarding).

### Light Mode (Default: Warm Ivory & Royal Burgundy)
- **Background Primary (`--background`)**: `#FAF8F8` (Warm ivory paper)
- **Surface / Card (`--card`)**: `#FFFFFF` (Pure white, border `1px` `#E6E0E1`)
- **Muted Surface (`--muted`)**: `#F4EFEF` (Warm stone lane container)
- **Text Primary (`--foreground`)**: `#1A1415` (Warm obsidian ink, contrast `18.1:1` PASS)
- **Text Secondary (`--muted-foreground`)**: `#5C5153` (Contrast on `#FFFFFF`: `7.6:1` PASS)
- **Primary Burgundy (`--primary`)**: `#7F1D1D` / `#651220` dengan teks `#FFFFFF` (Contrast `9.77:1` — `11.79:1` PASS AAA)
- **Signature Burgundy Gradient (`--gradient-burgundy`)**: `linear-gradient(135deg, #4A0D18 0%, #7F1D1D 55%, #9F1239 100%)` (teks putih `#FFFFFF` di atas titik paling terang `#9F1239` tetap `7.3:1` PASS AAA!)

### Dark Mode (Obsidian Wine & Crimson Burgundy)
- **Background Primary (`--background`)**: `#0B090A` (Deep obsidian wine)
- **Surface / Card (`--card`)**: `#131012` (Flat dark surface, border `1px` `#2A2124`)
- **Muted Surface (`--muted`)**: `#1B1618`
- **Text Primary (`--foreground`)**: `#FAF7F7` (Contrast `18.3:1` PASS)
- **Text Secondary (`--muted-foreground`)**: `#A89CA0` (Contrast `7.4:1` PASS)
- **Primary Burgundy (`--primary`)**: `#881337` dengan teks `#FFFFFF` (Contrast `8.98:1` PASS AAA) dan aksen teks/ikon `#FDA4AF` di atas `#131012` (`9.81:1` PASS AAA)
- **Signature Burgundy Gradient (`--gradient-burgundy`)**: `linear-gradient(135deg, #3B0712 0%, #7F1D1D 50%, #9F1239 100%)`

### Purpose-Gate Justification for Signature Burgundy Gradient (R-01, R-31)
- **Why use the burgundy gradient?** The gradient (`#4A0D18 -> #7F1D1D -> #9F1239`) is strictly reserved as CPGP's brand motif on the **CPGP monogram badge**, the **primary action button (`variant="editorial"`)**, and a subtle top border/accent on the **primary Workspace/Next-Content focal card** — never spammed across the entire page background.

### Semantic Status Tokens (Functional Only, R-09)
- **Success / Ready**: Light `#166534` on `#DCFCE7` (`6.49:1`) / Dark `#86EFAC` on `#052E16` (`10.62:1`)
- **Warning / Needs Watermark**: Light `#92400E` on `#FEF3C7` (`6.37:1`) / Dark `#FCD34D` on `#451A03` (`10.39:1`)
- **Danger / Incomplete**: Light `#991B1B` on `#FEE2E2` (`6.80:1`) / Dark `#FCA5A5` on `#450A0A` (`8.51:1`)
- **Burgundy Accent Badge**: Light `#651220` on `#FCE7EB` (`8.4:1`) / Dark `#FECDD3` on `#4C0519` (`11.61:1`)

## 3. Typography & Copy Hygiene (R-02, R-04, R-06)
- **Primary Sans**: **Plus Jakarta Sans** (`@fontsource/plus-jakarta-sans` weights 400/500/600/700, bundled locally for offline speed and zero render-blocking external scripts per R-40). Chosen explicitly by the user for warm geometric legibility in Indonesian editorial headlines and clean workspace controls.
- **Monospace**: **JetBrains Mono** (`@fontsource/jetbrains-mono` weights 400/500/600, bundled locally). Used strictly for structured technical tokens: folder codes (`24.01`), filenames (`wm_final.mp4`), disk paths, counters (`0/4`), and `#hashtags`.
- **Action Density Rule (Anti-Clutter)**:
  - Consolidate row/card actions into a single **`DropdownMenu`** (`ItemActionsMenu`) rather than rendering 3-4 separate buttons and a `<select>` on every card/row.
  - Consolidate secondary filters into a single **`Popover`** (`Filter`) so the top workspace stays calm and spacious.
  - Collapse empty Kanban columns behind a clean toggle so active work (`Menunggu Watermark` & `Siap Upload`) takes center stage immediately.
- **Strict Copy Rules**:
  - **Zero Em Dashes (`—`)**: Never use `—` anywhere in UI labels, titles, or descriptions (R-02). Use colons (`:`), periods (`.`), commas (`,`), or standard hyphens (`-`).
  - **Zero Decorative Emojis**: Do not place emojis (`📋`, `☀️`, `🌙`, `💧`, `🚀`, `✅`) in headings, buttons, badges, or tabs (R-04).
  - **Zero Generic AI Icons**: Never use `Sparkles`, `Wand`, or decorative orbs (R-04). Use functional icons only where they clarify action, paired with visible text or `aria-label`.

## 4. Information Architecture: "Dipilah-pilah Agar Mudah Dibaca Manusia"
Seluruh aplikasi memakai satu shell yang sama (`AppShell`) dengan sidebar yang bisa diciutkan menjadi rail ikon:
1. **Sidebar Kiri (2 grup)**
   - Grup **Konten**: `Ringkasan` (`/`), `Kanban` (`/kanban`), `Tabel` (`/tabel`), `Kalender` (`/kalender`), `Jadwal Slot` (`/jadwal`), `Galeri` (`/galeri`).
   - Grup **Publishing**: `Dasbor Auto-Post` (`/auto-post`), `Riwayat` (`/auto-post/history`), `Sesi Studio` (`/auto-post/studio`), `Meta API` (`/auto-post/meta`), `YouTube API` (`/auto-post/youtube`).
2. **Topbar + Toolbar (`PlannerToolbar`)**
   - Topbar hanya menampilkan judul halaman, status live-sync, scan ulang, dan toggle tema.
   - Untuk rute Konten, di bawah topbar ada satu baris filter (`Input` pencarian + `Popover` Filter + penghitung konten).
3. **Halaman Fokus**
   - `/` adalah halaman ringkasan baru (KPI, jadwal terdekat, konten yang butuh perhatian, progres publikasi per platform, aksi cepat).
   - Tiap tampilan (`KanbanView`, `TableView`, `CalendarView`, `ScheduleView`, `GalleryView`) berada di rutenya sendiri sehingga tidak lagi menumpuk dalam satu tab switcher.
4. **Segmented Detail Sheet (`ContentDetailModal` dengan 3 Tab)**
   - Kolom kiri: pemutar 9:16 (`wm_final.mp4` vs `motionprovit` vs `cover`) + salin path dan buka di Explorer.
   - Kolom kanan: 3 tab terpisah (Status & Publikasi, Editor `caption.txt`, Detail Aset & Catatan).

## 5. Navigasi Berbasis Rute (TanStack Router)

Semua layar punya URL sendiri:

| Rute | Isi |
| --- | --- |
| `/` | Ringkasan konten (KPI, jadwal terdekat, butuh perhatian, progres platform) |
| `/kanban` | Papan Kanban |
| `/tabel` | Tabel database |
| `/kalender` | Kalender bulanan/mingguan |
| `/jadwal` | Matriks Slot 01 Siang dan Slot 02 Malam |
| `/galeri` | Galeri vertikal 9:16 |
| `/auto-post` | Dasbor Auto-Post |
| `/auto-post/history` | Riwayat dan antrean proses |
| `/auto-post/studio` | Sesi login studio |
| `/auto-post/meta` | Pengaturan Meta API |
| `/auto-post/youtube` | Pengaturan YouTube API |

Alasan:
- **Kenapa rute nyata, bukan state internal?** Setiap layar bisa di-bookmark, dibagikan, di-refresh, dan kembali lewat tombol Back browser. Kesan "SPA yang bingung" hilang karena URL selalu menggambarkan posisi kerja.
- **Kenapa konfigurasi rute berbasis kode (`createRoute`) bukan file-based codegen?** Repo ini tidak menjalankan dev server atau build saat pengembangan (lihat `RULES.md`), sehingga berkas hasil codegen tidak dapat dihasilkan. Rute berbasis kode tetap memberi tipe statis penuh tanpa langkah generate.
- **Kenapa state dasbor hidup di layout route?** Hook `useAutoPostData` dipasang sekali di `/auto-post` sehingga berpindah antar sub-halaman tidak memicu fetch ulang atau memutus SSE.
- **Kenapa aksi lintas halaman memakai search param?** `/?detail=ID`, `/?caption=ID`, dan `/?watermark=ID` membuka modal yang tepat setelah kembali dari dasbor, tanpa state global tambahan.

## 6. Written Reasons for Visual Decisions (R-31)
- **Why Light/Dark neutral palette with one amber accent?** So video thumbnails and functional status badges (`WM Siap` vs `Belum WM`) stand out immediately without fighting a neon UI.
- **Why 3 tabs inside the Content Detail Modal?** Because mixing video inspection, 4-platform URL tracking, `caption.txt` editing, and checklist notes in one long scroll creates cognitive overload; tabs isolate each job cleanly.
- **Why monospace on folder codes (`24.01`) and filenames (`wm_final.mp4`)?** So numeric date-slot codes align vertically in tables and distinguish disk filenames from prose captions.
- **Why flat 1px borders (`rounded-lg` cards, `rounded-md` buttons, `rounded-sm` badges) instead of shadows and glassmorphism?** Flat borders create crisp boundaries between dense data columns while differentiating interactive buttons from static badges (R-10, R-11, R-12).
