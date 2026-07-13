# Browser Services

Release v40 memperluas service layer agar business logic tidak terus menumpuk di `assets/app.js`.

- `storage-service.js`: browser storage dan auth adapter.
- `supabase-service.js`: validasi konfigurasi dan client Supabase.
- `auth-service.js`: sign-in, sign-up, session, listener auth, dan local sign-out.
- `stock-service.js`: validasi inventori, estimasi cangkir, status stok, dan RPC pengurangan stok.
- `brew-service.js`: validasi parameter seduhan, konsistensi rasio/pour, dan perbandingan parameter.
- `qa-service.js`: perhitungan nilai akhir serta rekomendasi berbasis parameter terlemah.
- `notification-service.js`: pengelompokan severity untuk ringkasan notifikasi.

Semua service harus dimuat sebelum `assets/app.js` dan diuji melalui `npm run audit:workflow`.


## v40 — Recommendation & QA Engine

- `recommendation-service.js` menjelaskan tingkat keyakinan, dasar parameter, dan satu eksperimen berikutnya.
- `qa-service.js` menghasilkan diagnosis sensorik, perbandingan dengan evaluasi sebelumnya, serta rencana perubahan satu variabel.
- Service tidak menulis langsung ke DOM atau database; orchestration tetap dilakukan oleh `assets/app.js`.
