# Modular Page Source

Folder `src` adalah sumber utama susunan halaman mulai v36.

- `shell.html` berisi kerangka aplikasi global: welcome screen, sidebar, topbar, modal, dan urutan script.
- `routes.json` adalah manifest route, judul, subtitle, akses, dan urutan halaman.
- `pages/*.html` berisi satu menu dashboard per file.

Jangan mengedit blok `<main class="dashboard-main">` langsung di `index.html`, karena file tersebut dihasilkan ulang saat build.

Alur perubahan halaman:

```powershell
# edit file pada src/pages
npm run build
npm run check
npm run serve
```

`npm run build` menggabungkan shell dan 14 fragment halaman menjadi `index.html`, lalu membuat `assets/core/routes.js` dari manifest yang sama.
