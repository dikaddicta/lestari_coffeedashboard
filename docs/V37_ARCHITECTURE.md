# v37 Architecture — Clean URLs & Modular Scripts

## Routing

`assets/core/navigation.js` membaca route dari pathname, bukan dari hash. Base URL ditentukan melalui elemen `<base>` agar struktur yang sama bekerja pada root lokal maupun GitHub project pages.

Contoh:

```text
/rekomendasi-seduh/
/pustaka-data/
/akun-role/
```

Setiap clean route memiliki static `index.html`, sehingga refresh dan direct access tidak membutuhkan rewrite server. Hash route lama tetap dimigrasikan untuk menjaga link lama tetap berfungsi.

## Build output

`npm run build` menggabungkan:

```text
src/shell.html
src/routes.json
src/pages/*.html
```

menjadi:

```text
index.html
404.html
<route>/index.html
assets/core/routes.js
```

Root document memakai `<base href="./">`. Entry point route memakai `<base href="../">` agar seluruh asset tetap menunjuk ke root repository.

## Page modules

`assets/core/page-modules.js` menyediakan registry berikut:

```text
register(definition)
activate(tab, context)
has(tab)
list()
```

Setiap file pada `assets/pages/` mendaftarkan tab dan daftar renderer yang dibutuhkan. `assets/app.js` menyediakan renderer map dan menjalankan hanya modul halaman aktif.

## Current boundary

Refactor v37 memisahkan navigation, lifecycle, dan orchestration halaman. Business logic utama—Supabase, recommendation engine, stok, QA, laporan, dan pustaka—masih berada dalam `assets/app.js`. Pemisahan service tersebut adalah tahap berikutnya agar risiko regresi tetap terkendali.
