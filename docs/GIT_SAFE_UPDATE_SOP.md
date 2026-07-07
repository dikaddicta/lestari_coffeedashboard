# Safe Git Update SOP

Use this order for every ZIP update:

```bash
git status
git pull --rebase origin main
```

Then replace the ZIP files.

```bash
git add .
git commit -m "Your update message"
git push origin main
```

Do not start a new ZIP replacement while GitLens or terminal shows:

- `rebase in progress`
- `Interactive Rebase`
- `.git/rebase-merge`

If it appears, finish it first:

```bash
git add .
git rebase --continue
```

If there are conflicts and the ZIP version is the version you want to keep:

```bash
git checkout --theirs index.html
git checkout --theirs assets/app.js
git checkout --theirs assets/styles.css
git checkout --theirs assets/data.js
git add .
git rebase --continue
```
