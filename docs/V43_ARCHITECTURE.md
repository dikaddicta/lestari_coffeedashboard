# Arsitektur v43 — Commercial Readiness

## Public information layer

```text
src/public-shell.html
src/public-pages.json
src/public/*.html
scripts/build-public-pages.mjs
```

Build menghasilkan:

```text
privasi/index.html
ketentuan/index.html
disclaimer/index.html
status/index.html
maintenance/index.html
404.html
robots.txt
sitemap.xml
```

## Operational services

### `assets/services/backup-service.js`

- format: `coffee-brew-os-backup`;
- schema version: 1;
- normalisasi dataset lokal;
- checksum SHA-256 melalui Web Crypto;
- dukungan membaca backup lama;
- validasi sebelum restore.

### `assets/services/error-service.js`

- maksimum 25 catatan;
- redaksi bearer token, password, API key, secret, dan token panjang;
- capture runtime error dan unhandled rejection;
- ekspor snapshot diagnostik.

### `assets/core/maintenance.js`

- membaca `COFFEE_APP_CONFIG.maintenance`;
- mengarahkan halaman aplikasi ke `/maintenance/` bila aktif;
- halaman status dan kebijakan tetap tersedia.

## Build pipeline

```text
npm run build
  └─ scripts/build-all.mjs
      ├─ scripts/build-pages.mjs
      └─ scripts/build-public-pages.mjs
```

## Keamanan data

Backup dan diagnostik hanya menyentuh penyimpanan lokal. Data cloud tetap dilindungi oleh Supabase Auth dan RLS v42. Tidak ada service-role key yang ditambahkan ke frontend.
