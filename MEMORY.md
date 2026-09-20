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
  (SAAT INI `SCHEMA_VERSION = 11`). Cold start: kalau versi DB < 11 →
  `fullInit` sekali; selain itu 1 SELECT saja. **Aturan: statement skema
  baru WAJIB diiringi bump `SCHEMA_VERSION`** (kalau tidak, DB lama tidak
  akan pernah dapat migrasi).
- Transaksi: `tx(d, fn)` — Turso: batch atomik 1 round-trip; `file:` lokal:
  sekuensial auto-commit (bug @libsql/client 0.15 — tx file LOST, jangan
  pakai lokal utk test integritas).

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

- **QRIS masih MOCK (22 Sep 2026)**: modal QRIS POS = SVG acak +
  NMID fiktif `ID102003004050`. QRIS asli BUTUH NMID resmi
  (bank/agregator QRIS). Opsi A: payload EMVCo statis dibuat
  client-side + `qrcode` — TIDAK butuh API; QR berisi nominal
  transaksi, discan GoPay/OVO/Dana/bank apps; verifikasi pembayaran
  manual oleh kasir (tanpa webhook). Opsi B: gateway dinamis
  Xendit/Midtrans — butuh API key + webhook + route server.
  DILAPORKAN 22 Sep, menunggu NMID/keputusan user. TODO [r].
