# Service Layer

Release v38 introduces a small browser service layer between the interface and infrastructure APIs.

- `storage-service.js` owns safe browser storage access and the Supabase auth storage adapter.
- `supabase-service.js` owns configuration validation and Supabase client creation.

Business rules remain in `assets/app.js` for this release. Future modules should depend on `window.COFFEE_SERVICES` instead of calling infrastructure APIs directly.
