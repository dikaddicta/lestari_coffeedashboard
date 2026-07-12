# Audit Menyeluruh Coffee Brew OS — v34 Stabilization

Tanggal audit: 12 Juli 2026

## Ruang lingkup

Audit mencakup struktur project, landing page, seluruh panel menu, konsistensi bahasa, font, warna dan kontras, layout desktop/mobile, aksesibilitas kontrol, integritas data pustaka, syntax JavaScript, konfigurasi PWA, dan workflow Git.

## Temuan utama dan perbaikan

### 1. Git dan line ending

- Branch `main` pada arsip sama dengan `origin/main`; masalah bukan karena remote lebih baru.
- Banyak file terdeteksi berubah hanya karena `CRLF` versus `LF`.
- Project belum memiliki `.gitattributes`, sementara SOP lama selalu menggunakan `pull --rebase`.
- Ditambahkan `.gitattributes`, `.editorconfig`, setup PowerShell, dan update aman berbasis `fetch` + `merge --ff-only`.

### 2. Struktur UI dan stylesheet

- Aplikasi tetap berupa static single-page app dengan 14 panel berbasis hash route.
- Dokumentasi lama menyebut stylesheet modular v33, tetapi halaman aktif hanya memuat `assets/styles.css`. Folder CSS modular dan salinan gambar v33 yang tidak digunakan telah dikeluarkan dari build produksi agar tidak membingungkan dan mengurangi duplikasi.
- Stylesheet lama sangat besar dan memiliki banyak override. Agar risiko regresi rendah, perbaikan dilakukan melalui `assets/styles-v34-stabilization.css` yang dimuat paling akhir.
- Font `Inter` sebelumnya dideklarasikan tetapi tidak dimuat. v34 memakai system font stack yang konsisten dan tetap aman untuk mode PWA/offline.

### 3. Kontras, layout, dan aksesibilitas

- Kontras field, placeholder, lock pill, dan teks sekunder diperkuat.
- Ditambahkan focus-visible untuk navigasi keyboard.
- Lima belas kontrol filter yang sebelumnya tidak memiliki label aksesibel kini memakai `aria-label`.
- Tabel, action group, welcome card, dan mascot diperbaiki untuk layar kecil.
- Wrapper judul ganda pada halaman Notifikasi diperbaiki.

### 4. Bahasa dan istilah

Menu utama dinormalisasi ke Bahasa Indonesia:

- Beans → Biji Kopi
- Stock → Stok
- Brew Log & QA → Log Seduh & QA
- Data Analytics → Analitik Data
- Notification → Notifikasi
- Export / Report → Ekspor & Laporan
- Akun & Role → Akun & Peran
- Dose → Dosis
- Total Water → Total Air
- Brew Time → Waktu Seduh
- Pour Pattern → Pola Tuang
- Pasca Panen → Pascapanen

Istilah teknis kopi seperti QA, grinder, dripper, roast profile, dan workspace tetap dipakai bila lebih mudah dikenali, tetapi kalimat penjelas dibuat lebih natural.

### 5. Integritas dan pembaruan data

Kondisi setelah perbaikan:

- 180 record varietas/alias/input mixed lot
- 81 proses pascapanen
- 18 profil sangrai
- 74 dripper/setup
- 2 filter kertas
- 15 profil air
- 16 grinder

Perubahan data:

- `SOLO HIFLUX Filter 165` dipindahkan dari dataset dripper ke dataset filter.
- Ditambahkan `SOLO SPIN` dari sumber resmi Mazelab.
- Ditambahkan `SOLO WAVE HIFLUX 165` dan `SOLO WAVE DAILY 155` sebagai filter/accessory.
- `SOLO Dripper 155` diperjelas menjadi `SOLO Dripper — 155 Setup`, bukan diklaim sebagai model resmi terpisah.
- Ditambahkan `Timemore Chestnut C3S` dari sumber resmi Timemore.
- Typo `Anaerobic Natural Inokolum` diperbaiki menjadi `Anaerobic Natural Inokulum`; alias lama dipertahankan untuk kompatibilitas data.
- `Mix Varietas` diberi penjelasan sebagai opsi input/mixed lot, bukan kultivar tunggal.
- Sumber USDA diarahkan ke halaman Coffee Plants of the World milik SCA.

Sumber utama:

- https://mazelabcoffee.com/products/solo-spin
- https://mazelabcoffee.com/products/solo-hiflux-wave
- https://mazelabcoffee.com/products/wave-filter-paper
- https://www.timemore.com/products/c3-series
- https://sca.coffee/research/coffee-plants-of-the-world
- https://varieties.worldcoffeeresearch.org/

### 6. Bug Pustaka Data

- Metrik proses sebelumnya membaca field `AgitationCue`, padahal data memakai `BrewingCue`.
- Metrik dripper sebelumnya membaca `BypassRisk_1low_5high`, padahal data memakai `Bypass`.
- Nilai perubahan suhu `0°C` sebelumnya tersembunyi karena pemeriksaan truthy.
- Dataset filter kini tersedia pada Pustaka, Ekspor/Laporan, pemeriksaan kualitas, dan status total data.

### 7. Batasan audit

- Syntax JavaScript dan struktur statis dapat diuji lokal.
- Koneksi, RLS, autentikasi, dan write operation Supabase tidak dapat divalidasi end-to-end tanpa akses ke project Supabase aktif dan akun uji.
- Screenshot browser otomatis tidak digunakan sebagai dasar klaim visual; audit layout dilakukan melalui struktur HTML/CSS, aturan responsive, dan konsistensi komponen.
- Pemisahan setiap menu menjadi file/page tersendiri belum dilakukan pada v34 karena merupakan perubahan arsitektur yang lebih aman dikerjakan setelah baseline stabil ini disetujui.

## Catatan teknis untuk fase re-create berikutnya

Stylesheet aktif lama masih memiliki sekitar 15.442 baris dan 1.271 deklarasi `!important`. Kondisi ini menjelaskan mengapa perubahan kecil pada warna atau layout mudah tertimpa oleh rule lain. v34 sengaja tidak memecah file tersebut agar stabilitas fungsi tetap terjaga.

Fase berikutnya sebaiknya dilakukan sebagai refactor terkontrol:

1. Bekukan v34 sebagai baseline dan tambahkan smoke test per modul.
2. Pisahkan shell, komponen, dan halaman ke file CSS/JS modular yang benar-benar aktif.
3. Ubah routing hash menjadi struktur halaman atau router modular tanpa menggandakan state/auth.
4. Susun design system komersial: token warna, tipografi, spacing, elevasi, state komponen, dan accessibility.
5. Migrasikan menu satu per satu: Beranda → Rekomendasi → Input → Publik → Stok/Biji → QA → Analitik → Notifikasi → Laporan → Admin → Pustaka.
6. Validasi desktop, tablet, dan mobile sebelum menghapus stylesheet monolitik lama.
