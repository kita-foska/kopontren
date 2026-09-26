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
- [x] **AUDIT 3x (23 Sep, pasca deploy phone guard + purchases
      floor): TANPA BUG KRITIS BARU.** Putaran: (1) grep SQLi/DOM/
      fetch/date/auth-role, (2) matriks write-route x invalidate x
      cache-key x guard, (3) regresi test:phone 26/26 + test:margin
      57/57 + test:split 15/15 + tsc exit 0. Temuan minor:
      (a) tabel `stock_opname` = schema mati (didefinisi + index di
      db.ts, TIDAK ada writer di route/lib manapun) -> decide
      drop/implement; (b) `invalidate('kas:')` tak punya key cache
      pasangan (harmless, jadi backstop); (c) fetch klien tanpa
      timeout (login/pin/session-watcher) - cosmetic. Verifikasi
      deploy prod: SW-BUILD stamp berubah `7706b506c8ab` ->
      `1d0b1c0f67b6` (deploy pasca `6b4b179` sudah live).
- [x] **Minor findings di-close (23 Sep, lanjut audit 3x s.d.
      `bd86ffa`):**
      (a) `stock_opname` — DITRIM (Opsi 3, keputusan user): commit
      `c46f4fa` (drop tabel + index, SCHEMA_VERSION 14 -> 15, fullInit
      v15 `DROP TABLE IF EXISTS`);
      (b) `invalidate('kas:')` — BUKAN BUG: didokumentasikan sebagai
      backstop intentional (commit `ae430f6` + doc ref-cache.ts +
      MEMORY.md seksi cache);
      (c) fetch klien tanpa timeout — commit `c088861`:
      `src/lib/fetch-util.ts` (`fetchTimeout` 10 dtk + `isAbort`),
      diterapkan di `api()` ui.tsx + login + pin + pin/setup +
      session-watcher + logout shell + export CSV zakat; batch import
      produk 60 dtk (toleransi). TSC exit 0, `next build` exit 0,
      regresi test 26/57/15/16 semua 0 gagal, dual-push `c088861`…`c46f4fa`.
- [x] `audit_log.ip_address` dari `x-forwarded-for` mentah — **SELESAI
      (23 Sep)**: `src/lib/client-ip.ts` `clientIp()` ambil KANAN-paling
      XFF (hop yang ditambahkan edge Vercel, tak bisa di-forge) + validasi
      IPv4/IPv6 (sampah -> `unknown`). Dipakai `logAudit` DAN kunci throttle
      login (dulu kiri-paling = forgeable → penyerang bisa memutar kunci
      `username|IP` dan lockout tak pernah terpicu — upgrade dari sekadar
      forensik jadi perbaikan anti brute-force nyata). Test `test:clientip`
      16 checks; TSC + build lolos.
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
- [x] ZAKAT known issues (±7 jam) — FIXED (25 Sep, batch #1+#3, ACC Gus
      Fi): boundary periode LABA dikonversi 00:00 WIB → 17:00 UTC
      (`wibDayStartUtc`, `src/lib/zakat-period.ts`); export CSV riwayat
      zakat kolom `paid_at (WIB)` + nama file `wibToday()`; validasi
      `pay_split` import backup ter-lock (`normalizeSaleImport`).
      Test: `test:split` 22 checks + `test:zakat` 18 checks, TSC exit 0,
      build OK. Sisa low-priority (RESOLVED 25 Sep, commit `74f704d`):
      timestamp export `reports/csv` kini WIB
      (kolom kini `created_at_wib` 'YYYY-MM-DD HH:MM' via helper `utcToWib`
      di `lib/format.ts`; nama kolom lama `created_at_utc` tidak dipakai). — lihat MEMORY.md.
- [x] ZAKAT media pembayaran (v17, 26 Sep): kolom `payment_type` di
      `zakat_history` (cash/transfer/qris/other; default 'cash' utk
      baris lama, migrasi idempoten `execColumn` skema v16→17) +
      select "Media Pembayaran" di form catat zakat `/admin/zakat`
      + kolom riwayat + kolom CSV. Helper `normalizePaymentType` di
      `src/lib/zakat-payment.ts` (Next.js tak izinkan value export
      selain HTTP handler di route.ts). `test:zakat` 18/18 +
      build EXIT 0. — detail MEMORY.md seksi 2026-09-26.
- [x] UI/UX audit high-priority: P1–P4 (26 Sep, lanjut FASE 2
      23 Sep): **P1** font 'Plus Jakarta Sans' kini benar-benar
      di-load via `next/font/google` di `layout.tsx`
      (`--font-jakarta` self-hosted, tampil swap) + globals.css/
      tailwind.config.ts; **P2** tema default ikut OS
      `prefers-color-scheme` (cookie eksplisit tetap menang) +
      `color-scheme` light/dark di globals.css; **P3** kontras WCAG
      AA — `text-amber-600`→`-700` (20 tempat/11 file, ikut Badge
      tone amber di ui.tsx) & pair `slate-500 dark:slate-500`→
      `slate-600 dark:slate-400` (26 tempat/9 file) + label chart/
      PageSkeleton; **P4** keyboard numerik fisik di pin-pad.tsx
      (0–9/Backspace/Escape, guard input terfokus), touch target
      44px (hamburger sidebar & bell h-9→h-10), `tabular-nums`
      (kartu dashboard, totals/mix/close-shift POS, rata-rata
      chart), `role="alert"` 3 paragraf error (login/PIN auth/PIN
      setup), `prefers-reduced-motion` menjangkau utilitas
      animate-*, manifest background `#170A0E`. Build 52/52 OK.
      — detail MEMORY.md seksi 2026-09-26.
- [x] FASE 2 (P3 tashih ulama zakat) — Step 1: implementasi posisi
      fiqih terkuat (zakat periodik konservatif + pencatatan media
      pembayaran v17, commit `2bd27a1`) — **STATUS: Provisional —
      implemented based on strongest available fiqh position. Pending
      tashih by pengasuh. Subject to correction.**
- [x] FASE 2 — Step 2 (PROVISIONAL, 26 Sep): logika P3 terimplementasi
      SEBELUM hasil tashih: haul anchor (`haul_start_date`; pembayaran
      = ta'jil, tidak me-reset), log standar emas
      `zakat_gold_standards` (append-only, skema v18),
      `valuation_mode` market (default; V1 proxy harga jual) / hpp
      (fallback) — `src/lib/zakat-valuation.ts` (murni) + route
      `/api/zakat` & `/api/zakat/gold-standards` + UI `/admin/zakat`
      + `test:zakat` (37 kasus). **Status: Provisional — menunggu
      tashih pengasuh. Subject to correction.**
- [ ] Diverifikasi: judul MUI Fatwa No. 78/2023 (untuk pengasuh) —
      referensi lama "DSN-MUI 8/2008" keliru (riset 26 Sep; lihat
      P3-TASHIH-ZAKAT.md §D footnote koreksi sitasi).
- [ ] FASE 2 — Step 3 (dokumen P4 hanya): lanjut setelah review +
      commit Step 2 (plan user, 26 Sep). Tunggu keputusan
      `P3-TASHIH-ZAKAT.md` (pengasuh); terapkan revisi hasil tashih
      = komit terpisah. Lihat SYARIAH-CHECKLIST.md seksi F.
- [ ] **sw.js refactor template-generate (FOLLOW-UP terpisah,
      BUKAN sekarang)** — ubah `scripts/inject-sw-version.mjs`
      dari in-place stamp menjadi MEN-GENERATE: template ter-track
      (mis. `public/sw.src.js`) + `public/sw.js` menjadi generated
      + `public/sw.js` masuk `.gitignore`. Eliminasi root-cause
      mutasi in-place. Verifikasi: perilaku SW di deploy TETAP
      SAMA + build lokal/Cloud. Detail: MEMORY.md seksi
      "PWA Installability" item guardrail.

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
- [x] GROSIR v1 (harga grosir per produk + integrasi POS) — SELESAI
      (25 Sep 2026): modul murni `src/lib/wholesale.ts` (rumus satu
      sumber: pct = MAKS(tier terbaik, global) vs base_price; harga
      manual kasir menang); test `npm run test:wholesale` (38 cek).
      Kolom `wholesale` (JSON tiers) di /api/products; endpoint anyar
      `GET/POST /api/products/[id]/prices` (replace, admin/manajer,
      audit `product:wholesale`); index `idx_product_prices_product`.
      UI admin /admin/produk seksi "Harga grosir" (tier min_qty→diskon%
      + preview). POS: auto-harga add/qty, badge "Grosir −X%" / "Harga
      manual", recompute saat setting global tiba. Setting global
      `wholesale_min`/`wholesale_discount` + `product_prices` kini
      TERGUNAKAI. Struk WA & laporan tidak diubah (v2: HPP per tier +
      struk grosir).
 - [x] **Monitor grosir v1** (`scripts/zz-grosir-monitor.mjs`, ops) —
       SELESAI (25 Sep 2026, disetujui user): read-only; koneksi
       Turso **raw HTTP** (tanpa driver native) utk produksi,
       `node:sqlite` (readOnly) utk `DATABASE_URL` file: (dev lokal).
       Cek 7 hari (arg `dina`): row grosir + margin (omzet−HPP−komisi
       konsinyasi; rumus DIIMPORT `src/lib/wholesale.ts` — satu
       sumber; harga manual kasir = flag INFO, bukan error), konsinyasi
       (`sales.konsinyasi/konsinyasi_commission`), audit log 7d + aksi
       terbanyak, probe HTTP 5xx route produksi (`APP_URL`, default
       kopontren-hijrah.vercel.app; `APP_URL=off` skip). Exit 1 bila
       5xx / baris rugi / DB tak terjangkau. Fallback skema lama
       (tanpa kolom P4) otomatis. Uji live 25 Sep: 5 route bebas 5xx,
       0 baris rugi.
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
- [x] UI/UX (laporan audit 4-fase) — **SELESAI**: Modal `✕` ≥44px +
      ESC + focus-trap + `aria-modal`; kontras skeleton dinaikkan;
      panel bantuan hotkey POS ada (cheatsheet `?`, F1–F9 + Ctrl-*);
      Toast `aria-live`. Live @ `c364b2c` (+ batch 5 hotkey POS),
      divalidasi ulang 23 Sep (grep + `git merge-base`). Keyboard-nav
      tablist (APG, 4 grup): TERVERIFIKASI 25 Sep (Batch #4) — 4 grup
      (belanja in/out, data backup/audit, konsinyasi, POS kategori) sudah
      terwired `useTablistNav` di `src/components/ui.tsx`; tak ada grup
      tersisa.
- [x] Validasi `pay_split` saat IMPORT backup (🟠, laporan review
      Fitur 3) — menunggu approval: normalisasi via `parsePaySplit`
      + Σ=total; non-valid → null (legacy).
- [r] QRIS asli (gateway/NMID resmi) — KEPUTUSAN 22 Sep: DITUNDA sampai
      user (Makfi) urus NMID resmi (bank/agregator QRIS). **QRIS mock SVG di
      POS = PLACEHOLDER — JANGAN DIPAKAI PRODUCTION** (NMID `ID102003004050`
      fiktif, tidak bisa dibayar). Setelah NMID siap, lanjut opsi
      (A) payload EMVCo statis client-side + `qrcode` (tanpa API, verifikasi
      manual kasir) / (B) gateway dinamis Xendit/Midtrans (API key + webhook).
       **PROGRES 25 Sep (disetujui user):** opsi (A) v1 SUDAH dibangun
       sebagai PLACEHOLDER pralayar: `src/lib/qris.ts` (encoder
       EMVCo/QRIS-BI murni: TLV + CRC16-CCITT; statis 0111 / dinamis
       0112+tag54) + UI `/admin/qris` (form NMID/NMID2/MCC/kota + preview
       QR 1024px + download PNG + copy payload; state OFFLINE bila NMID
       kosong) + settings `qris_*` (default kosong; audit via
       saveSettings) + `npm run test:qris` 28/28. POS mock SVG lama
       tidak disentuh (scope batch #5). NMID resmi dari provider tinggal
       diisi di /admin/qris — QR langsung fungsional.
- [x] Cetak label barcode produk — SELESAI (22 Sep): tombol "Label" di
      tabel /admin/produk membuka `ProductBarcodeLabel`
      (`src/components/admin/product-label.tsx`): QR berisi nilai field
      barcode produk (discan CameraScan kasir via jsQR / diketik
      manual), grid 2 kolom A4, pilihan 2–24 lembar, print via
      window + document.write (pola MemberQrBadge, nilai di-escape
      HTML). Butuh field barcode terisi dulu (toast penunjuk).
- [x] `debts` & `payables`: ringkasan `date('now')` (UTC) bisa meleset
      ±7 jam utk jatuh tempo tengah malam — **SELESAI (Batch F `c392237`,
      24 Sep 2026)**: cutoff overdue payables + badge hutang/piutang kini
      WIB (client baca device timezone, agregat server ikut boundary WIB);
      boundary `from` CSV laporan juga WIB (`startOfDayJakarta` +
      `T00:00:00+07:00`).
- [r] Notifikasi `cash_low`: pemicu `notifyCashBalance()` mengecek saldo
      kas penuh (5 query SUM) tiap jurnal — throttled dedupe 60 mnt,
      biarkan tapi pantau Rows Read.
- [x] `amount_paid`/`change` POST /api/sales dipercaya dari klien —
      **SELESAI (Batch F `1a07ed1`, 24 Sep 2026)**: normalisasi server
      (`paid` ≥ `total`, partial paid tak mungkin lagi; `change`
      di-recompute: cash = paid−total, tf/wa/split = 0) + normalisasi
      sama di import backup; alur offline-queue tak berubah (clamp
      hanya di sisi penerima).
- [x] **Audit Batch F (24 Sep 2026): item F-1 ditandai STALE** —
      temuan tak lagi berlaku setelah re-verify (stale); **tanpa
      perubahan kode** — hanya tercatat di MEMORY.md + item ini,
      tidak ada commit khusus.

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
- [x] **Riwayat poin & reward per member (point_history) — SELESAI (25 Sep 2026):**
  endpoint baru `GET /api/members/[id]/points` (tier 'member', paginasi limit 20)
  + `src/lib/points.ts` (label reason + deteksi unit delta + query, modul murni
  teruji node:sqlite) + aksi "Riwayat" & modal di /admin/member (tabel + kartu
  mobile, saldo poin & reward, "Muat lebih banyak", empty/error state,
  busy-guard) + `npm run test:points` (27 cek). Ledger point_history sudah
  tertulis sejak fitur redemsi (23 Sep); ini layer TAYANAN-nya. TSC 0,
  build EXIT 0, regresi 6 suite 0 gagal, dual-push master+main.
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
- [x] **Test manual ikon PWA taskbar — HANDLED USER NANG EDGE LAPTOP
      (LULUS 24 Sep, dieksekusi pas wanci cutover `4c31dc0c5819`):**
      Akar masalah ketemu: `public/icon-180.png` server-side KORUP
      (1,921 B, kotak putih + garis biru); PWA terinstall di periode
      rusak → .ico taskbar stuck di icon-cache Windows. Fix wis
      committed: `608074d` (regen icon-180 = 11,493 B + `?v=2` bust
      + header ikon/logo `max-age=86400`) & `7e6cb37` (next.config.mjs
      source EXACT — verified lokal `tsc` exit 0 + `npm run build`
      EXIT 0, 48 page). Kedua wis dual-push master+main; cutover
      Cutover Vercel LIVE (sw stamp `4c31dc0c5819`; icon-180 live =
      11,493 B; manifest live `?v=2`; ikon CC `max-age=86400`).
      **Hasil test "nuclear reset": logo taskbar KATON ✓ + Start
      menu KATON ✓ + PWA fungsional ✓ → item TUTUP 24 Sep.**
      Prosedur "nuclear reset" (UDH DIEKSEKUSI — saka reference
      bilangan kali balik gagal):
      1. Uninstall PWA: klik kanan shortcut "Kopontren" nang
         taskbar/Start menu → **Uninstall**
      2. Tutup Edge total (cek tray) → hapus:
         - `%LOCALAPPDATA%\Microsoft\Edge\User Data\Chrome (PWA)`
           (folder PWA terinstall)
         - `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Service
           Worker`, `...\Default\Cache`, `...\Default\Code Cache`
         - `%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*.db`
           & `thumbcache*.db` ( Explorer kudu mati/reboot )
         → `Win+R` `ie4uinit.exe -show` → **reboot**
      3. Edge → Settings → Privacy, search & services → Clear
         browsing data → "All time" (✓ Cached images & files,
         ✓ Site data & service workers)
      4. Buka `https://kopontren-gamma.vercel.app` → Install app
         maneh (ikon PWA nang menu)
      5. Cek: ikon taskbar & Start menu = logo (ora kothakan
         putih). Bila MASIH gagal → debug `chrome://serviceworker
         -internals` / `chrome://components` / flag
         `edge-automatic-https-encryption-disabled` (ref. seksi
         PWA/Favicon ing MEMORY.md) → LAPOR hasilnya

## Housekeeping (24 Sep)
- [x] **Cleanup file scratch root — commit `ba5f272` (dual-push):**
      113 file scratch dihapus (semua untracked — aman):
      `.audit-*.txt` (17) + `.build-*.txt`/`.tsc-*.txt` (7) +
      `_*.txt`/`_*.log`/`_*.json` (88) + `*.log` top-level (6).
      Root: 119 → 24 file. 6 file `.mjs` (bukti bug `tx()`:
      `_txlib.mjs`, `_probe4.mjs` + 4 tool sesi) DIPINDAH ke
      `desktop-archive/` (gitignored, tetep available). `.gitignore`
      +3 pattern (`.audit-*.txt`/`.build-*.txt`/`.tsc-*.txt`)
      anti-pollute. Verifikasi: `tsc --noEmit` EXIT 0 + `next build`
      EXIT 0 (48 page). JANGAN HAPUS (udh dijaga): CSV data user
      (`stok-*.csv`, `_products_update.csv`), `src/`, `public/sw.js`
      (artefak build — jangan commit), `public/icon-*.png`, script
      user (`build.ps1`, `smoke.ps1`, `server.ps1`, `rebuild.bat`),
      `state.txt` + `DEPLOY-VERCEL.txt` (tracked). `scripts/zz-*`
      = kosong (ora ana).

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

## FASE 2 — Audit UI/UX lengkap (23 Sep 2026) — STATUS: TUNGGU APPROVAL
Audit dhisik, **belum ada perubahan UI**. Temuan per halaman (prioritas:
P1 = fungsional/menyesatkan, P2 = UX/mobil, P3 = konsistensi/kosmetik).
Tag: [kom] komunikasi, [bug] UX-fungsional, [mobil], [a11y], [kons]
konsistensi.

### Global / shell / komponen bersama
- P1 [bug] **Double-submit tanpa guard** di form pencatatan:
  piutang (create/pay), hutang (create/pay), belanja (addPurchase/
  addExpense), kas (addEntry), konsinyasi (create/jual/kembalikan/
  bayar), produk & member (save modal), pengguna (createUser).
  Button tidak `disabled` selama request jalan — tap dobel di HP
  = data dobel. (Pola sudah benar di: member-settings,
  notification-*, data, POS, shift.)
- P1 [kom] **Label total belanja menipu**: `belanja-client`
  menuliskan "Total pengeluaran: X (50 pengeluaran terbaru)"
  padahal total AGREGAT GLOBAL (sumber `totals` server) & daftar
  hanya 50 terbaru.
- P2 [mobil] **Tabel lebar scroll horizontal di HP**: kas
  (`min-w-[36rem]`), shift (`min-w-[40rem]`, 7 kolom), produk,
  member, audit — alternatif: card per baris di <sm.
- P2 [a11y] `aria` minim di aksi tabel (produk/member/pengguna/
  laporan-admin: button teks tanpa `type`, hit-area kecil,
  pemisah "|" mentah) & label sumbu chart `text-[9px]`.
- P2 [kons] **Terminologi metode bayar tidak seragam** antar
  halaman: dashboard (Tunai/QRIS/Transfer/Campur), laporan
  (tf=Transfer), shift (QRIS/WA), pengurus-dashboard (CASH/TF/WA),
  laporan-admin (raw key `capitalize`). Rekomendasi: 1 map label
  di `lib/pay-methods.ts` dipakai semua.
- P2 [kons] **Fallback loading tidak seragam**: `PageSkeleton` di
  10 halaman vs teks "Memuat komponen…" di 6 (piutang, retur,
  audit, hutang, shift, zakat).
- P3 [bug-ringan] `toggleActive` pengguna: tanpa feedback
  (sukses/gagal sunyi) — satu-satunya mutasi tanpa toast.

### / (Ringkasan / dashboard peran)
- Baik: banner password-default komunikatif + link solusi; kasir
  dapat layout khusus (CTA MULAI JUAL + transaksi terakhir
  read-only).
- P3: teks "Menu pengurus … tersedia di navigasi atas" — di layout
  mobile navigasi ada di hamburger + bottom nav; kalimat
  membingungkan. **RESOLVED 25 Sep, commit `61dadd4`**: teks kini
  "tersedia di menu navigasi — baris atas di desktop, tombol
  hamburger di layar kecil".

### /kasir (POS)
- Terbaik se-app: busy-guard, queue offline + toast sinkron,
  hotkey F4/F6-F9 + cheatsheet, validasi stok dobel, a11y paling
  lengkap (7 aria).
- P3 [mobil]: input qty `disabled` diam-diam (alasan baru ketahuan
  dari toast saat coba tambah).

### /laporan (Laporan & Rekap)
- P2 [bug]: loop pagination — jika 1 request di tengah gagal
  (`!r.ok`), daftar TERPOTONG tanpa indikator.
- P2 [a11y]: accordion transaksi tanpa `aria-expanded`.
- Good: filter periode/status/cari, Undo 5 dtk utk tandai status,
  share WA rekap.


### /piutang + /admin/hutang
- P1 [bug] double-submit (create & terima-bayar/bayar) — lihat global.
- Good: modal pembayaran komunikatif (peringatan melebihi sisa,
  auto-lunas, penjelasan kas keluar utk hutang), badge Tunggak /
  Awas jatuh tempo.

### /retur
- P2: dropdown transaksi hanya 100 terakhir (30 hari) — transaksi
  lebih lama tak bisa dipilih; komunikasikan batasan atau tambah
  pencarian.
- Good: estimasi nilai retur live + preview efek ("masuk jurnal kas
  keluar + stok +N").

### /admin/belanja
- P1 label total menipu (lihat global). P2 tab "Stok Masuk /
  Pengeluaran" = button biasa, bukan tab semantik.

### /admin/kas
- P2 [a11y/mobil] tombol "hapus" jurnal `text-[10px]` tanpa
  padding (hit-area < 24px).
- P2 `removeEntry` fire-and-forget: tanpa toast sukses/gagal.
- Good: saldo kas berwarna + rumus penjelasan.

### /admin/konsinyasi
- [x] P1 [bug] aksi jual/kembalikan/bayar tanpa guard busy — SELESAI di P4
  (state `busy` global + `disabled={busy}` semua tombol aksi + guard
  `if (busy) return` di `post()`).
- [x] (25 Sep) P1 [bug] tombol "Terima Konsinyasi" → error "Aksi tidak
  dikenal" (regresi P4-B: form tidak pernah kirim `action:'create'` ke
  switch-case server; kena saat klien PWA cache-lama vs server baru) —
  fix `e027596` (client kirim `action:'create'` + server toleran
  `!b.action → 'create'`).
- [x] (25 Sep) P2 [bug] kolom harga "Rp / unit" default 0 nyangkut saat
  klik/ketik — fix `e027596` (default kosong + placeholder "0").
- [x] (25 Sep) UX: form dijelas utk user awam (`dbc5d45`) — card panduan
  "Cara Kerja Konsinyasi" + hint tiap field + preview perhitungan live +
  istilah sederhana ("Komisi Khusus Pemilik" menggantikan "Rate
  per-pemilik"/"Pre-fill"/"Ujrah").
- Good: "Muat riwayat lebih lama" (server-paginated), kartu per
  konsinyasi (sisa/payable/unpaid).

### /admin/shift
- P2 [mobil] tabel 7 kolom min-w-40rem (lihat global).
- Good: empty state ajakan "Buka shift dulu di menu Kasir (POS)";
  kasir lihat shift sendiri, admin semua + checkbox setor.

### /admin/audit
- Good: filter user/tabel/sejak, modal detail before/after
  (merah/hijau), purge 30/90/365 dengan confirm, "Muat lebih
  banyak log".
- P3: dropdown filter user hanya berisi user dari 50 log pertama.
  **RESOLVED 25 Sep, commit `61dadd4`**: `/api/audit` kini kembalikan
  `users` dari tabel `users` (aktif, cache 60 dtk `audit:users`);
  client pakai `data.users` + fallback ke turunan log.

### /admin/produk
- P1 [bug] save modal tanpa busy guard.
- P2 [mobil] aksi baris "Label | Ubah | Hapus" teks-pipih — sulit
  diketik di HP; ganti icon-button berlabel.
- Good: pencarian + filter kategori + status, edit stok inline,
  bulk ops, cetak label barcode.

### /admin/pengguna
- P1 [bug] createUser tanpa guard; `toggleActive` sunyi (global).
- Good: modal reset PW/PIN, atur timeout sesi.

### /admin/member
- Good: virtual list + debounce server-search.
- P1 [bug] save modal tanpa guard; P2 aksi baris pipih (seperti
  produk).

### /admin/dashboard
- Good: 6 KPI card clickable + LowStockClient (prediksi hari habis
  + Notif WA deep-link + salin pesan).
- P3 [kom] badge "14hr: 0/j" & "±N hr" cryptic — ganti "0 terjual
  14 hari" → "belum ada penjualan 14 hari".

### /pengurus/dashboard
- P2 [kons] PAY_LABEL hanya CASH/TF/WA uppercase — beda dari
  semua halaman lain.
- Good: chart anomali + export CSV/XLSX/PDF + kirim WA laporan +
  state error eksplisit.

### /admin/laporan (Laporan Pengurus)
- P2 [kons] by_method tampil raw key (`capitalize`).
- Good: catatan metodologi HPP historis (komunikatif).

### /admin/notifications (+settings)
- Good: bell portal + clamp viewport (HP aman), polling 30 dtk,
  mark-all, settings toggle per-jenis + push PWA (busy-guard,
  spinner).

### /admin/data & /admin/migrate
- Good: busy-guard import/reset, "Hapus Semua Data" dengan
  confirm, progress + fatal state migrate.
- P3 [kom] `window.open('/api/backup')` membuka tab API (kedip
  halaman kosong) — bisa blob download seperti CSV zakat.

### /login, /login/pin, /login/pin/setup
- Sudah bagus (hasil fix minor): timeout 10 dtk + pesan galat
  spesifik + error state tidak stuck.
- P3: `pin/setup` — bila cek sesi gagal, UI tetap tampil tanpa
  penjelasan → tambah hint "tak bisa cek sesi, lanjutkan saja
  (POST akan memvalidasi)".

### Batch rekomendasi (untuk approval user)
- **Batch A (bug fungsional, 1 commit) — SELESAI, commit `9ef700e`:**
  guard busy 8 form (piutang, hutang, belanja, kas, konsinyasi, produk,
  member, pengguna) via `useState` per-file + label total belanja
  "(dari semua data)" (tab in & out) + toast removeEntry (kas) &
  toggleActive (pengguna) + footer "Menampilkan X dari N transaksi"
  (GET /api/sales + kolom `total`).
- **Batch B (mobile) — SELESAI, commit `cb792aa` (23 Sep):**
  tabel → card di <sm (kas, shift, produk, member, audit) +
  hit-area 44px. Pola yang dieksekusi: tabel `hidden sm:block` +
  card list `sm:hidden` (sumber data sama; state/logika tak diubah),
  tombol aksi card `h-11` mobile / `sm:h-9` desktop. Fix khusus:
  hapus jurnal kas di card = ikon `Trash2` 44×44 + aria-label;
  toggle Aktif/Nonaktif produk kini bisa di mobile (lewat card);
  checkbox "Setor kas" shift + tombol load-more 44px. Verifikasi:
  `tsc --noEmit` exit 0 + `npm run build` exit 0, dual-push
  master+main. Rincian lengkap: MEMORY.md seksi FASE 2.
- [x] **Test manual Batch A nang HP (23 Sep, pasca-deploy `bf52f63`) —
  HANDLED USER, SEMUA 4 POKIN OK (hasil user 23 Sep):** (1) double-tap button form (piutang/hutang/kas/dll)
  → tap ke-2 diabaikan (tidak ada request dobel), (2) label total
  belanja "(dari semua data)" di tab in & out, (3) footer laporan
  "Menampilkan X dari N transaksi", (4) toast sukses/hapus jurnal kas
  & toggle pengguna. **Bagian Vercel "Ready" = TER-VERIFIKASI**
  (dashboard user: `bf52f63` Ready+Production; fingerprint LIVE
  `kopontren-gamma` ✓ — detail: MEMORY.md seksi "Re-Verifikasi LIVE").
  Test lulus → **Batch B di-approve & dieksekusi @ `cb792aa`**.
- **Batch C (komunikasi/konsistensi) — SELESAI, commit `ec9d9c9`
  (23 Sep):** 22 file, +181/−77, murni presentasional.
  (1) `lib/pay-methods.ts`: `PAY_METHOD_LABEL` + `payMethodLabel()`
  kanonik; 6 map lokal dihapus, 16 call-site seragam.
  (2) 7 page wrapper next/dynamic (audit, hutang, pengaturan-member,
  shift, zakat, piutang, retur) kini `PageSkeleton`.
  (3) LowStock: "14hr: 0/j" → "belum ada penjualan 14 hari",
  "±N hr" → "habis dalam N hari".
  (4) h1 aksen: konsinyasi/produk/belanja dapat span accent;
  laporan amber→accent.
  (5) pin/setup: catch/status tak dikenal tak lagi nyangkut
  "Memeriksa sesi" + hint amber (validasi tetap server-side).
  (6) 4 unduhan `window.open('/api/...')` (data-client ×2,
  laporan-client, laporan-admin) → `fetch`+Blob+objectURL+download
  + busy `dl` + toast. Verifikasi: `tsc --noEmit` 0, `npm run
  build` EXIT 0 (47 rute), dual-push master+main @ `ec9d9c9`.
- **Batch D (a11y polish) — SELESAI, commit `e9ebfdb` (23 Sep):**
  30 file, +194/−161, murni atribut.
  (1) `aria-expanded` ×3: akordion transaksi `laporan-client`
  (+`aria-controls`), toggle panel `notification-bell`, tombol
  menu mobile `sidebar`.
  (2) `role="tablist"` ×3 baru (+`role="tab"`+`aria-selected`
  di 6 tombol): belanja in/out, data backup/audit,
  konsinyasi active/done (pos-client sudah punya tablist).
  (3) `type="button"` di 154 tombol tanpa `type` eksplisit
  (submit form login tak disentuh).
  (4) Sumbu x `SalesBarChart` `text-[9px]`→`text-[11px]`.
  Verifikasi: tsc 0, build EXIT 0, grep + scanner bersih,
  dual-push master+main @ `e9ebfdb`.
  **Sisa pending:** QRIS/grosir (tunda, NMID) — **UPDATE 25 Sep:** opsi
  (A) QRIS v1 placeholder + monitor grosir v1 SUDAH SELESAI (lihat item
  atas); tinggal NMID resmi turun. point_history SUDAH SELESAI
  (25 Sep: riwayat poin & reward per member, layer tayangan ledger).
  (test ikon PWA Edge LULUS 24 Sep.)
- [x] **PWA: banner notifikasi update** (25 Sep): SW baru (konten
  /sw.js berubah — marker SW-BUILD tiap build) kini memicu banner
  kuning bawah layar "🆕 Versi anyar tersedia" + tombol "Nanti" /
  "Perbarui" (`sw-register.tsx`: `updatefound`+`statechange`+race-check;
  "Perbarui" → postMessage SKIP_WAITING → `controllerchange` → reload,
  fallback timer 2 dtk; "Nanti" → sessionStorage, muncul lagi saat
  aplikasi ditutup & dibuka ulang; TIDAK auto-reload biar kasir tak
  terganggu). `sw.js` +handler `message` SKIP_WAITING. Verifikasi: tsc 0,
  next build EXIT 0 (51 hal), regresi 6 suite 0 gagal. Manual QA HP:
  deploy → tutup paksa PWA → buka → banner → tap "Perbarui" → reload.


- **Batch #5: Kartu Membership + Jam Sibuk (25 Sep, ACC Gus Fi) —
  SELESAI (kode) — nunggu uji manual HP (bukan produksi penuh):**
  (1) Kartu Membership: `MemberQrBadge` ditulis ulang — modal kartu
  landscape maroon (pratinjau + print `@page landscape`) dgn badge tier
  (GOLD/SILVER), statistik Poin/Cashback/Total Belanja, footer
  "Tunjukkan kartu ini saat berbelanja — poin & cashback (uang
  kembali) diterapkan otomatis."; `qr_code` kosong → auto-generate
  (PATCH admin-only, 403 → hint amber); "Perbarui QR" dgn dialog
  konfirmasi (kartu lama tak berlaku lagi); aksi "Kartu" di
  `/admin/member` (desktop + mobile card); `GET /api/members` +
  `qr_code` (additive, tier 'pos' — kasir perlu token utk scanner).
  (2) Jam Sibuk: `GET /api/reports/hourly` (bucket 24 jam WIB
  `strftime('%H', created_at, '+7 hours')`, clamp days 1–365, tier
  'laporan', cache `reports:hourly:<from>` ikut `invalidate('reports:')`
  dari route tulis — TER-VERIFIKASI); `HourBarChart` di `charts.tsx`
  (CSS murni tanpa dependency; 24 bar min-width 480px + scroll
  horizontal di HP; aria-label + title tiap bar; jam puncak sorot
  amber); kartu "Jam Sibuk" di tab Ringkasan sinkron preset
  1/7/30/365 + callout puncak; silent-fail (console.error, tak
  merusak tab).
  Verifikasi: `tsc --noEmit` exit 0, `next build` EXIT 0 (52 rute,
  `/api/reports/hourly` live di route table). **Cek keamanan PII
  (selesai, instruksi Gus 25 Sep)**: `GET/POST /api/members` guard
  tier 'pos' = admin/manajer/kasir (auth.ts L65) → gudang/pembelian/
  pengurus TIDAK dapat akses (403), `qr_code` tak bocor;
  `PATCH /api/members/[id]` `isAdmin()`-only. **Sisa uji manual
  (checklist)**: (a) cetak kartu per tier (tanpa/silver/gold),
  (b) qr_code kosong → auto-generate → **persistence: tutup modal →
  buka lagi → QR HARUS PADHA** (kalau ganti, berarti tak ke-save)
  → cetak → token discan,
  (c) preset 1/7/30/365 sinkron,
  (d) kasir → 403 pada "Perbarui QR" **+ cek level API: kasir
  `PATCH /api/members/[id] {regenerate_qr}` langsung = 403**,
  (e) 24 bar di HP scroll horizontal (aria-label tiap bar sudah
  ada — cukup verifikasi visual; bila terasa berat, opsi agregasi
  2 jam sebagai fallback),
  (f) setelah lulus semua → laporkan hasil ke Gus, dia mutusake
  Batch UX-1 vs nunggu validasi non-eng (P3/P4/NMID/grosir).
  Detail: MEMORY.md seksi "Sesi 25 Sep 2026 — Batch #5".
- **Versi HTML P3/P4 kirim ulama & pengurus (25 Sep, ACC Gus Fi):
  SELESAI (commit + dual-push terlampir):** `P3-TASHIH-ZAKAT.html`
  (checklist tashih ulama zakat: 3 soal + blok keputusan + identitas
  panel) & `P4-PROPOSAL-KONSINYASI.html` (proposal pengurus konsinyasi:
  tabel skema + 3 checkbox persetujuan + tanda tangan). Standalone,
  mobile-friendly, print-ready, basa-awam, tag balance terverif.
  **Sisa:** kirim ke ulama (P3) & pengurus (P4) → catat keputusan
  nang MEMORY.md + SYARIAH-CHECKLIST.md.

