# SOP Git Aman — Tanpa Rebase Otomatis

## Penyebab masalah pada versi sebelumnya

Repository yang diaudit tidak sedang tertinggal dari `origin/main`, tetapi hampir semua file tampil berubah karena perbedaan akhir baris Windows `CRLF` dan Git `LF`. Project juga belum memiliki `.gitattributes`, sementara SOP lama selalu menjalankan `git pull --rebase`. Kombinasi tersebut membuat perubahan semu ikut masuk ke proses rebase dan meningkatkan risiko konflik.

## Setup satu kali

Jalankan dari root repository di PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-git-safe.ps1
```

Periksa hasil normalisasi:

```powershell
git status
git diff --check
git add -A
git commit -m "Stabilize line endings and Git workflow"
git push origin main
```

## Alur harian yang direkomendasikan

Sebelum mulai bekerja:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
```

Script hanya melakukan `fetch` dan `merge --ff-only`. Git tidak akan memulai rebase secara otomatis. Jika repository sudah divergen, proses dihentikan agar perubahan dapat diperiksa secara sadar.

Setelah selesai bekerja:

```powershell
npm run check
powershell -ExecutionPolicy Bypass -File .\scripts\pre-push-check.ps1
git status
git diff --check
git add -A
git commit -m "Deskripsi perubahan"
git push origin main
```

## Jika rebase sudah telanjur aktif

Periksa status:

```powershell
git status
```

Lanjutkan hanya setelah konflik diperbaiki:

```powershell
git add -A
git rebase --continue
```

Atau kembalikan repository ke kondisi sebelum rebase:

```powershell
git rebase --abort
```

Jangan menjalankan `git pull`, mengganti seluruh isi ZIP, atau menghapus file `.git` ketika rebase masih aktif.

## Jika branch lokal dan remote divergen

Buat pengaman terlebih dahulu:

```powershell
git branch backup-before-sync
git fetch origin
```

Setelah semua perubahan lokal sudah di-commit, pilih salah satu secara sadar:

```powershell
# Menyusun commit lokal di atas remote
git rebase origin/main

# atau membuat merge commit
git merge origin/main
```

Jangan gunakan `git push --force` pada `main`. Bila benar-benar diperlukan pada branch pribadi, gunakan `--force-with-lease`, bukan `--force`.
