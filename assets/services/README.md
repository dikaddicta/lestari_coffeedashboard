# Service Layer

Service pada folder ini berisi business logic yang dapat digunakan ulang tanpa bergantung langsung pada DOM.

## Service aktif

- `storage-service.js` — penyimpanan browser dan adapter Supabase Auth.
- `supabase-service.js` — validasi konfigurasi dan pembuatan client Supabase.
- `auth-service.js` — operasi autentikasi.
- `stock-service.js` — validasi stok, estimasi cangkir, status stok, dan konsumsi stok.
- `brew-service.js` — validasi input dan struktur seduhan.
- `recommendation-service.js` — penjelasan rekomendasi, confidence score, dan eksperimen berikutnya.
- `qa-service.js` — perhitungan QA, diagnosis sensorik, dan perbandingan evaluasi.
- `analytics-service.js` — periode analitik, konsumsi biji, estimasi biaya, tren, dan insight.
- `notification-service.js` — ringkasan notifikasi kualitas data.

## v41 — Analytics & Cost Insight

`analytics-service.js` menerima data Brew Log dan Stock sebagai input. Service ini tidak membaca DOM dan tidak melakukan query Supabase secara langsung, sehingga perhitungannya dapat diuji melalui `npm run audit:analytics`.
