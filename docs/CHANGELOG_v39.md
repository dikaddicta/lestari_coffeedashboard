# Changelog v39.0.0 — Core Workflow Modules

Tanggal: 13 Juli 2026

## Ditambahkan

- `assets/core/app-state.js` untuk state store terpusat.
- `assets/core/event-bus.js` untuk lifecycle event fitur.
- `assets/core/validation.js` untuk validasi dan sanitasi input.
- Service auth, stok, seduhan, QA, dan notifikasi.
- Validasi langsung pada Input Seduhan.
- Arahan otomatis pada panel QA.
- Estimasi cangkir dan status ketersediaan pada tabel stok.
- `assets/css/workflow.css`.
- `scripts/workflow-modules-audit.mjs`.

## Diubah

- Login, daftar, logout, perhitungan QA, validasi stok, validasi seduhan, pengurangan stok, dan ringkasan notifikasi mulai didelegasikan ke service.
- State cloud direset sebagai data transient agar cache lokal lama tidak dianggap sebagai data cloud terbaru.
- Service worker menggunakan cache `coffee-brew-os-v39-core-workflow`.
- Bahasa campuran pada halaman Stok dirapikan.

## Tidak berubah

- Schema Supabase dan kebijakan RLS.
- Jumlah dataset referensi.
- Struktur 14 clean route.
- Threshold publikasi QA 6.5.
