# Premium Patch v23

Patch ini melanjutkan v22 dengan fokus luxury polish dan interaksi:

- Setiap tab/section sekarang memiliki identitas visual sendiri melalui accent color, section marker, dan table tone.
- Empty state tabel dibuat lebih cantik dengan ikon, judul, dan deskripsi singkat.
- Header tabel dibuat lebih konsisten, seamless, dan tidak terasa patah/berulang.
- Card, panel, stat, recipe card, hero card, dan insight panel diberi hover yang lebih halus.
- Tab transition dibuat lebih smooth.
- Form input/select/textarea diberi hover dan focus state yang lebih premium.
- Scrollbar tabel tetap mengikuti palette kopi dan menyesuaikan accent section.
- Patch tetap ringan, static, dan tanpa dependency tambahan.

File Supabase config tidak disertakan agar API URL dan anon key lokal tidak tertimpa.


## v23.2 Input Seduhan Restoration

- Added a dedicated `Input Seduhan` tab.
- Manual input combines coffee identity, brew recipe fields, and QA scoring in one form.
- Removed stock dependency from this workflow.
- Save button is disabled until Final QA reaches 6.5.
- Passing manual brews are inserted as public approved brew logs and displayed in `Hasil Seduhan Publik`.
