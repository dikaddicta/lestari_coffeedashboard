$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  throw "Jalankan script ini dari root repository Git."
}

Write-Host "Menjalankan functional audit..." -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) { throw "Functional audit gagal." }

Write-Host "Memeriksa whitespace Git..." -ForegroundColor Cyan
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check menemukan masalah." }

$rebaseMerge = git rev-parse --git-path rebase-merge
$rebaseApply = git rev-parse --git-path rebase-apply
if ((Test-Path $rebaseMerge) -or (Test-Path $rebaseApply)) {
  throw "Masih ada rebase aktif. Selesaikan atau batalkan sebelum push."
}

Write-Host "Pre-push check lulus." -ForegroundColor Green
git status --short
