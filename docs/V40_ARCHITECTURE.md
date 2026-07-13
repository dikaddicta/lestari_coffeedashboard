# Arsitektur v40 — Recommendation & QA Engine

## Tujuan

Membuat rekomendasi tidak hanya menghasilkan angka, tetapi juga menjelaskan alasan, batas keyakinan, serta eksperimen berikutnya. Evaluasi QA diubah dari sekadar skor menjadi keputusan dial-in yang dapat dilakukan.

## Lapisan baru

```text
Data profil + input pengguna + brew history
                  ↓
       recommendation-service.js
                  ↓
 confidence · rationale · next experiment
                  ↓
      Recommendation UI components
```

```text
QA form + masalah utama + QA sebelumnya
                  ↓
              qa-service.js
                  ↓
 guidance · diagnosis · comparison · metric map
                  ↓
          QA decision components
```

## Recommendation confidence

Skor keyakinan tidak dimaksudkan sebagai probabilitas ilmiah. Nilai ini merupakan indikator kelengkapan dan keterlacakan rekomendasi berdasarkan:

1. Kelengkapan profil kopi.
2. Ketersediaan data alat dan air.
3. Guardrail proses pascapanen.
4. Ketersediaan sumber pada entri pustaka.
5. Brew log dengan QA pada profil serupa.

## Prinsip eksperimen

Recommendation engine hanya mengusulkan satu variabel utama per percobaan. Variabel lain dikunci agar dampak perubahan dapat dibaca dari hasil rasa dan QA.

## Diagnosis QA

Diagnosis menggabungkan:

- skor sensorik terkuat dan terlemah;
- masalah rasa yang dipilih pengguna;
- target hasil percobaan berikutnya;
- perbandingan nilai final dengan QA sebelumnya.

Hasil diagnosis berisi variabel yang diubah, arah perubahan, hasil yang diharapkan, dan perubahan yang harus dihindari pada percobaan yang sama.

## Kompatibilitas database

Release ini tidak menambah kolom baru. Masalah utama dan target percobaan berikutnya digabungkan ke catatan hasil agar tetap kompatibel dengan schema Supabase saat ini.

## Batas saat ini

- Recommendation engine masih berbasis rule dan data pustaka internal, bukan model machine learning.
- Confidence score adalah indikator operasional, bukan jaminan hasil rasa.
- Perbandingan QA membutuhkan brew log dan QA aktif pada workspace yang sama.
- Pengujian end-to-end Supabase tetap harus dilakukan dengan session dan role aktif.
