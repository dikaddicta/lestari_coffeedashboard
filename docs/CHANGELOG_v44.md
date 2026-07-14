# Changelog v44.0.0-rc.1

## Added

- Central site and release configuration in `src/site.json`.
- Automated release metadata build.
- Runtime `release.json` manifest.
- Release verification service.
- Opt-in monitoring service with sanitized payloads.
- Public release notes page at `/rilis/`.
- Open Graph and Twitter Card metadata for dashboard routes and public pages.
- 1200×630 social preview asset.
- Extended public status checks for HTTPS, release consistency, and monitoring state.
- Supabase Auth email templates for confirmation, password reset, and magic link.
- Production deployment, database backup, and email setup runbooks.
- Release candidate audit command: `npm run audit:rc`.

## Changed

- PWA cache namespace updated to `coffee-brew-os-v44-rc1`.
- PWA manifest and security.txt are generated from site config.
- Asset cache-busting version is generated from the build identifier.
- README and public navigation now include release candidate information.
- App config is generated and deep-frozen at runtime.

## Security and privacy

- Monitoring remains disabled until explicitly configured.
- Monitoring payloads reuse diagnostic redaction and do not read workspace records.
- Database backup runbook explicitly separates browser backup from Supabase database backup.
- Custom domain is not activated without a final domain decision.

## Database

No new migration is included. `migration_v42_security_audit_rls.sql` remains mandatory for the active Supabase project.
