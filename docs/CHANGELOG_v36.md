# Changelog v36.0.0 — Modular Pages Architecture

## Arsitektur halaman

- Memisahkan 14 menu dashboard menjadi 14 fragment pada `src/pages`.
- Menambahkan `src/shell.html` sebagai kerangka aplikasi global.
- Menambahkan `src/routes.json` sebagai single source of truth untuk route, metadata, akses, dan urutan halaman.
- Menambahkan build generator `scripts/build-pages.mjs`.
- `index.html` sekarang merupakan hasil build, bukan lokasi utama untuk mengedit isi setiap menu.

## Routing dan runtime

- Menambahkan `assets/core/routes.js` yang dihasilkan otomatis dari manifest.
- Menghapus duplikasi route dan metadata halaman dari `assets/app.js`.
- Menambahkan event `coffee:pagechange` untuk integrasi modul berikutnya.
- Judul tab browser sekarang mengikuti halaman aktif.
- Breadcrumb diseragamkan menjadi `Workspace Kopi / Nama Halaman`.

## Design system

- Menambahkan fondasi CSS modular:
  - `assets/css/tokens.css`
  - `assets/css/base.css`
  - `assets/css/layout.css`
  - `assets/css/components.css`
  - `assets/css/pages.css`
- Stylesheet v35 tetap dipertahankan sebagai compatibility layer agar visual dan fungsi tidak berubah mendadak.

## Quality gate

- Menambahkan `scripts/modular-pages-audit.mjs`.
- `npm run check` sekarang menjalankan build, audit struktur modular, dan functional audit.
- Service worker diperbarui untuk route registry dan CSS modular.
- Cache PWA diperbarui menjadi `coffee-brew-os-v36-modular-pages`.
