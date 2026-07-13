# Changelog v38.0.0

## Welcome screen

- Mengganti judul `Ruang kerja seduh yang lebih terukur` menjadi `Seduh lebih rapi. Hasil lebih konsisten.`
- Menyederhanakan copy agar lebih natural dan tidak terasa seperti hasil terjemahan.
- Menata ulang layout menjadi area utama dan panel panduan yang seimbang.
- Menghilangkan pengulangan antara bagian `Pengguna baru` dan `Akun Baru`.
- Mengubah pilihan akses menjadi:
  - Masuk ke Dashboard
  - Buat Akun
  - Jelajahi sebagai Tamu
  - Lihat Data Demo
- Menambahkan ringkasan kemampuan utama dan penjelasan tiga jalur akses.
- Memindahkan seluruh style welcome screen ke `assets/css/welcome.css` agar tidak lagi bertabrakan dengan stylesheet visual lama.

## Service layer

- Menambahkan `assets/services/storage-service.js`.
- Menambahkan `assets/services/supabase-service.js`.
- `assets/app.js` sekarang menggunakan service storage dengan runtime fallback.
- Pembuatan Supabase client dan validasi Project URL didelegasikan ke Supabase service.
- Menambahkan `scripts/service-layer-audit.mjs`.

## Build dan PWA

- Versi aplikasi dinaikkan menjadi `38.0.0`.
- Cache PWA menjadi `coffee-brew-os-v38-services-welcome`.
- Service worker mem-precache welcome stylesheet dan kedua service module.
- Release check mencakup service-layer audit.
