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
- [x] FASE 2 — Step 3 (dokumen P4 hanya) — SELESAI (26 Sep,
      commit 3, dual-push master+main): mapping akuntansi P4
      (supplier ≠ revenue Kopontren; ujrah = revenue — off-P&L
      memo V1 → pendapatan setelah tashih; hak supplier =
      settlement payable) + item A1.1 + sinkron md & html
      (keputusan user 26 Sep: md sumber ikut di-update).
      Tunggu keputusan `P3-TASHIH-ZAKAT.md` (pengasuh); terapkan
      revisi hasil tashih = komit terpisah. Lihat SYARIAH-CHECKLIST.md
      seksi F.
- [ ] **A1.1 (koreksi keuangan pascataashih P4)**: pindahkan ujrah
      konsinyasi dari off-P&L (memo, baris "Ujrah Konsinyasi") ke
      pendapatan setelah tashih pengasuh + klasifikasi tagihan
      pemilik = settlement payable (kewajiban toko). Eksekusi =
      komit terpisah setelah hasil tashih turun (bukan sekarang).
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

- [x] **Tutorial / dokumentasi in-app (T1-T3, 28-29 Sep 2026)** —
      SELESAI: `docs/*.html` (8: DOKUMENTASI-APLIKASI + 7 SOP) =
      source of truth -> `npm run sync:tutorial`
      (`scripts/sync-tutorial.mjs`) menyalin ke
      `public/tutorial/<slug>.html` (hapus stale + GATE 0 tag
      `<script>` + cek ukuran; `public/tutorial/` TIDAK pernah
      diedit manual; pelanggaran = exit 1 SYNC-TUTORIAL-FAIL).
      T1 `784cd86`: script + 8 HTML + script package.json.
      T2 `117e20a`: `src/lib/tutorial-data.ts` (TUTORIALS[8]
      slug/tittle/deskripsi, map identik dgn sync MAP;
      `slugOk()`/`tutorialBySlug()`), `/tutorial` landing
      (guard login + level personal = 7 role; grid 8 kartu),
      `/tutorial/[slug]` viewer (iframe
      `sandbox="allow-same-origin"` TANPA allow-scripts —
      pertahanan vs script injection; slug tak dikenal ->
      notFound(), 404 page sudah ada), sidebar link "Tutorial"
      level personal di 7 menu role (+item menu member; label
      level pengurus "Khusus Pengurus" -> "Semua Level").
      T3 = commit ini (docs MEMORY + TODO). Konvensi: ubah
      `docs/*.html` -> `npm run sync:tutorial` -> commit docs +
      `public/tutorial` BERSAMA. Verifikasi: T2 tsc EXIT 0;
      pixel-check /tutorial + 1 halaman viewer + 404 (Gus Fi,
      non-blocking).

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
- [x] **Theme warna global (5 preset) — SELESAI T1-T4 (29 Sep 2026):**
  kustomisasi warna app tanpa ubah kode (V1, Option A):
  `docs/color-theme-audit.md` (audit + plan, T1 `b230a3e`) +
  lapisan override CSS var `data-brand` di globals.css
  (T2 `2c4940b`, 38 aturan unlayered, maroon = pixel-identik) +
  settings key `theme` allow-list `maroon|green|blue|dark-maroon|
  slate` TANPA migration (T3 `346229d`): GET/PUT /api/settings +
  hook Shell (`<html data-brand>` + `meta theme-color` + event
  `kopontren:theme-change` live-switch) + kartu "Tema warna"
  (dropdown + swatch + Simpan) di /admin/pengguna + migrasi
  checkbox `accent-[#7A1835]` -> `accent-[var(--ac500)]`.
  Fallback tema tak dikenal/absen = `maroon`. Sync point hex
  (ubah bareng): var blocks globals.css = map `SWATCH`
  (pengguna-client) = map `META` (shell.tsx). Constraint:
  manifest PWA tetap maroon statis. tsc EXIT 0 + `next build`
  0/0, dual-push master+main. Visual check 5 preset ACC Gus Fi
  29 Sep. V2 opsional (non-blocking): live-push sesi lain +
  mitigasi flash load awal.
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
       Koreksi 26 Sep (Cline, verifikasi `git ls-files` +
       `check-ignore` + `git log --all -- public/sw.js`): `public/sw.js`
       ini TER-TRACK di git + skip-worktree aktif (flag `S`) →
       perubahan stamp tak pernah muncul di `git status`, tapi file
       ini tetap bisa ter-`git add` manual bila sengaja. Jadi
       "artefak build, jangan commit" berarti: jangan pernah
       `git add public/sw.js` / `git commit -a`; plan refactor
       (~baris 180, TODO sw.js template-generate) akan membuat
       `public/sw.src.js` ter-track + `public/sw.js` generated +
       di-gitignore, yang mengeliminasi root-cause secara struktural.
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
- [x] **UX-2: EmptyState CTA + PanduanKasir (26 Sep, ACC Gus Fi) —
  SELESAI (2 commit, dual-push master+main):** acuan goal document
  (3 file, 95 usulan, 8 fase UX-2→UX-8); UX-2 = R2 + R4.
  (1) **R2 `32d0538`** — `EmptyState` `ctaVariant="primary"` di
  dashboard + laporan (15 site), scroll-to-form (6 ID), `canAccess`
  laporan, upgrade banner shift POS; 12 file +225/−51; tsc 0,
  build EXIT 0 (53 rute), smoke 10/10, dual-push @ `32d0538`.
  (2) **R4 `e7130c3`** — `pos-client.tsx` (1 file, +90/−19):
  tombol ghost "Panduan kasir" (BookOpen) di banner shift + modal
  "Panduan Kasir" 3 seksi: Cara transaksi (5 langkah; pembeli
  opsional: F2 nama bebas / F8 member), Pintasan (CHEAT_ROWS +
  catatan Chrome), Jika ada masalah (4 bullet aksi konkret);
  tsc 0, build EXIT 0, dual-push @ `e7130c3`.
  **Sisa:** pixel-check real device oleh Gus Fi (breakage →
  follow-up commit). **UX-3 (TermTip + StatusBadge + rename
  `.hero-bg`)** — SELESAI 26 Sep, commit berikut.
  Detail: MEMORY.md seksi "UX-3" di bawah 2026-09-26.
  **Berikutnya: UX-4** (merujuk goal document 8 fase).
**UPDATE 27 Sep:** FASE A (design tokens) SELESAI @ `5698b74`
(9 file, +143/−47; tsc exit 0, build 53/53 rute); FASE B (Button
primitive B.1 @ `592b230` + keputusan C2/C3) dan FASE C (migrasi
`<Button>` ke 30 file + hapus CSS legacy `btn-*`/`.field`/`.card-field`,
@ `3a59c9a`, +561/−583; tsc exit 0, build EXIT 0) **SELESAI**,
dual-push master+main.
**Berikutnya:** pixel-check real device oleh Gus Fi (tombol kini
global min-height 44px; breakage → follow-up commit); UX-5.

**UPDATE 27 Sep (FASE D):** FASE D (tabel) SELESAI — D0 `4dd28c2`
(hapus rules `.btn` yatim, close debt B.4), D1 `0637ee7`
(primitive `Table`/`Th`/`Td`/`Trow`/`TEmpty` di `ui.tsx`),
D2a `9a20a1b` (migrasi 7 tabel legacy), D2b `5ac6080` (migrasi
4 tabel: kas, pengguna, migrate, zakat + hapus CSS legacy
`.th`/`.td`/`.table-row` dr `globals.css`; tsc exit 0, build
EXIT 0 53/53, dual-push master+main). Delta approved (Opsi A,
6+2): header bold, sel 10px, rose panel 14px, `w-full`→
`min-w-[32rem]`, weight/werna header nang primitive, zakat 10px,
divider/hover kas+pengguna dihapus (sesuai bahasa D2a), padding
`px-3` simetris kolom pungkasan. **Sisa:** pixel-check real
device oleh Gus Fi — 4 halaman durung visual diverifikasi:
`/admin/audit`, `/admin/member`, `/admin/produk`, `/admin/data`
(+ tabel FASE D liyane manawa durung ketoke); 79 raw button
Phase B tetep disengka (chip sub-sm dll). **Berikutnya: FASE E**
(Card unification + FilterPill/TogglePill).
- [ ] (follow-up opsional) refresh doc comment stale `ui.tsx`
  L833/L906 (masih merujuk CSS legacy `.th`/`.td` sing wis
  dihapus).

**UPDATE 27 Sep (FASE E):** audit Card + FilterPill/TogglePill
SELESAI (read-only, ora kode; laporan lengkap nang sesi AI 27
Sep). Temuan ringkas: hero 5 site drifty shadow; modal/panel 3
radius x 3 shadow; tile hover drifty; stray `shadow` + anomali
`pos-client:1781` (pixel-check); kandidat pill F1 (laporan),
F2 (pos tab, hover drift), T1 (pos segmented payment), T2/T3
(produk toggle desktop vs mobile). Proposal: `.card-hero` /
`.card-dialog` / `.card-pop` / `.tile-hover` (globals.css) +
`<FilterPill>` / `<TogglePill>` (ui.tsx).
- [x] E0 `15054d8`: docs - koreksi S5 kp note (3 entitas,
      kp-zip3 = kanonik) + catat audit FASE E nang MEMORY/TODO.
- [x] E1 `05c65aa`: primitif add-only (globals.css + ui.tsx):
      `.card-hero`/`.card-dialog`/`.card-pop`/`.tile-hover` +
      `<FilterPill>`/`<TogglePill>`.
- [x] E2 `06cbe8b`: migrasi card 11 file (home, dashboard
      admin/pengurus, notifications x2, member-qr-badge,
      product-label, sidebar) - delta visual (Q1 hero flat, Q4
      shadow `pos-client:1781` ilang). tsc+build EXIT 0,
      dual-push master+main.
- [x] E3 `4572b3f`: migrasi pill 3 file (laporan-client F1,
      pos-client F2+T1, produk-client T2/T3) - delta visual;
      Q3 parity desktop+mobile; normalisasi hover tab kategori
      `bg-slate-100` (standar E1). tsc+build EXIT 0,
      dual-push master+main.
- [x] E4 (commit iki): docs (MEMORY/TODO) + sinkron kp-zip3
      (mirror `src/`: copy semua, hapus 3 yatim
      `navpills.tsx`/`themetoggle.tsx`/`logout.tsx`,
      hash-verify MD5 0 differ) + dual-push.
- [x] ACC Gus Q1-Q5 (27 Sep, kabeh IYO): (1) hero flat
      (2) standarisasi panel dialog/popover (3) T3 selaras
      tinted (4) hapus shadow `pos-client:1781` (5) deprecate
      `C:\Users\baiti\Desktop\kp` (kanonik = `kp-zip3`).
- [x] Housekeeping (putus Gus 27 Sep): 2 CSV stok 09/23 =
      RETAIN (material item 4 upload CSV); scratch
      `_*.txt/_*.ps1` = git-ignored lokal (tetep nang D, ora
      ke-push); `.cline/` = data lokal Cline (wengi
      di-gitignore).
- [ ] Pixel-check E2+E3 (Gus Fi; daftar lengkap nang MEMORY.md
      seksi FASE E): `/laporan` chip periode - `/kasir` tab
      kategori + metode bayar (Campur amber) - `/admin/produk`
      toggle status - hero card flat - anomali
      `pos-client:1781` ilang.
### FASE F (audit + ACC 27 Sep; SELESAI 27 Sep F0-F3, dual-push)
- [x] Audit read-only: 62 situs arbitrary (`text-[10px]`
      26 + `text-[11px]` 36; 17 file; angka 67 stale) +
      token `2xs`/`1xs` wis ready (usage 0) +
      tracking/leading clean + 4 inkonsistensi
      micro-label (detail: MEMORY.md seksi FASE F).
- [x] ACC Gus Fi Q1-Q4: Q1 Opsi A (keep `2xs`/`1xs`,
      swap mekanis); Q2 include Badge `ui.tsx:33` →
      `text-xs` (F2 = 10 situs); Q3 4 commit terpisah
      (F0/F1/F2/F3); Q4 `sidebar:172` as-is
      (documented exception).
- [x] F0 @ `d1f7574`: catat audit + ACC + bersihke
      scratch `_fasef-*.txt`.
- [x] F1 @ `2ff5091`: token map `text-[10px]` →
      `text-2xs` + `text-[11px]` → `text-1xs` (61 owah,
      17 file; mekanis; residual = 1 mung sidebar:172
      Q4).
- [x] F2 @ `ce7e0cd`: `.card-label` + unifikasi
      micro-label KPI (10 situs, include Badge
      `text-xs`; delta visual 11/10px→12px + dark
      variant, ACC'd).
- [x] F3 (commit iki): docs + pixel-check list final +
      resync kp-zip3 `src/` (mirror + MD5).
- [ ] Pixel-check F1+F2 (Gus Fi; 8 item nang
      MEMORY.md seksi FASE F).
**FASE G (modal size + toast tone)** — ACC Gus, 27 Sep:
- [x] G1 (`99a3b20`): `Modal` prop `size` sm/md/lg (default `md`
      zero-delta) + migrasi 2 dialog manual (`member-qr-badge`,
      `product-label`). Dual-push.
- [x] G2 (`0ffb072`): `Toast` tone `info/success/error/warning`
      (info = kelas lawas persis); 22 file consumer + 54 call
      ketag (53 `'error'` + 1 `'warning'`). `useToast` 4-tuple,
      `showToast`/`clearToast` = `useCallback` (pitfall
      `member-qr-badge` useEffect — detail MEMORY.md § FASE G).
      Dual-push.
- [x] G3 (commit iki): docs (MEMORY + TODO) + resync `kp-zip3`
      (full-mirror `src/` + `README.md`, MD5 0 differ).
- [ ] G4: pixel-check 5 item (Gus Fi — 3 modals: Panduan Kasir,
      QR member `md`, label produk `sm`; 2 toasts: 1 error
      `rose-600` + 1 default `info`). Daftar ing MEMORY.md §
      FASE G.
- [ ] G2-full backlog (mangkase UX-5): ternary campuran
      success/error `pos-client:714/892/901` — ditinggal
      `'info'`, butuh keputusan per kasus.
**FASE H (UX-5 Information Architecture)** — ACC Gus Fi, 27 Sep:
- [x] H0 (commit iki): audit read-only 10 temuan (I-1..I-10) +
      ACC Q1-Q4 (Loyalty→OPERASIONAL; home `/`; bell +pengurus
      read-only; I-6/I-7 defer UX-6+) + plan commit. Detail:
      MEMORY.md § UX-5 FASE H.
- [x] H1: sidebar regroup 4 group (UTAMA/OPERASIONAL/KEUANGAN/
      SISTEM) + item-level filter (`Feature | 'ops' | 'admin'`,
      mirror guard) + fix I-1/I-2 + copy stale I-10 — DONE 27 Sep @ `c41ddfd`.
- [x] H3: member personal dashboard (filtered read-only:
      poin/status/QR + "transaksi saya"; CTA QR badge; fix I-4) — DONE 27 Sep @ `b5b4927`.
- [x] H2: role-aware redirect (unauthorized → role home; ora
      redirect anyar saka `/`; fix I-5) — DONE 27 Sep (11 file;
      pengurus/dashboard = fix pascakommit audit H4).
- [x] H4: breadcrumb komponen (mung nested `/admin/*`
      `/pengurus/*`; visual only; fix I-8) — DONE 27 Sep
      (komponen + shell, 0 edit hal.); pixel-check: light/
      dark/mobile @ /admin/produk.
- [x] H5: notif deep-link SPA (router ganti `location.href`;
      V1 link statik — `/admin/produk` ORA support `?focus=`;
      entity-focus = backlog) + bell pengurus (guard
      `/api/notifications` + `/admin/notifications`
      `isAdmin` → admin|pengurus; fix I-9) — DONE 27 Sep @ `a0b9f79` (7 file; Q3 opsi (a): viewer admin+pengurus read-only, penerima tetep admin-only → bell pengurus = 0; follow-up "pengurus sebagai penerima" = backlog UX-6+).
- [x] H6: docs + resync `kp-zip3` + pixel-check list (drawer 4
      role + breadcrumb + member dashboard) — DONE 27 Sep @ commit H6 (MEMORY § UX-5 H5 + list pixel-check H4/H5; resync lokal `kp-zip3`: copy `src/` + MD5 verify).
- [ ] Backlog UX-6+: I-6 shift-day screen · I-7 onboarding
      wizard · I-3 route hierarchy · G2-full ternary ·
      notif entity-focus `?focus=<id>` (butuh kolom meta
      `notifications` + produk-client).
      (angka I-x di baris ini = temuan audit FASE H, BUKAN
      nomor commit FASE I di bawah — namespace beda).

**FASE I (UX-6 Attention System)** — ACC Gus Fi, 27 Sep
(urutan: I-3→I-4→I-5→I-2→I-6→I-8; **I-7 DITUNDA**; per commit:
diff → ACC → tsc (+build utk kode) → dual-push master+main):
- [x] I-1: docs audit 8 kategori (A–H) + rencana per commit —
      DONE 27 Sep @ commit I-1 (MEMORY.md § UX-6 FASE I;
      koreksi: target edit = `ui.tsx` monolit, bukan ui/*).
- [x] I-3: delta konteks KPI — admin: hari ini vs kemarin;
      pengurus: 30h vs 30h-sebelumnya (compute server) +
      TermTip pakan delta; 4–5 kartu.
      **DONE 27 Sep @ `e484cbb`** (3 file: `lib/format.ts`
      `kpiDelta` + 2 dashboard; admin 2 kartu [penjualan vs
      kemarin, kas 7d vs 7d-sebelumnya], pengurus 3 kartu
      [penjualan 30h, kas 30h, member aktif = absolut "▲ N
      baru"]; tsc+build EXIT 0; dual-push master+main).
- [x] I-4: CTA di 5 Empty tanpa CTA — low-stock →
      /admin/produk; notification-list → settings
      (**admin-only**; pengurus = tanpa CTA, pola kondisional
      H3); zakat x2 → form zakat; member dashboard → POS
      (kondisional). **(selesai commit `6222bc70`: 6 file +123/−15;
      tsc+build EXIT 0 (53/53); dual-push master+main; catatan
      amend BOM + pelajaran commit-msg + pixel-check 4 item =
      MEMORY.md § UX-6 I-4)**
- [x] I-5: primitive `ErrorState` (pesan + tombol "Muat ulang"
      + `<details>` teknis) — terapkan 2 blok err laporan-admin
      (L461/L601) + seragamkan pola retry konsinyasi.
      **(selesai commit I-5: primitive di ui.tsx setelah `Empty`,
      `<pre>` text-1xs sesuai ACC; 3 blok (PL + Neraca +
      konsinyasi); hash I-5 = report, backfill docs I-2;
      pixel-check 3 item = MEMORY.md § UX-6 I-5)**
- [x] I-2: toast tone `critical` (auto-dismiss 90 dtk,
      manual-close; **sound = SKIP V1**) + slot undo
      `showToast(msg, tone, action?)` + 4 titik contoh.
      **(selesai commit I-2: `ToastTone` += `critical` +
      `ToastAction` slot + `useToast` 5-tuple (backward-compat,
      12 host aman); 4 titik = produk delete (undo PUT active=1)
      + bulk delete (undo via snapshot `extra.ids`), tutup shift
      critical, zakat gold-sync warning; OOS = undo zakat &
      sound; backfill hash I-5 `99c973c`; pixel-check 4 item =
      MEMORY.md § UX-6 I-2)**
- [x] I-6: `useConfirm` + `risk:1..5` (L1-2 tombol biasa;
      L3-4 tombol merah + ringkasan dampak; L5 + input nama
      entitas) — 3 contoh: hapus transaksi L3, purge audit L4,
      resetAll data L5. **(selesai commit I-6: primitive risk di
      ui.tsx — L1 direct (tanpa modal), L2 default (15 situs lama
      aman), L3 merah + impact[], L4 + alasan wajib (V1: BELUM
      ke server, wire V2 = param `reason` di DELETE `/api/audit`
      + rekam audit log), L5 + typeToConfirm 'RESET SEMUA DATA'
      (ketik persis); heuristic `confirmLabel==='Hapus'` pensiun;
      3 situs = kas removeEntry L3, audit purge L4, data resetAll
      L5; hash I-6 = `4de83fd` (backfilled di commit I-8);
      pixel-check 3 item = MEMORY.md § UX-6 I-6)**
- [x] I-8: kartu "Apa yang berubah" di /admin/dashboard +
      /pengurus/dashboard (5 audit log terbaru, server-side + KPI
       mover; SELESAI commit I-8: `activity-feed.tsx` baru
       (presentational, tanpa state) + query `audit_log LIMIT 5` di
       2 page dashboard; ACTION_LABEL 35 aksi + fallback raw;
       timeAgo "baru saja/Xm/Xj/HH.mm" WIB; guard tier `audit`
       (tanpa tier = kartu tersembunyi); tsc 0 + build 53/53;
       hash I-8 = report, backfill di commit docs berikutnya;
      CTA → Audit).
- [ ] I-7: **DITUNDA (ACC 27 Sep)** — void transaksi dgn
      alasan struktural (picker alasan + catatan bebas).
      Alasan: butuh penentuan pengurus (daftar alasan sah) +
      risiko alur bisnis. Dikerjakan sbg **fase UX-6.5 /
      tersendiri** setelah daftar alasan di-ACC.


---

# RENCANA KEDEPAN — UX MASTER PLAN & BACKLOG (usulan 26 Sep, belum mulai — nunggu ACC Gus)

> Disusun 26 Sep 2026 (sesi AI) atas usulan user. **Ini rencana, BUKAN
> daftar fitur yang akan langsung di-coding.** Tidak ada kode baru
> sebelum ACC. Semua item di bawah masih **backlog usulan**; prioritas
> & fase baru jadi rencana kerja. Status engineering terkini:
> **UPDATE 27 Sep: UX-2 + UX-3 SELESAI; UX-4 FASE A–E SELESAI
> 27 Sep (design tokens @ 5698b74; Button primitive @ 592b230;
> migrasi <Button> ke 30 file + hapus CSS legacy @ 3a59c9a;
> FASE D tabel: D1 @ 0637ee7 · D2a @ 9a20a1b · D2b @ 5ac6080
> + hapus CSS legacy `.th`/`.td`/`.table-row`; FASE E
> card+pill: E1 @ 05c65aa · E2 @ 06cbe8b (11 file) · E3 @
> 4572b3f (3 file) · E4 = docs + resync kp-zip3; ACC Q1-Q5
> kabeh IYO; sisa: pixel-check real device Gus Fi — 4 halaman
> admin (FASE D) + halaman E2/E3 (dashboard, laporan, kasir,
> produk); 79 raw button Phase B tetep disengka); NEXT:
> FASE F (Typography scale cleanup) — audit + ACC 27 Sep
> (Q1-Q4, Opsi A: keep `text-2xs`/`text-1xs`, swap
> mekanis; 4 commit F0-F3); F0 (docs) SELESAI 27 Sep;
> next F1 (token map 62 situs, 17 file) + F2
> (`.card-label` 10 situs, include Badge) + F3 (docs +
> resync kp-zip3).
> Laporan lengkap: `PROGRESS-2026-09.md`.

## Arah utama (visi user)

Membuat pengalaman **"Kopontren Operating System"**: pengurus paham
situasi, kasir cepat, gudang aman, kasir lama tidak bingung, pengurus
bisa mengambil keputusan, sistem syariah jelas, audit trail kuat,
backup aman, offline tetap percaya diri.

## Roadmap fase (urutan usulan user)

| Fase  | Isi                                                                 | Status |
| ----- | ------------------------------------------------------------------- | ------ |
| UX-2  | EmptyState CTA + Panduan Kasir                                      | ✅ selesai 26 Sep (@ `32d0538` + `e7130c3`) |
| UX-3  | TermTip + StatusBadge + rename `.grad-hero`                        | ✅ selesai 26 Sep (detail: MEMORY.md seksi "UX-3") |
| UX-4  | **DESIGN SYSTEM**: warna, tipografi, spacing, token, komponen seragam (audit data sdh dikumpulkam 26 Sep; FASE A–E SELESAI 27 Sep; next FASE F: Typography scale cleanup) | ✅ A–E selesai 27 Sep: A @ `5698b74` · B @ `592b230` · C @ `3a59c9a` · D @ `0637ee7`+`9a20a1b`+`5ac6080` · E card+pill @ `05c65aa`(E1)+`06cbe8b`(E2)+`4572b3f`(E3), E4 = docs + resync kp-zip3; sisa: pixel-check real device (4 hal. admin + halaman E2/E3); FASE F SELESAI 27 Sep (F0 `d1f7574` + F1 `2ff5091` token map 61 situs + F2 `ce7e0cd` .card-label 10 situs + F3 docs+resync kp-zip3); sisa: pixel-check HP 8 item; FASE G1+G2 SELESAI 27 Sep (G1 `99a3b20` Modal size + G2 `0ffb072` Toast tone 54 tag); G3 = docs + resync kp-zip3; G4 = pixel-check 5 item; G2-full = ternary `pos-client:714/892/901` |
| UX-5  | **Information Architecture**: role-based UX, dashboard berbeda per role, alur penting lebih kuat (audit + ACC Q1-Q4 27 Sep; plan H0-H6: MEMORY.md § UX-5 FASE H) | ✅ SELESAI H0–H6 27 Sep: H1 `c41ddfd` · H3 `b5b4927` · H2 (+fix `faf4849`) · H4 `33ce3f4` · H5 `a0b9f79` · H6 (commit H6); sisa = pixel-check H4+H5 (list: MEMORY § UX-5 H4/H5) + P3/P4 tashih |
| UX-5.5 | **Multi-role (M1)** — siji akun multi-role; **ACC eksekusi 27 Sep (sadurunge P0 Production Certification)** — doc `docs/m1-multirole.md`, liha Kelompok M | ▶ in progress (commit plan M1-1…M1-6) |
| UX-6  | **Attention System + komunikatif**: angka penting, status jelas, peringatan penting, "Explain This Number" | 🚀 FASE I ACC 27 Sep: I-1 done · I-3 done (`e484cbb`) · I-4 done (`6222bc70`) · I-5 done (`99c973c`) · I-2 done (`8d585f4`) · I-6 done (`4de83fd`) · I-8 done (commit I-8, hash backfill docs) · **I-7 ditunda** (daftar alasan = pengurus) — liha § FASE I di atas |
| UX-7  | **Power User / Productivity**: Ctrl+K global search, saved views, deep link, advanced reports, keyboard | 📋 rancang |
| UX-8  | **Operational Safety**: audit trail komunikatif, backup rasa aman, freeze/immutable, health center, reconciliation | 📋 rancang |

Catatan: item "35. Consistency Audit" direkomendasikan user untuk
dijalankan **setelah UX-3** — hasilnya jadi input utama UX-4.

## 10 prioritas paling worth it (pilihan user)

1. **Design System global** — warna, tipografi, spacing, button, input,
   card, table, modal, toast, badge, chart harus punya "jantung" yang sama.
2. **Dashboard menjadi Command Center** — pusat komando: apa yang
   terjadi hari ini, mana yang perlu perhatian, keputusan apa yang harus
   dibuat, apa yang berisiko, apa yang belum dituntaskan.
3. **Role-based UX** — kasir beda, admin beda, pengurus beda, gudang
   beda; setiap role punya "ruang kerjanya sendiri".
4. **Attention System** — mana yang penting, mana hanya informasi, mana
   perlu tindakan; jangan semua sama pentingnya.
5. **Universal Empty / Loading / Error / Success States** — semua modul
   punya alur state yang sama.
6. **Global Search / Ctrl+K** — cari produk, customer, transaksi, tag,
   invoice, kasir, tanggal; command palette terasa.
7. **"Explain This Number"** — setiap angka besar bisa diklik, tooltip
   menjelaskan formula (omzet bruto, laba kotor = omzet − HPP, neraca
   harus balanced, zakat = (aset − kewajiban) × kadar, konsinyasi =
   harga × rate).
8. **Offline & Sync Confidence** — indikator sinkronisasi, status
   online/offline, antrian transaksi, timestamp.
9. **Financial Reconciliation Checks** — kasir total vs kas, stok vs
   purchase vs penjualan, piutang vs payment, hutang vs settlement;
   auto-detect mismatch + tombol "Periksa".
10. **Golden Path + Smoke Test** — jalur kritis (login → POS jual →
    tutup shift → rekap → buka laporan) selalu punya test otomatis
    "apakah sistem masih hidup?".

## Gate kualitas (dari user)

**5 rasa:** profesional · elegan · modern · mudah dipahami · tenang.
**6 kata:** bersih · konsisten · modern · informatif · cepat · tenang.

## Backlog item (nomor mengikuti kelompok usulan user)

### Kelompok E — Experience Layer (E1–E40)

**E1–E10 (fondasi & pola):**
- [ ] E1 Visual Identity — brand warna/ikon/logo/spacing/kepribadian visual (dark + light theme).
- [ ] E2 Dashboard komunikatif — kartu ringkas, angka penting, perhatian hari ini, risiko, keputusan; jangan wall of text.
- [ ] E3 Human Language — label manusia, istilah minimal, "Bahasa apa kasir perlu tahu?".
- [ ] E4 Micro-explanation — tooltip/deskripsi, contoh: "Laba Kotor = Omzet – HPP".
- [ ] E5 StatusBadge seragam — warna & label status transaksi (pending/paid/partial/void/cashless/cash/return).
- [ ] E6 Empty State + CTA — pola universal: kosong → alasan → tindakan ("Belum ada transaksi — Mulai POS / Input manual / Export contoh").
- [ ] E7 Error manusiawi — error + saran, bukan `500`; "Permintaan gagal. Coba lagi, atau hubungi admin bila terus terjadi."
- [ ] E8 Loading skeleton — semua tabel/kartu/chart; jangan hanya spinner.
- [ ] E9 Kasir berbeda — mode cepat/tenang, area besar untuk aksi utama, tidak banyak klik, tidak terasa admin.
- [ ] E10 Admin command center — bukan sekadar CRUD, tapi pusat keputusan.

**E11–E20 (bantuan & mobile):**
- [ ] E11 Recent Activity — "Apa yang terjadi?" (jurnal mini: transaksi, stok, kas, retur).
- [ ] E12 Global Search / Ctrl+K — cari semua; command palette, hasil terkelompok, highlight, Enter → buka, Esc → tutup; HP = search bar + quick action.
- [ ] E13 Cheat sheet — ringkasan fungsi/shortcut, contoh modal "Panduan Kasir" F1–F9.
- [ ] E14 Feedback premium — toast sukses/gagal + animasi, auto-dismiss, stackable; jangan hanya alert().
- [ ] E15 Confirm dialog aman — hapus/ubah data penting → dialog + ketik "HAPUS"; jangan confirm() browser.
- [ ] E16 Undo ringan — aksi kecil, "Kamu menghapus 1 produk — Urungkan" (5 detik).
- [ ] E17 Mobile app-like — target sentuh besar, swipe, FAB, bottom sheet, gesture; jangan tabel 12 kolom di HP.
- [ ] E18 Tabel → card di HP — responsive: tabel desktop, card mobile.
- [ ] E19 Drill down — klik angka → detail (omzet → transaksi, stok → mutasi).
- [ ] E20 Grafik jangan kebanyakan — hanya yang membantu keputusan; label, warna jelas, tooltip, klik detail.

**E21–E30 (warna, dark mode, help, syariah, audit):**
- [ ] E21 Warna bermakna — success/warning/danger/info/netral konsisten.
- [ ] E22 Dark mode palette — bukan inverte buta; dark = tenang, high contrast, bukan menyilaukan.
- [ ] E23 Contextual help — "?", panel bantuan per halaman, jawaban pendek.
- [ ] E24 Istilah syariah dua lapis — "zakat perdagangan" + tooltip "pengelolaan harta dagang…"; jangan tebar istilah tanpa konteks.
- [ ] E25 Tandai provisional — label "Menunggu tashih" utk keputusan belum final (P3/P4).
- [ ] E26 Audit trail komunikatif — "SIAPA melakukan APA KAPAN"; log filter + timeline.
- [ ] E27 Mode Pengurus — view ringkas: kas, stok, piutang, hutang, performa; bukan dashboard teknis.
- [ ] E28 Sidebar grouping — Kelola / Keuangan / Laporan / Sistem; jangan semua rata.
- [ ] E29 Onboarding — panduan pertama per role, 3 langkah.
- [ ] E30 First Run Checklist — alur awal: atur shift → input kas awal → buat produk → login kasir.

**E31–E40 (detail, performa, akuntabilitas):**
- [ ] E31 Printer premium — struk rapi, header kopontren, total jelas, watermark; bukan CSS dump.
- [ ] E32 Nomor transaksi — ID mudah dibaca, konsisten, "INV-2026-000123".
- [ ] E33 Action→Result — "Simpan" → berubah, toast, refresh relevan; jangan diam.
- [ ] E34 Performance — data besar, pagination/infinite scroll, filter cepat.
- [ ] E35 Consistency Audit — audit komprehensif UI (warna, tipografi, spacing, component patterns, empty states, iconography, copywriting); **jalankan setelah UX-3** → jadi input UX-4.
- [ ] E36 Accessibility — keyboard navigation, focus state, contrast WCAG, screen reader, font scalable.
- [ ] E37 Help Center — mini FAQ/glossary, icon "?".
- [ ] E38 Progressive disclosure — detail saat dibutuhkan (expand, tab, drill-down).
- [ ] E39 Naming kamus resmi — istilah global di `src/lib/glossary.ts`: "Omzet", "Laba Kotor", "Zakat Dagang", "Konsinyasi", "Ujrah", "Settlement".
- [ ] E40 Karakter — system yang "tenang, jelas, dan aman".

### Kelompok P — 15 perkara kelas profesional (P1–P15)

- [ ] P1 Zero Thinking UX — user hanya berpikir untuk keputusan bisnis, bukan cara pakai aplikasi.
- [ ] P2 Role-based experience — kasir fokus bertransaksi; pengurus fokus insight & risiko; admin setup & keamanan; gudang input kelola stok; pembelian supplier & stok; member info/reward.
- [ ] P3 Attention System — indikator penting/risiko/perlu tindakan/berita/success, jangan semua notification merah.
- [ ] P4 Smart defaults — default yang benar (rentang 1–30 hari, status open, stok minimum, tanggal hari ini) agar tidak banyak mengetik.
- [ ] P5 Jangan ketik hal yang bisa dipilih — form minimal input, lebih banyak pilih/dari data.
- [ ] P6 Undo-first — kesalahan ringan bisa dibatalkan tanpa takut.
- [ ] P7 Audit trail immutable — log tidak bisa dihapus; siapa, apa, kapan, perubahan apa.
- [ ] P8 "Explain This Number" — tooltip formula + sumber data.
- [ ] P9 Angka punya source — drill down / sumber / klik → detail.
- [ ] P10 Period context — semua angka harus context periode ("Rp10 jt per 30 hari").
- [ ] P11 Freeze / Close Period — tutup periode keuangan; data tetap bisa dilihat, tidak bisa diubah diam-diam.
- [ ] P12 Backup rasa aman — terakhir, cadangan, restore, otomatis/semi-otomatis, bukan "backup sekali lalu lupa".
- [ ] P13 Health Center — status sistem: DB, koneksi, versi, cache, log, backup terakhir, notifikasi.
- [ ] P14 Offline confidence — kasir online/offline/nyinkron; status per modul.
- [ ] P15 Confidence language — label jelas: "Terakhir diperbarui 2 menit lalu", "Data lengkap", "Menunggu sinkronisasi".

### Kelompok Q — kelas profesional lanjutan (Q41–Q95, nomor mengikuti usulan user)

**Dashboard & insight:**
- [ ] Q41 Command Center pengurus — ringkasan kas, stok, piutang, hutang, penjualan, laba.
- [ ] Q42 Insight hari ini — apa yang naik, turun, belum, dan butuh tindakan.
- [ ] Q43 Peringatan risiko — stok menipis, piutang tak tertagih, kas menipis, diskon besar.
- [ ] Q44 Perbandingan periode — hari vs kemarin, minggu vs minggu sebelumnya, bulan vs bulan sebelumnya.
- [ ] Q45 Target vs aktual — omzet, laba, target kas harian.
- [ ] Q46 Top produk / top kasir / top transaksi — ranking berguna.
- [ ] Q47 Trend sederhana — grafik tidak berlebihan, tetap komunikatif.
- [ ] Q48 "Klik angka → detail" — semua dashboard bisa di-drill-down.



### Kelompok M — Identitas & multi-role (M1: M1-1..M1-4 + M1-6 SELESAI 27 Sep; M1-5 = verify; ACC eksekusi 27 Sep)

- [~] M1 Multi-role support — **M1-1..M1-4 + M1-6 SELESAI 27 Sep (M1-5 = verify release-gate)**
      Status 27 Sep: M1-1 docs selesai (`2dea8a3`); M1-2 skema V19
      selesai (`411f5b7`); M1-3-prep header shell selesai
      (`cc45511`); M1-3 auth+switch-role selesai (`b3b4f34`);
      M1-4 UI switcher + PUT/GET /api/users role/roles selesai
      (`0908155`); M1-6 test-roles (30) + release-gate selesai
      (`9a5f73c`).
      Renomer: `cc45511` = M1-3-prep (bagian M1-4), bukan M1-3.
      Status: M1-1…M1-4 + M1-6 SELESAI; M1-5 = audit
      (`auth:switch-role` + `user:roles` events sudah ada — verify
      release-gate). P0 Production Certification SELESAI 27 Sep (C1-C4; gate doc `docs/qa/PRODUCTION-RELEASE-GATE.md`) - liha seksi P0 di bawah.
      — siji akun duwe role pirang-pirang (`users.roles` JSON, skema
      **V19**, `users.role` = primary). **Dokumen desain:
      `docs/m1-multirole.md`** (4 keputusan ACC + commit plan
      M1-1…M1-6). Riwayat:
      **Rancangan (rekomendasi)**: *primary role + access tambahan* —
      primary role nrentahi menu utama; access tambahan lewat "mode
      switch"/dedicated link; audit log "acting as primary role";
      session nggolongi role context. **Langkung aman ketimbang
      "union sagedhah role"** (menu campur + audit bingung).
      **Pertimbangan keamanan**: saiki (sebelum M1) siji peran = siji
      akun, jangan share akun; audit trail per-akun resik; role
      context eksplisit ing session + audit; akses akun multi-role
      = union sagedhah role akun kasebut (ora nglewati iku). Estimasi ~4–5 commit:
      (1) skema v18 `users.roles` + migrasi idempoten; (2)
      auth/session role context; (3) pilih role ing login + menu
      adaptif; (4) audit "acting as"; (5) docs + resync kp-zip3.
      **Trigger: nalika Gus Fi ngramesake kabutuhan nyata**
      (contone: siji wong sing sekaligus pengurus + member).
      **Interim saiki**: akun pirang-pirang (jangan share akun);
      admin bisa ndeleng card member dhewe ing `/member` (H3)
      menawa dipasangke.

### P0 Production Certification (C1-C4) - SELESAI 27 Sep

- [x] **C1** Golden Path E2E release gate (`test:golden` +
      `docs/qa/GOLDEN-PATH.md`) - commit `662b654`; bug kritis
      ditemukak: SQL products koma akhir (500 ing SETIAP
      `GET /api/products` ter-autentikasi; intro `37d0a34`).
- [x] **C2** Invarian data + restore drill (`test:invariants` +
      `docs/qa/DATA-INVARIANTS.md`) - commit `7f09341`; bug kritis
      ditemukak: `point_history` missing saka backup
      (export/import/DELETE/audit).
- [x] **C3** Rekonsiliasi 13 cek read-only (`test:rekon` +
      `/admin/rekonsiliasi` + `GET /api/reconciliation`) - commit
      `206350f`; 2 bug ditemukak: kolom `payables.supplier_name`
      (dulu nulis `owner_name`) + KONSIN sub-cek overpay.
- [x] **C4** Production release gate doc - commit iki:
      `docs/qa/PRODUCTION-RELEASE-GATE.md` anyar (gate checklist
      otomatis + deploy, tabel 4 bug, cakupan sertifikasi, item
      P1/P2 non-blocking, roadmap pasca-P0) + update MEMORY/TODO +
      cleanup scratch `_*.txt`.
- **Total P0: 4 bug produksi nyata ditemukak** - detail + dampak:
      gate doc seksi "P0 findings".

**V2 DITUNDA (pasca-sertifikasi, liha gate doc seksi V2):**
- [ ] **V2-1** I-7 void reason struktural - daftar alasan sah +
      risiko alur bisnis BUTUH ACC pengurus (UX-6.5).
- [x] **V2-2** COGS/HPP reversal - SELESAI 27 Sep (3 commit,
      dual-push): netting DUA SISI P&L/KPI/Zakat — pendapatan net
      Σ returns.amount + HPP net Σ returns.cogs (`hppRetur`,
      payload additive); snapshot cogs = round(HPP item × qty)
      di-write-time (rumus sara P&L/reports/zakat: si.cost_price,
      fallback harga beli produk saiki); retur pre-V2-2 cogs = 0
      (konservatif, tanpa backfill). C1 `980d57c` schema v19→v20 +
      write path (returns + backup); C2 `8880ddb` netting
      (keuangan/reports/zakat/rekap WA/UI); C3 `85d24b0` rekonsiliasi
      cek #14 RETURN_COGS + UI + test (rekon PASS 46) + docs.

**Roadmap pasca-P0 (DIUPDATE 27 Sep, ACC Gus Fi):**
1. **V2-2** COGS reversal retur — SELESAI (4 commit: `980d57c`,
   `8880ddb`, `85d24b0`, docs `315ef66`; dual-push).
2. **V2-1** I-7 void reason — PENDING (butuh ACC pengurus).
3. **Fase 3 Akuntansi Terbaru** — F3.1 audit (`84a3266`) + F3.2 proposal SELESAI (29 Sep):
   `docs/akuntansi-audit.md` (A.1) + `docs/akuntansi-proposal.md`
   (F3.2: COA 52 akun 6 grup; skema jurnal double-entry immutable
   + running balance + invariant D=K; auto-posting 3 wave; 5
   laporan formal; modul akad 5 tipe; koperasi Level C + SHU;
   ZIS terpisah; peta PAP; migrasi saldo pembuka @ N; R1-R8
   mitigasi; roadmap 32 commit 6 wave; §13 = 14 poin keputusan).
   Snapshot HTML bacaan (H1 `c3ade14`, 29 Sep):
   `docs/AKUNTANSI-PROPOSAL.html` + route `/tutorial/akuntansi-proposal`
   (0-script; tema maroon SOP-ADMIN; §13 = 14 kartu amber + checkbox,
   print A4 utk rekam centang). Pasca-F3.3 (keputusan turun) ->
   regenerate HTML + re-sync (1 commit kecil).
   12 keputusan Gus Fi: badan = koperasi resmi; standar hybrid
   PRIORITAS SYARIAH (SAK Syariah -> PAP -> SAK EP); Level C;
   COA B; ZIS A; SHU A; wakaf B (ditunda); auto-posting B
   (bertahap); saldo pembuka A; laporan A; akad A (bareng
   fondasi); timeline B (6 minggu). Next: **F3.3 = review +
   keputusan GUS FI langsung** (14 poin §13 via
   `/tutorial/akuntansi-proposal`; pengasuh mengikuti;
   TIDAK ada forum terpisah) -> F3.4+ implementasi.
4. **Maintenance** — ongoing (audit periodik, test, performance).
- Roadmap bakpao.id (7 fitur: live ticker multi-cabang, tangga
  loyalty tier, katalog hadiah + ranking, panel bagi-hasil per role,
  onboarding mitra/reseller, hero + trust badges, timeline + demo)
  = **CANCELLED** (keputusan Gus Fi, 27 Sep — ora perlu; ora
  diimplementasi).


**Notifikasi & komunikasi:**
- [ ] Q49 Pusat notifikasi — bukan sembarangan popup.
- [ ] Q50 Kategori notifikasi — risiko, sukses, pengingat, update sistem.
- [ ] Q51 Level keparahan — info / peringatan / kritis.
- [ ] Q52 Pesan action-oriented — "Stok X menipis. Tambah stok."
- [ ] Q53 Do not disturb / prioritas — jangan semua sama pentingnya.
- [ ] Q54 Toast sementara vs notification persistent.
- [ ] Q55 Email/WA rekap — untuk pengurus.

**Keuangan & kontrol:**
- [ ] Q56 Health check — apakah data kas, stok, penjualan masih konsisten?
- [ ] Q57 Rekonsiliasi — kasir total vs kas, stok vs penjualan.
- [ ] Q58 Freeze period — tutup periode laporan.
- [ ] Q59 Audit trail komunikatif — siapa melakukan apa.
- [ ] Q60 Immutable log — log tidak bisa dihapus.
- [ ] Q61 Diff perubahan — sebelum/d sesudah.
- [ ] Q62 Approval flow — perubahan besar bisa perlu persetujuan.
- [ ] Q63 Lock record — data kunci tidak bisa diam-diam berubah.
- [ ] Q64 Export laporan siap presentasi — bukan sekadar CSV.
- [ ] Q65 Dashboard untuk pengurus — angka penting + interpretasi.

**Peringatan & risiko:**
- [ ] Q66 Stok minimum warning.
- [ ] Q67 Stok mati (slow-moving) — produk lama tidak laku.
- [ ] Q68 Piutang jatuh tempo — tagih dulu.
- [ ] Q69 Diskon terlalu besar — perlu perhatian.
- [ ] Q70 Harga terkeluar.
- [ ] Q71 Transaksi abnormal — nilai sangat besar.
- [ ] Q72 Konsolidasi data — deteksi anomali.

**Operasional & manajemen:**
- [ ] Q73 Saved views — simpan filter favorit.
- [ ] Q74 Deep link — link langsung ke item.
- [ ] Q75 Advanced reports — kustom report.
- [ ] Q76 Keyboard shortcuts — power user.
- [ ] Q77 Quick actions — dari halaman mana pun, tindakan cepat.
- [ ] Q78 Stock opname — stok fisik vs sistem.
- [ ] Q79 Perbaikan/penyesuaian stok — alasan & approval.
- [ ] Q80 Supplier scorecard — performa supplier.
- [ ] Q81 Product health — produk bagus/rugi.
- [ ] Q82 Price history — ubah harga terlacak.
- [ ] Q83 Business simulation — "bagaimana jika margin naik 5%?".
- [ ] Q84 Cash flow forecast — perkiraan kas.
- [ ] Q85 Cash back safety — jangan bikin rugi.
- [ ] Q86 Profit warning — peringatan saat margin rendah.
- [ ] Q87 Margin guard — cegah penjualan rugi.
- [ ] Q88 Low cash alert — peringatan kas menipis.
- [ ] Q89 Slow-moving inventory — stok lama.
- [ ] Q90 Duplicate detection — data duplikat.

**Keamanan & backup:**
- [ ] Q91 Session timeout — penguncian setelah tidak aktif.
- [ ] Q92 2FA — otentikasi dua langkah.
- [ ] Q93 Backup reminder — ingatan backup berkala.
- [ ] Q94 Backup restore test — backup bisa diuji.
- [ ] Q95 Jangan over-engineer — fitur hanya masuk jika: menghemat waktu, mencegah kesalahan, meningkatkan kontrol, memberi kejelasan laporan, memperkuat keamanan, atau mendukung keputusan.

## Hal yang TIDAK boleh dilakukan dulu (dari Bagian 35 laporan)

Sampai tashih selesai: jangan anggap 24K final, jangan anggap market
valuation final, jangan ubah haul berdasar asumsi sendiri, jangan
anggap ta'jil menggeser haul, jangan anggap 20% ketentuan syariah,
jangan masukkan seluruh penjualan konsinyasi sebagai revenue, jangan
treat settlement pemilik sebagai expense, jangan ubah mapping akuntansi
P4 diam-diam, jangan bikin keputusan fiqih baru demi kebutuhan coding.

## Checklist tambahan utk verifikasi manual HP (usulan, masuk daftar Gus)

- [ ] **TermTip mobile viewport edge check** (setelah UX-3 selesai):
  tooltip istilah di layar sempit — pastikan tidak overflow/melewati tepi
  layar, terbaca, dan bisa ditutup; bila perlu fallback bottom-sheet di HP.
