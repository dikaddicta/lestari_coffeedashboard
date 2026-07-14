# v44 Architecture — Release Metadata & Production Readiness

## Sumber konfigurasi tunggal

`src/site.json` menjadi sumber konfigurasi untuk:

- versi dan nama release;
- build identifier dan waktu release;
- URL deployment;
- identitas produk dan brand;
- theme color, icon, dan social image;
- maintenance mode;
- monitoring cloud opt-in.

`scripts/build-release.mjs` menghasilkan:

- `assets/app-config.js`;
- `release.json`;
- `manifest.webmanifest`;
- `.well-known/security.txt`.

## Build pipeline

```text
src/site.json
   ↓
build-release.mjs
   ↓
app-config.js + release.json + manifest + security.txt
   ↓
build-pages.mjs + build-public-pages.mjs
   ↓
root + 14 clean routes + 6 public pages
```

HTML dashboard dan halaman publik menerima metadata berikut pada waktu build:

- canonical URL;
- title dan description;
- Open Graph;
- Twitter Card;
- social preview 1200×630;
- cache-busted asset version.

## Release verification

`assets/services/release-service.js` mengambil `release.json` dan membandingkannya dengan runtime config. Halaman `/status/` menampilkan apakah manifest dan runtime sinkron.

## Monitoring

`assets/services/monitoring-service.js` hanya mengirim diagnostic event apabila:

- monitoring diaktifkan;
- endpoint tersedia;
- browser online;
- event lolos sample rate.

Monitoring nonaktif secara default. Payload dibatasi pada metadata error yang telah disanitasi oleh error service. Service ini tidak membaca stok, resep, QA, atau isi workspace.

## Public release page

`/rilis/` menampilkan tahap build, cakupan release candidate, migration yang dipersyaratkan, dan pekerjaan yang belum selesai sebelum general availability.

## Deployment portability

URL dan metadata tidak lagi hard-coded di beberapa build script. Perubahan domain dilakukan melalui `src/site.json`, kemudian seluruh output dibangun ulang.
