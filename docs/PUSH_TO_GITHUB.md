# Push ke GitHub

Repository tujuan:

```text
https://github.com/dikaddicta/lestari_coffeedashboard
```

## Pertama kali memakai versi v34

Buka PowerShell dari folder repository, lalu jalankan:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-git-safe.ps1
git status
git diff --check
git add -A
git commit -m "Release v34 dashboard stabilization"
git push origin main
```

## Update berikutnya

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
# lakukan perubahan di VS Code
git status
git diff --check
git add -A
git commit -m "Deskripsi perubahan"
git push origin main
```

## Aturan penting

- Jangan menyalin folder `.git` dari ZIP lain ke repository aktif.
- Jangan menjalankan `git pull --rebase` sebagai kebiasaan default.
- Jangan mengubah file ketika `git status` menampilkan rebase aktif.
- Jangan melakukan `push --force` ke branch `main`.
- Selalu commit perubahan lokal sebelum sinkronisasi yang memerlukan rebase manual.

## Setelah push

Pastikan file utama berada di root repository: `index.html`, `assets/`, `supabase/`, `scripts/`, `docs/`, `README.md`, `.gitattributes`, dan `.editorconfig`.
