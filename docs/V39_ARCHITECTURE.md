# Arsitektur v39 — Core Workflow Modules

## Tujuan

Mengurangi coupling antara DOM, state, Supabase, validasi, dan business logic tanpa memindahkan seluruh `assets/app.js` dalam satu release berisiko tinggi.

## Lapisan

```text
UI fragments (src/pages)
        ↓
Page orchestration (assets/pages + assets/app.js)
        ↓
Core (state, event bus, validation)
        ↓
Feature services (auth, stock, brew, QA, notification)
        ↓
Infrastructure (storage + Supabase)
```

## Lifecycle event

Event yang sudah diterbitkan:

- `auth:changed`
- `auth:login`
- `auth:logout`
- `stock:saved`
- `stock:deleted`
- `stock:consumed`
- `brew:saved`
- `qa:saved`

Event ini menjadi fondasi agar analitik, notifikasi, dan audit log berikutnya dapat bereaksi tanpa menambahkan pemanggilan langsung ke setiap fungsi penyimpanan.

## State

Data lokal dimuat melalui `createStore()`. Data `cloudStock`, `cloudBrewLogs`, dan `cloudQA` tetap transient dan selalu direset sebelum sinkronisasi agar data cloud usang tidak muncul sebagai sumber kebenaran.

## Validasi workflow

Input Seduhan memeriksa:

- nama kopi;
- dosis;
- rasio;
- total air;
- suhu;
- waktu seduh;
- bloom;
- kesesuaian total air dengan rasio;
- kesesuaian jumlah pour dengan total air;
- keberadaan es pada mode Japanese Iced.

## Batas arsitektur saat ini

Orchestration dan mapper Supabase masih berada di `assets/app.js`. Tahap berikutnya adalah memindahkan mapper/repository dan membuat operasi seduhan + stok sebagai transaksi database atomik.
