# P-V2-MULTISATUAN -- Multi-Satuan V2 (Stok Fraksional) DESIGN DOC

STATUS: DRAFT -- MENUNGGU APPROVAL GUS FI (plan phase, 19 Okt 2026).
Penulis: Cline (audit `origin/master` @ `1325ee1` + ruling D1-D5 dari
DeepSeek audit). Setelah approval: eksekusi kode (STEP 3), push dual,
verifikasi -- semua gate tetap berlaku (tsc 0, test:all 37/37,
0 non-ASCII di file kode, sw.js & laporan-admin-client.tsx & coop.ts
TIDAK disentuh).

## 0. Ruling D1-D5 (diterima Gus Fi, 19 Okt 2026)

- D1: Pembelian fraksional (restock 3.5 kg) -- DITERMASUKKAN V2.
- D2: Fraksi CSV -- titik PERCENTE (3.5); koma (3,5) tetap OOS.
- D3: Presisi stok -- 3 desimal (1 gram utk kg), bukan unlimited float.
- D4: HPP fraksional -- Math.round ke rupiah utuh.
- D5: Cakupan V2 = qty_per_base fraksional + stok fraksional + D1-D3.
  Tidak termasuk: wholesale tier (min_qty integer, jangan disentuh),
  harga jual (tetap integer rupiah), perubahan COA/akun GL.

## 1. SYARIAH/FIQIH -- konfirmasi TASHIH (1 baris, tercatat di MEMORY.md)

> "Kenaikan presisi stok multi-satuan (V2) tidak mengubah mekanisme
> penghitungan zakat: nilai penaksiran tetap jumlah (stok x harga
> (beli/jual)) yang dibulatkan ke rupiah utuh; presisi stok 3 desimal
> hanya mengurangi pembulatan stok dan tidak menambah konsep fiqih
> baru."

Konsekuensi: rumus zakat/neraca TIDAK DIUBAH (sumber data &
penbulatan output rupiah-utuh sama persis). Tidak ada item fiqih
baru utk tashih.

## 2. Cakupan V2

IN: qty_per_base fraksional (mis. 0.5 kg/karton), stok fraksional
3 desimal (products.stock), pembelian/restock fraksional (D1), input
CSV titik (D2), HPP pack fraksional dibulatkan rupiah (D4).

OUT (tetap V1/integer): harga jual & pack price (rupiah integer),
wholesale tiers (product_prices.min_qty), COA & akun GL (4010/5010/
2070 dst), jumlah pack terjual (qty = integer; yg fraksional hanya
konversi pack->dasar), koma desimal di CSV.

## 3. Aturan canonical (sumber kebenaran implementasi)

- R1. SETIAP mutasi stok (INSERT/UPDATE products.stock) lewat 3
  desimal: helper `r3(n) = Math.round(n * 1000) / 1000` (0 bila
  non-finite). Di lapisan SQL: `ROUND(stock + ?, 3)` /
  `ROUND(stock - ?, 3)` / `ROUND(MAX(0, stock + ?), 3)`.
- R2. Perbandingan kecukupan stok pakai epsilon: `EPS = 1e-6`.
  `stok cukup <=> stock + EPS >= needed`.
- R3. HPP pack snapshot = `hppPerUnit(cost_price, qpb) =
  Math.max(0, Math.round(cost_price * qpb))` (D4: Math.round, bukan
  Math.floor V1).
- R4. Harga jual, subtotal, total, discount -- tetap rupiah integer
  (Math.floor di route TETAP, tidak disentuh).
- R5. Pembelian fraksional (D1): qty pembelian = `r3(qty)` (validasi
  > 0); total kas/GL = `Math.round(qty * unit_cost)` rupiah utuh.
- R6. Validasi qty_per_base (pack_units): angka finite,
  0.01 <= qpb <= 10000, disimpan `r3(qpb)`; reject lain. (V1:
  Math.max(1, Math.floor) -- GANTI.)
- R7. Input stok CSV/Excel (D2): `Number(...)` -- HANYA titik; koma
  tetap ditolak; hasil `r3()`. Excel kolom stok boleh 3,5 (format
  kolom = number) -- konversi via `Number(row.s2)` lalu r3.

## 4. Skema v31 (rebuild, preseden v29 di db.ts)

Dalam satu langkah `if (CURRENT_VERSION < 31)` + `tx()`:

- `products_v31`: sama persis dgn products v30 (kolom: id, name,
  category, unit, base_price INTEGER, cost_price INTEGER, active,
  barcode, is_consignment, pack_units TEXT, created_at) +
  `stock REAL NOT NULL DEFAULT 0` (GANTI INTEGER).
- `sale_items_v31`: `qty_per_base REAL NOT NULL DEFAULT 1` (GANTI
  INTEGER); kolom lain tak berubah (incl. unit_name TEXT,
  cost_price INTEGER).
- `purchases_v31`: `qty REAL NOT NULL` (GANTI INTEGER); kolom lain
  tak berubah.
- Kopi data (`INSERT ... SELECT`), drop tabel lama, rename; rebuild
  index yg terdampak: `idx_products_barcode ON products(barcode)`,
  `idx_products_active ON products(active, category)`,
  `idx_si_sale ON sale_items(sale_id)`,
  `idx_sale_items_sale ON sale_items(sale_id, product_id)`;
  purchases = tanpa index.
- Data aman: value integer v30 eksak sebagai double (REAL, < 2^53).
- Baris `CREATE TABLE` awal (path DB baru) juga diubah:
  products.stock REAL, purchases.qty REAL, sale_items.qty_per_base
  REAL (path fresh DB langsung v31).
- Sebelum migrate di prod: `SELECT COUNT(*)` 3 tabel -- catat di
  pesan commit (preseden v29).

## 5. Helper baru: `src/lib/multisatuan.ts` (file BARU, pure)

```ts
export const STOCK_EPS = 1e-6;
export function r3(n: number): number          // R1
export function validateQpb(v: unknown): number // R6 (throw bila invalid)
export function stockNeeded(qty: number, qpb: number): number // r3(qty*qpb)
export function hppPerUnit(cost: number, qpb: number): number // R3
export function parseStockInput(v: unknown): number // R7 (Number titik -> r3)
```

Pure & deterministik -- bisa di-test langsung node (pola neraca.ts /
zakat-valuation.ts). Route route.ts importing helper (bukan
sebaliknya).

## 6. Checklist per-file (urutan implementasi)

1. `src/db.ts` -- langkah migrate v31 (DDL + index, sketsa §4) +
   ubah teks CREATE TABLE awal + CURRENT_VERSION 30 -> 31.
2. `src/lib/multisatuan.ts` -- file baru (§5).
3. `src/app/api/products/route.ts` -- POST: validasi pack_units via
   validateQpb (ganti `Math.max(1, Math.floor(...))`); stockValue =
   r3 (non-consignment) / r3 (consignment) (ganti Math.floor).
4. `src/app/api/products/[id]/route.ts` -- PUT: mirror #3.
5. `src/app/api/products/bulk/route.ts` -- opname massal: delta = r3
   (ganti Math.trunc, baris 61); SQL
   `stock = ROUND(MAX(0, stock + ?), 3)`; aksi lain tak berubah.
6. `src/app/api/sales/route.ts` -- needed = stockNeeded(qty, qpb);
   guard non-consignment `stock + EPS >= needed` (pesan error:
   "Stok tidak cukup untuk {unit} (butuh {needed}, sisa {stock})");
   decrement `stock = ROUND(stock - ?, 3)`; restock pembatalan
   `stock = ROUND(stock + ?, 3)`; snapshot HPP = hppPerUnit (R3,
   ganti Math.floor V1).
7. `src/app/api/returns/route.ts` -- restock `stock = ROUND(stock +
   ?, 3)` (amount = stockNeeded(qty, qpb)); cogs snapshot =
   hppPerUnit x qty (bulatkan rupiah).
8. `src/app/api/purchases/route.ts` -- qty = r3 (ganti Math.floor);
   validasi qty > 0; stock `ROUND(stock + ?, 3)`; total =
   Math.round(qty * unit_cost). CATAT: cek `journalForPurchase` di
   `src/lib/jurnal.ts` -- pastikan total yang masuk jurnal GL tetap
   integer rupiah (perbaiki di helper bila perlu).
9. `src/lib/product-import.ts` -- parseImport stock = r3 (ganti
   Math.round); excelToRow stock = r3 (consignment-only, floor 0
   non-consignment TETAP via r3); toNum tak berubah (koma tetap
   ditolak).
10. `src/app/api/migrate/products/route.ts` -- stock import = r3
    (ganti Math.round, baris ~100).
11. `src/components/pos-client.tsx` -- (a) editor pack (baris ~188):
    input qpb `type=number step=0.01` (ganti step=1 +
    Math.max(1,Math.floor)); validasi sisi klien via validateQpb;
    (b) stepper qty: disabled `l.qty * qpb - EPS >= l.product.stock`;
    (c) preview HPP pack = hppPerUnit (Math.round, tampilan rp).
12. `scripts/test-multisatuan.ts` -- tambah blok V2 (T1-T5 integer
    TETAP valid & harus tetap hijau):
    - T6 fraksional: qpb 0.5, stok 3.5; jual 5 pack (butuh 2.5) ->
      stok 1.0 (eksak r3).
    - T7 boundary + drift: stok 1.0 jual 2 pack (1.0) = KUKUHAN
      (EPS); 3 pack (1.5) = blokir; drift: r3(0.3*10) = 3.0.
    - T8 HPP: 2001 x 0.5 = 1000.5 -> Math.round -> 1001.
    - T9 restock fraksional (D1): 3.5 x 4000 = 14000 (bulat);
      stok 2.1 + 3.5 = 5.6 (r3).
    - T10 backward compat: qpb integer 12 tetap eksak (stok 100 ->
      jual 2 box 24 -> 76).
13. `scripts/test-zakat.ts` + `scripts/test-neraca.ts` -- tambah
    case stok fraksional: zakat modal = Math.round(3.5 x 10000) =
    35000 (output rupiah-utuh tak berubah); neraca: total value
    35000 + satuan 3.5 (display stok boleh desimal).
14. `P-V2-MULTISATUAN.md` (dok ini) + `MEMORY.md` (1 baris tashih §1
    + ruling D1-D5) + `TODO.md` (item V2).

Gate per commit: `npx tsc --noEmit` exit 0; `npm run test:all`
37/37 (suites #1-#37 -- V2 HANYA menambah blok ke suite #37
(test-multisatuan) + #32 (test-zakat) + #33 (test-neraca); jumlah
suites TIDAK berubah); grep non-ASCII di file-file §6 = 0.

## 7. Kompatibilitas backward

- Produk tanpa pack_units: qpb default 1, semua jalur integer-eksak
  tak berubah (REAL menyimpan integer eksak).
- V1 pack integer (box 12 pcs): T1-T5 & T10 tetap hijau.
- Data historis sales/purchases: qty/cost snapshot lama integer --
  tak di-touch (purchases qty lama tetap nilainya; hanya kolom jadi
  REAL).
- Zakat/neraca: rumus & output tak berubah (§1) -- hanya stok
  fraksional yang sekarang lebih presisi di input.
- Laporan admin (laporan-admin-client.tsx): stok fraksional muncul
  dgn desimal bila perlu -- TIDAK disentuh kecuali agregasi
  menunjukkan 0.x (verifikasi di test:all; bila hanya tampilan,
  out-of-scope V2).

## 8. Risiko & mitigasi (dari audit)

1. Float drift 0.3x10=2.999... -> mitigasi: r3 di SETIAP mutasi (R1)
   + EPS di perbandingan (R2) + T7 (drift).
2. Stok "cukup" meleset -> guard EPS (R2); test T7 boundary.
3. HPP pack 1000.5 -> Math.round (D4/R3); test T8.
4. GL non-integer (Rp 14.005) -> total selalu Math.round (R5);
   verifikasi journalForPurchase; test neraca fraksional.
5. CSV koma vs titik -> D2: titik only; toNum reject koma TETAP;
   test import fraksional.
6. Rebuild schema -> preseden v29 teruji; COUNT(*) sebelum; data
   integer-eksak sebagai REAL.

## 9. Eksekusi & commit (setelah approval)

- C1: semua kode + skema + test (§6 item 1-13) -- commit tunggal
  "V2 multi-satuan (stok fraksional): schema v31 + aturan R1-R7
  (P-V2-MULTISATUAN.md)". Review FULL DIFF sebelum commit.
- C2: docs & bookkeeping (P-V2-MULTISATUAN.md + MEMORY.md + TODO.md).
- Push dual master + main + verifikasi dua-duanya.
- Verifikasi pasca: tsc 0, test:all 37/37, grep non-ASCII 0,
  sw.js / laporan-admin-client.tsx / coop.ts tak berubah
  (`git diff --stat` commit C1+C2).

## 10. Keputusan terbuka

TIDAK ADA -- D1-D5 sudah diruling; fiqih = confirm (1 baris §1).
Satu-satunya verifikasi waktu implementasi: perilaku total
`journalForPurchase` (§6.8) -- bila perlu, sesuaikan di helper
dgn assert test.