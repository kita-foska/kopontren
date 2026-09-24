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
- [ ] Nisab 85 gr emas (bisa dikonfigurasi, harga emas dicek berkala)?
- [ ] Haul 1 tahun?
- [ ] Kadar 2.5%?
- [ ] Pengurangan hutang (payables open) ikut terkurangi?

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
| 4 | Konsinyasi + komisi | Wakalah + ju'alah | ✅ | P4+P4-B SELESAI (24 Sep) — komisi FLEKSIBEL per kesepakatan (antardhin): input per titipan + default per-pemilik (`konsinyasi_owner_rates`); global `konsinyasi_commission` default 20; ujrah dicatat otomatis SAAT terjual (bukan di muka — tanpa risalah); pemilik dapat 100−rate%; titipan aktif = snapshot (tak diubah sepihak) |
| 5 | Poin loyalty | Tawadhi'/hibah | ✅ | Gratis, jadi potongan, tak bisa ditarik tunai |
| 6 | Cashback (reward) | Ta'diyah / potongan | ✅ | Mekanik ok; P1 SELESAI — label UI jadi "Saldo Reward" (f4479b3, 24 Sep 2026) |
| 7 | Tier Silver/Gold | Status | ✅ | Badge saja, ambang jelas di setting |
| 8 | Diskon (member/grosir/ultah) | Hibah | ✅ | Jelas, cap 90%, ultah = tawadhi' |
| 9 | Retur/Refund | Khiyar ('aib/syarat) | ✅ | Alur sah; P2 SELESAI — rollback poin/reward saat retur penuh (f4479b3) |
| 10 | Zakat tijarah | Kewajiban | ❓ | Nisab/kadar ok; formula laba periodik & modal HPP perlu tashih |
| 11 | Shift / setor kas | Wakalah | ✅ | Kontrol internal, jurnal kas atomik |
| 12 | QRIS | — | ⏸️ | Masih MOCK — jangan produksi sebelum NMID |

### Keputusan user P (tashih ulama)
1. **P1 — Terminologi "Cashback"** → ✅ SELESAI (24 Sep 2026, commit f4479b3 + follow-up label WA/CSV/soft-flag): label UI jadi **"Saldo Reward"**; poin "Poin Reward". Mekanisme tidak berubah (tetap store-credit).
2. **P2 — Lubang exploit poin** (beli → tebus reward → retur barang + uang, poin tetap) → ✅ SELESAI (f4479b3): balikkan poin & saldo reward saat retur penuh (jejak ledger `reason='return'`). Tashih tersisa: bolehkah store membatalkan reward yang sudah cair? (biasanya boleh, karena mughannash/dhalalah)
3. **P3 — Zakat**: (a) pakai haul 1 tahun tetap; laba diakumulasikan secara konservatif sejak awal haul, bukan sejak `last_zakat_date`, (b) harga emas diverifikasi berkala, (c) apakah modal disekap pada nilai pasar (atau tetap HPP)? — semua menunggu keputusan ulama. Draft tashih: `P3-TASHIH-ZAKAT.md` (24 Sep 2026).
4. **P4 — Konsinyasi + komisi store**: jika suatu hari store mau komisi, pakai **ju'alah** (komisi % disepakati di muka, tercatat di baris konsinyasi). → ✅ SELESAI (24 Sep 2026): implementasi `ju'alah` — komisi 20% (ujrah) dicatat otomatis sebagai kas masuk "Ujrah Kon. …" hanya saat barang TERJUAL; tagihan pemilik neto komisi; rate per titipan di-snapshot (`consignments.commission_rate`), admin bisa ubah via setting `konsinyasi_commission`. Proposal pengurus: `P4-PROPOSAL-KONSINYASI.md` (24 Sep). **P4-B (24 Sep):** komisi boleh BEDA-BEDA per kesepakatan (antardhin) — field input per titipan + default per-pemilik (`konsinyasi_owner_rates` JSON; kartu "Rate per-pemilik" di /admin/konsinyasi); prioritas eksplisit > per-pemilik > global; titipan aktif tetap snapshot (tanpa perubahan sepihak).
5. **P5 — Denda keterlambatan**: JANGAN pernah diimplementasikan sebagai pendapatan store. Jika ada insentif ketepatan waktu → **ta'zir/ta'zhir ke kas amal** (contoh: donasi ke kas pondok), bukan masuk kas store.
