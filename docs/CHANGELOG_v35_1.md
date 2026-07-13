# Changelog v35.1 — Functional Stabilization

## Fokus release

v35.1 tidak menambah menu baru. Release ini memperkuat fondasi runtime, penyimpanan browser, PWA, validasi project, serta alur release agar v35 dapat dipakai sebagai baseline stabil sebelum migrasi multi-page.

## Perubahan

### Runtime dan penyimpanan

- Menambahkan `assets/app-config.js` sebagai sumber versi dan feature flag.
- Menambahkan `assets/core/runtime.js` untuk safe storage, logger, dan busy-state helper.
- Seluruh akses `localStorage` di aplikasi utama dialihkan ke safe storage adapter.
- Kegagalan penyimpanan browser tidak lagi langsung memutus proses aplikasi.
- Supabase Auth menggunakan adapter penyimpanan yang lebih defensif.
- Debug object hanya tersedia ketika feature flag debug diaktifkan.
- Mascot tetap nonaktif pada mode produksi.

### PWA dan cache

- Cache dinaikkan menjadi `coffee-brew-os-v35-1-functional`.
- Query version pada asset dinormalisasi ketika dicache.
- Asset yang gagal dimuat tidak lagi menerima fallback `index.html`.
- Core asset dicache menggunakan `Promise.allSettled`, sehingga satu file gagal tidak menggagalkan seluruh install.
- Update service worker diperiksa ketika aplikasi dibuka.

### HTML dan aksesibilitas

- Seluruh 124 tombol memiliki `type` eksplisit.
- Tombol navigasi sidebar memakai `type="button"`.
- Status database menggunakan `role="status"` dan `aria-live="polite"`.
- Field akun memperoleh atribut `autocomplete` yang sesuai.
- Dukungan `prefers-reduced-motion` ditambahkan.
- Focus ring dan busy-state tombol dibuat konsisten.

### Audit dan workflow

- Menambahkan `package.json` tanpa dependency eksternal.
- Menambahkan `npm run audit`, `npm run check`, dan `npm run serve`.
- Menambahkan audit 48 pemeriksaan untuk syntax, route, asset, tombol, keamanan key, service worker, dan integritas data.
- Menambahkan GitHub Actions quality check untuk branch `main` dan `development`.
- Menambahkan canonical `supabase/schema.sql` dan dokumentasi setup Supabase yang lebih jelas.
- Dokumentasi versi lama dipindahkan ke `docs/archive/legacy-reports/`.

## Data yang dipertahankan

- 180 varietas
- 81 proses pascapanen
- 74 dripper/setup
- 2 filter kertas
- 18 profil sangrai
- 15 profil air
- 16 grinder
