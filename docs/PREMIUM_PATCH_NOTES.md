# Premium Patch v26

Fokus patch ini adalah fitur **Edit Hasil Seduhan Publik** untuk pemilik/inputer data.

## Perubahan utama

- Tombol **Edit** muncul di tabel dan modal detail **hanya** untuk hasil seduhan milik akun yang sedang login.
- Hasil seduhan milik orang lain hanya menampilkan tombol **Detail**.
- Edit membuka menu **Input Seduhan** dan mengisi form dengan data lama.
- Form edit memakai field yang sama seperti Input Seduhan, termasuk detail pour, valve mode Switch, Japanese ice, dan evaluasi QA.
- Tombol simpan tetap terkunci jika Final QA kurang dari 6.5.
- Saat disimpan, data `brew_logs` dan `qa_scores` diperbarui di Supabase.

## Catatan keamanan

Edit owner memakai `created_by = auth.uid()` melalui RLS Supabase. Data yang dibuat sebagai guest tanpa login tidak bisa diverifikasi dengan aman lintas perangkat, sehingga tombol edit aman difokuskan untuk akun login yang menginput data.
