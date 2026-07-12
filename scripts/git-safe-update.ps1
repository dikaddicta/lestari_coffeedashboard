param(
  [string]$Branch = "main",
  [string]$Remote = "origin"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  throw "Jalankan script ini dari root repository Git."
}

$status = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Gagal membaca status Git." }
if ($status) {
  Write-Host "Update dibatalkan karena masih ada perubahan lokal:" -ForegroundColor Yellow
  git status --short
  throw "Commit atau stash perubahan terlebih dahulu."
}

$rebaseMerge = git rev-parse --git-path rebase-merge
$rebaseApply = git rev-parse --git-path rebase-apply
if ((Test-Path $rebaseMerge) -or (Test-Path $rebaseApply)) {
  throw "Masih ada rebase aktif. Selesaikan dengan git rebase --continue atau batalkan dengan git rebase --abort."
}

git fetch $Remote --prune
if ($LASTEXITCODE -ne 0) { throw "git fetch gagal." }

git merge --ff-only "$Remote/$Branch"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Branch lokal dan remote sudah divergen; merge otomatis tidak dilakukan." -ForegroundColor Yellow
  Write-Host "Buat backup branch, lalu lakukan rebase manual setelah memastikan perubahan sudah di-commit." -ForegroundColor Cyan
  exit 1
}

Write-Host "Repository sudah sinkron dengan $Remote/$Branch tanpa rebase otomatis." -ForegroundColor Green
