# v38 Architecture — Services & Welcome Refinement

## Tujuan

v38 mengurangi dua jenis risiko yang terlihat setelah v37:

1. welcome screen masih memiliki hierarchy dan copy yang kurang natural;
2. `assets/app.js` masih menangani akses infrastruktur secara langsung.

## Service layer

```text
assets/services/
├─ storage-service.js
└─ supabase-service.js
```

### Storage service

Menyediakan API aman untuk:

- local storage;
- session storage;
- JSON serialization;
- scoped key;
- storage adapter untuk Supabase Auth.

`assets/app.js` menggunakan service ini terlebih dahulu, lalu menggunakan runtime storage sebagai fallback untuk kompatibilitas.

### Supabase service

Menangani:

- validasi Project URL;
- pembacaan anon key;
- pemeriksaan kelengkapan konfigurasi;
- pembuatan Supabase browser client.

Business logic seperti auth flow, workspace, stok, brew log, QA, moderasi, dan laporan masih berada di `assets/app.js`. Pemisahan berikutnya dilakukan per domain agar tidak menimbulkan regresi besar dalam satu release.

## Welcome screen

Markup berada di:

```text
src/shell.html
```

Style berada sepenuhnya di:

```text
assets/css/welcome.css
```

Welcome screen tidak lagi memiliki style di `assets/styles-v35-quiet-luxury.css`. Pemisahan kepemilikan ini mencegah override responsive lama mengubah layout pembuka.

## Urutan script

```text
app-config
routes
navigation
runtime
storage service
page modules
page scripts
Supabase CDN
Supabase config
Supabase service
data
application
```

Urutan tersebut diverifikasi melalui functional audit dan service-layer audit.
