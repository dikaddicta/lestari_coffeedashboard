# Push ke GitHub

Repo tujuan:

```text
https://github.com/dikaddicta/lestari_coffeedashboard
```

## Opsi aman: update repo yang sudah ada

```bash
git clone https://github.com/dikaddicta/lestari_coffeedashboard.git
cd lestari_coffeedashboard

# Salin isi ZIP bersih ke folder repo ini, lalu cek perubahan:
git status

git add index.html README.md assets supabase docs .gitignore
git status

git commit -m "Clean project structure and consolidate Supabase schema"
git push origin main
```

## Opsi overwrite isi repo dengan isi ZIP bersih

Gunakan opsi ini hanya jika kamu yakin isi repo lokal boleh disamakan persis dengan ZIP bersih.

```bash
git clone https://github.com/dikaddicta/lestari_coffeedashboard.git
cd lestari_coffeedashboard

# Hapus isi lama kecuali folder .git
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

# Salin seluruh isi folder coffee_dashboard dari ZIP bersih ke folder repo ini.

git add -A
git commit -m "Clean project structure and consolidate Supabase schema"
git push origin main
```

## Setelah push

- Cek tab Code di GitHub dan pastikan file utama ada di root: `index.html`, `assets/`, `supabase/`, `README.md`.
- Jika memakai GitHub Pages, pilih branch `main` dan folder `/root` sebagai source.
- Jika Supabase belum sinkron, jalankan SQL dari `supabase/schema.sql` untuk project baru atau migration yang belum dijalankan untuk project lama.
