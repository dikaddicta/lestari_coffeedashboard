# Changelog v37.0.0

## Clean URLs

- Menghapus kebutuhan hash route `/#/...` pada navigasi utama.
- Menambahkan History API melalui `assets/core/navigation.js`.
- Membuat 14 static clean-route entry point untuk GitHub Pages.
- Menambahkan `404.html` fallback.
- Menambahkan migrasi otomatis untuk link hash lama.
- Memperbarui PWA start URL dan shortcuts agar memakai clean URL.

## Modular Scripts

- Menambahkan registry lifecycle halaman melalui `assets/core/page-modules.js`.
- Menambahkan satu module orchestration untuk setiap menu di `assets/pages/`.
- Mengubah `renderAll()` agar hanya merender halaman aktif dan komponen global yang diperlukan.
- Menjalankan renderer halaman saat navigasi berubah.
- Menambahkan penanda `data-active-module` pada document element untuk debugging visual yang aman.

## Build dan PWA

- Build menghasilkan root index, 404 fallback, dan 14 route directory.
- Service worker mem-cache clean route serta seluruh page module.
- Cache diperbarui menjadi `coffee-brew-os-v37-clean-urls-modules`.

## Quality checks

- Menambahkan `clean-url-audit.mjs`.
- Menambahkan `page-modules-audit.mjs`.
- Memperluas functional audit untuk navigation dan seluruh page module.
