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
- [x] **Retur refund mengabaikan diskon baris** - SELESAI commit
      `2a34a8f` (22 Sep): refund dihitung dari harga efektif
      `(subtotal - diskon)/qty_terjual x qty_retur` (returns/route.ts
      + estimasi UI retur-client.tsx). TSC+build lolos, master+main.
- [x] **Export CSV laporan tak terbatas** (22 Sep, batch 3):
      `reports/csv/route.ts` membatasi `from` maks 365 hari ke
      belakang + `LIMIT 50000` (default lama = sejak 1970).
- [x] AUDIT bug scan 3x (22 Sep): tanpa temuan baru - zakat route
      bounded (periode last_zakat_date), users list admin-only,
      tak ada SQL string-concat, tak ada N+1 lain; CSV cap di atas
      menutup item performa terakhir.
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
- [x] AUDIT 3x (21 Sep): `audit_log` auto-purge - SELESAI
      (22 Sep): `purgeAuditLog` di lib/notify.ts (default 90 hari +
      invalidasi cache) + cron job `audit` & diinklusi job `all`;
      dipicu scheduler eksternal (Vercel Cron + CRON_SECRET, repo tak
      kelola secret) via POST /api/notifications/cron?job=audit;
      purge manual admin (`DELETE /api/audit`) tetap tersedia.
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
- [x] **Phone duplicate guard format-insensitive** — SELESAI (commit
      `f2b398e`, 23 Sep 2026, dual-push master+main): helper bersama
      `phoneOwner` + `canonicalPhone` di `src/lib/phone.ts` — duplikat
      beda penulisan ("+62 812…" vs "0812…") tertangkap di lapisan
      aplikasi → POST/PUT member balas 409/400 pesan jelas (bukan
      error constraint mentah HTTP 500 "Kesalahan jaringan.").
      Test: `npm run test:phone` — **26 checks, 0 gagal**
      (`scripts/test-members-phone.ts`). TSC exit 0.
- [x] **`purchases.unit_cost` pecahan** — SELESAI (commit `6b4b179`,
      23 Sep 2026): `Math.floor` ke rupiah penuh — qty×unit_cost selalu
      bilangan bulat → agregat kas/laporan & harga modal konsisten.

## Fitur (gap fungsional)
- [x] **Penjaga margin utk perk member (anti rugi)** — SELESAI
      (commit `4dee370`, 23 Sep 2026): modul murni `src/lib/perks.ts`
      (`computePerks` + `marginGuard`, 57 unit test `npm run test:margin`);
      POST /api/sales clamp perk otomatis ke margin kotor produk
      (urutan pangkas: cashback → redeem → diskon), diskon manual yang
      menembus margin = soft flag (audit `sales:margin_clamped` /
      `sales:manual_over_margin` + notifikasi admin `margin_alert`,
      transaksi tetap jalan); PUT /api/member-settings accept+warn
      (`memberSettingWarnings`); akumulasi `totalCost` HPP ikut
      dihitung saat harga di-override. Dual-push master+main.
- [x] **Struk thermal 58mm + @page kondisional** — SELESAI
      (commit `82fccdb` + helper `printReceipt()` di pos-client):
      `.receipt-print` kini 58mm/padding 2mm/9pt/line-height 1.3
      (dulu 320px ≈ 84mm — kelewat lebar); `@page` global tetap A4
      8mm utk laporan `.print-area` (zakat/dll), dan SAAT cetak struk
      `printReceipt()` meng-inject `@page { size: 58mm auto; margin: 0 }`
      lalu menghapusnya saat `afterprint` — satu-satunya jalur
      `window.print()` struk (auto-print, F5, tombol Cetak). Plus
      `.print-hidden` utk chrome yang tak boleh tercetak. Semua jalur
      cetak struk rewired ke `printReceipt()`.
- [x] Terapkan perks member di alur POS: diskon member, cashback
      (saldo member), promo ulang tahun, tier Silver/Gold — DITERAPKAN
      (commit `43098a4`, 22 Sep 2026): ultah = MAX(birthday_discount,
      base); tier = badge/status saja (tanpa diskon tambahan); poin
      dihitung dari total SETELAH perk; cashback masuk
      `members.cashback_balance` + ledger `point_history` (reason
      'cashback'); kolom baru `sales.member_discount`; preview & struk
      di POS. Grosir terpisah & ditunda (lihat item di bawah).
- [m] GROSIR: setting `wholesale_min`/`wholesale_discount` global +
      per produk (tabel `product_prices`) belum terpakai di
      perhitungan — TUNDA (keputusan user 22 Sep: fokus perks dulu).
- [x] Redemisi poin + pemakaian saldo cashback — SELESAI (baseline
      `66a3db9` + fix `1b98a24`, 23 Sep 2026): kolom `sales.redeem`/
      `sales.cashback` + ledger `point_history` reason `redeem`/
      `cashback_use`/`void`/`refund`/`refund_cash`; POST /api/sales
      menebus poin dulu lalu saldo (cap ketersediaan + clamp penjaga
      margin); UI POS checkbox "Tebus poin/saldo" + baris struk;
      DELETE sales/[id] rollback presisi dari ledger + guard
      anti-double-delete + re-hitung tier. Dual-push master+main.
- [x] Backup/restore perluas cakupan PENUH: `debts`, `payables`,
      `returns` (commit `c02421b`) + `notifications`,
      `notification_settings`, `notification_logs`, audit_log
      import 13 kolom skema v11 (commit `d435f57`, 21 Sep 2026;
      (payload version 3). Keputusan user 21 Sep:
      `notification_settings`, `notification_logs` SERTAKAN;
      4 kolom audit_log v11 SERTAKAN; `point_history` TUNDA
      (di luar cakupan).
- [x] Pembayaran campuran dalam satu transaksi (tunai + transfer) —
      SELESAI (Fitur 3): kolom JSON `sales.pay_split`
      `[{"m":"cash","a":50000},…]` + SCHEMA_VERSION 13. SPLIT
      PENUH saja (Σ(split) = total divalidasi server; bayar
      sebagian/piutang = follow-up terpisah); whitelist {cash,
      tf, wa}. Agregasi per-metode terpusat di
      `src/lib/pay-methods.ts` (UNION ALL + json_each) utk
      shift-close/reports/notify; rekap + struk WA/POS
      menampilkan rincian per metode; kas label "+campur";
      csv kolom `pembayaran_campur`; backup payload v4; UI POS
      tombol "🔀 Campur" (input per metode + indikator lunas)
      + payload ikut antrean offline. Uji: `npm run test:split`
      (15 check).
- [x] Bug kritis `tx()` (write transaksi hilang di produksi) — FIXED
      (`91802a5`): Turso `transaction().close()` TANPA commit
      membatalkan batch → sales/member/konsinyasi tampak sukses tapi
      data hilang. Kini `tx()` eksplisit `commit()`/`rollback()`;
      semantik lib dibuktikan `_txlib.mjs` (close=0, commit=1);
      produksi live (manifest `bfa7aa8`) + probe `_probe4.mjs`
      POST→GET→audit→DELETE→stok balik.
- [x] Guard anti double-return + fix migrasi `idx_sales_member` —
      FIXED (`2b084a4` + `8a616a1`): retur dobel ditolak in-tx (dedup
      90 dtk + `changes===1` pada INSERT retur & restock, race-safe);
      index dipindah dari SCHEMA statis ke `migrate()` (DB lama tanpa
      kolom `member_id` tak lagi 500; diverifikasi skrip zz-retain-*).
- [x] Audit 4-fase: 🟡 jejak `pay_split` di audit `sales:create` —
      FIXED (`4431e80`). Sweep delta (margin/split/redemsi/returns/
      tx()/PWA/print) tanpa bug 🔴/🟠 baru; perf FLJS maks 133 kB.
- [r] UI/UX menunggu approval (laporan audit 4-fase): Modal `✕`
      <44px + tanpa ESC/focus-trap/aria-modal; kontras teks skeleton
      (`slate-400/500`) rendah; belum ada panel bantuan hotkey POS
      (F1–F5); Toast tanpa `aria-live`. Kode UI belum diubah.
- [r] Validasi `pay_split` saat IMPORT backup (🟠, laporan review
      Fitur 3) — menunggu approval: normalisasi via `parsePaySplit`
      + Σ=total; non-valid → null (legacy).
- [r] QRIS asli (gateway/NMID resmi) — KEPUTUSAN 22 Sep: DITUNDA sampai
      user (Makfi) urus NMID resmi (bank/agregator QRIS). **QRIS mock SVG di
      POS = PLACEHOLDER — JANGAN DIPAKAI PRODUCTION** (NMID `ID102003004050`
      fiktif, tidak bisa dibayar). Setelah NMID siap, lanjut opsi
      (A) payload EMVCo statis client-side + `qrcode` (tanpa API, verifikasi
      manual kasir) / (B) gateway dinamis Xendit/Midtrans (API key + webhook).
- [x] Cetak label barcode produk — SELESAI (22 Sep): tombol "Label" di
      tabel /admin/produk membuka `ProductBarcodeLabel`
      (`src/components/admin/product-label.tsx`): QR berisi nilai field
      barcode produk (discan CameraScan kasir via jsQR / diketik
      manual), grid 2 kolom A4, pilihan 2–24 lembar, print via
      window + document.write (pola MemberQrBadge, nilai di-escape
      HTML). Butuh field barcode terisi dulu (toast penunjuk).
- [r] `debts` & `payables`: ringkasan `date('now')` (UTC) bisa meleset
      ±7 jam utk jatuh tempo tengah malam — badge per-baris sudah
      dihitung client-side WIB; agregat server opsional diperbaiki.
- [r] Notifikasi `cash_low`: pemicu `notifyCashBalance()` mengecek saldo
      kas penuh (5 query SUM) tiap jurnal — throttled dedupe 60 mnt,
      biarkan tapi pantau Rows Read.
- [r] `amount_paid`/`change` POST /api/sales dipercaya dari klien
      (tanpa cross-check vs `total`) — pre-ada; POS menghitungnya;
      validasi server opsional (jangan rusak alur offline-queue).

## Performa (status: BERSIH)
- [x] Target Turso Rows Read < 3.000 tercapai: list cap 50 baris,
      agregat di-cache 60 dtk + invalidasi, N+1 dibatch, gate
      `schema_version` (cold start 1 SELECT). `next build` 48 page,
      First Load JS maks ±123 kB (POS lazy).
- [x] `notifyStockAfterSale` limit per transaksi (22 Sep 2026): filter
      di bawah ambang (< 5) + urut stok terendah dulu + cap 5 produk
      paling kritis - loop berbatas, transaksi ramai tak lagi memicu
      20+ round-trip beruntun.
- [x] `reports/csv` tanpa batas baris - SUDAH DIFIX (`473c8d3`): `from`
      cap 365 hari + `LIMIT 50000`; "sejak awal" tak mungkin lagi.

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
- **Status produksi**: 17 fix live di Vercel (chain `851e219` →
  `a4fdd00`). Test manual Makfi (12 langkah backup v3 + hardening)
  DITUNDA — tetap wajib sebelum rilis fitur baru. XSS struk
  print/WA sudah diverifikasi AMAN (commit `a4fdd00`).
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

## Fitur
- [x] **Redemsi parsial — input nominal (24 Sep 2026):** POS ganti
  checkbox auto-max jadi input nominal Rp + tombol "Maks" + preview
  live "Tebus −Rp X (N poin + Rp Y cashback)". Backend tak berubah
  (POST /api/sales `b.redeem` nominal). TSC + `next build` lolos.
  **Fitur 2 (redemsi) 100% SELESAI.**

## Batch UI + Hotkey (21 Sep 2026, HEAD `9782a89`, dual-push)
- [x] Logo chip persegi + brand penuh (bug #14) — commit `95c70b5`
- [x] Tema + Keluar pindah ke hamburger menu (ikon Sun/Moon dinamis,
      logout tetap `POST /api/auth/logout` + `/login`) — `c3ce06c`
      + `f03d6b7` (hapus themetoggle/logout.tsx tak terpakai)
- [x] UI a11y: Modal (ESC + focus-trap + close ≥44px + role dialog),
      Toast `aria-live` persisten, PageSkeleton kontras — `c364b2c`
- [x] Hotkey kasir: F6 split, F7 shift, F8 member, F9 diskon (admin),
      ↑/↓ seleksi item, +/- qty, Del hapus, Enter checkout, Ctrl+P/M/H/R,
      cheatsheet `?` (tombol + key), hook `useHotkeys` stabil — `7ab05d2`
      + `9782a89` (Backspace utk Mac)
- [x] REGRESI DB: migrasi `sales.kasir_id` utk DB existing
      (`execColumn` idempoten + `SCHEMA_VERSION 14`) — `3724e36`
- [ ] **Uji manual pasca-deploy (Vercel auto dari `main`) — HANDLED USER
      NANG HP (22 Sep 2026):** status: PENDING hasil.
      1. Hamburger → "Ganti Tema" (ikon berubah sesuai mode) +
         "Keluar" (sesi habis, lompat /login) di HP & desktop
      2. POS: F6 split (Σ nominal), F7 shift, F8 member, F9 diskon
         (admin), ↑/↓ pilih item (+/+− qty/Del hapus), Enter di
         uang diterima → checkout, `?` buka cheatsheet
      3. Retur: kasir hanya bisa retur transaksi `kasir_id` miliknya
         (transaksi lama NULL → kasir 403, pengurus/admin tetap leluwa)
      4. Setelah deploy v14: cek di Turso `PRAGMA table_info(sales)`
         punya kolom `kasir_id` + `idx_sales_kasir` terbuat (cek
         `sqlite_master`) — jika belum, cold start Vercel akan
         menjalankan fullInit sekali
      5. Smoke: 1 transaksi POS baru (INSERT `kasir_id` jalan, tak ada
         "no such column")

## PWA / Favicon (22 Sep 2026, commit `046b80c`)
- [x] `public/favicon.ico` multi-size VALID (4 entry: 16/32/48/64) +
      SW cache v11 — dual-push master+main. Akar masalah = favicon
      lama KORUP (detail: MEMORY.md, seksi "PWA Favicon"). Produksi
      Vercel LIVE: favicon served 5.635 byte = persis file lokal
      (verifikasi HTTP 22 Sep, https://kopontren-gamma.vercel.app).
- [ ] **Test manual ikon PWA taskbar — HANDLED USER NANG EDGE LAPTOP
      (PENDING hasil):**
      1. Tunggu Vercel deploy `046b80c` Ready
      2. Uninstall PWA di Edge → clear site data → restart Explorer
      3. Install ulang PWA → cek logo nang taskbar & Start menu
      4. Bila masih gagal: hapus cache ikon Windows manual → restart
         → install maneh → LAPOR hasilnya

## Produk / Stok — revisi pendekatan (23 Sep 2026)
- [x] Generate CSV stok dari DB dev (`file:./data/kopontren.db`):
      `stok-export-20260923.csv` (237 baris, semua `aktif`; UTF-8 tanpa
      BOM; header `id,nama_produk,barcode,kategori,stok,hpp,harga_jual,status`;
      field ber-koma di-quote). Generator `_gen-stok-csv.mjs` (scratch
      gitignored) bisa di-run ulang. Catatan: baris 237 = `ZZ-GUARD-TEST`
      (baris uji manual, tidak ada di codebase) — hapus sebelum upload
      bila di Turso produksi tidak ada baris tsb.
- [ ] **User upload CSV ke Turso sendiri (PENDING):** pendekatan baru =
      Cline TIDAK lagi akses Turso langsung / tidak perlu credential
      Turso di `.env` lokal. Setelah user upload: verifikasi jumlah
      baris di Turso (ekspektasi 237, atau 236 bila `ZZ-GUARD-TEST`
      dihapus).

