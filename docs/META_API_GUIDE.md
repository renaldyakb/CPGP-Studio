# Panduan Lengkap Menyambungkan Meta API (Facebook Reels & Instagram Reels)

Panduan ini disusun mengikuti urutan kerja resmi dari persiapan akun hingga pengujian koneksi di **CPGP** (*Content Planer Gam Puko*). Jangan melompat langsung ke pembuatan token sebelum akun Instagram dan Facebook Page siap, karena akun yang belum memenuhi syarat akan membuat token gagal dipakai untuk publish.

Di CPGP, **Langkah 5, 6, dan 7 sudah diotomatisasi dalam 1 klik** lewat halaman **Auto-Post > Meta API** (`/auto-post/meta`), sehingga Anda tidak perlu lagi menjalankan panggilan cURL secara manual untuk memperpanjang token atau mencari ID Page/Instagram.

---

## Ringkasan Alur 8 Langkah

1. **Langkah 0**: Siapkan akun Instagram (Business/Creator) dan tautkan ke Facebook Page tempat Anda menjadi Admin.
2. **Langkah 1**: Daftar akun Meta Developer di `developers.facebook.com`.
3. **Langkah 2**: Buat Meta App tipe **Business**, lalu catat **App ID** dan **App Secret**.
4. **Langkah 3**: Tambahkan produk **Facebook Login for Business** dan **Instagram Graph API**, lalu daftarkan Redirect URI CPGP.
5. **Langkah 4**: Ambil token awal (`EAA...`) di Graph API Explorer dengan 7 permission lengkap.
6. **Langkah 5 & 6 (Otomatis 1 Klik di CPGP)**: Tukar short-lived token menjadi Long-Lived Token (60 hari) sekaligus ambil `PAGE_ACCESS_TOKEN` permanen, `PAGE_ID`, dan `IG_USER_ID`.
7. **Langkah 7 (Otomatis 1 Klik di CPGP)**: Jalankan **Tes Koneksi FB & IG** untuk memastikan Page, Instagram Business, masa berlaku token, dan seluruh izin sudah valid sebelum auto-post.
8. **Langkah 8**: Pahami batas mode **Development** (untuk akun sendiri) vs **Publik** (memerlukan Meta App Review).

---

## Langkah 0: Siapkan Akun Terlebih Dahulu (Wajib)

Ini adalah penyebab kegagalan yang paling sering ditemui. Pastikan ketiga syarat berikut sudah terpenuhi sebelum membuka Meta Developer:

1. **Akun Instagram wajib bertipe Business atau Creator** (bukan akun Personal).
   - Di aplikasi Instagram: buka **Settings > Account type and tools > Switch to professional account**.
   - Pilih **Business** atau **Creator**.
2. **Instagram wajib terhubung ke sebuah Facebook Page**.
   - Dari Instagram: **Settings > Account > Linked accounts (Akun tertaut) > Facebook Page**.
   - Atau dari Facebook Page: **Settings > Linked Accounts > Instagram**.
3. **Akun Facebook Anda wajib berstatus Admin** (Full Control) di Facebook Page tersebut.

> **Kenapa syarat ini mutlak?**
> Publishing Instagram melalui Graph API meminjam akses dari Facebook Page yang tertaut. Jika Instagram masih Personal atau belum tertaut ke Page, Meta API tidak akan mengembalikan `IG_USER_ID` dan tidak bisa mempublikasikan Reels.

---

## Langkah 1: Buat Akun Meta Developer

1. Buka [developers.facebook.com](https://developers.facebook.com/).
2. Login menggunakan akun Facebook yang menjadi Admin Page Anda.
3. Jika baru pertama kali masuk, selesaikan pendaftaran sebagai **Meta Developer** (gratis).

---

## Langkah 2: Buat Meta App & Catat App ID + App Secret

1. Di dashboard Meta Developer, klik **My Apps > Create App**.
2. Pilih tipe aplikasi **Business**.
3. Isi detail aplikasi:
   - **App Name**: contoh `Jurnal Dunia Auto Post`
   - **Contact Email**: email aktif Anda
4. Klik **Create App**.
5. Buka menu **App Settings > Basic**, lalu catat dua kredensial utama:
   - **App ID**
   - **App Secret**

> **Catatan Keamanan:**
> **App Secret** setara dengan kata sandi aplikasi Anda. Jangan pernah menaruh App Secret di kode JavaScript frontend publik. Di CPGP, App Secret hanya dikirim ke backend lokal (`localhost`) dan disimpan terpisah di folder `data/workspaces/<id>/`.

---

## Langkah 3: Tambahkan Produk & Atur OAuth Redirect URI

Masih di dashboard Meta App Anda:

1. Buka bagian **Add Product**.
2. Tambahkan dua produk berikut:
   - **Facebook Login for Business** (atau *Facebook Login*)
   - **Instagram Graph API** (atau *Instagram API with Instagram Login*)
3. Masuk ke pengaturan **Facebook Login > Settings**, lalu isi kolom **Valid OAuth Redirect URIs** dengan alamat callback lokal CPGP:

```text
http://localhost:5173/api/autopost/meta/callback
```

4. Klik **Save Changes**.

*(Jika Anda menggunakan tombol **Login OAuth Meta** di CPGP, CPGP juga bisa mengambil token langsung lewat redirect URI di atas tanpa perlu membuka Graph API Explorer secara manual.)*

---

## Langkah 4: Ambil Token Pertama lewat Graph API Explorer

Cara paling cepat dan transparan untuk mendapatkan token awal adalah lewat Graph API Explorer:

1. Buka [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer/).
2. Pada panel kanan atas, pilih **Meta App** yang baru Anda buat di Langkah 2.
3. Klik **Generate Access Token** (atau **Get Token > Get User Access Token**).
4. Centang **7 permission** berikut secara lengkap:

**Untuk Instagram Reels:**
- `instagram_basic`
- `instagram_content_publish` *(dipakai untuk membuat container dan publish Reels ke Instagram)*

**Untuk Facebook Page Reels:**
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `pages_manage_metadata`
- `publish_video`

5. Klik **Generate Access Token**, login dengan akun Facebook Anda, lalu pilih **Facebook Page** dan akun **Instagram Business** yang ingin digunakan.
6. Salin token yang muncul (biasanya diawali `EAA...`).

> **Penting:** Token langsung dari Graph API Explorer bersifat **short-lived** (hanya berlaku 1 sampai 2 jam). Jangan dipakai langsung untuk auto-upload jangka panjang; lanjutkan ke Langkah 5 & 6 di bawah untuk menukarnya secara otomatis di CPGP.

---

## Langkah 5 & 6: Tukar ke Long-Lived Token & Ambil Page/IG ID (Otomatis 1 Klik di CPGP)

Di panduan manual, Anda biasanya harus memanggil endpoint `oauth/access_token`, lalu memanggil `/me/accounts`, lalu memanggil `/{PAGE_ID}?fields=instagram_business_account` satu per satu.

### Cara Cepat di CPGP (1 Klik)
1. Buka halaman **Auto-Post > Meta API** (`/auto-post/meta`) di CPGP.
2. Pada kartu **Kredensial Meta App & Token**, masukkan:
   - **App ID** (dari Langkah 2)
   - **App Secret** (dari Langkah 2)
3. Tempel token `EAA...` dari Langkah 4 ke kolom **Short-Lived / Access Token (EAA...)**.
4. Klik tombol **Tukar Long-Lived & Ambil Page/IG**.
5. Jika akun Facebook Anda mengelola lebih dari satu Page, pilih Page yang diinginkan pada daftar yang muncul lalu klik **Gunakan Page Ini**.

### Apa yang Dikerjakan CPGP di Balik Layar?
Saat Anda menekan tombol **Tukar Long-Lived & Ambil Page/IG**, backend lokal CPGP menjalankan urutan resmi Meta Graph API berikut secara berurutan:

1. **Menukar User Token Short-Lived menjadi Long-Lived (~60 hari):**
   ```http
   GET https://graph.facebook.com/v25.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={APP_ID}
     &client_secret={APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
2. **Mengambil `PAGE_ID` dan `PAGE_ACCESS_TOKEN` Permanen menggunakan token Long-Lived tersebut:**
   ```http
   GET https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}
   ```
   Page Token yang dihasilkan dari User Token Long-Lived bersifat jauh lebih awet (umumnya *Never Expires* selama akses Admin dan izin aplikasi tidak dicabut).
3. **Menyimpan `PAGE_ID`, `IG_USER_ID`, dan `PAGE_ACCESS_TOKEN` secara lokal** di penyimpanan backend CPGP, lalu mengaktifkan kesiapan **FB: Siap** dan **IG: Siap**.

*(Jika Anda sudah memiliki token Long-Lived atau System User Token permanen dari Business Portfolio, Anda cukup menempel token tersebut dan menekan tombol **Deteksi Saja**.)*

---

## Langkah 7: Tes Koneksi 1x Dulu Sebelum Auto-Post

Sebelum memicu Auto-Post ke konten produksi Anda, selalu lakukan pemeriksaan koneksi terlebih dahulu:

1. Pada halaman **Auto-Post > Meta API** (`/auto-post/meta`), buka kartu **Status Koneksi**.
2. Aktifkan sakelar **Aktifkan Meta API**.
3. Klik tombol **Tes Koneksi FB & IG**.
4. Periksa panel diagnostik yang muncul:
   - **Facebook Page**: harus berstatus `OK` dengan nama Page dan `PAGE_ID` yang sesuai.
   - **Instagram Business**: harus berstatus `OK` dengan `@username` dan jumlah post akun Anda.
   - **Izin & Token**: pastikan masa berlaku menampilkan `Expires: Never` (atau tanggal kedaluwarsa Long-Lived) dan tidak ada daftar izin yang kurang (`Kurang izin IG` / `Kurang izin FB`).

### Alur Publish Reels di Balik Layar CPGP
Setelah koneksi dinyatakan siap dan Anda menjalankan Auto-Post dari dasbor `/auto-post`, CPGP mengeksekusi protokol unggah resmi Meta:
- **Instagram Reels**: Membuat media container (`POST /{IG_USER_ID}/media` dengan `media_type=REELS` dan upload video biner/URL), memantau `GET /{CONTAINER_ID}?fields=status_code` hingga `FINISHED`, lalu mempublikasikan dengan `POST /{IG_USER_ID}/media_publish`.
- **Facebook Page Reels**: Memulai sesi unggah (`POST /{PAGE_ID}/video_reels?upload_phase=start`), mengunggah berkas lokal langsung ke `rupload.facebook.com`, lalu menyelesaikan publikasi (`upload_phase=finish`).

---

## Langkah 8: Mode Development vs Mode Publik (App Review)

- **Pemakaian Pribadi / Tim Internal (Mode Development)**:
  Jika Meta App hanya digunakan untuk mengunggah konten ke Facebook Page dan akun Instagram milik Anda sendiri, Anda **cukup membiarkan App di mode Development** dengan akun Anda terdaftar sebagai **Admin** atau **Tester** di dashboard App. Tidak perlu melewati App Review.
- **Pemakaian Publik / Pengguna Lain (Mode Live)**:
  Jika suatu saat aplikasi akan dibuka untuk pengguna publik di luar tim Anda, App wajib melewati **Meta App Review** karena izin `instagram_content_publish`, `pages_manage_posts`, dan `publish_video` termasuk izin sensitif. Meta akan meminta video demo (screencast) yang menunjukkan cara aplikasi menggunakan masing-masing izin tersebut.

---

## Ringkasan Kredensial & Permission yang Harus Dipegang

| Komponen | Keterangan / Nilai |
| :--- | :--- |
| **App ID** | ID numerik Meta App dari `App Settings > Basic` (misal `123456789012345`) |
| **App Secret** | Kunci rahasia Meta App, hanya disimpan di backend lokal CPGP |
| **Valid OAuth Redirect URI** | `http://localhost:5173/api/autopost/meta/callback` |
| **PAGE_ID** | ID Facebook Page hasil deteksi `/me/accounts` |
| **IG_USER_ID** | ID akun Instagram Business dari `instagram_business_account` |
| **PAGE_ACCESS_TOKEN** | Token Page hasil tukar Long-Lived (disimpan aman di backend lokal) |
| **Permission Instagram** | `instagram_basic`, `instagram_content_publish` |
| **Permission Facebook Page** | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `publish_video` |

---

## Troubleshooting Umum

### 1. Akun Instagram Tidak Muncul atau `IG: Belum`
- **Penyebab**: Akun Instagram masih bertipe **Personal**, atau belum tertaut ke Facebook Page.
- **Solusi**: Ubah Instagram ke tipe **Business** atau **Creator**, tautkan ke Facebook Page dari pengaturan Instagram maupun Facebook Page, lalu klik ulang **Tukar Long-Lived & Ambil Page/IG** atau **Deteksi Saja**.

### 2. Daftar Facebook Page Kosong Saat Deteksi
- **Penyebab**: Saat login di Graph API Explorer / OAuth, Page belum dicentang pada dialog izin Meta, atau akun Facebook bukan Admin di Page tersebut.
- **Solusi**: Pastikan Anda adalah Admin (Full Control) di Page tersebut, lalu generate ulang token dan pastikan kotak centang Page dipilih pada jendela otorisasi Meta.

### 3. Error Token Kedaluwarsa (`Error validating access token` / Session Expired)
- **Penyebab**: Token yang dipakai masih berupa **short-lived token** (umur 1-2 jam) langsung dari Graph API Explorer tanpa ditukar.
- **Solusi**: Masukkan **App ID** dan **App Secret**, tempel token baru dari Explorer, lalu klik tombol **Tukar Long-Lived & Ambil Page/IG** (bukan *Deteksi Saja*). Pastikan lencana token berubah menjadi **Permanen** atau **Long-Lived**.

### 4. Diagnostik Menampilkan `Kurang izin IG` atau `Kurang izin FB`
- **Penyebab**: Salah satu dari 7 permission belum dicentang saat membuat token di Graph API Explorer.
- **Solusi**: Klik tombol **Salin daftar permission** pada bagian Panduan di halaman `/auto-post/meta`, buka kembali Graph API Explorer, pastikan seluruh 7 permission dicentang, generate token baru, lalu klik **Tukar Long-Lived & Ambil Page/IG**.

### 5. Error Redirect URI Ditolak Saat Klik `Login OAuth Meta`
- **Penyebab**: URL `http://localhost:5173/api/autopost/meta/callback` belum ditambahkan ke **Valid OAuth Redirect URIs** pada pengaturan produk Facebook Login di Meta Developer.
- **Solusi**: Salin alamat persis dari kolom **Valid OAuth Redirect URI** di CPGP, tempel di dashboard Meta App (**Facebook Login > Settings > Valid OAuth Redirect URIs**), klik **Save Changes**, lalu coba login ulang.
