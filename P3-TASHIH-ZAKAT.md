# DOKUMEN TASHIH ULAMA — ZAKAT TIJARAH
## Kopontren Al Ittihad

> **Prinsip: "Syariah nomer 1, fitur nomer 2."**
> Dokumen ini adalah **materi musyawarah/review ulama, BUKAN fatwa**.
> Semua formulasi di bawah adalah OPSI TEKNIS aplikasi; hukum tiap opsi
> diputuskan ulama. Tim app tidak memvonis salah satu opsi lebih utama.

- Tanggal penyusunan: 24 Sep 2026
- Modul terkait: `/admin/zakat` (implementasi 18 Sep 2026, commit `806984f`)

### A. Latar Belakang
Modul zakat tijarah berfungsi: menghitung harta dagang
(modal + laba + piutang − hutang), menilai "wajib/belum" vs nisab
(85 g emas × harga emas), dan menyimpan riwayat zakat. Tiga aspek
formula memuat pilihan fiqhi yang belum ditashih ulama:
(a) akumulasi laba per haul, (b) verifikasi harga emas, (c) penilaian
modal (HPP vs nilai pasar). Dokumen ini merumuskan ketiganya sebagai
pertanyaan terbuka untuk ulama.

### B. Rumusan Masalah (3 Sub-Poin)

#### 1. Akumulasi Laba per Haul
- **Formula saat ini:** periode laba = sejak `last_zakat_date` (zakat
  terakhir DIBAYAR), bila kosong → `haul_start_date`, bila kosong →
  awal bulan WIB berjalan. Catatan "belum wajib" TIDAK me-reset siklus,
  jadi laba terakumulasi sejak pembayaran terakhir (bukan sejak
  awal haul tetap 1 tahun).
- **Masalah:** (1) aplikasi tidak mengunci haul 1 tahun — bila zakat
  dibayar tiap bulan, periode laba pendek (konservatif pada angka
  laba, tetapi penghitungan harta diulang sebulan sekali); (2)
  istilah "laba periodik" bukan konsep baku fiqh — standar zakat
  tijarah umumnya = harta dagang SELURUH (modal + untung) pada
  jatuh haul, bukan laba per periode.
- **Pertanyaan:** apakah akumulasi-laba-sejak-pembayaran-terakhir
  sah sebagai mekanik praktis? Atau wajib memakai haul tetap 1 tahun
  (periode laba = sejak awal haul, tidak peduli kapan dibayar)?
- **Referensi fiqh:** Mughni (Ibnu Qudamah), kitab zakaat — bab
  zakat al-tijarah (haul harta dagang); DSN-MUI Fatwa No. 8/2008
  (haul zakat tijarah = 1 tahun; harta = total aset dagang).

#### 2. Verifikasi Harga Emas
- **Formula saat ini:** nisab = `nishab_gram` (default 85) ×
  `gold_price` — harga per gram diisi manual oleh admin. Default
  `gold_price = 0` (belum diisi) → status otomatis "belum wajib".
  Tidak ada sumber harga yang direkam, tidak ada catatan kapan
  harga terakhir dicek.
- **Masalah:** harga emas basi → nisab terdistorsi (harga naik
  tapi tak diperbarui → nisab rendah → zakat diminta "terlalu
  cepat"; sebaliknya → zakat terlambat). Verifikasi saat ini
  = kebiasaan admin, tanpa audit.
- **Pertanyaan:** (a) sumber harga emas yang sah utk nisab
  (Antam? spot dunia? harga daerah)? (b) frekuensi verifikasi
  + pencatatan di mana? (c) bila admin ragu, opsi konservatif
  yang mana (pakai harga tertinggi yang mungkin / tunda zakat)?
- **Referensi fiqh:** nisab emas = 20 dinar (20 mithqal,
  ~85 g menurut ukur Hijaz — angka 85 g terkonfirmasi DSN-MUI
  Fatwa No. 8/2008); bab qiyas nila' al-fudhala' (Mughni,
  kitab zakaat).
- **Karat (riset 24 Sep 2026 — Muktamar NU ke-35 + Syafi'i):**
  emas 14 karat TIDAK sah sebagai standar nisab (bukan emas murni;
  nisab emas campuran diperhitungkan dr kandungan emas murninya).
  `gold_price` di app WAJIB = harga emas **24 karat (murni)**;
  label UI /admin/zakat sudah disetel ("Harga emas 24 karat per
  gram (Rp)").

#### 3. Modal: HPP vs Nilai Pasar
- **Formula saat ini:** modal = Σ stok × HPP (`cost_price`)
  produk aktif — nilai PEROLEHAN, bukan harga jual.
- **Masalah:** bila harga pasar > HPP, harta dagang kurang
  terhitung → nisab lebih mudah terpenuhi & zakat kecil.
  Ada dua pendekatan baku: (a) **modal murni** (hanya untung
  yang dizakati — sebagian Hanafi), (b) **modal + untung**
  (mayoritas & DSN-MUI 8/2008: total harta dagang) — dan dalam
  opsi (b), persediaan dinilai pada HPP atau harga jual saat
  jatuh haul?
- **Pertanyaan:** memakai modal HPP sekarang (paling rendah,
  konservatif utk harta) cukup, atau harus dipindah ke
  nilai pasar / hanya-untung?
- **Referensi fiqh:** Mughni, kitab zakaat, bab zakat al-budhl
  (barang dagangan dinilai berapa); 'Umdah al-Ahkam, bab
  nishab al-tijarah.

### C. Data Teknis
Source: `src/app/api/zakat/route.ts` → `computeZakat()` (L35–123):

```
modal    = Σ stok × cost_price (produk aktif, stok > 0)
laba     = Σ sales.total − Σ COGS sale_items, periode = period_start
period_start = last_zakat_date || haul_start_date || awal-bulan WIB
piutang  = Σ debts.remaining (status open)
hutang   = Σ payables.remaining (status open)
total    = modal + laba + piutang − hutang
nishab   = round(nishab_gram × gold_price)
wajib    = gold_price > 0 && total ≥ nishab
zakat    = round(total × zakat_rate%)   [default 2.5]
```

Setting (`ZAKAT_SETTING_DEFAULTS`, `src/db.ts`): `gold_price='0'`,
`nishab_gram='85'`, `zakat_rate='2.5'`, `haul_start_date=''`,
`last_zakat_date=''`.
Catatan penting: zakat TIDAK otomatis dicatat ke kas — hanya
perhitungan + riwayat (`zakat_history`); pelunasan tanggung
admin. P&L V1 (`src/lib/keuangan.ts`) = laporan akuntansi,
terpisah dari rumus zakat.

### D. Referensi Fiqh (untuk panel ulama)
| No | Kitab / Rujukan | Bab / Topik |
|----|-----------------|-------------|
| 1 | Mughni (Ibnu Qudamah) | Kitab Zakaat, bab zakat al-tijarah & haul |
| 2 | 'Umdah al-Ahkam (Muwaffaqi) | Bab nishab al-tijarah & penilaian harta |
| 3 | DSN-MUI Fatwa No. 8/2008 | Zakat tijarah: nisab 85 g, kadar 2,5%, haul 1 th, harta = total aset dagang |
| 4 | (opsi) Al-Hawi / Kasyaf al-Qina' | Nila' budhl: perolehan vs pasar saat jatuh haul |

Catatan: halaman spesifik diserahkan panel ulama melengkapi;
tabel ini hanya peta arah baca.

### E. Pertanyaan Kanggo Ulama (ringkas, 3)
1. **Haul:** apakah mekanik "laba terakumulasi sejak zakat
   terakhir dibayar" boleh, atau harus haul 1 tahun tetap
   (periode laba sejak `haul_start_date`)?
2. **Harga emas:** sumber resmi apa (Antam/spot/daerah),
   frekuensi verifikasi + pencatatan di mana, dan opsi
   konservatif bila ragu? (Karat: sudah terjawab — 24 karat murni, Muktamar NU ke-35; label UI sudah disetel)
3. **Modal:** HPP (status quo) sah, atau harus nilai pasar /
   pendekatan hanya-untung?

### F. Lampiran
- `src/app/api/zakat/route.ts` (formula), `src/db.ts`
  (ZAKAT_SETTING_DEFAULTS), `/admin/zakat`
  (`src/components/admin/zakat-client.tsx`),
  `src/lib/keuangan.ts` (P&L V1),
  `src/app/api/zakat/settings/route.ts`
- `SYARIAH-CHECKLIST.md` (item 3 + keputusan P3),
  `MEMORY.md` (entri 18 Sep zakat)
- Contoh angka (diisi saat presentasi): modal Rp …, laba Rp …,
  harta Rp …, nisab (emas Rp …/g) Rp …, zakat 2,5% Rp …

**Format tashih:** [ ] Diterima dengan catatan | [ ] Diterima
| [ ] Perlu revisi formula (sebutkan) | [ ] Ditolak —
zakat hanya manual
Catat: nama panel/lembaga + tanggal → `MEMORY.md`.