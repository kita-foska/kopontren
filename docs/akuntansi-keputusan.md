# Keputusan F3.3 — Jawaban Tashih Proposal Akuntansi (Level C)

> **Jawaban: Gus Fi (Ali Makfi) · 30 September 2026**
> Merespons `docs/akuntansi-proposal.md` §13 (14 poin) via antarmuka
> tashih interaktif `/tutorial/akuntansi-proposal`
> (`docs/AKUNTANSI-PROPOSAL.html`, §13 — tombol "Copy Jawaban Tashih").
>
> **Alur (aturan F3.3, §13 proposal):** Cline presentasi dokumen →
> Gus Fi tinjau + putuskan **langsung** (pengasuh mengikuti
> keputusan; tidak ada forum pengurus+pengasuh terpisah) →
> keputusan di-rekam di berkas ini (**commit terpisah**) →
> revisi proposal bila perlu (**commit terpisah**) → F3.4+ mulai.
>
> **Prinsip: syariah nomer 1, fitur nomer 2.** Cline TIDAK
> memutuskan fiqih/standar — semua nilai syariah diputuskan Gus Fi.

---

## Ringkasan

**12 Setuju · 0 Ora Setuju · 2 Koreksi**
Perlu ditindaklanjuti: item **6** (denda) & item **14** (wakaf).

| # | Item (opsi yang disajikan · rujukan proposal) | Jawaban | Catatan Gus Fi |
|---|---|---|---|
| 1 | Nisbah mudharabah & musyarakah — % per akad, input manual · §6.5 | **SETUJU** | - |
| 2 | Rate zakat (mal/tijarah/fitrah) + mustahik — angka + daftar mustahik sah; finalkan P3 (24K/market/haul) · §8.3 | **SETUJU** | - |
| 3 | Margin murabahah — % / nominal per akad; basis pengakuan · §6.5 | **SETUJU** | - |
| 4 | Rasio distribusi SHU — cadangan umum/khusus/jasa anggota/dibagi + periodik · §7.2 | **SETUJU** | - |
| 5 | Rate ijarah — nominal per periode per akad · §6.5 | **SETUJU** | - |
| 6 | Denda keterlambatan — ada/tidak; nominal/rasio; ke kas sosial · §6.4 | **KOREKSI** | "ini tidak usah, bisa dengan yang lain. tidak denda." |
| 7 | Penerima LK formal (CALK/LK 5) — siapa & frekuensi · §5.5 | **SETUJU** | - |
| 8 | Tanggal N buku pembuka + angka saldo pembuka · §10 | **SETUJU** | - |
| 9 | Sumber teks PAP (+ status ED SAK Koperasi) · §9 | **SETUJU** | - |
| 10 | Simpanan wajib + ketentuan tarik sukarela · §7.2 | **SETUJU** | - |
| 11 | Periode closing jurnal + metode penyusutan & umur aset (1050/1060) · §3.2.6 | **SETUJU** | - |
| 12 | Pola pencairan mudharabah/musyarakah (1080 vs 2040) · §6.4 | **SETUJU** | - |
| 13 | Switch label entitas ("Kopontren (dalam proses)" → resmi, `coop_registered`) · §1.1 | **SETUJU** | - |
| 14 | Revisi keputusan #7 (wakaf) — bila tidak lagi ditunda, scope tambahan PSAK 112 · §8.2 | **KOREKSI** | "wakaf aktif" |

---

## Tindak Lanjut (koreksi #6 & #14)

### #6 — Denda keterlambatan: TIDAK ADA

Gus Fi memutuskan skema denda keterlambatan **tidak diterapkan**
("ini tidak usah, bisa dengan yang lain. tidak denda."). Penanganan
keterlambatan bila diperlukan = mekanisme lain di luar denda,
**di luar scope proposal GL ini** — diputuskan terpisah bila
dibutuhkan (aspek fiqih-nya, bila mau, tetap tashih ulama).

Dampak teknis (direvisi di `docs/akuntansi-proposal.md`, commit
terpisah):
- Akun **5050** (Denda/Keterlambatan clearing) **tidak diaktifkan** —
  tetap di-seed dgn `status=closed` (akun tidak dihapus, aturan §2.7
  "hapus = TIDAK ADA"), tidak ada fitur input denda.
- Baris "Denda diterima" (§6.4) & parameter denda (§6.5) dicoret.
- Kolom `kind` tabel `zis`: `'zakat'|'infak'|'sedekah'|'wakaf'`
  ('denda' keluar; 'wakaf' masuk — lihat #14).
- LKA/CALK: sebutan denda pada kas sosial (1100) & struktur LKA
  dihapus (beban operasi → "Laba Sebelum ZIS"; ZIS = 5090+5100+6030).
- Roadmap: **W3.5** (input denda) dialokasikan ulang → scope wakaf
  (lihat #14) — total commit tetap 32.

### #14 — Wakaf: AKTIF (revisi keputusan #7)

Keputusan #7 (29 Sep: "B — Belum sekarang, ditunda; hook §8.2")
**di-revisi**: wakaf **aktif** → scope tambahan PSAK 112 berlaku.

Dampak teknis:
- Akun **1120** (Aset Wakaf), **4100** (Wakaf Masuk), **6020**
  (Aset Wakaf, grup 6xx) = **AKTIF** (bukan placeholder ditunda).
- Booking = hook yang sudah disiapkan §8.2: input `kind='wakaf'` di
  UI `/admin/zis` + jurnal manual ke 1120/4100/6020.
- Invarian anti-campur **tetap**: wakaf tidak dicampur kas toko
  (rekon #16: 1010+1020 = kas V1; 1100 terpisah).
- Roadmap: **W3.5** kini = fitur wakaf aktif + test.

### Item Setuju — yang dikunci

12 item SETUJU mengunci **bentuk keputusan** yang disajikan §13
(input manual per akad utk nisbah/margin/rate; angka zakat P3
24K/market/haul + mustahik **final** via #2; penerima LK formal;
tanggal N; sumber teks PAP; simpanan wajib/sukarela; periode closing
+ penyusutan; pola booking mudharabah/musyarakah; label entitas).
Konsekuensi:
- Nilai yang masih "placeholder teknis" kini menjadi ketentuan.
- **#2 = tashih P3 turun** → larangan prabatasih R6 lepas utk modul
  zakat: jembatan `zakat_history` boleh di-switch + badge
  "provisional" dihapus, **saat commit implementasi** (F3.4+),
  bukan sekarang.
- **F3.4+ siap mulai** sesuai roadmap §12 (Wave 1, 6 minggu).

---

## Lampiran — Teks Jawaban Tashih (asli, copy dari §13)

```
JAWABAN TASHIH — AKUNTANSI PROPOSAL (F3.3)
Tanggal: 30 September 2026
Oleh: Gus Fi (Ali Makfi)

1. Nisbah mudharabah & musyarakah → SETUJU
2. Rate zakat (mal/tijarah/fitrah) + mustahik → SETUJU
3. Margin murabahah → SETUJU
4. Rasio distribusi SHU → SETUJU
5. Rate ijarah → SETUJU
6. Denda keterlambatan → KOREKSI (ini tidak usah, bisa dengan
   yang lain. tidak denda.)
7. Penerima LK formal (CALK/LK 5) → SETUJU
8. Tanggal N buku pembuka + angka saldo pembuka → SETUJU
9. Sumber teks PAP (+ status ED SAK Koperasi) → SETUJU
10. Simpanan wajib + ketentuan tarik sukarela → SETUJU
11. Periode closing jurnal + penyusutan → SETUJU
12. Pola pencairan mudharabah/musyarakah → SETUJU
13. Switch label entitas → SETUJU
14. Revisi keputusan #7 (wakaf) → KOREKSI (wakaf aktif)

Ringkasan: 12 Setuju, 0 Ora Setuju, 2 Koreksi
Perlu ditindaklanjuti: 6, 14
```

---

# Keputusan P3 — Tashih Zakat Tijarah (dokumen `P3-TASHIH-ZAKAT`, 30 Sep 2026)

> **Jawaban: Gus Fi (Ali Makfi) · 30 September 2026**
> Merespons `P3-TASHIH-ZAKAT.md` / `P3-TASHIH-ZAKAT.html` (versi
> HTML 25 Sep, commit `81db5e5`; 3 soal + blok keputusan, via
> tombol "Copy Jawaban" di dokumen tersebut).
>
> **Ringkasan: 1 Setujuan · 0 Ora Setujuan · 1 Koreksi (Soal 1)**;
> Soal 3 **BELUM DIPILIH** (catatan: opsi B).
> **Keputusan Tashih: DITERIMA** — catatan: *"yang penting manut
> rumusan Nahdliyin ulama lan hasil bahtsul masail pondok
> pesantren."*

## Ringkasan Jawaban

| # | Soal (opsi yang disajikan) | Jawaban | Catatan Gus Fi |
|---|---|---|---|
| 1 | Haul (masa zakat) — A: mekanik sejak pembayaran terakhir · B: haul tetap 1 tahun sejak awal haul | **KOREKSI** | zakat dihitung haul mulai toko koperasi berjalan (niat berdagang) = **22 Oktober 2025**; musyawarah boleh memutuskan **ta'jil**; haul tidak dihitung dari pembayaran zakat terakhir; nilai perhitungan zakat selalu bisa dilihat saat itu juga (**dibayangkan sudah haul**, walau belum); tetap tampil keterangan "belum wajib zakat karena belum nishab" bila di bawah nisab |
| 2 | Harga emas (nisab) — 24K provisional + log `zakat_gold_standards` | **SETUJU** | **harga emas terendah** |
| 3 | Modal (barang dagangan dinilai berapa) — A: modal HPP (kondisi saat ini) · B: nilai pasar saat jatuh haul | **(BELUM DIPILIH)** | B |
| 4 | Keputusan Tashih | **DITERIMA** | yang penting manut rumusan Nahdliyin ulama lan hasil bahtsul masail pondok pesantren |

Perlu ditindaklanjuti: item **1** (koreksi) & item **3** (belum dipilih).

---

## Tindak Lanjut

### Soal 1 — Haul: KOREKSI (anchor tetap 22 Okt 2025)

- **Anchor haul = `2025-10-22`** — mulai toko koperasi berjalan
  (niat berdagang), **bukan** sejak pembayaran zakat terakhir &
  **bukan** auto-awal-bulan. Seed `zakat_settings.haul_start_date`
  = `2025-10-22`.
- **Haul pertama jatuh: 22 Okt 2026** (1 tahun penuh) — saat itu
  nilai zakat "sebenarnya" muncul.
- **Ta'jil**: musyawarah boleh memutuskan pembayaran zakat lebih
  awal; pembayaran **tidak me-reset** anchor (mekanik provisional
  P3 Step 2 sudah sejalan — tidak berubah).
- **Tampilan baru — "seolah sudah haul"**: nilai zakat (total
  harta × 2,5%, basis haul penuh) **selalu tampil** di UI apa pun
  status haul ("kami hanya pengin tiap waktu bisa melihat berapa
  zakat yang harus dibayar saat itu juga"). Bila harta < nisab,
  nilai tetap tampil + keterangan **"belum wajib zakat karena
  belum nishab"** (bukan dinol-kan; "mengabaikan nishab" = tidak
  memblokir tampilan, bukan memvonis wajib).
- Dampak teknis = spesifikasi modul zakat (implementasi di commit
  F3.4+, sesuai aturan larangan prabatasih: spesifikasi dulu, kode
  menyusul): seed `haul_start_date`; UI `/admin/zakat` penampang
  "seolah sudah haul" + note bawah nisab; `test:zakat` update.

### Soal 2 — Harga emas: SETUJU (harga terendah)

- Nisab = `nishab_gram` (85 g, 24K murni — final via F3.3 #2) ×
  **harga emas terendah** (posisi hati-hati/konservatif dari opsi
  §B.2 dokumen P3). Basis = log `zakat_gold_standards`
  (append-only, verifikasi berkala) — harga efektif diambil dari
  **minimum** harga tercatat dalam jendela/periode haul, bukan
  entri terbaru.
- Dampak teknis: rumus `harga_efektif` (skala: entri terbaru →
  **terendah**) + UI keterangan "harga terendah periode ini =
  Rp …" — implementasi commit F3.4+.

### Soal 3 — Modal: BELUM DIPILIH (catatan B)

- Opsi **B = nilai pasar saat jatuh haul (modal + untung)** —
  dicatat tapi **belum final**. `valuation_mode` tetap posisi
  provisional (default `market` = proxy harga jual V1, yang paling
  dekat dengan B; `hpp` = A) sampai jawaban turun. Aspek ini
  tetap berlabel "provisional"; aspek lain (haul/nisab/kadar)
  sudah final.

### Yang dikunci (Soal 2 + keputusan DITERIMA)

- **Standar normatif**: seluruh rumusan zakat mengikuti **rumusan
  Nahdliyin ulama & hasil bahtsul masail pondok pesantren**
  (catatan keputusan) — rujukan tetap untuk semua angka syariah
  zakat (nisab 85 g · kadar 2,5% · haul 1 tahun).
- Soal 2 + kadar 2,5% + nisab 85 g = **final**. Haul 1 tahun
  tetap = **final** (mekanik anchor: koreksi Soal 1 di atas).
- **Larangan prabatasih (R6) utk modul zakat LEPAS sebatas aspek
  yang terjawab**: jembatan `zakat_history` boleh di-switch +
  badge "provisional" dihapus saat commit implementasi F3.4+
  (**kecuali aspek modal/Soal 3** yang masih menunggu).

## Open Items

1. **Soal 3 (modal)**: jawaban final (A: HPP / B: nilai pasar /
   hanya-untung) — menunggu tashih lanjutan (pola commit
   terpisah, seperti F3.3).
2. **Verifikasi judul MUI Fatwa No. 78/2023** utk pengasuh
   (TODO lama — tetap terbuka; koreksi sitasi §D dokumen P3).

## Lampiran — Teks Jawaban Tashih (asli, copy dari `P3-TASHIH-ZAKAT.html`)

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

---

# Keputusan P4 — Tashih Konsinyasi / Wakalah bil Ujrah (dokumen `P4-PROPOSAL-KONSINYASI`, 30 Sep 2026)

> **Jawaban: Gus Fi (Ali Makfi) · 30 September 2026**
> Merespons `P4-PROPOSAL-KONSINYASI.md` / `P4-PROPOSAL-KONSINYASI.html`
> (versi HTML 25 Sep; 3 soal + tindak lanjut, via blok "Copy Jawaban
> Tashih" di dokumen tersebut).
>
> **Ringkasan: 3 Setujuan · 0 Ora Setujuan · 0 Koreksi.**
> Aspek larangan prabatasih R6 (P4) = **LEPAS** — A1.1 released
> (ujrah → pendapatan, eksekusi commit terpisah saat F3.4+).
> Sisa open: dasar hitung ujrah V1 → konfirmasi ulama.

## Ringkasan Jawaban

| # | Soal (opsi yang disajikan) | Jawaban | Catatan Gus Fi |
|---|---|---|---|
| 1 | Skema komisi = **wakalah bil ujrah** (ujrah tercatat SAAT terjual; tagihan pemilik neto komisi; rate snapshot per titipan, tanpa perubahan sepihak) — sesuai implementasi commit `4f12818` + P4-B fleksibel | **SETUJU** | - |
| 2 | Komisi boleh **berbeda-beda per kesepakatan (antardhin)** — input per titipan + default per-pemilik (`konsinyasi_owner_rates`); default global 20; titipan berjalan tetap snapshot | **SETUJU** | - |
| 3 | **Meneruskan dasar hitung ujrah V1 ke ulama** — V1 = persentase harga PERJANJIAN (ma'lum); alternatif = ujrah mitsli | **SETUJU** | - |

Perlu ditindaklanjuti: -

---

## Tindak Lanjut

### (1) Skema wakalah bil ujrah = DISETUJUI
- Akad & mekanik implementasi (`4f12818` + P4-B fleksibel)
  dikonfirmasi: ujrah tercatat otomatis SAAT terjual; tagihan
  pemilik = neto komisi (harga − ujrah); rate snapshot per titipan
  (tidak bisa diubah sepihak).
- Terminologi ju'alah → wakalah bil ujrah (riset 24 Sep, fiqh
  madzhab Syafi'i + Bahtsul Masail NU; Fatwa DSN-MUI No.
  113/DSN-MUI/IX/2017) = **bukan perubahan mekanik** — komisi
  tetap hanya dicatat saat barang terjual.

### (2) Komisi per kesepakatan (antardhin) + titipan terkunci = DISETUJUI
- Titipan berjalan tetap snapshot; rate baru hanya utk titipan
  baru (prioritas: input eksplisit > default per-pemilik >
  global); `konsinyasi_commission` (default 20) = **preset
  operasional aplikasi, BUKAN ketentuan syariah**; audit
  `commission_source` per baris (bukti utuh).

### (3) Dasar hitung ujrah V1 → DITERUSKAN KE ULAMA
- V1 (persentase harga PERJANJIAN, ma'lum) tetap posisi
  berjalan; konfirmasi ulama menyusul; alternatif = ujrah mitsli
  (tercatat di seksi H dokumen P4). Badge "provisional" di UI
  ujrah kon. tetap sampai terjawab (TODO E25).

### Yang dikunci (LEPAS)
- **Larangan prabatasih R6 (aspek P4) LEPAS — A1.1 LEPAS**:
  ujrah konsinyasi dipindahkan dari off-P&L (memo, baris "Ujrah
  Konsinyasi") ke pendapatan (4040 PKGF) + tagihan pemilik =
  settlement payable (2020 APL) — eksekusi = **commit terpisah
  saat F3.4+** (sesuai R6); mapping seksi I dokumen P4 TIDAK
  diubah diam-diam (tetap via commit tercatat).

## Open Items

1. **Dasar hitung ujrah V1** (persentase harga PERJANJIAN) —
   menunggu konfirmasi ulama; bila ada koreksi = commit terpisah
   (pola F3.3).
2. **Eksekusi A1.1** (ujrah → pendapatan 4040 + tagihan → 2020)
   — pada commit implementasi F3.4+ (commit terpisah, tercatat).

## Lampiran — Teks Jawaban Tashih (asli, copy dari `P4-PROPOSAL-KONSINYASI.html`)

```
JAWABAN TASHIH — P4 KONSINYASI
Tanggal: 30 September 2026
Oleh: Gus Fi (Ali Makfi)

1. Skema wakalah bil ujrah → Setuju
   Catatan: -
2. Komisi per kesepakatan + titipan terkunci → Setuju
   Catatan: -
3. Meneruskan dasar hitung ujrah ke ulama → Setuju
   Catatan: -

Ringkasan: 3 Setuju, 0 Ora Setuju, 0 Koreksi
Perlu ditindaklanjuti: -
```
