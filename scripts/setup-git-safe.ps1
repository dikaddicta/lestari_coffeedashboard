$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  throw "Jalankan script ini dari root repository Git."
}

git config core.autocrlf false
git config core.safecrlf warn
git config pull.ff only
git config fetch.prune true

git add --renormalize .

Write-Host "Konfigurasi Git lokal sudah distabilkan." -ForegroundColor Green
Write-Host "Periksa hasil normalisasi dengan: git status" -ForegroundColor Cyan
Write-Host "Commit perubahan .gitattributes/.editorconfig bersama perubahan project." -ForegroundColor Cyan
