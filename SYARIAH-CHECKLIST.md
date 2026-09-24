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
| 4 | Konsinyasi | Salam al-bi' / wakalah | ✅ | 100% hasil untuk pemilik; tanpa komisi (ju'alah) |
| 5 | Poin loyalty | Tawadhi'/hibah | ✅ | Gratis, jadi potongan, tak bisa ditarik tunai |
| 6 | Cashback (reward) | Ta'diyah / potongan | ⚠️ | Mekanik ok; **redesign label** + perlu tashih ulama |
| 7 | Tier Silver/Gold | Status | ✅ | Badge saja, ambang jelas di setting |
| 8 | Diskon (member/grosir/ultah) | Hibah | ✅ | Jelas, cap 90%, ultah = tawadhi' |
| 9 | Retur/Refund | Khiyar ('aib/syarat) | ⚠️ | Alur sah; **lubang exploit poin** (P2) + tashih |
| 10 | Zakat tijarah | Kewajiban | ❓ | Nisab/kadar ok; formula laba periodik & modal HPP perlu tashih |
| 11 | Shift / setor kas | Wakalah | ✅ | Kontrol internal, jurnal kas atomik |
| 12 | QRIS | — | ⏸️ | Masih MOCK — jangan produksi sebelum NMID |

### Keputusan user P (tashih ulama)
1. **P1 — Terminologi "Cashback"** → ganti label UI menjadi **"Saldo Reward"**; poin "Poin Reward". Mekanisme tidak berubah.
2. **P2 — Lubang exploit poin** (beli → tebus reward → retur barang + uang, poin tetap) → fix: balikkan poin/reward saat retur penuh. Tashih: bolehkah store membatalkan reward yang sudah cair? (biasanya boleh, karena mughannash/dhalalah)
3. **P3 — Zakat**: (a) pakai haul 1 tahun tetap; laba diakumulasikan secara konservatif sejak awal haul, bukan sejak `last_zakat_date`, (b) harga emas diverifikasi berkala, (c) apakah modal disekap pada nilai pasar (atau tetap HPP)? — semua menunggu keputusan ulama.
4. **P4 — Konsinyasi + komisi store**: jika suatu hari store mau komisi, pakai **ju'alah** (komisi % disepakati di muka, tercatat di baris konsinyasi).
5. **P5 — Denda keterlambatan**: JANGAN pernah diimplementasikan sebagai pendapatan store. Jika ada insentif ketepatan waktu → **ta'zir/ta'zhir ke kas amal** (contoh: donasi ke kas pondok), bukan masuk kas store.
