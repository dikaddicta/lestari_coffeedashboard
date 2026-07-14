# Coffee Brew OS v44.0.0 RC2

## Visual contrast and error-page hotfix

- Corrected primary action-link text on dark public-page buttons. The generic inline-link color can no longer override CTA text.
- Standardized public actions as 44 px minimum touch targets with explicit hover and keyboard-focus states.
- Reviewed CTA behavior on Release Notes, Maintenance, System Status, and 404 pages.
- Improved the 404 explanation and made its secondary action label more explicit.
- Changed the generated 404 `<base>` to the GitHub Pages project root so styles, scripts, and links continue to work when an unknown nested URL is opened.
- Added an automated visual contrast and public error-state audit to the release check.
- Bumped the PWA cache to `coffee-brew-os-v44-rc2`.

No Supabase migration is required for this release.
