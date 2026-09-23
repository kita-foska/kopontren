# MEMORY — Kopontren Al Ittihad (kasir & pembukuan)

Memory permanen utk sesi pengembangan berikutnya. Detail kronologis ada di
`state.txt`; daftar kerja yang belum: `TODO.md`.

## Arsitektur inti
- **Next.js 15 App Router + Turso/libSQL** (`@libsql/client`). Tidak ada DB
  lokal selain dev `file:`. Semua timestamp disimpan **UTC ISO**
  (`YYYY-MM-DDTHH:MM:SS.sssZ`); tampilan WIB via `src/lib/format.ts`
  (`startOfDayJakarta()` kembalikan string UTC ISO, BUKAN format spasi WIB —
  jangan bandingkan string campur format).
- `src/db.ts`: skema + migrasi idempoten + **gate `schema_version`**
  (SAAT INI `SCHEMA_VERSION = 15`). Cold start: kalau versi DB < 15 →
  `fullInit` sekali; selain itu 1 SELECT saja. **Aturan: statement skema
  baru WAJIB diiringi bump `SCHEMA_VERSION`** (kalau tidak, DB lama tidak
  akan pernah dapat migrasi).
- Transaksi: `tx(d, fn)` — Turso: `c.transaction('write')` lalu
  `commit()` bila sukses / `rollback()` bila gagal (perbaikan 24 Sep:
  dulu close() saja DROP transaksi → write `tx()` hilang di produksi;
  kini eksplisit commit/rollback). `file:` lokal: sekuensial
  auto-commit (bug @libsql/client 0.15 — tx file LOST, jangan pakai
  lokal utk test integritas).
  **Caveat (diterima, pre-existing):** `tx()` memakai singleton
  `DbShim.c` bersama — dua `tx()` benar-benar paralel di satu process
  Vercel hangat bisa interleave; kalau muncul anomali lintas-request,
  follow-up: shim fresh per transaksi. Bukti semantik lib: `_txlib.mjs`
  (close = 0 baris, commit = 1 baris). Probe produksi: `_probe4.mjs`.

## Keamanan (jaga konsistensinya)
- Password: scrypt + salt per user (`hashPassword`/`randomSalt` di
  `src/lib/auth.ts`). Perbandingan selalu `crypto.timingSafeEqual`.
- Sesi: cookie HttpOnly `kopontren_session` + cookie pendamping non-HttpOnly
  `kopontren_session_exp` (plafon countdown klien). Idle timeout via
  `settings.session_timeout` (default 3600 dtk; PUT `/api/settings` admin,
  clamp 60–7 hari).
- PIN: 4–6 digit, anti-pattern (sekuensial/semua sama/sama password),
  lockout `PIN_MAX_ATTEMPTS=5` → `PIN_LOCK_SECONDS=900` (tabel `user_pins`).
  **`changePin` juga menghitung kegagalan + lockout** (audit 18 Sep 2026).
- Throttle login: per username+IP, 10 gagal/15 mnt → kunci 15 mnt
  (in-memory per instance, di `src/app/api/auth/login/route.ts`).
- Role: **7 role + matriks terpusat** (implementasi 18–20 Sep 2026,
  commit `b83b75e`) — detail di bagian "## Matriks Permission 7 Role"
  di bawah. `normRole` menormalkan nilai tak dikenal → `kasir`;
  `isManager` = admin + manajer (pengurus keluar dari tier ops sejak
  18 Sep — kini read-only). Kasir tetap hanya mutasi data miliknya
  (sale.kasir_id === user.id, retur shift sendiri, retur hanya
  transaksi sendiri).
- `CRON_SECRET` dipbandingkan constant-time (`timingSafeEqual`) di
  `/api/notifications/cron`.

## Strategi cache (jangan ubah asal)
- `src/lib/ref-cache.ts`: in-memory per instance, TTL 60 dtk, **cap 256
  key** (eviksi tertua; penting — key `members:totals:<q>` mengikuti
  string pencarian user). `invalidate(prefix)` dipanggil di setiap route
  WRITE yang menyentuh data tersebut (`products:`, `kas:`, `reports:`,
  `members:`, `belanja:`, `notif:`, `audit:`, `settings:member`).
  **Catatan `kas:` (23 Sep, verifikasi FASE 1):** prefix `kas:` = BACKSTOP
  — saat ini TIDAK ADA key cache `kas:…` (key nyata: `reports:<from>`,
  `products:active`, `belanja:totals`, `members:totals:<q>`,
  `settings:member`, `audit:tables`, `notif:list:<…>`), jadi
  `invalidate('kas:')` di 10 route tulis adalah no-op yang INTENTIONAL
  (ongkos ~0): kalau kelak ada `cached('kas:…')`, semua route mutasi
  sudah memanggil invalidate — tidak perlu disisir ulang. Didokumentasi
  juga di doc-header `src/lib/ref-cache.ts` (commit `ae430f6`).
- `src/lib/ttl-cache.ts`: helper terpisah (cap 100) — legacy, dipakai
  minimal sekarang.
- Header `Cache-Control: public, max-age=60` HANYA untuk response yang
  user-independent (agregat reports, katalog produk). Payload yang
  membawa field per-user (dulu `role` di /api/products) TIDAK BOLEH
  di-cache browser.
- `getMemberSettings()`/`getZakatSettings()` di db.ts: cache modul 30 dtk,
  invalidated otomatis saat save.

## Pola kerja git (PENTING — beda dari kebiasaan)
- Repo: `https://github.com/kita-foska/kopontren.git` (per 18 Sep 2026;
  sebelumnya `verica1937/kopontren-app`). Branch lokal: `master` (HEAD)
  + `main` (mirror).
- Pengembangan di branch **`master`**; **`main` = cermin master**
  (Vercel build dari `main`). Sinkron dual-branch:
  `git push origin master:master && git push origin master:main`
  (fast-forward push; main & master kini berbagi sejarah sejak sinkron
  GitHub — JANGAN `git merge` antar keduanya).
- Git: `C:\Program Files\Git\cmd\git.exe`; node: `C:\Program Files\nodejs\node.exe`.
- **JANGAN commit `public/sw.js`**: setiap `npm run build`,
  `inject-sw-version.mjs` men-stamp ulang `// SW-BUILD:<hex>` (seed
  `.next/BUILD_ID` + timestamp) → file berubah tiap build lokal;
  Vercel men-stamp sendiri saat build. (Aturan sama utk `out/`, `data.db`.)
- `.gitignore`: pola `_*` menyeluruh (file scratch `_*.{txt,log,...}`
  otomatis diabaikan) + `*.log` + tsbuildinfo.

## Konvensi kode
- Route handler API: `currentUser()` → 401; guard role → 403; validasi
  body defensif (`Number(...)` + floor + clamp; `req.json().catch(()=>({}))`).
- Query Turso: cap baris (limit ≤ 50 + offset) utk daftar; agregat global
  lewat `cached('...')`; N+1 → batch `IN (...)` (pola ada di
  `/api/sales`, `/api/shifts`).
- Notifikasi: SEMUA best-effort (`try/catch` + `console.warn`), tidak
  boleh memblokir/merollback transaksi bisnis.
- Audit: `logAudit()` (tidak pernah throw) di setiap mutasi.
- UI: ikon `lucide-react` (jangan emoji), komponen dasar di
  `src/components/ui.tsx` (`api`, `Modal`, `Toast`, `Badge`), tema
  "Blue Notebook" (navy dark default + light). POS dirender lazy
  (`pos-lazy.tsx`) — jangan imporkan `pos-client` dari page awal.
- Bahasa UI: Indonesia.

## Lingkungan & jebakan
- Windows PowerShell: command foreground Cline bisa "terpotong" (exit 1
  palsu) — jalankan build panjang dengan `Start-Process` detached +
  polling file, atau `& node node_modules/next/dist/bin/next build`.
- Verifikasi selalu: `npx tsc --noEmit` lalu `next build` (48 page,
  First Load JS terberat ~123 kB).
- Modal QRIS di POS masih MOCK (NMID placeholder) — bukan gateway nyata.
- Backup JSON (`/api/backup`) mencakup produk/penjualan/pembelian/kas/
  konsinyasi/member/shift/audit + `debts`/`payables`/`returns` (sejak
  commit `c02421b`, 21 Sep 2026) — sisa yang belum: notifications
  (+ log push), member_settings/zakat (lihat TODO.md).

## PWA Installability (21 Sep 2026 — JANGAN dibalikkan)
- `src/middleware.ts`: aset statis publik (`/sw.js`, `/manifest.json`,
  `favicon.ico`, `icon-*`, `logo-kopontren*`, ekstensi gambar)
  **early-return SEBELUM guard sesi**. /sw.js & /manifest.json yang
  di-redirect 307 ke /login (respons HTML, bukan JS) saat belum login
  membuat service worker GAGAL register => PWA tidak installable di HP
  admin. Guard sesi tetap berlaku utk halaman HTML/app & semua selain
  aset publik.
- `src/components/sw-register.tsx`: register idempoten + retry saat
  `visibilitychange`/`pageshow` (setelah login via navigasi
  client-side, effect layout tidak re-run; register pertama di /login
  bisa gagal).
- Ikon PWA tervalidasi dimensi aktual (parse IHDR byte 16/20):
  `icon-192.png`=192x192, `icon-512.png`=512x512 (purpose `any
  maskable`), `icon-180.png`=180 (Apple). Jangan percaya field
  `sizes` manifest saja.
- Build lokal: `next build` langsung TIDAK men-stamp SW (stamp hanya
  jalan via `npm run build` → `scripts/inject-sw-version.mjs`) ⇒
  `public/sw.js` tak berubah di git saat test lokal; Vercel
  men-stamp sendiri tiap deploy.

## PWA Favicon — Ikon Taskbar/Start Menu (22 Sep 2026, commit `046b80c`)
- **Akar masalah:** `public/favicon.ico` lama KORUP (10.861 byte, ICO
  tidak valid) → Edge tak bisa ekstrak ikon aplikasi PWA; ikon taskbar
  & Start menu tampil default/generic.
- **Fix (046b80c):** generate ulang `public/favicon.ico` = ICO
  multi-size VALID (4 entry: 16/32/48/64) dari `icon-512.png` via
  `sharp` (`scripts/_gen-favicon.mjs`), hasil 5.635 byte;
  + bump cache `public/sw.js` → v11 (paksa SW lama re-fetch aset).
- **Verifikasi LIVE (22 Sep):** `https://kopontren-gamma.vercel.app`
  menyajikan `/favicon.ico` = 5.635 byte (`image/vnd.microsoft.icon`),
  PERSIS file lokal → deploy `046b80c` Ready & produksi live
  (halaman login app + manifest.json valid: icon-180/192/512,
  theme `#8A1538`).
- **Test client-side (DIANGKAT USER, Edge laptop — PENDING hasil):**
  tunggu deploy → uninstall PWA di Edge → clear site data → restart
  Explorer → install ulang PWA → cek logo nang taskbar/Start menu.
  Bila masih gagal: hapus cache ikon Windows manual + restart +
  install ulang, lalu laporkan. Cache ikon taskbar milik sisi
  Windows — fix server baru terlihat setelah PWA di-install ulang /
  cache ikon dibersihkan.
- `scripts/_gen-favicon.mjs` & bukti sementara = file scratch (pola
  `_`, tak di-commit); `public/favicon.ico` & `public/sw.js` hasil
  `046b80c` sudah dual-push master+main.

## Audit Kode 3 Pass (20 Sep 2026)
Audit menyeluruh request terakhir (fungsional / keamanan /
performa-integritas). `tsc --noEmit` BERSIH. Temuan:

- **🔴 Backup import `audit_log` PK collision (DIFIX):** import INSERT
  baris `audit_log` dgn id eksplisit (`insA`), tapi daftar DELETE import
  & `/api/backup/reset` TIDAK membersihkan `audit_log` → di DB live
  (ada log audit), import gagal 500. Fix: DELETE-then-INSERT per tabel
  (aman; audit = forensik, boleh terhapus saat restore).
- **🟠 `sales/[id]` DELETE vs retur:** FK `returns.sale_id` (ON) —
  jika transaksi punya retur, `DELETE FROM sales` bisa throw FK → 500;
  meski lolos, retur sudah restock +1 dan delete restock penuh lagi
  (stok dobel) & jurnal kas (sale/refund) tidak direverse.
- **🟠 Race read-then-write:** plafon retur dibaca SEBELUM `tx`
  (returns/route.ts:94→109) — 2 POST concurrent bisa melebihkan restock;
  cek stok POS (`prod.stock < qty`) vs `UPDATE stock = stock - ?` bisa
  oversell bila 2 transaksi concurrent. Probability rendah (kasir
  tunggal), dampak integritas data.
- **🟡 `debts/[id]` payment TIDAK masuk `cash_entries`** (bandingkan
  `payables/[id]` yang tulis 'expense' dalam 1 tx + invalidasi kas) —
  inkonsistensi pembukuan piutang vs hutang.
- **🟡 Retur refund pakai `unit_price` asli baris, mengabaikan
  `sale_items.discount`** → refund/jurnal bisa lebih besar dari yang
  benar-benar dibayar pelanggan.
- **⚪ `audit_log.ip_address` ambil `x-forwarded-for`/`x-real-ip` mentah**
  — bisa di-forge klien (dampak forensik saja, bukan auth).
- **✅ Diverifikasi BAIK:** matriks 7 role + guard tiap route konsisten
  (DELETE debts/payables = admin-only; kasir hanya transaksi sendiri);
  PIN lockout + timingSafeEqual; `CRON_SECRET` constant-time; SQL semua
  parameterized; `sales.client_ref` punya UNIQUE index partial
  (`idx_sales_client_ref WHERE client_ref != ''`) → dedupe offline queue
  aman sampai di level DB; ref-cache berbatas 256 key + TTL 60 dtk.

## ZAKAT Tijarah & Known Issues (18 Sep 2026)
- **Bug #1 DI-FIX** (commit `6ef487b`, dual-push master+main):
  `computeZakat()` di `/api/zakat` kini **mengurangkan hutang dagang** —
  `SUM(payables.remaining)` dgn `status='open'` — dari harta bersih
  (dulu hard-coded `hutang = 0`; statcard "Hutang" selalu Rp 0).
  Arahnya: piutang (`receivables` open) **ditambah**, hutang dagang
  **dikurangkan** → harta bersih = modal + laba + piutang − hutang
  (konsisten fiqh zakat tijarah).
- **Known issues (belum difix, low priority):**
  - `reports/csv` export: timestamp ditulis **UTC mentah**, UI tampil
    WIB (beda ±7 jam) — kosmetik, tidak memengaruhi perhitungam.
  - Batas periode LABA zakat memakai perbandingan UTC
    (`date('now')`), bukan batas hari/bulan WIB — laba bisa meleset
    ±7 jam di ujung periode.
- **Known behavior — `/sw.js` redirect (temuan 18 Sep 2026, bukan
  regression):** fetch `/sw.js` **tanpa cookie sesi → 307 redirect ke
  `/login`** (whitelist `isStaticPublic` di `src/middleware.ts` hanya
  mengontrol header `Cache-Control`, TIDAK melewati session guard).
  Implikasi: PWA tidak bisa diinstall dari halaman publik — service
  worker baru ter-fetch setelah login. Karena aplikasi internal, ini
  **acceptable**; kalau kelak ingin PWA installable dari landing page,
  perlu me-whitelist `/sw.js` di session guard middleware.

## Matriks Permission 7 Role (commit b83b75e, teruji manual 20 Sep 2026)
- **7 role**: admin, manajer, pengurus, kasir, gudang, pembelian, member
  (`ROLES` di `src/lib/auth.ts`; nilai tak dikenal → `kasir` via
  `normRole`).
- Matriks terpusat: `FEATURE_MATRIX` + `canAccess(user, feature)`
  di `src/lib/auth.ts` (admin selalu lolos; guard API = 403; layout
  admin cukup cek login; sidebar per role; `products/bulk` per-aksi —
  stock tier gudang, lainnya tier products):

  | Fitur (`Feature`) | Role |
  |---|---|
  | pos | admin, manajer, kasir |
  | shift | admin, manajer, kasir |
  | products (CRUD) | admin, manajer |
  | stock (opname) | admin, manajer, gudang |
  | supplier (supplier + payables + belanja) | admin, manajer, pembelian |
  | piutang | admin, manajer, kasir |
  | laporan | admin, manajer, pengurus |
  | audit | admin, pengurus |
  | zakat | admin, manajer, pengurus |
  | member | admin, manajer |
  | personal | semua 7 role |

  Pengurus = read-only (laporan + audit + zakat), TIDAK operasional.
- Commit dual-push 20 Sep 2026 (semua `master` + mirror `main`):
  - `b83b75e` matriks 7 role + guard (author: kita-foska; teruji
    manual: semua role berfungsi sesuai matriks).
  - `eeb9a50` rename aplikasi "Kopontren AL ITTIHAD" + layout header.
  - `83a29dd` audit trail per-user: `audit_log` +4 kolom
    (user_name, user_role, ip_address, user_agent) + index
    idx_audit_user; `logAudit` form objek `{fieldChanges, req}`
    (diff per-field: `old_value`/`new_value` JSON `{field:{before,
    after}}`) + form legacy tetap jalan; event LOGIN/LOGOUT
    per-user; UI `/admin/audit` tampilkan snapshot "nama (role)" +
    tooltip IP/UA. **`SCHEMA_VERSION` 10→11**: WAJIB, agar DB
    prod (v10) menjalankan `fullInit`+`migrate()` sekali lagi saat
    cold start berikutnya — tanpa bump, kolom baru tak akan pernah
    sampai ke DB lama dan semua `logAudit` (INSERT 4 kolom) gagal
    diam-diam.

## Audit 3 Putaran — Hardening (21 Sep 2026)
Lanjutan audit 3-pass (fungsional / keamanan / performa-integritas).
Semua temuan diverifikasi ulang ke kode; fix dijalankan 2 batch
(`tsc --noEmit` + `next build` BERSIH di kedua commit):

**Batch A — `c02421b` (kritis + medium, 6 file):**
- Backup diperluas: `debts`, `payables`, `returns` (+ kolom
  `client_ref` di sales) masuk export/DELETE/INSERT import;
  dilanjutkan `d435f57`: + `notifications`, `notification_settings`,
  `notification_logs` (export/DELETE/INSERT), import `audit_log`
  kini 13 kolom skema v11 (user_name, user_role, ip_address,
  user_agent) — bug PK collision tetap ditutup oleh
  DELETE-before-INSERT; payload version 2 → 3. `point_history`
  TUNDA (di luar cakupan, keputusan user).
- Import `audit_log` kini DELETE-then-INSERT; urutan DELETE
  FK-safe (returns → sale_items → sales → … → debts/payables/
  audit_log) → bug PK collision selesai.
- `sales/[id]` DELETE: restock di-clamp qty sudah diretur (net),
  jurnal `cash_entries` "Retur #id" dihapus, baris `returns`
  dihapus → tidak ada lagi stok menggembung / kas terdistorsi.
- `returns` POST: re-validasi plafon `SUM(qty)` DI DALAM `tx`
  (TOCTOU tertutup); violasi → 400 + rollback.
- `sales` POST: guarded decrement
  `UPDATE … SET stock = stock - ? WHERE id = ? AND stock >= ?` +
  cek `changes === 1` → race oversell tertutup, stok tak negatif.
- `backup/reset`: + DELETE returns/debts/payables; `audit_log`
  sengaja TIDAK dihapus (akun + rekam jejak audit).
- UI `admin/data-client.tsx`: teks entitas & warning
  import/reset disesuaikan.

**Batch B — `f280f60` (minor hardening, 9 file):**
- konsinyasi: guarded UPDATE sell/return/pay di level SQL
  (`qty_sold + ? <= qty_received`, `amount_paid + ? <= tagihan`)
  → double-submit tak lagi overpay/oversell.
- debts/[id] pay: guarded update + jurnal kas MASUK
  `cash_entries` "Bayar piutang · …" (sejajar payables
  "Bayar hutang") + `invalidate('kas:','reports:')`.
- payables/[id] pay: guarded update; data berubah → 400.
- members: DELETE kini dalam `tx` + urutan FK-safe (null
  `sales.member_id` dulu); pencarian LIKE escape meta-char
  (`% _ \`) + `ESCAPE '\'`.
- products POST/PUT: harga/HPP/stok clamp ≥0 (mencegah angka
  negatif merusak laba, COGS & kalkulasi zakat).
- reports GET: `days` clamp 1–3650 (dulu ≤0 → full-scan 1970).
- logout: fallback `findSessionUser()` — logout sesi
  idle-expired kini tetap tercatat di audit.
- notifications GET: error `pruneOldNotifications` kini
  `console.warn` (tak ditelan diam-diam).

**Known issues (belum difix / accepted — 21 Sep 2026):**
- Throttle login pakai `X-Forwarded-For` (per-instance, bisa
  dirotasi); mitigasi: 3x salah PIN → sesi dimusnahkan + lock
  5 mnt → accepted risk.
- GET `/api/audit` menampilkan `old_value/new_value` (termasuk
  PII member) ke tier pengurus — sesuai desain role internal;
  tinjau bila perlu.
- Cetak struk / struk WA: DIVERIFIKASI AMAN — nama customer/produk
  masuk JSX React (auto-escape) + `window.print()` (CSS
  `.receipt-print`, tanpa document.write/innerHTML/dangerously
  SetInnerHTML); teks struk/rekap WA di-encodeURIComponent utk
  `wa.me` (nomor disterilkan non-digit). Lihat TODO.md [x].
-`audit_log` auto-purge harian (job `audit` di cron; default 90
  hari) - TODO [x] SELESAI; purge manual admin tetap tersedia.
- Stale cache lintas instance Vercel ≤60 dtk (accepted,
  terdokumentasi).
- Retur refund KININ dihitung dari harga efektif (commit
  `2a34a8f`, 22 Sep) - TODO [m] ditutup.
- `point_history` belum masuk backup/restore (TUNDA — 21 Sep
  2026, keputusan user, di luar cakupan perluasan backup).

## Status Produksi & Uji (update sesi akhir)
- 17 fix live di Vercel (chain `851e219` → `a4fdd00`; Batch A
  `c02421b`+`d435f57`, Batch B `f280f60`, dst.). **Test manual
  12 langkah DITUNDA** (Makfi sibuk) — checklist tetap terbuka;
  import backup legacy v2 → skema v3 tetap berisiko data lama
  (kolom notification/audit kosong), bukan error.
- **XSS struk print/WA: DIVERIFIKASI AMAN** (commit dokumen
  `a4fdd00`): cetak = JSX auto-escape + `window.print()` (tanpa
  document.write/innerHTML/`javascript:` URL); struk/rekap WA =
  teks polos `encodeURIComponent` di `wa.me`. Tanpa fix kode.
- **Retur refund diskon baris: DISELESAIKAN** (commit `2a34a8f`
  22 Sep) - refund = floor(qty_retur x (subtotal - diskon baris) /
  qty_terjual); estimasi UI retur-client.tsx pakai rumus sama.
- **Export CSV dibatasi** (batch 3, 22 Sep): `reports/csv/route.ts`
  `from` kini maksimal 365 hari ke belakang + `LIMIT 50000`
  (sebelumnya default sejak 1970, tanpa limit row).
- **AUDIT bug scan 3x (22 Sep)**: tanpa temuan baru; item [r]
  forensik (x-forwarded-for) tetap terbuka; purge audit_log
  SELESAI (22 Sep, auto-purge cron; lihat entri akhir).

- **Audit 4-fase otonom (perbarui terkini)**: sweep ulang delta
  (margin guard, split payment, redemsi parsial, returns guard,
  migrasi idx_sales_member, tx() commit, PWA whitelist/retry,
  print 58mm) — tanpa 🔴/🟠 baru; 🟡 kelengkapan jejak `pay_split`
  di audit `sales:create` difix (`4431e80`). Perf terukur:
  First Load JS maks 133 kB (< target 150), shared 103 kB,
  Middleware 34 kB, 48 page. FASE UI/UX = laporan menunggu
  approval (Modal ✕ <44px + tanpa ESC/focus-trap; kontras teks
  skeleton rendah; belum ada panel bantuan hotkey POS) — kode UI
  belum diubah apa pun.

- **Struk thermal 58mm + @page kondisional (perbarui)**: `.receipt-print`
  = 58mm/2mm/9pt/1.3 (commit `82fccdb`); `@page` global A4 8mm utk
  laporan `.print-area`; saat cetak struk `printReceipt()` (pos-client)
  inject `@page 58mm/0mm` + hapus saat `afterprint` (fallback 4 dtk) —
  semua jalur cetak struk (auto-print, F5, tombol) lewat helper ini;
  `.print-hidden` utk chrome. Catatan uji Makfi: cek spacing, jumlah
  item per roll, margin tepi di mesin kasir fisik.

- **Notif stok pasca-penjualan dibatasi (22 Sep 2026)**:
  `notifyStockAfterSale` kini hanya cek produk < 5 (stok terendah
  dulu, cap 5 produk paling kritis) - TODO [r] "loop per produk"
  selesai; item [r] `reports/csv` tanpa limit sudah fix di `473c8d3`
  \(from max 365 hari \+ LIMIT 50000\)\.

- **Auto-purge audit_log (22 Sep 2026)**: `purgeAuditLog`
  di lib/notify.ts (hapus > 90 hari + invalidasi cache
  `audit:log`+`audit:ops:50`+`audit:ops`); cron job `audit` &
  diinklusi job `all`; dipicu scheduler eksternal (Vercel Cron
  + CRON_SECRET, repo tak kelola secret); purge manual admin
  (`DELETE /api/audit`) tetap tersedia. TODO [r] audit-purge
  ditutup.

- **Label barcode produk (22 Sep 2026)**: tombol "Label" di tabel
  /admin/produk (produk-client.tsx) membuka `ProductBarcodeLabel`
  (`src/components/admin/product-label.tsx`): QR berisi nilai field
  `barcode` produk — discan CameraScan kasir (jsQR, lookup
  `addByBarcode`) atau diketik manual; nomor barcode juga dicetak
  teks monospace utk scanner USB 1D / input manual. Grid 2 kolom A4,
  pilihan 2–24 lembar, print window + `document.write` (pola
  MemberQrBadge; semua nilai di-escape HTML). Produk tanpa barcode →
  toast penunjuk ke tombol Ubah. Lib `qrcode` sudah ada di deps
  (dipakai juga MemberQrBadge). TODO [x].

- **QRIS DITUNDA (keputusan user, 22 Sep 2026)**: QRIS mock (SVG acak +
  NMID fiktif `ID102003004050`) hanyalah PLACEHOLDER — **belum
  production-ready, jangan dipakai menerima pembayaran**. Makfi akan
  mengurus NMID resmi (bank/agregator QRIS). Setelah NMID siap:
  Opsi A payload EMVCo statis client-side + `qrcode` (tanpa API,
  verifikasi manual kasir) / Opsi B gateway dinamis Xendit/Midtrans
  (API key + webhook). TODO [r] terbuka.

- **Perk member di POS (22 Sep 2026, commit `43098a4`)**:
  POST `/api/sales` kini menerapkan `member_settings` saat transaksi
  (server = sumber kebenaran; preview POS pakai rumus sama):
  (1) diskon = `member_discount%` dari subtotal setelah diskon manual;
  bila hari ulang tahun member & `birthday_active` aktif, pakai
  MAX(`birthday_discount`, base) — yang paling untung (keputusan
  user), cap 90%; (2) cashback = `cashback%` dari total SETELAH perk,
  dikredit `members.cashback_balance` + ledger `point_history`
  (reason 'cashback'); (3) poin dihitung dari total setelah perk
  (dulu sebelum perk); (4) auto-tier (badge/status saja, tanpa
  diskon tambahan — keputusan user): `members.tier` dihitung ulang
  dari akumulasi `total_spent` vs `tier_silver`/`tier_gold` (bisa
  turun ke silver/nona bila di bawah ambang). Kolom baru
  `sales.member_discount` (pisahkan dari kolom `discount` manual).
  GET `/api/members` kini kirim `birth_date`, `tier`,
  `cashback_balance` (gate tier 'pos'). UI POS: chip perk preview
  (badge tier, diskon, cashback) + struk (kartu/thermal/WA/salin):
  baris diskon member / cashback / tier. GROSIR DITUNDA (keputusan
  user: fokus perk dulu); redemsi poin & pemakaian
  cashback_balance = langkah berikutnya (fitur 2 — SELESAI 23 Sep,
  commit `66a3db9` + fix `1b98a24`; detail di bagian di bawah).

## Penjaga Margin Perk Member (commit `4dee370`, 23 Sep)
- Modul murni `src/lib/perks.ts` = SATU-SATUNYA sumber rumus perk,
  dipakai bersama POST /api/sales (otoritatif) + preview POS +
  unit test `node scripts/test-margin.ts` (`npm run test:margin`,
  57 test). JANGAN tambah import proyek di sini — harus tetap
  bisa dieksekusi Node langsung (type-stripping).
- Pipeline perk (urutan): (1) diskon member = % dari subtotal
  SETELAH diskon manual, cap 90%; ultah aktif → MAX(birthday,
  base); (2) redeem: nominal, poin (1 poin = `point_value` Rp)
  dipakai DULU, sisa dari `cashback_balance`, cap di total
  setelah diskon + ketersediaan saldo; (3) cashback = % dari
  total SETELAH diskon & redeem → kredit saldo (liabilitas,
  TIDAK mengurangi total saat ini); (4) poin = total /
  `points_every`; (5) auto-tier dari akumulasi `total_spent`
  (badge/status saja).
- PENJAGA MARGIN (anti rugi): margin kotor = subtotal − Σ(cost×
  qty); cap perk otomatis = max(0, margin − diskon manual);
  pangkas berurutan cashback → redeem → diskon (diskon paling
  "keras" utk pembeli → dipertahankan terakhir). Diskon manual
  menembus margin = SOFT: flag `manual_over_margin` (audit
  `sales:margin_clamped` / `sales:manual_over_margin` + notifikasi
  admin `margin_alert`), penjualan TIDAK diblokir (keputusan
  user). HPP produk = 0 → margin dianggap = subtotal (guard tak
  pernah memotong — aman).
- POST /api/sales kini balas blok `sale.margin` (diagnostik:
  grossMargin, cap, clamped, clampedAmount, manualOutflow,
  manualOverMargin) + ledger `point_history` reason: `earn`,
  `cashback`, `redeem` (delta NEGATIF = poin terpakai),
  `cashback_use` (delta NEGATIF = Rp terpakai), `void`,
  `refund`, `refund_cash`. Kolom baru `sales.redeem` +
  `sales.cashback`. UPDATE members guarded
  `WHERE points ≥ ? AND cashback_balance ≥ ?` (race 2 transaksi
  paralel satu member tak bisa oversell saldo).

## Redemsi Poin + Saldo Cashback — rollback DELETE (baseline
`66a3db9` + fix `1b98a24`, 23 Sep)
- UI POS: dulu checkbox "Tebus poin/saldo" (auto-max); KINI input
  nominal bebas + tombol "Maks" (follow-up — lihat seksi "Redemsi
  Parsial" di bawah); nominal `redeem`; poin dulu lalu saldo;
  + 2 baris struk.
- DELETE /api/sales/[id]: guard anti-double-delete — hapus baris
  sales DULU, cek `changes === 1` baru restock/rollback member;
  race 2 DELETE paralel → seluruh batch di-rollback (tak ada
  restock/kredit dobel). Tier di-rehitung setelah
  `total_spent` turun (badge tak stale). Rollback redemsi
  terbaca PRESISI dari ledger (`SUM ABS(delta)` per reason +
  `SUM(amount)`), jejak `refund`/`refund_cash`; jumlah `amount`
  SAMA di earn/cashback/redeem/cashback_use agar agregat &
  audit konsisten.
- `.gitignore` + lokal: `_prod` (dump turso prod), `_ts.json`,
  `db.txt` — JANGAN commit.

## Redemsi Parsial — input nominal (follow-up UI, 24 Sep 2026)
- Checkbox "Tebus poin/saldo" (auto-max) GANTI jadi input nominal
  Rp (`redeemInput`) di POS: kasir ketik nominal bebas, di-clamp ≤
  `redeemMax` (= poin×point_value + cashback_balance, plafon total).
  Tombol "Maks" = perilaku auto-max lama (shortcut).
- Preview live "Tebus −Rp X (N poin + Rp Y cashback)" pakai rumus
  SAMA server (perks.ts): `N=min(floor(redeem/pointValue),
  availPoints)`, `Y=min(redeem−N·pointValue, availCb)`. Nominal >
  saldo → warning + auto-clamp. Backend TIDAK berubah (POST
  /api/sales sudah terima `b.redeem` nominal sejak baseline Fitur 2).
  TSC + `next build` lolos. **Fitur 2 (redemsi) 100% selesai.**

## Bug check 3x utk perk/redemsi/DELETE (23 Sep — tanpa temuan
blocking)
- FUNGSIONAL: POST↔DELETE konsisten — ledger reason simetris,
  jumlah `amount` per reason sama, re-hitung tier memakai ambang
  `tier_silver`/`tier_gold` yang sama dgn `computePerks`. Edge
  pre-ada (tercatat TODO [r]): `amount_paid`/`change` dipercaya
  dari klien (tak di-cross-check vs total) — rencana Fitur 3
  menutup utk transaksi bercampur (Σ split divalidasi server).
- KEAMANAN: guard utuh (POST `canAccess 'pos'`; override harga,
  diskon line & transaksi HANYA manager; DELETE `isManager`;
  PATCH sales status sendiri-atau-manager); SQL tetap
  parameterized; `redeem` di-floor + cap ketersediaan;
  notifikasi margin best-effort tak memblokir/merollback.
- PERFORMA: margin guard = murni hitungan (0 query tambahan);
  guarded redeem UPDATE = 1 round-trip; re-hitung tier = mrow
  (SELECT yang sudah ada) + `getMemberSettings()` (cache modul
  30 dtk) + 1 UPDATE — tak ada N+1; agregat kas/laporan tetap
  di-cache 60 dtk; `point_history(member_id)` terindeks.

## Fitur 3 — Pembayaran Campuran (SELESAI — approval user)
- Keputusan user: SPLIT PENUH saja (Σ = total, tanpa piutang;
  bayar-sebagian = follow-up terpisah). Whitlist metode {cash,
  tf, wa} (QRIS resmi menyusul bila NMID siap -> tambah `qris`
  ke whitelist + PAY_LABEL).
- Skema v13: `sales.pay_split` JSON TEXT NULL
  (`[{"m":"cash","a":50000},{"m":"tf","a":50000}]`); baris lama /
  1-metode = NULL (fallback `pay_method` + `total`).
- Validasi server POST /api/sales: metode ⊂ whitelist, nominal
  integer > 0 per bagian; **Σ(split) = total final PERSIS**
  (dicek di dalam tx, setelah perk member); `change` = 0 &
  `amount_paid` = total; `pay_method` = metode dominan (bagian
  terbesar) — baris lama tak berubah.
- Agregasi per-metode TERPUSAT di `src/lib/pay-methods.ts`
  (modul murni, aman diimpor klien): `parsePaySplit`,
  `salesByMethod` & `salesCashPortion` (SQL UNION ALL +
  `json_each`; WHERE tanpa alias, args diulang 2x). Dipakai
  windowStats shifts (cash_total/by_method), by_method reports,
  periodSales notify. Shift-close: kasir menyetor BAGIAN tunai
  transaksi bercampur, bukan totalnya.
- Consumer selesai: rekap/struk WA + struk POS modal/cetak
  (rincian per metode), kas label "(cash+campur)", csv kolom
  `pembayaran_campur`, backup export/import (payload v4, legacy
  tetap valid), laporan baris "(campur)", UI POS: tombol "🔀
  Campur" + input nominal per metode + indikator Lunas/Selisih
  live; payload `pay_split` ikut antrean offline.
- Uji: `npm run test:split` (node:sqlite in-memory — agregat
  per-metode & cash-portion utk baris legacy + mixed, 15 check).
- QRIS resmi DI LUAR cakupan (TERTUNDA — NMID).

## Batch UI + Hotkey (21 Sep 2026) — 7 commit, HEAD `9782a89`
- **Logo (95c70b5):** chip persegi `h-9 w-9` (Image `h-full w-full object-contain`)
  + brand "Kopontren AL ITTIHAD" semua lebar — perbaikan bug #14
  (atribut width/height 36 mengunci aspect ratio).
- **Batch 3 (c3ce06c): tema + keluar pindah ke hamburger.** `shell.tsx`
  kini `'use client'` (+ `useRouter`): handler `toggleTheme` (logika cookie
  identik ThemeToggle lama) & `handleLogout` (POST `/api/auth/logout` +
  `router.push('/login')`) di-pass ke `HamburgerNav` → `Sidebar`. Di bawah
  nav panel: item "Ganti Tema" (ikon dinamis CSS: dark→Sun, light→Moon) +
  "Keluar" (rose). `themetoggle.tsx` & `logout.tsx` DIHAPUS (f03d6b7).
  Header kini: hamburger + logo/brand | nama+badge role + bell (admin).
- **Batch 4 (c364b2c): a11y.** `Modal` (ui.tsx): ESC tutup, focus-trap
  Tab/Shift+Tab, fokus awal elemen pertama + restore saat tutup,
  `role="dialog" aria-modal aria-label`, tombol ✕ min 44px (`min-h-11
  min-w-11`). `Toast`: live region `role="status" aria-live="polite"`
  PERSISTEN (kosong = sr-only, jangan unmount — SR tak mau live region
  baru). `PageSkeleton`: kontras naik (`bg-slate-300`/`dark:bg-navy-500`,
  label slate-500).
- **Batch 5 (7ab05d2 + 9782a89): hotkey kasir.** Hook baru
  `src/lib/useHotkeys.ts` (map handler stabil via useRef: listener 1x,
  isi map fresh tiap render; handler yang preventDefault — di luar aksi
  input teks & shortcut browser tetap normal). F1–F5 + ESC TIDAK berubah
  (memori otot). Baru: F6 toggle split (cart tidak kosong, di luar modal),
  F7 buka/tutup shift (modal sesuai `currentShift`), F8 fokus select
  member, F9 fokus input diskon (hanya admin), panah ↑/↓ seleksi item
  keranjang (+ highlight ring, clamp), +/- qty item terpilih (clamp stok
  via setQty), Del/Backspace hapus item, Enter di kolom uang diterima =
  checkout (guard uang kurang tetap jalan), Ctrl+P cetak struk, Ctrl+M
  member, Ctrl+H → `/laporan` (CATATAN: Chrome menahan Ctrl+H — tak
  bisa dicegah page-side; Firefox/Edge OK; fallback = menu), Ctrl+R reset
  pesanan tanpa transaksi (antrean offline TIDAK disentuh). Cheatsheet:
  tombol `?` di judul keranjang + key `?` (guard: ketik `?` di input teks
  tidak membuka panel).
- **REGRESI DB (3724e36) — temuan bug check, PENTING:** `sales.kasir_id`
  cuma ada di `CREATE TABLE` (tak berlaku utk DB existing) + tak ada
  `execColumn` → di Turso produksi kolom HILANG: `CREATE INDEX
  idx_sales_kasir` gagal, `INSERT INTO sales (kasir_id,…)` & guard retur
  `SELECT … kasir_id` = "no such column". FIX: `execColumn(d, 'ALTER
  TABLE sales ADD COLUMN kasir_id INTEGER')` (idempoten) + bump
  `SCHEMA_VERSION 14`. Baris lama kasir_id NULL = transaksi historis
  tanpa atribusi; guard hanya membatasi role kasir (pengurus/admin leluwa).
- **Verifikasi:** `tsc --noEmit` exit 0 · `next build` 48/48 ·
  `test:split` 15/15 · `test:margin` 57/57 · dual-push master+main
  `9782a89` (ff juga membawa 7 commit main tertinggal). `public/sw.js`
  tetap tidak di-commit (stamp di-inject lokal saat build).
- **STATUS LIVE (22 Sep 2026):** 8 commit (`95c70b5`…`f0d17c8`) sudah
  di master + main; Vercel auto-deploy dari `main`. **skema v14 terpasang
  pada cold start pertama pasca-deploy** — buktinya = smoke test transaksi
  POS baru di HP user: INSERT `kasir_id` jalan tanpa "no such column".
  (Query `schema_version` tak bisa dari lokal: `.env` lokal hanya
  `DATABASE_URL` dev-DB; token Turso produksi hanya di Vercel env.)
- **Keputusan sisa item:** QRIS asli TUNDA (NMID), grosir/perks member
  belum dimulai, `point_history` backup TUNDA (keputusan 21 Sep: di luar
  cakupan). File scratch sesi di-gitignore (`_*` pola + `scripts/zz-*`);
  bukti di-retain lokal: `_txlib.mjs`, `_probe4.mjs`.

## Produk & Stok — Revisi Pendekatan (23 Sep 2026)
- Cline TIDAK lagi butuh akses Turso langsung utk fetch stok/import
  (credential Turso di `.env` lokal tidak diperlukan). Pendekatan:
  Cline generate CSV stok dari DB dev, USER upload sendiri ke Turso.
- Artefak: `stok-export-YYYYMMDD.csv` di root project (untracked,
  jangan di-commit — user ambil lokal). Header:
  `id,nama_produk,barcode,kategori,stok,hpp,harga_jual,status`.
- Mapping kolom DB→CSV: `products.name`→nama_produk,
  `products.category`→kategori (kategori = TEXT langsung di tabel
  `products`, bukan join tabel `categories`), `products.cost_price`→hpp,
  `products.base_price`→harga_jual, `products.active`→status
  (1='aktif' / 0='nonaktif'), `products.barcode`→barcode (banyak
  masih kosong → field dibiarkan kosong).
- Generator: `_gen-stok-csv.mjs` (scratch gitignored, re-runnable):
  buka `data/kopontren.db` read-only via `node:sqlite`, tulis UTF-8
  TANPA BOM + quoting RFC-4180 (field mengandung koma/quote
  di-wrap tanda kutip, quote internal dobel). Contoh nyata:
  produk `double tap 1,2 cm` (id 127) ter-export dgn benar.
- Ekspor 23 Sep: 237 baris (semua aktif). Baris 237 = `ZZ-GUARD-TEST`
  (baris uji manual di DB dev, tidak ada di codebase) — flag:
  hapus sebelum upload bila Turso produksi tak punya baris tsb.

## Phone guard format-insensitive + purchases floor (23 Sep 2026)
- **Commit `f2b398e` fix(members): phone duplicate guard
  format-insensitive + test 26 checks** (dual-push master+main):
  - `src/lib/phone.ts`: `canonicalPhone` (normalize "+62/62/0" →
    digit kanonik) + `phoneOwner(d, phone, exceptId)` — pemilik nomor
    selain `exceptId` lewat pembanding DUA bentuk (teks apa adanya
    sesuai kolom/index `idx_members_phone_uniq` + bentuk kanonik),
    parameterized IN(...) — duplikat beda penulisan tertangkap di
    lapisan aplikasi SEBELUM constraint mentah (dulu: HTTP 500
    "Kesalahan jaringan." di POS).
  - `src/app/api/members/route.ts`: helper lokal `phoneOwner` dihapus,
    import dari `@/lib/phone`; POST guard 409 + try/catch fallback
    400, PUT guard (kecuali diri sendiri) 409.
  - `scripts/test-members-phone.ts` (`npm run test:phone`): **26
    checks, 0 gagal** — index unik tolak teks mentah, index terima
    teks beda kanonik sama (bukti guard app wajib), query kanonik vs
    tersimpan "+62…", kecuali diri → null, dll.
  - Verifikasi: `tsc --noEmit` exit 0 · `test:phone` 26/26.
- **Commit `6b4b179` fix(purchases): floor unit_cost ke rupiah penuh**
  — `Math.max(0, Math.floor(...))`: nominal pecahan tak lagi membuat
  `qty×unit_cost` pecahan → agregat kas/laporan & harga modal
  konsisten.
- `public/sw.js` TIDAK di-commit (stamp lokal `ea8ac407f7aa` =
  artefak build lokal; Vercel re-stamp saat build). CSV stok
  (`stok-export/import-20260923.csv`, `_products_update.csv`)
  tetap untracked — user upload sendiri (PENDING).
- **Vercel: DEPLOY TERKONFIRMASI LIVE (23 Sep):** stamp produksi
  berubah `SW-BUILD:7706b506c8ab` -> `1d0b1c0f67b6` (build s/d
  `c4d77e4`) -> `3d3c7a7f47e6` @ 00:04 (build s/d `e0aed83`,
  diff konten vs sw.js lokal tanpa baris stamp = 0 baris).
  Catatan: stamp di-seed `BUILD_ID + Date.now()` per build (lihat
  `scripts/inject-sw-version.mjs`), jadi stamp prod TIDAK PERNAH
  = stamp lokal DAN re-stamp tiap deploy — kriteria sukses =
  stamp prod BERUBAH dari baseline + konten non-stamp identik
  lokal, bukan match stamp. Cara verifikasi tanpa Vercel CLI/token:
  `curl https://kopontren-gamma.vercel.app/sw.js` lalu grep
  `SW-BUILD:` + Compare-Object vs `public/sw.js` (skip baris stamp).
- **AUDIT 3x (23 Sep): tanpa bug kritis baru** — detail + temuan
  minor (schema mati `stock_opname`, `invalidate('kas:')` no-op,
  fetch klien tanpa timeout) tercatat di TODO.md. Semua key
  `cached()` (7 site) terverifikasi punya pasangan
  `invalidate(prefix)` yang benar; oversell-guard
  `WHERE stock >= ?` + guard `changes === 1` tetap konsisten.
- **Hardening IP klien (23 Sep):** `src/lib/client-ip.ts`
  `clientIp(req)` — ambil KANAN-paling `x-forwarded-for` (hop yang
  ditambahkan edge Vercel; kiri-paling bisa di-forge klien) +
  validasi IPv4/IPv6, sampah -> `'unknown'`. Dipakai oleh
  `logAudit` (forensik audit_log.ip_address) DAN `throttleKey` di
  `/api/auth/login` — sebelumnya kunci throttle
  `username|IP` bisa diputar penyerang via header palsu sehingga
  lockout anti brute-force tak pernah terpicu. Test
  `npm run test:clientip` (16 checks). `x-real-ip` tetap jadi
  fallback bila XFF absen.


## Fix minor FASE 1 + drop stock_opname + FASE 2 (23 Sep 2026)
- **Commit `c088861` fix(client): timeout 10 dtk di semua fetch** —
  helper baru `src/lib/fetch-util.ts`: `fetchTimeout(url, init?, ms=10_000)`
  (AbortController; menggabungkan `init.signal` bila ada) + `isAbort(e)`
  + pesan galat spesifik "Waktu koneksi habis. Silakan coba lagi."
  Cakupan: `api()` di `ui.tsx` (menutup SEMUA caller helper: POS,
  laporan, piutang, retur, belanja, hutang, kas, konsinyasi, audit,
  shift, produk, pengguna, member, zakat, dsb.), `/api/auth/login`,
  PIN verify, PIN setup (cek sesi + POST), `session-watcher` (polling
  30 dtk + refresh), logout `shell.tsx` (kini + catch — dulu bisa
  hang tanpa redirect), export CSV zakat. Pengecualian: batch import
  produk `migrate-client` = 60 dtk (batch 50 baris tidak boleh
  terpotong Turso lambat).
- **Commit `ae430f6` docs(cache): `kas:` backstop** — hanya doc
  (header ref-cache.ts); bukan bug, tidak ada perubahan perilaku.
- **Commit `c46f4fa` chore(db): drop `stock_opname` + SCHEMA_VERSION 15** —
  CREATE TABLE + CREATE INDEX dihapus dari skema fullInit; langkah v15
  baru `DROP TABLE IF EXISTS stock_opname` + `DROP INDEX IF EXISTS
  idx_stock_opname_created` sebelum stamp versi. DB produksi (stempel
  14) akan menjalankan `fullInit` SEKALI saat cold start pertama pasca
  deploy (pola sama dengan bump v9→14 — terbukti aman); data lama
  (bila pernah diinput manual) tetap bisa dipulihkan dari snapshot
  backup Turso pra-drop. Butuh opname lagi → migration baru + v16.
- **FASE 2 (UI Modern + Komunikatif): AUDIT UI/UX LENGKAP SELESAI,
  TUNGGU APPROVAL user sebelum ubah UI.** Detail temuan per halaman di
  `TODO.md` (seksi "FASE 2 — Audit UI/UX"). Prinsip yang disepakati:
  tidak ada perubahan UI sebelum approval; rekomendasi dipecah per
  batch agar tiap batch kecil & mudah di-approve.
- **FASE 2 BATCH A: DISELESAIKAN — commit `9ef700e` (23 Sep 2026).**
  Eksekusi 4 item bug fungsional (1 commit, 10 file, +377/-199):
  1. **Guard busy 8 form** (useState per-file, konsisten dgn POS/
     LowStock): piutang, hutang, belanja (tab in & out), kas,
     konsinyasi (`post` + 5 tombol KonsCard), produk (save/stock/
     toggle; bulk sudah guard), member, pengguna (6 operasi).
     Setiap submit async kini `if (busy) return` + `finally
     setBusy(false)`, tombol `disabled` saat request.
  2. **Label belanja tidak menyesatkan:** "(50 transaksi/pengeluaran
     terbaru)" → "(dari semua data)" — total memang agregat global
     server, daftar di bawah hanya 50 baris.
  3. **Feedback sunyi diurai:** `removeEntry` (kas) kini toast sukses/
     gagal; `toggleActive` (pengguna) kini toast "Aktiv/Nonaktif".
  4. **Notifikasi pagination laporan:** GET `/api/sales` kini
     mengembalikan `total` (COUNT dgn WHERE sama); `laporan-client`
     menampilkan footer "Menampilkan X dari N transaksi".
  - Verifikasi: `tsc --noEmit` exit 0, `npm run build` exit 0,
    audit guard per-file (semua 8 form punya `if(busy)` + `disabled`).
    `public/sw.js` sengaja TIDAK di-commit (di-stamp ulang oleh build
    Vercel). Dual-push `main` + `master` @ `9ef700e`.
  - Belum teruji di UI langsung (butuh deploy + klik di perangkat);
    logika double-tap sudah dipertahankan di level guard + disabled.

   - **Test manual 4 poin Batch A nang HP: SEMUA OK (23 Sep, hasil
     user):** (1) double-tap form → tap ke-2 diabaikan ✓,
     (2) label total belanja "dari semua data" ✓,
     (3) footer "Menampilkan X dari N transaksi" ✓,
     (4) toast kas + pengguna ✓. → Batch B di-approve.
- **FASE 2 BATCH B (mobile tabel→card): DISELESAIKAN — commit
  `cb792aa` (23 Sep 2026).** 5 file, +273/-8, MURNI RENDER LAYER
  (state/logika/data tak disentuh): kas, shift, produk, member,
  audit. Pola: tabel `hidden sm:block` + card list `sm:hidden`
  memakai source data yang sama (`data.rows`, `all` + `openList`,
  `filtered`, `shown` jendela virtual member — spacer
  `padTop`/`padBottom` diduplikat di card agar scroll container
  virtual tetap akurat, `logs` audit). Hit-area 44px: tombol aksi
  card `h-11` mobile / `sm:h-9` desktop; `.btn`/`.input` sudah
  bawa `min-height:44px` sehingga tombol `.btn-*` lama tak perlu
  diubah. Fix khusus Batch B: (a) hapus jurnal kas di card = ikon
  `Trash2` (lucide) 44×44 + `aria-label` (tabel desktop tetap link
  teks "hapus"), (b) toggle Aktif/Nonaktif produk kini TERGUNA
  di mobile lewat card (dulu hanya tabel desktop; checkbox
  "Setor kas" shift di card 44px utk admin, load-more 44px).
  `public/sw.js` sengaja TIDAK di-commit (prebuild `npm run build`
  me-stamp ulang: stamp lokal kini `01d183d5d618`).
  Verifikasi: `tsc --noEmit` exit 0 (output kosong), `npm run
  build` exit 0 (rute export lengkap, First Load JS shared
  103 kB). Dual-push `master` + `main` @ `cb792aa`.
- **FASE 2 BATCH C (konsistensi UI): DISELESAIKAN — commit
  `ec9d9c9` (23 Sep 2026).** 22 file, +181/−77, MURNI
  PRESENTASIONAL (tak ada ubah data/state/API/DB):
  1. **Label metode bayar terpusat:** `lib/pay-methods.ts`
     kini punya `PAY_METHOD_LABEL` + `payMethodLabel()`; 6 map
     lokal (rekap, pengurus-dashboard, pos-client, laporan-client,
     shift-client, home) dihapus → 16 call-site pakai helper.
  2. **Skeleton seragam:** 7 page wrapper `next/dynamic` (audit,
     hutang, pengaturan-member, shift, zakat, piutang, retur)
     `loading="Memuat komponen..."` → `<PageSkeleton />`.
  3. **Low-stock badge:** "14hr: 0/j" → "belum ada penjualan
     14 hari", "±N hr" → "habis dalam N hari".
  4. **Aksen h1:** konsinyasi/produk/belanja dapat span
     `text-accent-500`; laporan amber→accent.
  5. **Bug pin/setup:** status tak dikenal/fetch gagal dulu
     nyangkut "Memeriksa sesi…" → kini lanjutkan UI + state
     `checkFailed` + hint amber "tak bisa cek sesi, lanjutkan
     saja" (POST tetap memvalidasi sesi server-side).
  6. **Unduhan tanpa tab flicker:** 4 tempat
     `window.open('/api/backup')` & `window.open('/api/reports/csv…')`
     (data-client ×2, laporan-client, laporan-admin-client) →
     `fetch`+Blob+`URL.createObjectURL`+`<a download>`+revoke,
     busy `dl` + toast sukses/gagal.
  - Verifikasi: `tsc --noEmit` exit 0, `npm run build` EXIT 0
    (47 rute), grep sisa `PAY_LABEL`/`window.open('/api` bersih.
    `public/sw.js` tidak di-commit (di-restore pasca build,
    stamp lokal `c1adf8a50196`). Dual-push `master` + `main`
    @ `ec9d9c9`.
  - Belum teruji di UI langsung; menunggu test manual user
    (pola sama dgn Batch A/B).
  - **UPDATE (23 Sep):** 6 titik test manual user nang HP
    SEMUA OK — (1) label bayar ✓, (2) skeleton ✓, (3) low-stock ✓,
    (4) aksen h1 ✓, (5) pin/setup ✓, (6) unduhan blob ✓.
    Batch C final → Batch D di-approve.

## FASE 2 BATCH D (a11y polish): DISELESAIKAN — commit `e9ebfdb`
  (23 Sep 2026)
  - 30 file, +194/−161, MURNI ATRIBUT (tak ada ubah
    data/state/API/DB, tak ada ubah layout/perilaku):
    1. **aria-expanded ×3** (sebelumnya 0 di seluruh repo):
       `laporan-client` (akordion transaksi, `aria-controls=
       lap-detail-{id}` + id di panel), `notification-bell`
       (toggle panel, `aria-controls="notif-panel"` + id di panel),
       `sidebar` (tombol menu mobile drawer).
    2. **role=tablist ×3 baru** (+ `role="tab"` +
       `aria-selected` di 6 tombol tab): `belanja-client`
       (in/out), `data-client` (backup/audit), `konsinyasi-client`
       (active/done). Catatan: `pos-client` L1139 sudah punya
       `role="tablist"` bawaan (tak diubah). Panel tab berupa
       fragment/kondisional — wiring `aria-controls` panel
       sengaja dilewati (minimal viable, tanpa wrap baru).
    3. **type="button" ×154 tombol di 30 file** (estimasi awal
       grep single-line ~65; scanner nesting-aware menemukan
       lebih banyak karena banyak tag `type=`-nya beda baris /
       auditor melewatkan tombol tanpa atribut di beberapa file).
       Tombol submit form login (`type="submit"`) TIDAK diubah —
       satu-satunya `<form>` di app.
    4. **Sumbu chart:** label x `SalesBarChart`
       (`charts.tsx`) `text-[9px]` → `text-[11px]`.
  - Verifikasi: `tsc --noEmit` exit 0, `npm run build` EXIT 0;
    grep: `aria-expanded`=3 (full coverage — tak ada kontrol
    fold/collapse lain di repo), `role="tablist"`=4 (3 baru +
    1 eksisting pos-client), `text-[9px]` di charts=0, scanner
    `<button` tanpa `type` = 0 pelanggaran.
  - `public/sw.js` tidak di-commit (di-restore pasca build,
    stamp lokal `9aa319458960`). Dual-push `master` + `main`
    @ `e9ebfdb` (ls-remote kedua ref = `e9ebfdb…`).
  - Sisa pending: test ikon PWA di Edge (urutan 3 test user),
    QRIS / grosir / point_history (tunda, NMID).

## Konvensi fetch klien (23 Sep 2026)
- Klien: SEMUA fetch lewat `fetchTimeout` (`@/lib/fetch-util`),
  default 10 dtk; pesan galat timeout via `isAbort(e)`. Jangan buat
  helper terpisah per halaman. (`checkSession` di `/login/pin` sudah
  punya AbortController sendiri + abort saat unmount — biarkan, sudah
  patuh aturan 10 dtk.)

## Re-Verifikasi LIVE — Batch A `bf52f63` (23 Sep 2026, 19.00)
- **URL produksi = `https://kopontren-gamma.vercel.app`** (project
  Vercel terhubung `kita-foska/kopontren`, build dari `main`).
  ⚠️ `kopontren-app-sapiens-ai.vercel.app` (URL lama di dokumen awal)
  sekarang **404 semua path**, dan `kopontren-app.vercel.app` masih
  menyajikan build **lawas (pra-21 Sep)**: `/sw.js`, `/manifest.json`,
  `/api/*` → 307 `/login`, `/login/pin*` → 404, buildId
  `GCE-OvNduy2JlV5shvyiS`. Keduanya BUKAN produksi — JANGAN dipakai
  utk verifikasi.
- Vercel dashboard (screenshot user 23 Sep): `bf52f63`, `9ef700e`,
  `c46f4fa`, `bd86ffa`, `e0aed83` semua **Ready + Production** ✓.
- Fingerprint LIVE ✓ (HTTP 23 Sep, `kopontren-gamma`): `/sw.js` 200
  (baru, bukan 307), `/manifest.json` 200, `/api/shifts` &
  `/api/sales` → **401 JSON** (middleware passthrough — behavior
  post-`db10160` ✓), `/login/pin` 200, `/login/pin/setup` 200.
- **Semantik stamp SW-BUILD**: `// SW-BUILD:<12hex>` =
  `sha1(.next/BUILD_ID + Date.now())` yang ditulis
  `scripts/inject-sw-version.mjs` SAAT BUILD (vercel.json
  `buildCommand`). **BUKAN hash git** — tak bisa di-resolve `git log`
  (jangan kejar). Stamp live saat ini `7c86f8f64937` vs
  `db032f04f915` ter-commit lokal — NORMAL (tiap build men-stamp
  ulang; isi file 137 baris selain stempelnya IDENTIK).
- Cold start v15: terpenuhi pada **akses pertama dari HP setelah
  deploy ini** — browser deteksi diff /sw.js → install SW baru →
  `skipWaiting` → activate purge cache lama → `fullInit` sekali.
- Koreksi bagian "Batch A" di atas: sejak `c46f4fa` (commit
  `public/sw.js` + `scripts/inject-sw-version.mjs`), `public/sw.js`
  **DI-COMMIT** (dengan stamp); build Vercel men-stamp ulang tiap
  build, jadi diff git per push tetap ada.
