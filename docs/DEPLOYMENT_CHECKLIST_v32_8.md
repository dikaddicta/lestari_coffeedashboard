# Coffee Brew OS — Deployment Checklist v32.8

## 1. Before replacing files
```bash
git status
git pull --rebase origin main
```

Only continue when there is no active rebase and the working tree is clean.

## 2. Replace project files
Extract the ZIP and replace the local project files.

## 3. Validate locally
Open `index.html` or run your local static server, then check:

- Welcome screen opens.
- Guest mode opens public modules.
- Login page / Akun & Role opens.
- Routes work: `/#/rekomendasi-seduh`, `/#/input-seduhan`, `/#/pustaka-data`.
- Pustaka Data shows USDA, Kopyol, Mix Varietas, Extended Natural, and Fermented Natural.
- Custom post-harvest process input appears when `Custom / Isi Manual` is selected.
- Mobile sidebar drawer works.
- No unreadable text in Pustaka Data hero.

## 4. Commit and push
```bash
git add .
git commit -m "Prepare production deployment pack"
git push origin main
```

## 5. If push is rejected
```bash
git pull --rebase origin main
git push origin main
```

If conflicts appear, resolve only the conflicted files, then:
```bash
git add .
git rebase --continue
git push origin main
```
