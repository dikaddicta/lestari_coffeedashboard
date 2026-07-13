# Push Coffee Brew OS ke GitHub

Repository tujuan:

```text
https://github.com/dikaddicta/lestari_coffeedashboard
```

## Memasang dashboard lengkap

Salin seluruh isi dashboard baru ke root repository lokal, tetapi pertahankan folder:

```text
.git
```

Jangan menyalin folder `.git` dari ZIP lain.

## Pemeriksaan sebelum commit

```powershell
cd "D:\PRIBADI\4. WEBSITE\coffee_dashboard"
powershell -ExecutionPolicy Bypass -File .\scripts\pre-push-check.ps1
```

Jika pemeriksaan lulus:

```powershell
git status
git add -A
git commit -m "Release v35.1 functional stabilization"
git push origin main
```

## Jika push ditolak karena akun

Pesan seperti berikut bukan error rebase:

```text
Permission to dikaddicta/lestari_coffeedashboard.git denied to <akun-lain>
```

Hapus credential GitHub lama melalui Windows Credential Manager, lalu login dengan akun yang memiliki akses ke repository, atau tambahkan akun tersebut sebagai collaborator.

## Jika branch remote berubah

Jangan langsung menjalankan `git pull --rebase`. Gunakan:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
```

Script menggunakan `fetch` dan `merge --ff-only`. Jika branch divergen, script berhenti agar perubahan diperiksa terlebih dahulu.

## Setelah push

1. Buka tab **Actions** dan pastikan `Dashboard Quality Check` lulus.
2. Pastikan GitHub Pages melakukan deployment dari `main` dan folder `/ (root)`.
3. Buka website melalui Incognito.
4. Pastikan label versi menunjukkan `v35.1.0 · Functional Stabilization`.
