# Checklist Syariah — Kopontren Al Ittihad

> Prinsip: **"Syariah nomer 1, fitur nomer 2."**
> Setiap fitur WAJIB lolos checklist ini sebelum dianggap selesai.
> Audit awal: 24 Sep 2026 (lihat `MEMORY.md` — seksi ATURAN POKOK SYARIAH).

## A. Akad
- [ ] Akad apa? (bai', qardh, wadiah, ju'alah, wakalah, salam al-bi', dll)
- [ ] Akad jelas & tercatat di data (nama pihak, nominal, jangka, harga)?
- [ ] Ridha (sukarela)? Tidak ada paksaan (ikrah)?

## B. Riba
- [ ] Ada bunga? (tidak boleh)
- [ ] Ada denda keterlambatan sebagai pendapatan? (tidak boleh — bila ada, wajib ke kas sosial)
- [ ] Ada biaya admin tersembunyi?
- [ ] Ada tambahan di atas pokok saat pembayaran utang?
- [ ] Loyalty (poin/cashback) berbentuk potongan harga/hibah, BUKAN bunga & BUKAN penarikan tunai?

## C. Gharar
- [ ] Harga jelas (ma'lum)?
- [ ] Barang jelas & ada di stok?
- [ ] Waktu/jangka jelas (due_date diisi bila ada tenggang waktu)?
- [ ] Kualitas & jumlah jelas?
- [ ] Preview perhitungan (diskon/redeem/cashback) tampil SEBELUM transaksi?

## D. Maysir
- [ ] Ada undian/lotre/giveaway berhadiah? (tidak boleh)
- [ ] Ada janji penghasilan berdasarkan untung-untungan?

## E. Dzalim
- [ ] Harga adil, tidak eksploitatif?
- [ ] Tidak ada penipuan (najasy)?
- [ ] Sistem proteksi marjin aktif (anti jual di bawah HPP tanpa kendali)?

## F. Zakat (kalau relevan)
- [ ] Nisab perdagangan = 85 gr emas (BAZNAS: basis = aset lancar usaha
      dikurangi kewajiban jangka pendek; haul 1 th; kadar 2,5%)?
- [ ] **Karat emas = PROVISIONAL, bukan ketentuan final**: std 24K saat ini
      hanya configurable default. MUI (Komisi Fatwa, 2026) masih mengkaji
      karat emas utk zakat penghasilan (pilihan 24/22/21/14K tanpa
      rekomendasi final ke publik); std 14K BAZNAS 2026 adalah utk zakat
      pendapatan/jasa — TIDAK boleh otomatis digeneralisasi ke zakat
      perdagangan. Riwayat perubahan std tercatat di `zakat_gold_standards`
      (append-only, skema v18; history parameter, bukan fatwa).
- [ ] Haul 1 tahun?
- [ ] Kadar 2.5%?
- [ ] Pengurangan hutang (payables open) ikut terkurangi?
- [x] Media pembayaran zakat tercatat per baris riwayat (v17, 26 Sep:
      `payment_type` cash/transfer/qris/other, default 'cash') —
      murni pencatatan yang ma'lum (nilai jelas + ridha pencatat);
      TIDAK menambah riba/ghharar/maysir; akad tetap kewajiban zakat
      tijarah (nisab emas 24K + haul + kadar 2,5%).
- **STATUS PROVISIONAL (zakat tijarah — FASE 2 Step 1 + Step 2)**:
  Provisional — implemented based on strongest available fiqh position.
  Pending tashih by pengasuh. Subject to correction.
  - Step 1 (sudah SELESAI sebelumnya): formula periodik konservatif
    (haul 1 tahun tetap, laba terakumulasi sejak `last_zakat_date`,
    modal @ HPP, harga emas 24K manual) + pencatatan media pembayaran
    v17.
  - Step 2 (26 Sep, PROVISIONAL, sebelum hasil tashih): haul anchor
    `haul_start_date` (pembayaran zakat = ta'jil, TIDAK me-reset
    siklus; `last_zakat_date` hanya audit + fallback), log standar
    emas `zakat_gold_standards` (append-only: karat, harga/g, sumber,
    tanggal, oleh; entri terbaru = standar terkini), `valuation_mode`
    market (default; V1 proxy = harga jual) / hpp (fallback) —
    `src/lib/zakat-valuation.ts` + route `/api/zakat/gold-standards`
    + UI `/admin/zakat`; `test:zakat` 37/37.
  - **Koreksi sitasi (riset 26 Sep):** referensi dokumen tashih lama
    "DSN-MUI Fatwa No. 8/2008" KELIRU (No. 08/DSN-MUI/IV/2000 =
    pembiayaan musyarakah, bukan zakat; DSN-MUI berdomain muamalah,
    bukan fatwa zakat) → diganti "MUI Fatwa No. 78/2023 [judul:
    menunggu pengasuh]" (nomor belum terverifikasi).
  - Step 3 (P4 dokumen hanya) + revisi hasil tashih pengasuh =
    komit terpisah.

## G. Tashih
- [ ] Perlu tashih ulama?
- [ ] Sudah ditashih? (catat nama/lembaga + tanggal di MEMORY.md)
- [ ] Ada catatan/syarat yang harus dipenuhi?

---

## Status per Fitur (hasil audit 24 Sep 2026)

| # | Fitur | Akad | Status | Catatan |
|---|-------|------|--------|---------|
| 1 | POS / Jual-beli | Bai' | ✅ | Harga & barang jelas; penjaga marjin aktif |
| 2 | Piutang customer | Qardh / tijari | ✅ | Tanpa bunga & denda; overpay mustahil (capped) |
| 3 | Hutang supplier | Dayn | ✅ | Tanpa bunga & denda; due_date hanya pengingat |
| 4 | Konsinyasi + komisi | **Wakalah bil Ujrah** | ✅ | P4+P4-B SELESAI (24 Sep); koreksi akad ju'alah → wakalah bil ujrah (riset Syafi'i + Bahtsul Masail; DSN-MUI 113/IX/2017) — komisi FLEKSIBEL per kesepakatan (antardhin): input per titipan + default per-pemilik (`konsinyasi_owner_rates`); global `konsinyasi_commission` default 20; ujrah dicatat otomatis SAAT terjual (bukan di muka — tanpa risalah); pemilik dapat 100−rate%; titipan aktif = snapshot (tak diubah sepihak) |
| 5 | Poin loyalty | Tawadhi'/hibah | ✅ | Gratis, jadi potongan, tak bisa ditarik tunai |
| 6 | Cashback (reward) | Ta'diyah / potongan | ✅ | Mekanik ok; P1 SELESAI — label UI jadi "Saldo Reward" (f4479b3, 24 Sep 2026) |
| 7 | Tier Silver/Gold | Status | ✅ | Badge saja, ambang jelas di setting |
| 8 | Diskon (member/grosir/ultah) | Hibah | ✅ | Jelas, cap 90%, ultah = tawadhi' |
| 9 | Retur/Refund | Khiyar ('aib/syarat) | ✅ | Alur sah; P2 SELESAI — rollback poin/reward saat retur penuh (f4479b3) |
| 10 | Zakat tijarah | Kewajiban | ❓ | Nisab/kadar ok (BAZNAS: 85 gr emas, haul 1 th, 2,5%, basis aset lancar − kewajiban jangka pendek); formula laba periodik & modal HPP perlu tashih; std emas = **provisional 24K/configurable — menunggu tashih** (MUI 2026 masih mengkaji karat; riwayat std di `zakat_gold_standards` append-only, skema v18). Step 2 P3 provisional (26 Sep): `haul_start_date` anchor + `valuation_mode` market/hpp + log `zakat_gold_standards` — menunggu tashih
| 11 | Shift / setor kas | Wakalah | ✅ | Kontrol internal, jurnal kas atomik |
| 12 | QRIS | — | ⏸️ | Masih MOCK — jangan produksi sebelum NMID |

### Keputusan user P (tashih ulama)
1. **P1 — Terminologi "Cashback"** → ✅ SELESAI (24 Sep 2026, commit f4479b3 + follow-up label WA/CSV/soft-flag): label UI jadi **"Saldo Reward"**; poin "Poin Reward". Mekanisme tidak berubah (tetap store-credit).
2. **P2 — Lubang exploit poin** (beli → tebus reward → retur barang + uang, poin tetap) → ✅ SELESAI (f4479b3): balikkan poin & saldo reward saat retur penuh (jejak ledger `reason='return'`). Tashih tersisa: bolehkah store membatalkan reward yang sudah cair? (biasanya boleh, karena mughannash/dhalalah)
3. **P3 — Zakat**: (a) pakai haul 1 tahun tetap; laba diakumulasikan secara konservatif sejak awal haul, bukan sejak `last_zakat_date`, (b) harga emas diverifikasi berkala, (c) apakah modal disekap pada nilai pasar (atau tetap HPP)? — semua menunggu keputusan ulama. Draft tashih: `P3-TASHIH-ZAKAT.md` (24 Sep 2026). **P3-b (riset 24 Sep):** nisab = 85 g emas **murni 24 karat** — emas 14 karat TIDAK sah (Muktamar NU ke-35; Syafi'i: nisab emas murni) → app wajib pakai harga emas 24K; label UI zakat + dokumen sudah disetel. **P3 Step 2 (26 Sep, PROVISIONAL — sebelum hasil tashih):** (a) terapkan: `haul_start_date` jadi anchor siklus (pembayaran = ta'jil, tidak me-reset), (b) log `zakat_gold_standards` (append-only) untuk verifikasi berkala, (c) `valuation_mode` market/hpp + accrued proporsional hari haul. Semua status provisional menunggu tashih pengasuh; **koreksi sitasi 26 Sep:** referensi "DSN-MUI Fatwa No. 8/2008" keliru → diganti "MUI Fatwa No. 78/2023 [judul: menunggu pengasuh]" (nomor belum terverifikasi; lihat §F + `P3-TASHIH-ZAKAT.md` §D). **Koreksi 26 Sep (user):** klaim "24K = final" diturunkan ke **PROVISIONAL/configurable** — MUI (Komisi Fatwa, 2026) masih mengkaji karat emas utk zakat penghasilan; std 14K BAZNAS 2026 adalah utk zakat pendapatan/jasa, BUKAN otomatis utk perdagangan. App memakai 24K sbg default configurable + riwayat `zakat_gold_standards` (append-only); label UI + dokumen disetel "provisional".
4. **P4 — Konsinyasi + komisi store**: jika suatu hari store mau komisi, pakai **wakalah bil ujrah** (koreksi 24 Sep dr "ju'alah" — dsr Syafi'i, bentuk "laku = beli" = gharar; ref. Fatwa DSN-MUI No. 113/DSN-MUI/IX/2017; komisi % disepakati di muka, tercatat di baris konsinyasi). → ✅ SELESAI (24 Sep 2026): komisi 20% (ujrah) dicatat otomatis sebagai kas masuk "Ujrah Kon. …" hanya saat barang TERJUAL; tagihan pemilik neto komisi; rate per titipan di-snapshot (`consignments.commission_rate`), admin bisa ubah via setting `konsinyasi_commission`. Proposal pengurus: `P4-PROPOSAL-KONSINYASI.md` (24 Sep). **P4-B (24 Sep):** komisi boleh BEDA-BEDA per kesepakatan (antardhin) — field input per titipan + default per-pemilik (`konsinyasi_owner_rates` JSON; kartu "Rate per-pemilik" di /admin/konsinyasi); prioritas eksplisit > per-pemilik > global; titipan aktif tetap snapshot (tanpa perubahan sepihak). **P4-Tashih (riset 24 Sep):** (a) koreksi terminologi ju'alah → wakalah bil ujrah diterapkan di UI/dokumen/kode — mekanik & data TAK berubah; (b) basis ujrah V1 = % harga PERJANJIAN (ma'lum, sesuai Syafi'i); harga jual aktual = gharar dlm pendapat klasik (DSN-MUI 112/IX/2017 membolehkan persentase yg disepakati; alternatif: ujrah mitsli) — tunggu konfirmasi ulama; (c) komisi persenan = ujrah ma'lum (mayoritas Bahtsul Masail HIPJAS VI 2023, Hasyiyah al-Jamal). **P4 Step 3 (26 Sep, PROVISIONAL — dokumen hanya, tanpa perubahan kode):** mapping akuntansi (posisi fiqh terkuat, menunggu tashih): (a) **barang supplier (pemilik titipan) ≠ revenue Kopontren** — hasil bersih penjualan titipan adalah hak pemilik, bukan pendapatan toko; (b) **ujrah Kopontren = revenue** — di V1 dicatat off-P&L (memo, baris "Ujrah Konsinyasi" pada laporan P&L); **dipindahkan ke pendapatan setelah tashih pengasuh**; (c) **hak supplier (pemilik) = settlement payable** — tagihan neto komisi (harga jual − ujrah) = kewajiban toko. **Provisional — implemented based on strongest available fiqh position. Pending tashih by pengasuh. Subject to correction.** (detail: `P4-PROPOSAL-KONSINYASI.html` seksi "Mapping akuntansi"; TODO: item A1.1.) **Koreksi 26 Sep (user):** "default 20%" = **preset operasional aplikasi, BUKAN ketentuan syariah**; mapping akuntansi (supplier goods ≠ revenue; ujrah → revenue; hak pemilik → settlement payable) = **PROVISIONAL menunggu tashih P4** (doku commit `6c9d939`) — jangan ubah mapping sebelum tashih.
5. **P5 — Denda keterlambatan**: JANGAN pernah diimplementasikan sebagai pendapatan store. Jika ada insentif ketepatan waktu → **ta'zir/ta'zhir ke kas amal** (contoh: donasi ke kas pondok), bukan masuk kas store.
