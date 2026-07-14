# Database Backup & Recovery Runbook

## Tujuan

Menjaga salinan database Supabase di luar project aktif dan memastikan proses pemulihan pernah diuji.

## Sebelum perubahan besar

- Catat waktu backup, environment, project reference, dan operator.
- Gunakan halaman Database > Backups pada Supabase apabila plan mendukung backup terkelola.
- Untuk logical backup mandiri, gunakan proses `supabase db dump` sesuai dokumentasi Supabase yang berlaku.
- Simpan backup terenkripsi di lokasi off-site dengan akses terbatas.
- Jangan memasukkan password database, service-role key, atau connection string ke repository.

## Verifikasi backup

- Pastikan file tidak kosong dan checksum tersimpan terpisah.
- Pulihkan ke project atau environment uji, bukan langsung menimpa produksi.
- Verifikasi tabel workspace, membership, stock, brew log, QA, audit events, dan policy RLS.
- Catat durasi pemulihan dan gap data agar RPO/RTO dapat dievaluasi.

## Jadwal minimum release candidate

- Backup sebelum migration atau release besar.
- Backup setelah migration dinyatakan berhasil.
- Uji restore berkala pada environment terpisah.

Backup lokal dari menu Ekspor & Laporan hanya mencakup data browser dan tidak menggantikan backup database Supabase.
