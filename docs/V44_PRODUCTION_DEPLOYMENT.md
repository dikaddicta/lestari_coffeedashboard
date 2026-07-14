# v44 Production Deployment Guide

## Status build

v44.0.0-rc.1 adalah release candidate. Build ini belum boleh dinyatakan general availability sebelum pengujian end-to-end, RLS, backup, email, dan domain selesai.

## Urutan deployment

1. Jalankan `npm run check` dan pastikan seluruh audit lulus.
2. Backup database Supabase dan simpan salinan di lokasi terpisah.
3. Pastikan `migration_v42_security_audit_rls.sql` sudah diterapkan dan diuji.
4. Push build ke branch staging atau repository uji terlebih dahulu.
5. Uji role Admin, QA, Brewer, Guest, dan akun tanpa membership.
6. Verifikasi login, signup, reset password, CRUD stok, brew log, QA, laporan, backup lokal, restore lokal, dan logout.
7. Setelah staging lolos, deploy ke branch produksi dan pantau halaman `/status/`.

## Domain produksi

`src/site.json` adalah sumber konfigurasi URL. Ganti `siteUrl` hanya setelah domain final siap. Setelah itu jalankan ulang `npm run build` agar canonical URL, sitemap, security.txt, manifest, social preview reference, dan clean route ikut diperbarui.

Untuk GitHub Pages, tambahkan custom domain melalui Settings > Pages, verifikasi DNS, lalu aktifkan HTTPS. Jangan membuat file `CNAME` sebelum nama domain final diputuskan.

## Monitoring

Monitoring cloud default-nya nonaktif. Untuk mengaktifkan:

- isi `monitoring.endpoint` di `src/site.json`;
- set `monitoring.enabled` menjadi `true`;
- pastikan endpoint hanya menerima payload error yang sudah disanitasi;
- perbarui Kebijakan Privasi sebelum aktivasi;
- uji CORS, rate limit, retensi, dan penghapusan data.

## Rollback

Simpan ZIP release sebelumnya dan tag Git. Jika ada regresi kritis, kembalikan commit terakhir yang stabil, deploy ulang, kemudian periksa service worker agar cache lama terhapus.
