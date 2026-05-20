# Premium Patch Notes

Patch ini sengaja hanya berisi file yang berubah:

- `index.html`
- `assets/app.js`
- `assets/styles.css`
- `README.md`
- `docs/PREMIUM_PATCH_NOTES.md`

File `assets/supabase-config.js` tidak disertakan agar Supabase URL dan anon key lokal yang sudah kamu set tidak tertimpa.

## Cara pakai

Extract isi folder `coffee_dashboard/` dari ZIP ini ke folder repo lokal kamu yang sama, lalu replace file yang sama.

Setelah itu:

```powershell
git status
git add index.html assets/app.js assets/styles.css README.md docs/PREMIUM_PATCH_NOTES.md
git commit -m "Upgrade premium UI and brew recommendation engine"
git push origin main
```
