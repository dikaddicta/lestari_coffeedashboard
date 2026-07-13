# Service Layer

Service pada folder ini berisi business logic yang dapat digunakan ulang tanpa bergantung langsung pada DOM.

## Service aktif

- `storage-service.js` — penyimpanan browser dan adapter Supabase Auth.
- `supabase-service.js` — validasi konfigurasi dan pembuatan client Supabase.
- `auth-service.js` — operasi autentikasi.
- `security-service.js` — matriks izin, ringkasan sesi, security posture, dan redaksi metadata sensitif.
- `audit-service.js` — pencatatan audit melalui RPC, pembacaan audit workspace, dan fallback development.
- `stock-service.js` — validasi stok, estimasi cangkir, status stok, dan konsumsi stok.
- `brew-service.js` — validasi input dan struktur seduhan.
- `recommendation-service.js` — penjelasan rekomendasi, confidence score, dan eksperimen berikutnya.
- `qa-service.js` — perhitungan QA, diagnosis sensorik, dan perbandingan evaluasi.
- `analytics-service.js` — periode analitik, konsumsi biji, estimasi biaya, tren, dan insight.
- `notification-service.js` — ringkasan notifikasi kualitas data.

## v42 — Security & Audit

`security-service.js` tidak memberikan hak akses secara mandiri. Service ini membantu UI menjelaskan izin dan menyembunyikan aksi yang tidak sesuai, sedangkan keputusan akhir tetap ditegakkan oleh Supabase RLS dan trigger.

`audit-service.js` menulis event cloud melalui RPC `write_audit_event`. Fallback browser digunakan hanya ketika migration belum tersedia atau saat development; log lokal bukan audit record tepercaya.

Audit service dapat diperiksa melalui:

```powershell
npm run audit:security
```
