# Changelog v42.2.0

## Browser Title Hotfix

- Memastikan tab browser pada landing page root selalu menampilkan `Coffee Brew OS — Dashboard Seduh Kopi`.
- Judul halaman `Cara Pakai — Coffee Brew OS` hanya digunakan setelah pengguna benar-benar masuk ke menu Cara Pakai.
- Sinkronisasi `document.title` dan `data-page` kini mengikuti visibilitas welcome screen, termasuk setelah inisialisasi Supabase dan render ulang.
- Cache PWA dinaikkan ke `coffee-brew-os-v42-2-browser-title`.
