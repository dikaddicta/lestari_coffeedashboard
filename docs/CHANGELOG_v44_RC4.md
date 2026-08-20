# v44.0.0-rc.4 — Routing Stability Hotfix

## Fixed
- Fixed a recursive render loop on **Akun & Peran** that caused `RangeError: Maximum call stack size exceeded`.
- Prevented the guest login/auth panel from redirecting to itself during access rendering.
- Added a page-module re-entrancy guard as a second safety layer.
- Separated historical diagnostics from active system-health warnings on the Status page.
- Added an explicit `/404/` alias plus `.nojekyll` for more deterministic GitHub Pages publishing.
- Local development server now serves the branded 404 page for unknown paths, matching production behavior more closely.
- Bumped the PWA cache namespace so clients do not keep the RC3 JavaScript bundle.

## Data and database
- No coffee reference data was removed or changed.
- No new Supabase migration is required.
