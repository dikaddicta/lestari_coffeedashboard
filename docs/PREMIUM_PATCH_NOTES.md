# Patch v27 — Accurate Metrics & Library Expansion

## Fokus

- Membenahi kartu metrik **Pengguna** agar tidak ambigu dan tidak menampilkan 0 saat data masih dibaca.
- Mengubah label menjadi **Pengguna Tercatat** dengan tooltip sumber data.
- Memperkuat fallback frontend jika RPC Supabase belum tersedia atau belum diperbarui.
- Menambahkan migration Supabase untuk `get_dashboard_user_count()` yang lebih akurat.
- Melengkapi pustaka varietas lokal Indonesia, terutama Gayo/Aceh/Sumatra dan alias pasar.
- Melengkapi pustaka pasca panen eksperimental lokal termasuk `Anaerobic Natural Inoculum`.

## File penting

- `assets/app.js`: metric count logic diperbaiki.
- `assets/data.js`: varietas dan proses diperluas.
- `supabase/migration_v27_accurate_dashboard_user_count.sql`: wajib dijalankan di Supabase lama agar metrik pengguna akurat dari database.
- `supabase/schema.sql`: fungsi count juga diselaraskan untuk setup baru.

## Catatan

Untuk project Supabase lama, jalankan file migration v27 di SQL Editor. Untuk project baru, `schema.sql` sudah berisi versi fungsi terbaru.
