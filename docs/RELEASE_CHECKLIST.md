# Release Checklist

## Sebelum commit

```powershell
npm run check
git diff --check
git status
```

Lakukan review manual pada menu:

- Beranda
- Rekomendasi Seduh
- Input Seduhan
- Hasil Seduhan Publik
- Biji Kopi
- Stok
- Log Seduh & QA
- Analitik Data
- Notifikasi
- Ekspor & Laporan
- Akun & Peran
- Saran
- Pustaka Data
- Cara Pakai

## Sebelum push

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pre-push-check.ps1
git add -A
git commit -m "Release v35.1 functional stabilization"
git push origin main
```

## Setelah GitHub Pages deploy

1. Pastikan GitHub Actions `Dashboard Quality Check` berwarna hijau.
2. Buka website dengan jendela Incognito.
3. Periksa label versi `v35.1.0 · Functional Stabilization`.
4. Uji setidaknya Beranda, Input Seduhan, Pustaka Data, dan Akun & Peran.
5. Jika browser masih memuat versi lama, unregister service worker lalu clear site data sekali.
