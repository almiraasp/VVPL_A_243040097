# Tugas 08 – Pengujian Unit dan Test-Driven Development

## Identitas
- Nama: Almira Alifia Suparya Putri
- NPM: 243040097
- Kelas: A
- Mata kuliah: IF21W0504 – Verifikasi dan Validasi Perangkat Lunak
- Paket kasus: U8 versi 1.0

## Deskripsi
Proyek menguji `submitEnrollment({ studentId, classId, term, idempotencyKey }, ports)` menggunakan Node.js ESM dan `node:test`. Cakupan meliputi validasi panjang idempotency key, pendaftaran baru, replay, conflict, kelas penuh, serta pemulihan saat penyimpanan enrollment gagal.

## Kebutuhan runtime
- Node.js 26.12.1 atau versi yang mendukung ESM dan `node:test`.
- npm 11.20.0.
- Tidak ada dependensi runtime eksternal.

## Struktur proyek
```text
VVPL_A_243040097/
├── .gitignore
├── package.JSON
├── src/submitEnrollment.js
└── test/
    ├── fixtures/fixtures.js
    └── submitEnrollment.test.js
```

## Instalasi dan menjalankan test
1. Pastikan Node.js terpasang.
2. Ekstrak folder proyek.
3. Buka terminal pada folder yang berisi `package.JSON`.
4. Jalankan seluruh test:
```powershell
npm test
```
5. Jalankan satu test (contoh UT03):
```powershell
node --test --test-name-pattern="UT03" test/submitEnrollment.test.js
```
Script `npm test` menjalankan `node --test test/submitEnrollment.test.js`.

## Cara menjalankan mutation test
Mutation dilakukan pada branch/salinan percobaan, bukan versi akhir.
1. Buat branch percobaan: `git switch -c mutation/remove-fingerprint-check`.
2. Pada `src/submitEnrollment.js`, hilangkan pemeriksaan kesamaan fingerprint sehingga key yang sudah ada langsung mengembalikan hasil sebelumnya.
3. Jalankan:
```powershell
node --test --test-name-pattern="UT03" test/submitEnrollment.test.js
```
4. Mutation terdeteksi jika UT03 gagal karena hasil aktual `OK`, sedangkan expected `IDEMPOTENCY_CONFLICT`.
5. Pulihkan kode asli, lalu jalankan `npm test` dan `git status`. Pastikan semua test lulus dan working tree bersih.

## Batas unit pengujian
Unit yang diuji adalah `submitEnrollment()` dengan dependensi port yang diinjeksi. Penyimpanan, kursi, dan pencatatan idempotensi digantikan test double dalam memori (fake, stub, dan spy). Test tidak memakai database atau jaringan nyata. Karena pemanggilan berlangsung berurutan, hasil ini tidak membuktikan atomisitas transaksi, constraint unik database, atau keamanan terhadap race condition pada permintaan paralel.

Lihat `Laporan_Tugas08_Unit_TDD.docx` untuk matriks U8–UT, hasil dua run bersih, catatan mutation, bukti commit, dan jurnal TDD.
