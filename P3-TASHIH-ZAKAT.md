# DOKUMEN TASHIH ULAMA — ZAKAT TIJARAH
## Kopontren Al Ittihad

> **Prinsip: "Syariah nomer 1, fitur nomer 2."**
> Dokumen ini adalah **materi musyawarah/review ulama, BUKAN fatwa**.
> Semua formulasi di bawah adalah OPSI TEKNIS aplikasi; hukum tiap opsi
> diputuskan ulama. Tim app tidak memvonis salah satu opsi lebih utama.

- Tanggal penyusunan: 24 Sep 2026
- Modul terkait: `/admin/zakat` (implementasi 18 Sep 2026, commit `806984f`)
- **STATUS (26 Sep 2026): PROVISIONAL.** Implementasi P3 Step 2 sudah jalan
  di aplikasi (haul anchor, log standar emas `zakat_gold_standards`,
  `valuation_mode` market/hpp). Semua posisi — termasuk koreksi sitasi
  DSN-MUI 8/2008 → MUI Fatwa No. 78/2023 [judul: menunggu pengasuh] —
  menunggu tashih pengasuh; subject to correction.
- **STATUS (30 Sep 2026): TASHIH TERJAWAB — DITERIMA (GUS FI).**
  Soal 1 **KOREKSI**: anchor haul = **22 Okt 2025** (mulai toko
  koperasi berjalan / niat berdagang); haul pertama jatuh **22 Okt
  2026**; musyawarah boleh memutuskan **ta'jil**; nilai zakat selalu
  bisa dilihat "seolah sudah haul", dengan keterangan "belum wajib
  zakat karena belum nishab" bila harta di bawah nisab. Soal 2
  **SETUJU**: harga emas **terendah** (dasar nisab). Soal 3
  **BELUM DIPILIH** (catatan: B — nilai pasar saat jatuh haul).
  Keputusan tashih **DITERIMA** — manut rumusan Nahdliyin ulama &
  hasil bahtsul masail pondok pesantren. Ter-rekam:
  `docs/akuntansi-keputusan.md` + revisi `docs/akuntansi-proposal.md`
  §15.4 (commit terpisah). Open: Soal 3 (modal) + verifikasi judul
  MUI Fatwa No. 78/2023.

- **STATUS (1 Okt 2026): TASHIH LEPAS PENUH (GUS FI).** Soal 3
  (modal) **DIPUTUSKAN Opsi B = modal + untung, harga pasar saat
  jatuh haul**; `valuation_mode` = **market FINAL** (bukan
  provisional lagi). Ke-3 soal P3 kini terjawab: Soal 1 (koreksi,
  30 Sep) + Soal 2 (setuju, 30 Sep) + Soal 3 (Opsi B, 1 Okt).
  Standar tetap: manut rumusan Nahdliyin ulama & hasil bahtsul
  masail pondok pesantren. Ter-rekam:
  `docs/akuntansi-keputusan.md` (seksi "Keputusan P3" — Soal 3) +
  `docs/akuntansi-proposal.md` §15.4.

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
  zakat al-tijarah (haul harta dagang); MUI Fatwa No. 78/2023
  [judul: menunggu pengasuh] (zakat tijarah: haul 1 tahun; harta =
  total aset dagang). (Koreksi 26 Sep 2026: referensi lama tertulis
  "DSN-MUI Fatwa No. 8/2008" — keliru; No. 08/DSN-MUI/IV/2000 =
  pembiayaan musyarakah, bukan zakat; DSN-MUI = muamalah/keuangan
  syariah, bukan lembaga fatwa zakat — riset 26 Sep 2026.)
- **Jawaban provisional aplikasi (26 Sep, menunggu tashih):** periode
  laba di-ANCHOR pada `haul_start_date` (haul tetap 1 tahun);
  `last_zakat_date` tidak me-reset siklus (pembayaran = ta'jil) —
  hanya fallback anchor bila haul start kosong + audit. Akumulasi
  (accrual) proporsional hari haul ditampilkan di UI.

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
  ~85 g menurut ukur Hijaz — angka 85 g terkonfirmasi MUI Fatwa
  No. 78/2023 [judul: menunggu pengasuh]; koreksi 26 Sep 2026 dari
  referensi lama "DSN-MUI Fatwa No. 8/2008" yang keliru); bab qiyas
  nila' al-fudhala' (Mughni, kitab zakaat).
- **Karat (riset 24 Sep 2026 — Muktamar NU ke-35 + Syafi'i):**
  emas 14 karat TIDAK layak sebagai standar nisab (bukan emas murni;
  nisab emas campuran diperhitungkan dr kandungan emas murninya).
  Posisi aplikasi (PROVISIONAL, menunggu tashih): `gold_price`
  memakai standar **24 karat (murni)**; label UI /admin/zakat
  di-soften menjadi "Standar emas (provisional 24K — menunggu
  tashih)".
- **Jawaban provisional aplikasi (26 Sep, menunggu tashih):** log
  `zakat_gold_standards` (append-only: karat, price_per_gram, source,
  price_date, decided_by) — entri terbaru = standar terkini;
  settings `gold_price` = fallback legacy. Diverifikasi: judul MUI
  Fatwa No. 78/2023 untuk pengasuh (TODO).

#### 3. Modal: HPP vs Nilai Pasar
- **Formula saat ini:** modal = Σ stok × HPP (`cost_price`)
  produk aktif — nilai PEROLEHAN, bukan harga jual.
- **Masalah:** bila harga pasar > HPP, harta dagang kurang
  terhitung → nisab lebih mudah terpenuhi & zakat kecil.
  Ada dua pendekatan baku: (a) **modal murni** (hanya untung
  yang dizakati — sebagian Hanafi), (b) **modal + untung**
  (mayoritas & MUI Fatwa No. 78/2023 [judul: menunggu pengasuh]:
  total harta dagang) — dan dalam opsi (b), persediaan dinilai
  pada HPP atau harga jual saat jatuh haul?
- **Pertanyaan:** memakai modal HPP sekarang (paling rendah,
  konservatif utk harta) cukup, atau harus dipindah ke
  nilai pasar / hanya-untung?
- **Jawaban provisional aplikasi (26 Sep, menunggu tashih):**
  setting `valuation_mode`: 'market' (default; V1 proxy = harga
  jual `products.base_price`; ledger harga pasar menyusul P4) |
  'hpp' (fallback konservatif: `cost_price`). Default market
  selaras opsi (b); bila pengasuh menilai modal-untung (a),
  cukup ganti default + kurangi basis (revisi rumus, bukan
  migrasi data).
- **Jawaban FINAL (1 Okt 2026, GUS FI — Opsi B):** modal + untung,
  persediaan dinilai pada **harga pasar saat jatuh haul**;
  `valuation_mode` = **market FINAL** (default harga jual V1;
  ledger harga pasar menyusul P4). Opsi (b) terpilih = mayoritas
  ulama (Syafi'i, Maliki, Hanbali). Aspek modal kini **final** —
  bukan provisional lagi.
- **Referensi fiqh:** Mughni, kitab zakaat, bab zakat al-budhl
  (barang dagangan dinilai berapa); 'Umdah al-Ahkam, bab
  nishab al-tijarah.

### C. Data Teknis
Source: `src/app/api/zakat/route.ts` → `computeZakat()` (P3 Step 2,
sejak 26 Sep 2026):

```
modal      = Σ stok × (mode 'market': base_price [V1: proxy harga
               pasar] | 'hpp': cost_price) — produk aktif, stok > 0
laba       = Σ sales.total − Σ COGS sale_items, periode = anchor
anchor     = haul_start_date (di-anchor, P3-Q1 provisional;
               pembayaran ta'jil TIDAK me-reset)
               || last_zakat_date (fallback) || awal-bulan WIB
piutang    = Σ debts.remaining (status open)
hutang     = Σ payables.remaining (status open)
total      = modal + laba + piutang − hutang
nishab     = round(nishab_gram × harga_efektif)
harga_efektif = standar emas TERKINI (log zakat_gold_standards,
               ORDER BY price_date DESC) bila ada, selain itu
               settings.gold_price (fallback legacy)
wajib      = harga_efektif > 0 && total ≥ nishab
zakat      = round(total × zakat_rate%)   [default 2.5]
accrued    = zakat × (hari_sejak_anchor / 365, cap 1) — provisional
```

Setting (`ZAKAT_SETTING_DEFAULTS`, `src/db.ts`): `gold_price='0'`,
`nishab_gram='85'`, `zakat_rate='2.5'`, `haul_start_date=''`,
`last_zakat_date=''`, `valuation_mode='market'`.
Catatan penting: zakat TIDAK otomatis dicatat ke kas — hanya
perhitungan + riwayat (`zakat_history`); pelunasan tanggung
admin. P&L V1 (`src/lib/keuangan.ts`) = laporan akuntansi,
terpisah dari rumus zakat.

### D. Referensi Fiqh (untuk panel ulama)
| No | Kitab / Rujukan | Bab / Topik |
|----|-----------------|-------------|
| 1 | Mughni (Ibnu Qudamah) | Kitab Zakaat, bab zakat al-tijarah & haul |
| 2 | 'Umdah al-Ahkam (Muwaffaqi) | Bab nishab al-tijarah & penilaian harta |
| 3 | MUI Fatwa No. 78/2023 [judul: menunggu pengasuh] | Zakat tijarah: nisab 85 g, kadar 2,5%, haul 1 th, harta = total aset dagang |
| 4 | (opsi) Al-Hawi / Kasyaf al-Qina' | Nila' budhl: perolehan vs pasar saat jatuh haul |

Catatan: halaman spesifik diserahkan panel ulama melengkapi;
tabel ini hanya peta arah baca.

**Koreksi sitasi (riset 26 Sep 2026):** baris 3 semula tertulis
"DSN-MUI Fatwa No. 8/2008" — keliru: No. 08/DSN-MUI/IV/2000 adalah
fatwa pembiayaan musyarakah, dan DSN-MUI (Sharia Board MUI) berdomain
muamalah/keuangan syariah (bank, asuransi, pasar modal), BUKAN fatwa
zakat (domain Komisi Fatwa MUI). Referensi diganti "MUI Fatwa No.
78/2023 [judul: menunggu pengasuh]" — nomor ini diberikan tim (belum
terverifikasi); judul & substansi harus diverifikasi pengasuh sebelum
dokumen ini dipakai dasar tashih.

### E. Pertanyaan Kanggo Ulama (ringkas, 3)
1. **Haul:** apakah mekanik "laba terakumulasi sejak zakat
   terakhir dibayar" boleh, atau harus haul 1 tahun tetap
   (periode laba sejak `haul_start_date`)?
   *Provisional aplikasi (26 Sep): haul tetap 1 tahun via
   `haul_start_date` (anchor); pembayaran = ta'jil (tak me-reset).*
2. **Harga emas:** sumber resmi apa (Antam/spot/daerah),
   frekuensi verifikasi + pencatatan di mana, dan opsi
   konservatif bila ragu? (Karat: posisi provisional — 24 karat
   murni, riset Muktamar NU ke-35; menunggu tashih)
   *Provisional aplikasi: log `zakat_gold_standards` (append-only;
   entri = {karat, harga/g, sumber, tgl, oleh}); Diverifikasi:
   judul MUI Fatwa No. 78/2023 untuk pengasuh (TODO).*
3. **Modal:** HPP (status quo) sah, atau harus nilai pasar /
   pendekatan hanya-untung?
   *Provisional aplikasi: `valuation_mode` market (default) | hpp
   (fallback); V1 market = proxy harga jual.*
   *FINAL (1 Okt 2026, GUS FI): Opsi B — modal + untung, harga
   pasar saat jatuh haul; `valuation_mode` = market FINAL.*

### F. Lampiran
- `src/app/api/zakat/route.ts` (formula), `src/db.ts`
  (ZAKAT_SETTING_DEFAULTS + DDL v18 `zakat_gold_standards`),
  `/admin/zakat` (`src/components/admin/zakat-client.tsx`),
  `src/lib/keuangan.ts` (P&L V1),
  `src/app/api/zakat/settings/route.ts`
- P3 Step 2 (26 Sep, provisional): `src/lib/zakat-valuation.ts`
  (penilaian/accrual/anchor — modul murni),
  `src/app/api/zakat/gold-standards/route.ts` (log append-only),
  `scripts/test-zakat.ts` (7 skenario baru B8)
- `SYARIAH-CHECKLIST.md` (item 3 + keputusan P3 + Step 2),
  `MEMORY.md` (entri 18 Sep zakat + entri 26 Sep P3 Step 2)
- Contoh angka (diisi saat presentasi): modal Rp …, laba Rp …,
  harta Rp …, nisab (emas Rp …/g) Rp …, zakat 2,5% Rp …

**Format tashih:** [ ] Diterima dengan catatan | [ ] Diterima
| [ ] Perlu revisi formula (sebutkan) | [ ] Ditolak —
zakat hanya manual
Catat: nama panel/lembaga + tanggal → `MEMORY.md`.

### G. Jawaban Tashih (30 Sep 2026 — Gus Fi)

```
JAWABAN TASHIH — P3 ZAKAT TIJARAH
Tanggal: 30 September 2026
Oleh: Gus Fi (Ali Makfi)

1. Soal 1 — Haul (masa zakat) → KOREKSI
   Catatan: zakat dihitung haul mulai toko koperasi berjalan (niat
   berdagang), yaitu 22 Oktober 2025. dan musyawarah bisa
   memutuskan untuk ta'jil zakat. walaupun nilai perhitungan zakat
   sebenarnya muncul saat haul 22 Oktober 2026. jadi haul tidak
   dihitung dari pembayaran zakat terakhir. kami hanya pengin tiap
   waktu bisa melihat berapa zakat yang harus dibayar saat itu
   juga (dibayangkan sudah haul, walaupun belum). dan perhitungan
   zakat ini tetap muncul dengan mengesampingkan nishab. maaf,
   bukan kami mengabaikan. tapi tetap ada keterangan belum wajib
   zakat karena belum nishab, misal.
2. Soal 2 — Harga emas (nisab) → SETUJU
   Catatan: harga emas terendah
3. Soal 3 — Modal (barang dagangan dinilai berapa) → (BELUM
   DIPILIH)
   Catatan: B
4. Keputusan Tashih → DITERIMA
   Catatan: yang penting manut rumusan Nahdliyin ulama lan hasil
   bahtsul masail pondok pesantren

Ringkasan: 1 Setuju, 0 Ora Setuju, 1 Koreksi
Perlu ditindaklanjuti: 1
```

**Tindak lanjut (tim aplikasi):**
- Soal 1: seed `haul_start_date` = `2025-10-22`; haul pertama
  jatuh `2026-10-22`; penampang "seolah sudah haul" + keterangan
  nishab di UI `/admin/zakat`.
- Soal 2: `harga_efektif` = minimum harga tercatat di
  `zakat_gold_standards` (periode haul).
- Soal 3: DIPUTUSKAN 1 Okt 2026 (GUS FI): Opsi B = modal + untung, harga pasar saat jatuh haul;
  `valuation_mode` = market FINAL (switch implementasi di commit F3.4+; default sudah `market`).
- Rekam keputusan: `docs/akuntansi-keputusan.md` (seksi "Keputusan
  P3") + revisi `docs/akuntansi-proposal.md` §15.4 — commit
  terpisah; implementasi spesifikasi = komit F3.4+.

### H. Jawaban Tashih Suplemen (1 Okt 2026 — Gus Fi)

```
JAWABAN SUPLEMEN — P3 ZAKAT TIJARAH (Soal 3)
Tanggal: 1 Oktober 2026
Oleh: Gus Fi (Ali Makfi)

3. Soal 3 — Modal (barang dagangan dinilai berapa) → Opsi B (FINAL)
   Catatan: modal + untung (mayoritas ulama: Syafi'i, Maliki,
   Hanbali); persediaan dinilai pada harga pasar saat jatuh haul.
   `valuation_mode` = market FINAL (default harga jual V1).
```

**Catatan teknis:** aspek modal kini final (bukan provisional);
implementasi spesifikasi + switch `valuation_mode` = commit F3.4+.