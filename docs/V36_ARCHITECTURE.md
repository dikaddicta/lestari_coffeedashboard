# Arsitektur v36

## Tujuan

v36 memisahkan sumber setiap menu tanpa langsung mengganti seluruh runtime aplikasi. Pendekatan ini mengurangi risiko kerusakan fungsi Supabase, autentikasi, stok, log seduh, QA, analitik, dan laporan yang sebelumnya bergantung pada seluruh elemen DOM tersedia saat startup.

## Alur build

```text
src/shell.html
       +
src/routes.json
       +
src/pages/*.html
       |
       v
scripts/build-pages.mjs
       |
       +-- index.html
       +-- assets/core/routes.js
```

## Aturan pengembangan

1. Ubah isi menu melalui file di `src/pages`, bukan langsung pada `index.html`.
2. Ubah nama route, judul, subtitle, atau akses melalui `src/routes.json`.
3. Jalankan `npm run build` setelah perubahan source.
4. Jalankan `npm run check` sebelum commit.
5. Tambahkan style baru ke file modular dan scope selector dengan `body[data-page="..."]` bila hanya berlaku pada satu halaman.

## Tahap lanjutan

Fondasi ini disiapkan untuk:

- pemisahan logika JavaScript per modul;
- lifecycle mount/unmount berdasarkan event `coffee:pagechange`;
- clean URL tanpa hash;
- bundler modern ketika aplikasi sudah siap berpindah dari static compatibility mode.
