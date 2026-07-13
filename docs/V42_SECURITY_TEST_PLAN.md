# V42 Security Test Plan

Jalankan setelah migration v42 diterapkan pada project Supabase pengujian.

## Akun dan sesi

- Login dengan akun valid.
- Pastikan status sesi menunjukkan Supabase terhubung.
- Klik **Perbarui Sesi** dan pastikan event muncul di Riwayat Aktivitas.
- Logout dan pastikan session token lokal dibersihkan.
- Uji password pendaftaran kurang dari 8 karakter dan tanpa angka.

## Workspace

- Buat workspace publik dan pastikan muncul pada daftar pendaftaran akun lain.
- Ubah workspace menjadi privat dan pastikan tidak terlihat oleh non-anggota.
- Pastikan anggota aktif tetap dapat membuka workspace privat.
- Coba membuat workspace dengan `created_by` berbeda melalui REST client; request harus ditolak RLS.

## Peran dan anggota

- Brewer tidak dapat membuka panel admin atau membaca audit workspace.
- QA dapat melakukan moderasi tetapi tidak mengelola anggota.
- Admin dapat mengubah Brewer menjadi QA atau Admin.
- Coba menurunkan, menangguhkan, dan menghapus admin aktif terakhir; database harus menolak.
- Tambahkan admin kedua, lalu pastikan admin pertama dapat diubah setelah konfirmasi.

## Audit trail

- Tambah/ubah stok dan simpan seduhan/QA.
- Setujui dan tolak data moderasi.
- Setujui, tolak, tangguhkan, ubah peran, dan lepas anggota.
- Pastikan event muncul dengan workspace, actor, action, outcome, dan timestamp yang sesuai.
- Coba update atau delete `audit_events` menggunakan anon/authenticated client; request harus ditolak.
- Pastikan metadata tidak menyimpan password, token, API key, atau session payload.

## Saran publik

- Guest dapat mengirim pesan valid ke Public Brew Community.
- Guest tidak dapat memasukkan `created_by` atau workspace privat.
- Pesan kosong atau lebih dari 4.000 karakter harus ditolak.
- Authenticated member dapat mengirim saran ke workspace aktifnya.

## Regression

- Beans, stok, rekomendasi, Input Seduhan, Brew Log, QA, analitik, laporan, dan pustaka tetap dapat digunakan sesuai role.
- Jalankan `npm run check` dan pastikan seluruh audit lulus.
