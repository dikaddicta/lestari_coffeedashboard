# Changelog v43.0.0 — Commercial Readiness

Tanggal: 14 Juli 2026

## Ditambahkan

- Kebijakan Privasi, Ketentuan Penggunaan, Batasan Rekomendasi, Status Sistem, dan halaman Pemeliharaan.
- Persetujuan kebijakan pada form pendaftaran.
- Backup lokal terstruktur dengan schema version dan checksum SHA-256.
- Pratinjau dan validasi backup sebelum pemulihan.
- Error service dengan sanitasi dan batas 25 catatan lokal.
- Ekspor file diagnostik.
- Maintenance mode melalui app config.
- Canonical URL, route-specific title/description, robots.txt, sitemap.xml, dan security.txt.
- Custom 404 page.
- Audit `npm run audit:commercial`.

## Diubah

- Build sekarang menghasilkan dashboard dan halaman publik melalui `scripts/build-all.mjs`.
- Service worker memakai cache `coffee-brew-os-v43-commercial-readiness`.
- Menu Ekspor & Laporan memiliki pusat backup dan pemulihan.
- Menu Akses & Keamanan memiliki status aplikasi dan diagnostik.
- Form daftar menyimpan versi serta waktu persetujuan kebijakan pada metadata signup.

## Tidak berubah

- Tidak ada migration Supabase baru.
- Dataset kopi tetap 180 varietas, 81 proses, 74 dripper/setup, 2 filter, 18 profil sangrai, 15 profil air, dan 16 grinder.
