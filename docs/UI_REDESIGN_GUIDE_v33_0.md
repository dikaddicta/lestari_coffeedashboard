# Coffee Brew OS v33 — UI/UX & File Structure Refactor

## Design Direction
Coffee Brew OS v33 menggunakan pendekatan hybrid:
- Clean SaaS layout sebagai fondasi utama.
- Premium coffee lab aesthetic untuk warna, card, dan ambience.
- Workflow/productivity pattern untuk modul brew, QA, stock, analytics, dan report.
- KPI/card pattern untuk home dashboard dan metric summary.

## New Style Structure
```text
assets/
  images/
    barista-banner.png
    barista-mascot.png
    latte-art-icon.png
  styles/
    00-tokens.css
    01-base.css
    02-layout.css
    03-components.css
    04-pages.css
    05-mobile.css
    06-legacy-compat.css
    main.css
```

## Notes
`06-legacy-compat.css` sengaja dipertahankan pada v33.0 agar seluruh class lama tetap aman saat redesign foundation. Override visual utama ada pada file 00 sampai 05.
