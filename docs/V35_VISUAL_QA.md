# V35 Visual QA

## Pemeriksaan otomatis

- HTML ID unik: 378.
- Route/tab: 14 route memiliki panel yang sesuai.
- Local assets: seluruh referensi yang aktif tersedia.
- JavaScript syntax: lulus untuk `app.js`, `data.js`, `supabase-config.js`, dan `sw.js`.
- CSS parse: lulus untuk `styles.css` dan `styles-v35-quiet-luxury.css`.
- Contrast audit: 0 pelanggaran pada 14 menu dalam pemeriksaan statis.
- Responsive overflow: 0 kegagalan pada 390 px, 768 px, dan 1440 px.
- Runtime offline mode: inisialisasi aplikasi berhasil tanpa page error; seluruh menu guest dapat dinavigasi.

## Data yang tervalidasi

- Varietas: 180.
- Dripper/setup: 74.
- Filter kertas: 2.
- Proses pascapanen: 81.
- Profil sangrai: 18.
- Profil air: 15.
- Grinder: 16.

## Catatan

Pengujian Supabase end-to-end tetap memerlukan koneksi ke project Supabase dan akun dengan role/workspace yang sesuai. Pemeriksaan visual v35 tidak mengubah schema database, RLS, atau migration.
