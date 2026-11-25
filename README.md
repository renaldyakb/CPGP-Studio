# CPGP

**CPGP** (*Content Planer Gam Puko*) adalah aplikasi **Local-First Multi-Workspace Content Planner, Watermark Studio, dan Auto-Post Suite** untuk kreator video pendek (**YouTube Shorts, TikTok, Instagram Reels, dan Facebook Reels**).

Dibangun dengan **Vite + React + TypeScript + Tailwind CSS v4 (shadcn/ui & ReUI)** dan backend lokal **Node.js (Express + FFmpeg + Patchright)** dengan penyimpanan **100% JSON lokal**.

---

## Mengapa CPGP Dibuat? (Cerita di Balik Proyek Ini)

Bagi kreator short-form video yang memproduksi konten setiap hari, masalah terbesar bukanlah menulis ide, melainkan **jembatan yang terputus antara folder file di hardisk dan papan jadwal konten**.

Ketika menggunakan spreadsheet atau Notion cloud:
- Video `.mp4`, thumbnail `cover.jpg`, dan teks `caption.txt` tersimpan di folder komputer lokal, sedangkan jadwalnya berada di tab browser yang tidak tahu apakah video tersebut sudah selesai di-render watermark atau belum.
- Saat waktunya upload ke **4 platform sekaligus (YouTube Shorts, TikTok, Instagram Reels, Facebook Reels)**, kreator harus bolak-balik membuka folder Windows Explorer, menyalin path video satu per satu, membuka `caption.txt`, menyalin judul, lalu mencentang status manual.
- Ketika kreator mulai membangun **channel kedua atau ketiga**, folder dan aturan file antar-channel mulai bercampur.

**CPGP hadir untuk menyatukan semuanya langsung di komputer lokal Anda:**
1. **Folder Hardisk Anda Adalah Database Anda**: CPGP memindai langsung folder konten di komputer Anda secara real-time. Begitu video selesai di-render atau `caption.txt` diubah, status kartu di papan Kanban otomatis bergerak sendiri.
2. **Multi-Workspace untuk Banyak Channel**: Kelola banyak channel dengan lokasi folder root, jam upload, dan aturan file yang berbeda-beda hanya dalam satu klik dari sidebar.
3. **Render Watermark Tanpa Turun Kualitas**: Atur posisi, font, warna, dan outline `@handle` langsung di atas pratinjau video 9:16, lalu render batch menggunakan FFmpeg (`libx264 CRF 16` atau GPU `NVENC`) dengan audio 100% lossless (`-c:a copy`).
4. **Satu Pintu Menuju 4 Platform**: Trigger upload ke YouTube Shorts, TikTok, Instagram Reels, dan Facebook Reels baik melalui API resmi (Meta Graph API & YouTube Data API v3) maupun profil browser lokal persisten.

---

## Fitur Utama CPGP v2.0

### 1. Multi-Workspace & Onboarding dengan Native Folder Picker
- Buat workspace tak terbatas untuk setiap channel Anda (misal: *Jurnal Dunia*, *Channel Sains*, *Klip Podcast*).
- **Native Windows Folder Picker**: Pilih folder root konten langsung lewat jendela *Browse Folder* asli Windows dari browser.
- **Salin Preset Antar-Workspace**: Bawa gaya watermark dari workspace lama ke workspace baru dengan penyesuaian `@handle` otomatis.

### 2. Tiga Mode Aturan Video & Watermark yang Fleksibel
Setiap kreator punya alur produksi berbeda. Saat membuat workspace di CPGP, Anda dapat memilih salah satu dari 3 gaya aturan berikut:

| Mode Aturan | Cara Kerja | Cocok Untuk |
| :--- | :--- | :--- |
| **1. Wajib `wm_final.mp4` Terpisah** *(Standar Jurnal Dunia)* | Video mentah (`motionprovit-*.mp4`) masuk ke status *Butuh Watermark*. Konten baru berstatus *Siap Upload* jika `wm_final.mp4`, `cover`, dan `caption.txt` lengkap. | Kreator yang memisahkan file video mentah tanpa watermark dan file final siap upload. |
| **2. Video Langsung Siap Upload** *(Fleksibel)* | File `.mp4` apa pun di dalam folder langsung terbaca *Siap Upload* tanpa mewajibkan nama `wm_final.mp4`. | Kreator yang sudah memasang watermark langsung dari CapCut, Premiere, atau After Effects. |
| **3. Render & Timpa Video Asli** *(Overwrite Mode)* | Cukup 1 file `.mp4` per folder. Saat di-render di Watermark Studio, file asli ditimpa secara aman tanpa menggandakan ukuran file di hardisk. | Kreator yang membutuhkan fitur Watermark Studio CPGP namun ingin menghemat kapasitas SSD/HDD. |

### 3. Buat Konten dari Web UI atau Manual dari Windows Explorer (Sinkron 2 Arah)
- **Dari Web UI (`+ Konten Baru`)**:
  - **Smart Slot Finder**: Otomatis mencarikan tanggal dan jam slot kosong berikutnya (misal `30.01 - Siang 11:30 WIB`).
  - **Batch Slot Generator**: Generate kerangka folder dan template `caption.txt` untuk 1 minggu atau 1 bulan ke depan sekaligus dalam 1 klik.
  - Otomatis membuat folder fisik `<FolderRoot>\<Bulan>\<DD.SLOT>\` beserta file `caption.txt` di hardisk Anda.
- **Dari Windows Explorer**:
  - Buat folder atau salin file video secara manual ke dalam folder workspace -> watcher `chokidar` langsung mendeteksi dan memperbarui tampilan Web UI tanpa refresh halaman.

### 4. 6 Tampilan Kerja Terpartisi (TanStack Router)
Setiap tampilan memiliki rute URL nyata dan tidak pernah ter-reset saat terjadi perubahan data (*Zero Page Reload*):
- `/` — **Ringkasan & Pusat Tool Studio**: KPI interaktif, peluncur cepat semua tool, jadwal terdekat, dan daftar konten yang butuh perhatian.
- `/kanban` — **Papan Kanban (`@reui/kanban`)**: Drag-and-drop 7 tahap alur kerja, atau kelompokkan berdasarkan Jam Slot (`01 Siang` vs `02 Malam`) dan Kesiapan File.
- `/tabel` — **Tabel Database**: Tabel padat dengan pengurutan kolom, ukuran berkas, dan toggle cepat 4 platform.
- `/kalender` — **Kalender Event (`@reui/event-calendar`)**: Tampilan Bulan, Minggu, Hari, dan Agenda sesuai jam tayang WIB.
- `/jadwal` — **Matriks Jadwal Slot Harian**: Perbandingan berdampingan antara slot Siang dan slot Malam per tanggal.
- `/galeri` — **Galeri Vertikal 9:16**: Dinding pratinjau video vertikal dengan kontrol putar instan.

### 5. Live Editor `caption.txt` Dua Arah
- Edit dalam **Mode Teks Penuh** atau **Mode Terstruktur** (*Paragraf 1 Hook Judul*, *Paragraf 2 Pertanyaan Komentar CTA*, dan *Baris 3 Hashtag*).
- Tekan `Ctrl + S` untuk langsung menulis ulang file fisik `caption.txt` di dalam folder konten tersebut.
- 4 tombol salin cepat: *Salin Semua*, *Salin Hook (untuk Judul YT Shorts < 100 karakter)*, *Salin Tanpa Hashtag*, dan *Salin Hashtag*.

### 6. Custom Watermark Studio (`100% WYSIWYG`)
- Seret posisi watermark langsung di atas video 9:16 dengan garis bantu *snap-to-center*.
- Gunakan font `.ttf` asli dari sistem Windows, atur ukuran, jarak huruf, rotasi, warna, opacity, outline/stroke (`paint-order: stroke fill`), dan shadow.
- Render 1 video atau **Render Batch Semua Konten Butuh WM** dengan live progress bar (persentase, kecepatan, ETA, dan tombol batal).

### 7. Dasbor Auto-Post 4 Platform (`/auto-post`)
- Pemicu upload manual satu per satu atau sekaligus ke **YouTube Shorts, TikTok, Instagram Reels, dan Facebook Reels**.
- Pilihan **Mode Tinjau (Aman)** yang berhenti sebelum tombol Publish terakhir, atau **Mode Langsung Publish**.
- Mendukung **Meta Graph API (`rupload.facebook.com`)** untuk upload file lokal FB & IG Reels tanpa browser, **YouTube Data API v3 (`googleapis`)**, serta **Profil Browser Lokal Persisten (`patchright`)**.
- Panduan lengkap konfigurasi 8 langkah: [Panduan Lengkap Menyambungkan Meta API (Facebook & Instagram Reels)](./docs/META_API_GUIDE.md).

---

## Struktur Konvensi Folder Konten (`DD.SLOT`)

Secara default, CPGP menggunakan kode folder **`DD.SLOT`** yang intuitif bagi manusia:
- **`DD`**: Tanggal tayang dalam bulan tersebut (`01` s/d `31`).
- **`SLOT`**: Kode jam upload harian yang dapat disesuaikan per workspace, contohnya:
  - **`01` (Slot Siang - 11.30 / 12.00 WIB)**: Menyasar jam istirahat makan siang saat audiens membuka HP sambil santai.
  - **`02` (Slot Malam - 19.30 / 20.00 WIB)**: Jam *prime time* saat audiens beristirahat di rumah dan memiliki waktu menyimak video hingga selesai.

```text
<Folder_Root_Workspace>/
└── November/
    ├── 24.01/                        # Tanggal 24, Slot 01 (Siang 11:30 WIB)
    │   ├── motionprovit-1cf3c29a.mp4 # Video mentah (atau video.mp4 pada mode fleksibel)
    │   ├── wm_final.mp4              # Video ber-watermark siap upload
    │   ├── cover-1cf3c29a-9x16.jpg   # Thumbnail / Cover 9:16
    │   └── caption.txt               # Caption (Hook, CTA komentar, #hashtags)
    └── 24.02/                        # Tanggal 24, Slot 02 (Malam 19:30 WIB)
```

---

## Cara Menjalankan di Komputer Lokal

### Prasyarat
1. **Node.js** `v20+` (direkomendasikan `v22+` / `v26+`).
2. **FFmpeg & FFprobe** terinstall di sistem `PATH` (untuk fitur Watermark Studio; di Windows dapat di-install dengan `winget install Gyan.FFmpeg`).
3. **Google Chrome** atau **Microsoft Edge** (untuk fitur Auto-Post via profil studio lokal).

### 1. Jalankan dengan Perintah `cpgp-studio` di Terminal (Rekomendasi)
Pasang perintah global `cpgp-studio` sekali saja:
```bash
git clone https://github.com/renaldyakb/CPGP-Studio.git
cd CPGP-Studio
npm install
npm link
```
Setelah itu, kapan saja dan dari folder mana saja di terminal Anda cukup ketik:
```bash
cpgp-studio                 # Scan workspace aktif, nyalakan server, & buka browser
cpgp-studio --no-browser    # Jalankan tanpa membuka browser otomatis
cpgp-studio --scan-only     # Hanya scan workspace aktif ke JSON
cpgp-studio --update        # Cek rilis versi terbaru di GitHub
cpgp-studio --port 5175     # Jalankan pada port khusus
```

### 2. Sekali Klik dengan File Bash / Batch
Klik dua kali atau jalankan file launcher di root folder:
- **Windows Batch**: `start-planner.bat`
- **Git Bash / macOS / Linux**: `./start-planner.sh`

### 3. Melalui npm Script Manual
```bash
npm install
npm run scan
npm run dev
```
Lalu buka `http://localhost:5173`. CPGP Studio otomatis memeriksa rilis terbaru di `https://github.com/renaldyakb/CPGP-Studio/releases` dan menampilkan banner notifikasi jika versi baru tersedia.

---

## Arsitektur Direktori Proyek (`manager-flow`)

```text
manager-flow/
├── shared/                     # Modul TypeScript murni (Server + Client)
│   ├── types/                  # Kontrak tipe Workspace, Planner, Watermark, AutoPost
│   ├── captionParser.ts        # Parser & komposer caption.txt Unicode
│   ├── rulePresets.ts          # Preset aturan folder & watermark (Jurnal Dunia / Standar / Overwrite)
│   └── watermarkSvg.ts         # Generator SVG watermark WYSIWYG
├── server/                     # Backend lokal Node.js + Express + Chokidar
│   ├── core/                   # Native Windows folder picker, validator path, & generator folder konten
│   ├── workspaces/             # Registry multi-workspace & auto-migrasi data v1 -> v2
│   ├── watermark/              # Renderer @resvg/resvg-js + FFmpeg & antrean p-queue
│   ├── autopost/               # Publisher Meta Graph API, YouTube API v3, & Patchright browser
│   ├── scanner.ts              # Pemindai folder konten berbasis aturan workspace
│   ├── storage.ts              # Sinkronisasi JSON non-destruktif
│   └── api.ts                  # REST API, media range streamer (206 Partial Content), & SSE
├── src/                        # Frontend React 19 + TanStack Router + Tailwind CSS v4
│   ├── components/
│   │   ├── shell/              # AppShell dengan Luxury Burgundy Sidebar & Workspace Switcher
│   │   ├── workspace/          # WorkspaceModal (Onboarding/Create/Edit) & QuickGuideModal
│   │   ├── planner/            # CreateContentModal, PlannerToolbar, PlatformToggleStrip
│   │   ├── autopost/           # Dasbor Auto-Post, Riwayat, Sesi Studio, Meta API, YouTube API
│   │   ├── ui/                 # Primitif shadcn/ui
│   │   └── reui/               # Primitif ReUI (@reui/kanban & @reui/event-calendar)
│   ├── routes/planner/         # Halaman rute Konten (/, /kanban, /tabel, /kalender, /jadwal, /galeri)
│   └── router.tsx              # Konfigurasi TanStack Router
├── data/                       # Database JSON lokal per workspace (diabaikan oleh git & Vite HMR)
├── DESIGN.md                   # Spesifikasi sistem desain Luxury Burgundy Minimalist
├── RULES.md                    # Aturan domain & standar engineering proyek
└── CHANGELOG.md                # Catatan riwayat versi rilis (v1.0.0 -> v2.0.0)
```

---

## Privasi & Keamanan Lokal
- **Tidak Ada Data yang Dikirim ke Pihak Ketiga**: Seluruh file video, caption, dan database JSON berjalan 100% di `localhost` Anda.
- **Kredensial API Aman di Lokal**: Token Meta Graph API, OAuth YouTube, dan cookies profil browser disimpan di dalam folder `data/workspaces/<id>/` yang disamarkan dari respons API publik.
