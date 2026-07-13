# Coffee Brew OS v35 — Quiet Luxury Visual Rebuild

## Tujuan

Mengubah dashboard dari tampilan yang terasa seperti demo berlapis menjadi produk web yang lebih matang, tenang, konsisten, dan layak dipresentasikan untuk penggunaan profesional maupun komersial.

## Perubahan arsitektur visual

- Menghapus pemuatan `styles-v34-stabilization.css` dan `styles-v34-3-premium-home.css`.
- Menambahkan satu lapisan design system baru: `assets/styles-v35-quiet-luxury.css`.
- Mempertahankan `assets/styles.css` sebagai fondasi layout dan kompatibilitas fitur lama.
- Menata ulang HTML Beranda dengan struktur yang valid dan lebih sederhana.
- Menghapus markup mascot serta onboarding mengambang dari tampilan produksi.
- Menghapus aset ilustrasi mascot dan banner barista yang tidak lagi digunakan.

## Design system

- Canvas: ivory netral.
- Surface: putih dan warm-white.
- Sidebar: espresso gelap.
- Accent: bronze terkontrol.
- Radius: 8–26 px sesuai tingkat komponen.
- Shadow: tipis dan fungsional, tanpa efek hover berlebihan.
- Table header: kontras tinggi dengan bahasa visual yang konsisten.
- Form dan tombol: state hover/focus lebih jelas serta tidak terlalu dekoratif.

## Pembaruan halaman

- Welcome screen: layout editorial dua kolom.
- Beranda: hero fokus, pustaka aktif, akun, quick actions, workflow, dan demo SOLO.
- Cara Pakai: kartu panduan dan role path disederhanakan.
- Rekomendasi Seduh: visual barista diganti visual abstrak dial-in.
- Input, Biji Kopi, Stok, QA, Publik, Analitik, Notifikasi, Laporan, Saran, Admin, dan Pustaka: panel, card, form, table, dan typography dinormalisasi.
- Dark surface hanya dipakai pada command center atau output penting.
- Label teknis dan istilah campuran dikurangi atau diterjemahkan.

## Aksesibilitas dan responsive

- Pemeriksaan `axe-core` untuk rule `color-contrast` pada 14 menu: **0 pelanggaran** setelah perbaikan.
- Pemeriksaan layout pada 390 px, 768 px, dan 1440 px: **0 horizontal overflow**.
- Fokus keyboard diperjelas.
- Preferensi `prefers-reduced-motion` dihormati.
- Tampilan print membersihkan sidebar, topbar, toast, dan elemen navigasi.

## Cache dan deployment

- Service worker cache: `coffee-brew-os-v35-quiet-luxury`.
- Core asset diarahkan ke stylesheet v35.
- Query version pada HTML diperbarui untuk memaksa browser mengambil aset terbaru.
