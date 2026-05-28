# Premium Patch v25 — Mobile Experience & Responsive QA

Patch ini fokus pada pengalaman mobile sebelum dashboard diarahkan ke hosting/custom domain.

## Perubahan utama

- Menambahkan **mobile menu switcher** berbentuk dropdown agar navigasi di HP tidak terlalu penuh.
- Desktop tab tetap ada, tetapi tab grid disembunyikan di layar kecil.
- Dropdown mobile tersinkron dengan tab aktif.
- Mencegah horizontal overflow pada body tanpa menghilangkan scroll tabel.
- Memperbaiki ukuran hero, logo, heading, badge, dan panel di layar kecil.
- Membuat form dan tombol lebih nyaman untuk touch device dengan minimum height 48px.
- Merapikan menu **Input Seduhan** di mobile, termasuk adaptive pour cards dan field QA.
- Membuat tabel mobile lebih aman dengan scroll area khusus dan hint `Geser tabel →`.
- Memperbaiki modal detail public brew agar lebih nyaman di layar kecil.
- Menjaga `assets/supabase-config.js` tetap tidak ikut patch.

## Validasi

- `assets/app.js` lolos syntax check.
- Patch ini tidak mengubah schema Supabase.
