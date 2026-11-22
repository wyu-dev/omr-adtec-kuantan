# Sistem Semakan OMR — ADTEC JTM Kampus Kuantan

Aplikasi web pengimbas dan penyemak kertas jawapan OMR berasaskan kamera (ala ZipGrade) untuk **ADTEC JTM Kampus Kuantan**, dibina menggunakan **React + TypeScript + Vite + Tailwind CSS** dengan enjin visi komputer OMR 100% di pelayar (*zero-backend*).

## Ciri-Ciri Utama

- **Borang OMR Dinamik (1–100 Soalan Manual)**: Pengajar boleh menetapkan sebarang bilangan soalan secara manual (`1` hingga `100` soalan). Pilihan jawapan **A, B, C, D** disusun kemas dalam blok **5 baris** (`1–5`, `6–10`, `11–15`, ...) dengan kepala lajur `A B C D`.
- **No. NDP Pelajar 8 Digit**: Grid OMR 8 digit (`0–9`) untuk No. NDP pelajar yang dipadankan secara automatik dengan senarai pelajar semasa imbasan.
- **Identiti Rasmi ADTEC JTM Kampus Kuantan**: Logo rasmi pada bar navigasi dan borang cetak (PDF / PNG / SVG), kotak maklumat pelajar (**Nama, No. Kad Pengenalan, NDP, Kursus, Semester**), serta kotak rasmi **`MARKAH (%)`** di bahagian kanan bawah.
- **Pengimbas Kamera Langsung & Muat Naik Gambar**:
  - Penjejakan masa nyata 4 petak penjuru (*fiducial squares*) dengan tangkapan automatik apabila fokus stabil.
  - Transformasi perspektif homografi 8-DOF & pengesanan pusingan automatik **180°** jika kertas diletakkan terbalik.
  - Pengelasan lorekan adaptif yang tahan bayang-bayang dan pencahayaan tidak sekata.
  - Mod **Simulate Camera Scan** untuk ujian segera tanpa perlu mencetak kertas terlebih dahulu.
- **Aliran Kerja Lengkap Pengajar**: Pengurusan ujian, Skema Jawapan (manual atau imbas kertas skema), Semakan Kertas & suntingan manual, Analisis Item (graf taburan A–D), Senarai Pelajar (NDP 8 digit), dan Eksport CSV.

## Cara Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173` di pelayar web.

> **Tip Kamera Telefon**: Akses kamera langsung (`getUserMedia`) memerlukan `localhost` atau sambungan `HTTPS`. Anda juga boleh menggunakan butang **Upload Photo** untuk mengambil gambar terus dari kamera belakang telefon.
