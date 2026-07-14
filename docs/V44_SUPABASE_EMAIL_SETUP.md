# Supabase Auth Email Setup

Template siap salin tersedia di `docs/email-templates/`:

- `confirmation.html`
- `password-reset.html`
- `magic-link.html`

Untuk hosted Supabase, template autentikasi diatur melalui halaman Email Templates pada dashboard Supabase. Sebelum produksi:

1. Konfigurasikan custom SMTP agar pengiriman tidak bergantung pada batas default.
2. Gunakan alamat pengirim dan domain yang telah diverifikasi.
3. Tempel template sesuai jenis email dan pertahankan variabel `{{ .ConfirmationURL }}`.
4. Uji link redirect pada domain staging dan produksi.
5. Periksa tampilan desktop, mobile, mode gelap, dan klien email utama.
6. Pastikan email tidak memuat data stok, resep, QA, token, atau informasi workspace.

Template di repository adalah baseline visual dan narasi, bukan bukti bahwa SMTP sudah aktif.
