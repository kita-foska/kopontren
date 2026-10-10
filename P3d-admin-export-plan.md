# P3d - Rencana Ekspor Administrasi (Admin Export)

Status: RENCANA - menunggu persetujuan. Belum ada kode yang diubah.
Cakupan: sisi administrasi saja. P1c/P3c (sisi pengguna) menyusul
setelah P3d. Di luar cakupan: tashih (bukan modul admin), emoji/unicode
di UI baru, format ekspor selain yang sudah ada (CSV + laporan formal).

## 1. Temuan dari audit (sudah diverifikasi)

### 1.1 Infrastruktur CSV yang sudah ada (tidak duplikat)
- `/api/reports/csv` - CSV modul laporan umum.
- `/api/keuangan/csv` - CSV modul keuangan.
- `/api/laporan/formal` - cetak/formal laporan (print).
- Modul lain punya endpoint CSV masing-masing; logika formatter sudah
  tersebar per modul dan berfungsi.

### 1.2 Freeze V1
- `src/components/admin/admin-laporan-client.tsx` di-freeze sebagai V1
  dan **tidak boleh di-edit** (termasuk tidak menambah prop/UI di
  file itu). Integrasi UI P3d lewat file BARU / perubahan aditif pada
  file lain yang non-frozen.

### 1.3 Banner update PWA (C1/C2) - tervalidasi
- `src/components/sw-register.tsx` baris 145-180: banner sudah memakai
  inline SVG (path refresh, `aria-hidden="true"`), teks polos
  "Versi anyar tersedia - perbarui...", tanpa emoji/unicode.
- `div` dengan `max-w-3xl` (baris 146) adalah konteks lama, BUKAN hasil
  C1; C1 hanya mengganti isi dalam.
- Aturan desain: `max-w-3xl` tetap dibatasi /admin/laporan (+
  pengecualian banner PWA yang sudah ada). P3d TIDAK boleh menambah
  penggunaan `max-w-3xl` baru.

### 1.4 Aturan desain yang wajib dipatuhi di UI baru
- Inline SVG saja untuk ikon (tanpa pustaka ikon).
- Tanpa unicode/emoji di teks UI maupun komentar baru.
- Gaya print tidak berubah; styling pakai Tailwind.
- Format tanggal ID-ID; teks UI Bahasa Indonesia.
- Target sentuh minimal 44px; atribut a11y (role/aria).

## 2. Keputusan desain (usulan)

### D1 - Lokasi UI: halaman admin baru, bukan edit V1
Rute baru `/admin/ekspor` (file: `src/app/admin/ekspor/page.tsx` +
`layout.tsx` + komponen client baru di `src/components/admin/ekspor/`).
Alasan:
- Tidak menyentuh `admin-laporan-client.tsx` (freeze aman; verifikasi
  via `git diff` yang kosong untuk file itu).
- Halaman khusus memberi ruang untuk daftar modul, rentang periode,
  dan progress unduhan - tanpa membebani layout laporan V1.
- Nav admin: tambah SATU entri di file layout admin (non-frozen;
  dikonfirmasi saat langkah 1 implementasi bahwa file nav bukan bagian
  freeze V1 - freeze hanya untuk client laporan).

Alternatif DITOLAK: menyisipkan komponen lewat layout/prop ke V1
(memerlukan edit file frozen -> melanggar freeze).

### D2 - Strategi API: orkestrasi di sisi frontend
- TIDAK membuat endpoint agregasi baru di server (mis.
  `/api/reports/consolidated`) karena menduplikasi logika formatter
  CSV per modul dan cepat terdistrak.
- Helper unduhan baru di `src/lib/admin/export-download.ts`: bangun
  URL + query (periode ID-ID) -> fetch -> blob -> objectURL -> unduh;
  modul berjalan berurutan dengan state progress (sukses/gagal per
  modul), timeout per modul (~10 detik), abort controller.
- "Unduh semua" = menjalankan semua modul yang dipilih secara
  berurutan; tiap modul tetap bisa diunduh satuan.
- Laporan formal: re-use `/api/laporan/formal` (tombol "Cetak formal").

Alternatif yang dicatat (bukan dipilih): endpoint manifest
`/api/ekspor/daftar` (daftar modul + endpoint di server). Ditunda
sampai jumlah modul membesar; P3d hard-code daftar modul di konstanta
TS.

### D3 - Format
- CSV (sudah ada per modul) + cetak formal yang sudah ada.
- Tidak menambah xlsx/pdf/zip di P3d.
- Header CSV tanpa emoji/unicode; bila perlu, konfirmasi BOM UTF-8
  per modul saat implementasi (perilaku Excel).

## 3. Rencana file (baru + 1 edit aditif)

BARU:
- `src/app/admin/ekspor/layout.tsx` - metadata halaman (ID, admin).
- `src/app/admin/ekspor/page.tsx` - server component, render client.
- `src/components/admin/ekspor/export-center-client.tsx` - daftar
  modul, pilihan periode, tombol Unduh per modul + Unduh semua.
- `src/components/admin/ekspor/export-progress.tsx` - indikator per
  modul (sukses/gagal/dalam proses) + ikon inline SVG 16px stroke-2.
- `src/lib/admin/export-download.ts` - util unduhan berurutan +
  URL builder.
- `tests/admin-export-download.test.ts` - unit test util.

EDIT ADITIF (konfirmasi non-frozen dulu):
- +1 entri "Ekspor" di nav layout admin.

TIDAK DISENTUH:
- `src/components/admin/admin-laporan-client.tsx` (V1 frozen).
- Endpoint CSV/formal yang sudah ada; `sw-register.tsx`; gaya print.

## 4. Langkah eksekusi (urutan)

1. Konfirmasi file nav/layout admin non-frozen (git + cek MEMORY.md).
2. Buat rute `/admin/ekspor` + layout + metadata.
3. Implementasi `export-download.ts` + test unit dulu, sebelum UI.
4. Implementasi komponen export center + progress (SVG inline, a11y,
   target 44px, tanpa emoji/unicode).
5. Tambah entri nav admin (+1 baris).
6. Verifikasi freeze: `git diff` pada `admin-laporan-client.tsx`
   harus kosong; grep emoji/unicode di file baru harus 0 hasil.
7. `pnpm test` + `pnpm build` (gerbang CI) - hijau.
8. Update `TODO.md` + `MEMORY.md` (P3d selesai + aturan ekspor).

## 5. Kriteria selesai (definition of done)

- [ ] `/admin/ekspor` tersedia untuk admin; modul + periode bisa dipilih.
- [ ] Unduh per modul dan "Unduh semua" berfungsi (CSV berurutan,
      progress terlihat, gagal per modul tidak menghentikan lainnya).
- [ ] Tombol cetak formal re-use `/api/laporan/formal`.
- [ ] `git diff src/components/admin/admin-laporan-client.tsx` kosong.
- [ ] Grep emoji/unicode di file P3d baru: 0 hasil.
- [ ] Tidak ada `max-w-3xl` baru di luar /admin/laporan + banner PWA.
- [ ] `pnpm test` dan `pnpm build` hijau.
- [ ] Tidak ada perubahan rute/aplikasi sisi pengguna.

## 6. Di luar cakupan P3d (eksklusi eksplisit)

- P1c/P3c: unduhan sisi pengguna (menyusul setelah P3d disetujui &
  selesai).
- Tashih di UI admin manapun.
- Format xlsx/pdf/zip, agregasi server-side, email otomatis.
- Edit apapun pada file V1 yang di-freeze.

## 7. Risiko & mitigasi

- Unduhan besar menumpuk -> eksekusi berurutan (bukan paralel),
  timeout per modul, abort controller.
- Perilaku Excel (BOM/UTF-8) per modul beda -> cek saat implementasi;
  bila perlu BOM, tambahkan di helper unduhan saja, jangan ubah
  endpoint yang sudah ada (agar perilaku V1 tidak bergeser).
- Nav admin ternyata bagian V1 frozen -> fallback: tautan diletakkan
  lewat layout non-frozen lain, atau akses via URL langsung;
  dikonfirmasi di langkah 1.

## 8. Pertanyaan untuk persetujuan

1. Route `/admin/ekspor` (halaman terpisah, usulan utama) atau
   sub-route `/admin/laporan/ekspor`?
2. Strategi orkestrasi frontend (usulan) atau tambah endpoint
   manifest `/api/ekspor/daftar` sekarang?
3. P3d menyertakan tombol cetak formal (re-use endpoint ada) atau
   cukup CSV saja dulu?

## Lampiran - Referensi audit
- `src/components/sw-register.tsx` baris 145-180: banner update sudah
  valid (SVG inline, teks polos, a11y, target 44px).
- `src/components/admin/admin-laporan-client.tsx`: V1 frozen.
- Endpoint: `/api/reports/csv`, `/api/keuangan/csv`,
  `/api/laporan/formal`.
- TODO.md / MEMORY.md: P3d administrasi, tanpa tashih, inline SVG
  saja, tanpa emoji; P1c/P3c menyusul.

