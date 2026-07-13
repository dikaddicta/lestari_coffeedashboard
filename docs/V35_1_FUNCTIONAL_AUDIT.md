# Functional Audit v35.1

## Ringkasan

Audit otomatis terakhir menghasilkan **48 pemeriksaan lulus dan 0 gagal**. Hasil mesin tersedia pada `docs/V35_1_AUDIT_RESULT.json`.

## Cakupan pemeriksaan

- Syntax JavaScript untuk config, runtime, data, app, dan service worker.
- Keunikan HTML ID.
- Kesesuaian 14 route menu dengan 14 panel.
- Seluruh tombol memiliki type eksplisit.
- Seluruh asset lokal yang dirujuk tersedia.
- Urutan pemuatan script aman.
- Aplikasi utama tidak mengakses `localStorage` secara langsung.
- Debug tool dan mascot dinonaktifkan untuk produksi.
- Supabase browser key menggunakan role `anon`, bukan `service_role`.
- Seluruh core asset service worker tersedia.
- Asset failure tidak lagi mengembalikan dokumen HTML.
- Integritas jumlah dan keunikan dataset kopi.

## Perbaikan risiko utama

### 1. Cache campuran HTML/CSS/JS

Service worker lama dapat mengembalikan `index.html` ketika file asset gagal dimuat. Kondisi tersebut berpotensi menyebabkan tampilan kosong, MIME mismatch, atau gabungan HTML lama dan stylesheet baru. v35.1 membatasi fallback HTML hanya untuk navigasi halaman.

### 2. Penyimpanan browser dapat menghentikan aplikasi

Beberapa browser dapat menolak `localStorage` karena private mode, policy, atau quota penuh. Akses kini menggunakan adapter defensif dan memberi pesan jika data gagal disimpan.

### 3. Regression tidak terdeteksi sebelum push

Audit sekarang dapat dijalankan lokal dan otomatis di GitHub Actions. Deployment tidak seharusnya diteruskan jika `npm run check` gagal.

## Pengujian manual yang tetap diperlukan

Audit statis tidak menggantikan pengujian langsung dengan session Supabase. Sebelum menandai release sebagai production-ready, uji:

1. Daftar dan login akun.
2. Request serta approval role/workspace.
3. Tambah, edit, dan hapus stok.
4. Simpan rekomendasi menjadi draft.
5. Simpan Input Seduhan dan QA.
6. Moderasi hasil publik.
7. Pengurangan serta pemulihan stok.
8. Analitik dan ekspor.
9. Offline/online transition.
10. Mobile Safari dan Chrome Android.
