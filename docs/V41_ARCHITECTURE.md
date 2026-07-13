# Arsitektur v41 — Analytics & Cost Insight

## Tujuan

v41 memisahkan perhitungan analitik dari renderer UI. `assets/app.js` tetap menangani DOM, sedangkan kalkulasi konsumsi, biaya, tren, dan insight berada pada service yang dapat diuji secara terpisah.

## Komponen baru

```text
assets/
├── services/
│   └── analytics-service.js
└── css/
    └── analytics-insight.css
```

## Alur data

```text
Brew Log + Stock Workspace
        ↓
analytics-service.js
        ↓
filter periode dan cakupan
        ↓
ringkasan QA, pemakaian, biaya, dan tren
        ↓
renderer Analitik Seduhan di assets/app.js
```

## Perhitungan biaya

Biaya per gram diperkirakan dari:

```text
Harga Pembelian ÷ (Stok Tersisa + Total Pemakaian Tercatat)
```

Biaya per cangkir dihitung dari:

```text
Biaya per Gram × Pemakaian Biji pada Brew Log
```

Metode tersebut memungkinkan data stok lama tetap digunakan tanpa migration baru. Akurasinya bergantung pada kelengkapan histori pemakaian stok.

Baris publik yang tidak memiliki referensi stok eksplisit tidak mengambil harga dari stok privat meskipun nama kopinya sama.

## Batas tanggung jawab

`analytics-service.js` tidak membaca DOM dan tidak mengakses Supabase secara langsung. Service hanya menerima array Brew Log dan Stock, lalu mengembalikan data terstruktur untuk UI dan laporan.
