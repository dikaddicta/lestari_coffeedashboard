# Modular Page Source

Folder `src` adalah sumber utama susunan halaman.

- `shell.html` berisi kerangka aplikasi global: welcome screen, sidebar, topbar, modal, urutan style, dan urutan script.
- `routes.json` adalah manifest route, judul, subtitle, akses, dan urutan halaman.
- `pages/*.html` berisi satu menu dashboard per file.

Mulai v37, proses build menghasilkan:

- `index.html` untuk root;
- `404.html` sebagai fallback GitHub Pages;
- 14 folder clean route seperti `rekomendasi-seduh/index.html`;
- `assets/core/routes.js` dari manifest yang sama.

Jangan mengedit file hasil build tersebut secara langsung.

Alur perubahan halaman:

```powershell
# edit src/pages, src/routes.json, atau src/shell.html
npm run build
npm run check
npm run serve
```

Page-module JavaScript berada pada `assets/pages/`. File tersebut menentukan renderer yang dijalankan ketika halaman terkait aktif.
