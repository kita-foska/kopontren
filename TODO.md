# TODO — Kopontren Al Ittihad

Prioritas: [!] tinggi · [m] sedang · [r] rendah.

## Bug / konsistensi (hasil audit 18 Sep 2026)
- [x] Anti brute-force `/api/auth/login` (throttle per username+IP) — SELESAI
- [x] `pin/change`: PIN lama salah kini menghitung lockout (konsisten
      dgn `pin/verify`) — SELESAI
- [x] Loyalty points memakai `member_settings.points_every` (dulu
      hard-coded Rp 10.000) di POST /api/sales + estimasi di POS — SELESAI
- [x] Ledger `point_history` tertulis (earn saat jual, void saat hapus
      transaksi) — SELESAI
- [x] `ref-cache` diberi cap 256 key (key `members:totals:<q>` dulu
      tak berujung) — SELESAI
- [x] Retur: qty plafon = (qty terjual − sudah diretur) — SELESAI
- [x] **AUDIT 3x: import backup `audit_log` PK collision** — SELESAI
      (commit `c02421b`): import kini DELETE-then-INSERT, urutan
      FK-safe, + cakupan `debts`/`payables`/`returns` (+ kolom
      `client_ref` di sales). (21 Sep)
- [x] **AUDIT 3x: `sales/[id]` DELETE vs retur** — SELESAI
      (commit `c02421b`): restock di-clamp qty sudah diretur (net),
      jurnal kas "Retur #id" dihapus, baris `returns` dihapus dalam
      1 tx. Tidak ada lagi stok dobel / kas terdistorsi. (21 Sep)
- [x] **AUDIT 3x: race read-then-write** — SELESAI (commit
      `c02421b`): plafon retur divalidasi ulang DI DALAM `tx`;
      decrement stok POS jadi guarded `WHERE stock >= ?` + cek
      `changes === 1` (oversell race tertutup). (21 Sep)
- [x] **AUDIT 3x: harmoni `debt:pay` ke `cash_entries`** — SELESAI
      (commit `f280f60`): guarded update + jurnal kas MASUK
      "Bayar piutang · …" dalam tx + invalidasi kas/laporan
      (sejajar payables "Bayar hutang", yang juga di-hardening
      guarded). (21 Sep)
- [x] Chip "Sesi: X menit" di header dihapus (file
      `session-countdown.tsx` dihapus; `SessionWatcher` tetap jadi
      pengaman expiry) — commit `851e219`, master+main (21 Sep)
- [m] **Retur refund mengabaikan diskon baris** — hitung dari
      effective price (subtotal−diskon)/qty, bukan `unit_price` mentah.
      (20 Sep)
- [r] `audit_log.ip_address` dari `x-forwarded-for` mentah — bisa di-forge
      (forensik saja, bukan auth).
- [x] AUDIT 3x (21 Sep): struk cetak / struk WA — XSS print-window —
      **DIVERIFIKASI AMAN**: cetak struk = JSX React
      (auto-escape) + `window.print()` via CSS `.receipt-print`
      (TIDAK ada document.write, innerHTML, `javascript:` URL, maupun
      `dangerouslySetInnerHTML` di alur struk); struk WA & rekap WA =
      teks polos di-encode `encodeURIComponent` utk `wa.me` (nomor
      disterilkan `\D`); tombol salin = `clipboard.writeText`. Titik
      diverifikasi: pos-client.tsx (`printStruk`, `handleSendWaStruk`,
      `copyStrukText`), lib/rekap.ts (`strukWaText`, `shareWa`,
      `shareRekap`), laporan-client.tsx (`shareRekap`), globals.css
      `@media print`. Tanpa perubahan kode.
- [r] AUDIT 3x (21 Sep): `audit_log` tak ada auto-purge (purge manual
      admin, default 90 hari) — pertimbangkan cron.
- [r] AUDIT 3x (21 Sep): throttle login keyed `X-Forwarded-For`
      (per-instance Vercel, bisa dirotasi) — accepted risk; mitigasi
      PIN 3x salah → sesi dimusnahkan + lock 5 mnt.
- [r] AUDIT 3x (21 Sep): GET `/api/audit` menampilkan
      `old_value/new_value` (termasuk PII member) ke tier pengurus —
      sesuai desain role internal; tinjau bila perlu.
- [x] `CRON_SECRET` dipbandingkan constant-time — SELESAI
- [x] `/api/products`: `role` dihapus dari payload yang di-cache
      browser — SELESAI
- [r] Backup GET/POST: pesan 403 "Hanya pengurus" → "Hanya admin"
      (guard-nya `isAdmin`) — SELESAI
- [r] `pin/reset`: validasi integer `user_id` — SELESAI
- [x] ZAKAT tijarah: hutang dagang (`payables` open) dikurangkan dari
      harta bersih utk zakat — commit `6ef487b`, pushed master+main
      18 Sep 2026 — SELESAI
- [r] ZAKAT known issues (terdokumentasi, belum difix): export CSV
      timestamp UTC vs tampilan WIB (±7 jam, kosmetik); batas periode
      laba zakat pakai UTC (±7 jam di ujung periode) — lihat MEMORY.md

## Fitur (gap fungsional)
- [m] Terapkan perks member di alur POS: diskon member, cashback
      (saldo member), promo ulang tahun, grosir, tier Silver/Gold.
      Setting-nya sudah ada (`member_settings` + halaman
      /admin/pengaturan-member) tapi belum dipakai transaksi.
- [m] Redemisi poin: tukar poin → Rupiah/diskon (ledger
      `point_history` sudah siap dipakai; butuh route + UI di POS/admin).
- [x] Backup/restore perluas cakupan PENUH: `debts`, `payables`,
      `returns` (commit `c02421b`) + `notifications`,
      `notification_settings`, `notification_logs`, audit_log
      import 13 kolom skema v11 (commit `d435f57`, 21 Sep 2026;
      (payload version 3). Keputusan user 21 Sep:
      `notification_settings`, `notification_logs` SERTAKAN;
      4 kolom audit_log v11 SERTAKAN; `point_history` TUNDA
      (di luar cakupan).
- [m] Pembayaran campuran dalam satu transaksi (tunai + transfer) —
      saat ini satu `pay_method` saja.
- [r] QRIS asli (gateway/NMID resmi) — modal QRIS di POS masih mock SVG.
- [r] Cetak label barcode produk (cetak struk & scan sudah ada).
- [r] `debts` & `payables`: ringkasan `date('now')` (UTC) bisa meleset
      ±7 jam utk jatuh tempo tengah malam — badge per-baris sudah
      dihitung client-side WIB; agregat server opsional diperbaiki.
- [r] Notifikasi `cash_low`: pemicu `notifyCashBalance()` mengecek saldo
      kas penuh (5 query SUM) tiap jurnal — throttled dedupe 60 mnt,
      biarkan tapi pantau Rows Read.

## Performa (status: BERSIH)
- [x] Target Turso Rows Read < 3.000 tercapai: list cap 50 baris,
      agregat di-cache 60 dtk + invalidasi, N+1 dibatch, gate
      `schema_version` (cold start 1 SELECT). `next build` 48 page,
      First Load JS maks ±123 kB (POS lazy).
- [r] `notifyStockAfterSale` menjalankan loop per produk (tiap notify =
      beberapa round-trip). Batasi: group/limit produk per transaksi.
- [r] `reports/csv` tanpa batas baris (manager-only, aman, tapi
      "sejak awal" = baca seluruh sale_items).

## Ceklis Uji Manual `/admin/zakat` (deploy Vercel `6ef487b`, 18 Sep 2026)
- [ ] 1. Buka `/admin/zakat` → 4 StatCard load (Modal, Laba, Piutang, Hutang)
- [ ] 2. Set harga emas → Simpan → Hitung Ulang
- [ ] 3. Nisab = 85 × harga emas
- [ ] 4. Total harta = modal + laba + piutang − hutang
- [ ] 5. Zakat 2.5% = total × rate
- [ ] 6. Test "Belum Wajib" → `last_zakat_date` tidak di-reset
- [ ] 7. Export CSV → buka file, cek 7 kolom
- [ ] 8. Print → `.print-area` tidak kosong
- [ ] 9. Bug #1 (A1–A5): tambah payables open → "Hutang" muncul, total berkurang
- [ ] 10. Auth: manager GET 200 · POST 403

## Catatan
- BMT/zakat: berfungsi penuh; hutang dagang tijarah kini dihitung
  dalam total zakat (commit `6ef487b`).
- Vercel: build dari `main`; setelah commit di `master`, mirror main
  (reset --hard + push -f).
- [x] Matriks permission 7 role (admin, manajer, pengurus, kasir,
  gudang, pembelian, member) — teruji manual 20 Sep 2026, commit
  `b83b75e`, dual-push master+main. Matriks terpusat
  `FEATURE_MATRIX`/`canAccess` di `src/lib/auth.ts`; detail di
  MEMORY.md (seksi "Matriks Permission 7 Role").
- [x] Audit trail per-user (snapshot user_name/user_role + IP/UA,
  diff per-field, event LOGIN/LOGOUT) — commit `83a29dd`;
  SCHEMA_VERSION kini 11 (DB prod menjalankan migrate() saat cold
  start berikutnya).
- [x] Rename aplikasi "Kopontren AL ITTIHAD" + layout header —
  commit `eeb9a50`.
