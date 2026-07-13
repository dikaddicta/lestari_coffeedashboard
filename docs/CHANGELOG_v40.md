# Changelog v40.0.0 — Recommendation & QA Engine

## Rekomendasi Seduh

- Menambahkan `recommendation-service.js` sebagai lapisan business logic yang terpisah dari DOM.
- Menambahkan skor keyakinan 0–100 dengan lima faktor yang dapat ditelusuri:
  - kelengkapan profil;
  - kalibrasi peralatan;
  - batas aman proses;
  - jejak referensi;
  - validasi brew log.
- Menjelaskan alasan pemilihan suhu, rasio, gilingan, agitasi, serta pembagian air dan es.
- Menambahkan satu rencana eksperimen berikutnya dengan prinsip satu variabel berubah dan variabel lain tetap.
- Menggunakan hasil QA terdahulu sebagai penguat keyakinan bila profil kopi yang sama pernah diuji.

## Evaluasi QA

- Memperbarui `qa-service.js` dengan normalisasi metrik, pemeringkatan sensorik, diagnosis masalah rasa, dan perbandingan dengan evaluasi sebelumnya.
- Menambahkan pilihan masalah utama: asam mentah, acidity tajam, pahit, kering/sepat, body tipis, datar, keruh, dan aroma lemah.
- Menambahkan target percobaan berikutnya.
- Menampilkan peta sensorik, rencana dial-in, hasil yang diharapkan, serta variabel yang tidak boleh diubah bersamaan.
- Istilah formulir QA dirapikan agar lebih natural dalam Bahasa Indonesia.
- Masalah utama dan target berikutnya ikut dicatat dalam hasil evaluasi tanpa perubahan schema database.

## UI dan PWA

- Menambahkan `assets/css/intelligence.css` untuk komponen rekomendasi dan QA.
- Menambahkan panel “Kenapa resep ini dipilih”.
- Cache PWA diperbarui menjadi `coffee-brew-os-v40-recommendation-qa`.
- Seluruh clean route tetap didukung.

## Quality Gate

- Menambahkan `scripts/recommendation-qa-audit.mjs`.
- Menambahkan perintah `npm run audit:intelligence`.
- Release check sekarang memvalidasi recommendation engine dan QA diagnostics.
- Tidak ada migrasi Supabase baru pada release ini.
