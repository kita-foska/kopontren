# MEMORY

# MEMORY

## 2026-10-26
### W13 BATCH 1 -- FLOATING NAV + HAPTIC (commit `935c7c5`, dual-push)
- **Floating pill (bottom-nav.tsx)**: bar bawah mobile kini pil
  mengambang `inset-x-3 bottom-3 z-50 rounded-2xl shadow-lg
  ring-1 ring-black/5 backdrop-blur-md bg-white/90` (dark:
  navy-900/90) + safe-area. Item aktif = `bg-accent-50 rounded-xl`
  (dulu: garis dot di bawah ikon -- dihapus). Breakpoint tetep
  `md:hidden` (pasangan `pb-28 md:pb-16` di shell.tsx).
- **Hide di /kasir**: SUDAH ADA sejak awal di shell.tsx
  (`showBottomNav = pathname !== '/kasir'`, L28) -- POS punya
  sticky bottom bar sendiri (pos-client L2965). Tidak ada
  duplikasi guard; cukup komentar dokumentasi.
- **Haptic (format.ts + pos-client.tsx)**: helper `buzz(pattern)`
  = navigator.vibrate, SSR-safe + try/catch (iPhone/desktop =
  no-op, tanpa izin). Pola: chip nominal (Lunas/10k/20k/50k/100k)
  `12ms`; checkout sukses `[18,40,18]`; gagal `[60,40,60]`
  (guard uang kurang, split beda, server reject). Branch
  offline-queue TIDAK getar-error (murnu info, transaksi
  tercatat).
- **Tutorial**: docs/TUTORIAL-W13-BATCH1.html (commit C3).
- **Gate**: tsc 0; test:all ALL_PASS 40/40; gate (route-exports +
  theme-gate + build) 0; 0 non-ASCII file anyar; frozen utuh;
  tanpa dependency anyar; tanpa perubahan skema.
### W13 BATCH 2 -- PUSH NOTIF SEMUA PERAN (commit `26fdc40`, dual-push)
- **Skop terpusat `src/lib/notify-scope.ts`** (modul PURE,
  zero-dependency): `NOTIFY_ROLES` = admin, manajer, pengurus,
  kasir; `canReceiveNotif(role)` fail-closed (member/gudang/
  pembelian/unknown = false); `notifyRecipientsSql()` ->
  SELECT id FROM users WHERE role IN (...) AND active = 1.
- **notify()** (lib/notify.ts): penerima kini
  `getNotifyRecipientIds()` (4 role, user aktif);
  `getAdminUserIds` dibiarkan (backward-compatible, tak dihapus).
- **Guard 4 API + 1 page**: push/subscribe, push/unsubscribe,
  push/vapid-key, notification-settings (GET+POST) + halaman
  /admin/notifications/settings -- kini pakai
  `canReceiveNotif(user.role)` (dulu hanya isAdmin); guard-fail
  page -> redirect roleHome(user.role) (pola H2).
- **PWA install hint** (notification-settings-client): bila
  `pushState === 'unavailable'` -> box kuning "Install Aplikasi
  (Add to Home Screen) dulu" + instruksi Chrome Android / iOS
  Safari. (Tanpa hint ini tombol Aktifkan Push diam tak
  berkedip.)
- **Test**: `scripts/test-notify.ts` (suite ke-41; 19 check
  termasuk "member TIDAK ada di skop" -- syarat penting W13).
- **Tutorial**: docs/TUTORIAL-W13-BATCH2.html (commit C3;
  inline SVG, 0 emoji).
- **Gate**: tsc 0; test:all 41/41; gate build 0; 0 non-ASCII;
  frozen utuh; tanpa dependency anyar; TANPA perubahan skema
  (v34).
- **W13 SELESAI** (B1 + B2). Lanjut Wave 14: e-Struk
  Interaktif, Member Card Glassmorphic, Health Meter.
 ### W14-1 -- e-STRUK INTERAKTIF: LINK PUBLIK HMAC + TOMBOL BAGIKAN POS (commit `942f74f`, dual-push GitHub master+main)
 - **env `STRUK_LINK_SECRET` (anyar, opsional)**: kunci
   HMAC-SHA256 (node:crypto, `timingSafeEqual`) utk tanda
   tangan link e-Struk; min 16 char. `.env` lokal: 64-hex
   acak (sudah terisi; file ter-ignore git). Tanpa env:
   `GET /api/struk-link` balas 503 + pesan jelas; tombol POS
   tetap ada, tampil toast -- TANPA crash, fitur POS lain
   aman. **Aksi Gus Fi (setelah push): set di Vercel
   (Settings -> Env Vars), salin 64-hex dari .env lokal.**
 - **lib/struk-link.ts (anyar, pure)**: token deterministik
   `<saleId>.<hex16>` + `verifyEstructToken` (timing-safe;
   tolak ID tak dikenal / digest rusak / secret kosong),
   `hasEstructSecret()`, `buildEstructUrl()`,
   `saleToEstructOpts()` = mapper satu-sumber (baris sales ->
   struk-media StructPdfOpts; POS = halaman publik: layout
   PDF/JPEG/WA sama persis -- konsistensi gaya m-banking W7).
 - **Halaman PUBLIK `/struk/[token]` (tanpa auth; middleware
   exception)**: gaya m-banking (reuse layout
   `struk-media.STRUCT_MEDIA` + `StructMediaClient`): logo,
   Tgl+WIB, kasir, pembeli, member, detail baris, TOTAL
   sorot, metode bayar, poin; 4 aksi (Unduh PDF / Unduh Foto
   -- dynamic import pola wadi-report, Kirim WA, Salin Teks).
   Token tak valid -> halaman ramah "tidak valid / belum
   lengkap", TANPA bocor detail data.
 - **API `GET /api/struk-link?id=N`**: guard role POS
   (kasir/admin -- pola /api/sales), 400/404/403/503 pesan
   jelas; hanya mengembalikan link (bukan data struk --
   data dibaca dari `id` oleh halaman publik).
 - **POS (pos-client.tsx)**: tombol "Bagikan Link" di dialog
   struk (icon Link2): fetch API -> `navigator.share`
   (mobile) / clipboard (desktop); guard `mediaBusy`.
 - **Test**: `scripts/test-estruct.ts` suite #42 (28 check:
   deterministik, valid, digest rusak, ID tak dikenal,
   secret kosong, mapping cash/non-cash, guard BOM/emoji).
   `test:all` kini = 43 suite.
 - **Tutorial**: docs/TUTORIAL-W14-1.html (commit C3; inline
   SVG, 0 emoji, layar awam + setup Vercel + analogi HMAC
   (cap resi) vs JWT vs base64 signed + FAQ + peta istilah).
 - **Gate**: tsc 0; test:all 43/43 hijau; gate
   (route-exports + theme-gate + build) 0; 0 non-ASCII;
   frozen utuh; tanpa dependency anyar; TANPA perubahan
   skema (v34).
  ### W14-2 -- MEMBER GLASSMORPHIC CARD: KARTU 300x100 + TILT 3D + SALIN NOMOR (ACC GO CODE 26 Okt)
  - **tailwind.config.ts**: token `wine` diperluas (800 #5E1414,
    900 #420E0E utk gradasi kartu); 4 komentar lama karakter
    em-dash -> `-` (file kini 0 non-ASCII).
  - **lib/member-card.ts (anyar, pure)**: `glassTiltDeg` (pusat
    = 0/0; tepi = +/-maks; clamp; pembulatan 1 desimal; guard
    ukuran 0), `glassTiltTransform` (0/0 -> "none"; selain itu
    perspective(700px) + deg), `glassTierBadge` (gold -> GOLD
    amber / silver -> SILVER slate, case-insensitif; kosong atau
    tak dikenal -> null tanpa crash), `glassCardCopyValue`
    (token QR bila ada -- itulah yg dipindai kasir; selain itu
    nomor member/id).
  - **components/member-glass-card.tsx (anyar)**: kartu 300x100
    glassmorphic (gradasi wine-700/800/900 + lapisan refleksi
    kaca), chip SVG, nama + HP (truncate), poin + saldo reward
    (tabular-nums), badge tier di pojok kanan atas (kelas sama
    dgn MemberQrBadge), QR thumbnail (reuse dependency `qrcode`,
    toDataURL 160px -- pola MemberQrBadge), kotak "Belum" bila
    token QR kosong. Tombol "Salin Nomor" (clipboard + indikator
    "Disalin" 1.5 dtk; fail-safe tanpa crash) + CTA "Lihat
    Detail" membuka modal MemberQrBadge EXISTING (tanpa
    duplikasi cetak/perbarui). Tilt 3D HANYA pointer mouse fine
    + hormati prefers-reduced-motion; MOBILE = statis. Cetak:
    `@media print { @page A4 portrait }`. 0 dependency anyar.
  - **personal-dashboard-client.tsx**: kartu glass ter-mount di
    PALING ATAS dashboard (di atas grid ringkasan), prop
    `member` + `qr={memberQr}` (sinkron otomatis bila QR
    auto-generate di modal) + `onDetail` -> setQrOpen(true).
  - **Test**: `scripts/test-member-card.ts` suite #43 (22 check:
    6 tilt, 2 transform, 4 badge, 2 salin, 3 guard BOM/emoji,
    5 sifat kode: mobile-statis/reuse-qrcode/print-portrait/gradasi
    wine/mount dashboard). `test:all` kini = 44 suite.
  - **Tutorial**: docs/TUTORIAL-W14-2.html (inline SVG, 0
    emoji, layar awam: apa itu kartu glass, efek 3D (komputer
    vs HP), tombol Salin Nomor/Lihat Detail, cetak portrait,
    bila QR belum ada, ringkasan cepat).
  - **Gate**: tsc 0; test:all 44/44; gate build 0; 0 non-ASCII
    (file batch); frozen utuh; tanpa dependency anyar; TANPA
    perubahan skema (v34).
  - **NEXT W14**: W14-3 Dashboard Health Meter (O5) -- 4 gauge
    (transaksi pending, antrean offline, kesehatan DB, kesiapan
    PWA).
  ### FIX NAV -- BUG HAMBURGER MOBILE: BOTTOM NAV z-50 -> z-30 (ACC GO FIX 26 Okt, ruling DeepSeek)
  - **Insiden**: menu hamburger mobile -- saat drawer terbuka,
    overlay (z-40) tidak menutupi pill navigasi bawah
    (z-50, setara drawer z-50): pill tetap cemerlang & bisa
    diklik di atas scrim (layak "nutupi" menu).
  - **Root cause**: src/components/bottom-nav.tsx (pill
    `fixed inset-x-3 bottom-3 z-50`). Lapisan target: Drawer
    z-50 > Overlay/Header z-40 > Bottom Nav z-30 > konten.
  - **Fix minimal (ruling: 1 file 1 kelas)**: z-50 -> z-30 +
    komentar desain di header komponen. State shell
    (sidebarOpen), scrim, aria-hidden + inert TIDAK diubah;
    perilaku desktop tak terpengaruh (pill `md:hidden`).
  - **Gate**: tsc 0; test:all 44/44; gate build 0; 0
    non-ASCII (file batch); frozen utuh; TANPA perubahan
    skema (v34).
   ### W14-3 -- HEALTH METER: SPIDOMETER DASHBOARD PENGURUS (ACC GO CODE 26 Okt, ruling DeepSeek)
   - **lib/health.ts (pure, perluasan suite 33)**:
     `HEALTH_SCORE {good:90, ok:40}`; `healthScore(cards)` =
     100 - 30/bad - 10/warn (floor 0; DB gagal total = 30);
     `healthScoreTone` (>=90 green / >=40 amber / <40 red);
     `healthMeterRows` (3 baris db/backup/notifikasi dari 7
     kartu, urutan tetap, robust utk kartu degraded).
   - **lib/health-collector.ts (anyar, server-only)**:
     `collectHealthInput(nowIso)` -- kolektor SHARED (query
     schema_version + audit_log + settings backup_last/_by +
     vapid_keys + notifications, stempel SW-BUILD, ref-cache).
     /admin/health di-refactor memakai kolektor ini (jantung
     yang sama, UX-4). DB tak terjangkau = input degraded,
     BUKAN throw/500.
   - **components/health-meter.tsx (anyar, server-safe)**:
     spidometer SVG busur 180 derajat + 3 zona (merah 0-39 /
     amber 40-89 / hijau 90-100) + jarum + busur progres +
     angka skor; 3 baris rasio (Database/Backup/Push) dgn
     titik tone; drill-down /admin/health HANYA role admin
     (guard halaman = admin-only), selain itu teks
     informatif. 0 hook (SVG statis dari prop -- hydration
     aman), 0 emoji, semua bentuk = inline SVG.
   - **pengurus/dashboard/page.tsx**: ter-mount di bawah
     KpiGrid, `buildHealthCards(await collectHealthInput())`.
   - **Test**: scripts/test-health-meter.ts suite #44 (28
     check: ambang zona, skor deterministik 7bad=0 /
     DBgagal=30 / mix=70, boundary tone 90/89/40/39, 3 baris
     + robust degraded, hermetis health.ts, ASCII + server-safe
     komponen). test:all kini = 45 suite.
   - **Tutorial**: docs/TUTORIAL-W14-3.html (inline SVG,
     0 emoji, bahasa awam: baca spidometer, 3 zona, 3 baris,
     drill-down admin, kapan angka berubah, ringkasan cepat).
   - **Gate**: tsc 0; test:all 45/45; gate build 0; 0
     non-ASCII (file batch); frozen utuh; tanpa dependency
     anyar; TANPA perubahan skema (v34).
   - **NEXT W14**: Wave 14 TUNTAS (W14-1 + W14-2 + FIX NAV +
     W14-3); tunggu Wave 15.

### W15-P1 -- HEALTH POLISH: JARUM MELYANG + TICK ZONA + DARK AMBER (ACC GO CODE W15 26 Okt, ruling: visual only, no polling)
- **Temuan audit read-only (26 Okt)**: spidometer W14-3 sudah terpasang
  di /pengurus/dashboard + /admin/health. 3 cacat visual: (1) jarum
  digambar dari pusat -> skor 35..65 (jarum hampir vertikal) menembus
  teks skor besar (baseline y=84); (2) batas zona (0/40/90/100) hanya
  angka, tanpa tanda batas; (3) skor amber tak punya dark variant
  (green/rose sudah punya).
- **Fix (1 file, src/components/health-meter.tsx; logika health.ts TIDAK
  diubah -- suite 44 tetap hijau)**:
  1. Jarum "melayang": segmen pointAt(score,38) -> pointAt(score,58)
     (dulu dari pusat 100,100); hub r4 tetap di pusat.
  2. Tick batas zona: garis pendek r66->r72 di 0/40/90/100 (warna netral
     slate-400/dark:slate-500).
  3. Skor: `fill-amber-500 dark:fill-amber-400`.
- **Ruling (Gus Fi via DeepSeek)**: P1 = finishing visual saja;
  auto-refresh polling 30 detik = scope anyar, TIDAK termasuk W15.
- **Gate**: tsc 0; test:all 49 file 0 fail (agregat 1380 passed, 0
  failed); gate build 0 (route-exports OK + theme-gate OK); 0 non-ASCII
  (file batch); 4 frozen utuh (diff kosong); TANPA dependency anyar;
  TANPA perubahan skema (v34).
- **Tutorial**: docs/TUTORIAL-W15-1.html (inline SVG sebelum/sesudah,
  0 emoji). C2 = seksi menika + TODO "WAVE 15".
- **Sisa W15**: P2a OmniSearch (kalkulator + deep-link 3 titik + suite
  45) dan P2b Micro-Interactions (ripple CSS + cart spring) -- STEP
  2/3 GO CODE. W16 sudah ACC: menunggu W15 rampung (purgecss, font
  [400,600] opsi B, lighthouse devDep, artifacts/ ke .gitignore).
- **Catatan utk W15-P2a/P2b**: gate build `gate` tetap 0 error;
  lighthouse (devDep local) bisa dipakai W15-P2b utk baseline
  perf/UX micro-interaction.

### W15-P2a -- OMNISEARCH: KALKULATOR LOKAL + DEEP-LINK ?q= 3 TITIK (ACC GO CODE W15, ruling 3 titik)
- **Ruling**: OmniSearch = 3 titik (admin produk, admin member, kasir);
  prefill /laporan ditunda; kalk "25000 * 12 = 300.000" langsung
  dari kotak Pintar.
- **Implementasi (6 file + package.json)**:
  1. `src/lib/calc.ts` (ANYAR, pure 0 import): `isCalcExpr()` +
     `safeCalc()` shunting-yard + RPN -- TANPA eval/Function; dukung
     `+ - * /`, kurung, persen, desimal, unary. Anti-OOM (jangkar
     iterasi), div0/overflow/kurung miring = null; hasil dibulatkan
     maks 4 desimal. `formatCalcResult()` locale id-ID (300000 ->
     "300.000").
  2. `command-palette.tsx`: query terdeteksi ekspresi -> section
     "Pintar | Kalkulator" (Enter = hasil jadi query lanjutan) +
     SKIP fetch /api/search.
  3. `admin/produk-client.tsx` + `admin/member-client.tsx`: prefill
     `?q=` mount via `useEffect` + URLSearchParams window (BUKAN
     useSearchParams -- hindari Suspense); ?q= prioritas di atas
     saved view; URL dibersihkan replaceState.
  4. `pos-client.tsx`: prefill `?q=` + AUTO-ADD (setara Enter) bila
     cocok persis barcode/nama setelah produk load (ref pending
     sekali pakai).
  5. `scripts/test-calc.ts` (ANYAR, suite 45, 51 check): hasil
     benar (prioritas/kurung/persen/unary/bulatkan), null utk
     crash-input (OOM/long-div/deep-paren), isCalcExpr positif/
     negatif, format id-ID. Package: `test:calc` + masuk test:all.
  6. **Bug kritis yang diperbaiki di calc.ts**: (a) tokenizer
     operator tanpa i++ = infinite loop OOM -> jangkar; (b) RPN
     eval urutan pop (kanan dulu utk - dan /); (c) `up` (unary)
     harus pop DULU sebelum operator biner berpresedensi lebih
     rendah; (d) saat POP 'up' dari ops stack, harus dipush ke
     out sebagai `{k:'up'}` BUKAN `{k:'op',v:'up'}` -- kalau
     salah, RPN eval underflow -> null (detected v6 suite).
- **Tutorial**: `docs/TUTORIAL-W15-2.html` (C3).
- **Gate v6**: tsc 0; test:all green (spt suite 45, 51 check);
  gate build 0; 6 file 0 non-ASCII; dual-push.

## 2026-10-19
### R1 DARURAT: 3 TABEL TURSO TERHAPUS -- RESTORE VIA `scripts/restore-db.js` (Gus Fi via DeepSeek, 19 Okt 2026)
- **INSIDEN**: kesalahan fatal (DeepSeek) menghapus tabel
  `products`, `sale_items`, `purchases` di Turso PRODUKSI.
  Turso Free tanpa restore/Import + tak ada Turso CLI.
- **Sumber**: `C:/Users/baiti/Downloads/kopontren.db` (434 KB;
  -wal 0 byte = utuh; integrity ok; stamp **v21**; 37 tabel;
  products **236**, sale_items **0**, purchases **0**, sales 0).
  File "kopontren (1).db" di memo = file ini (nama di-editor WA).
  Data s.d. 3 Okt; 16-17 Okt tak tergantikan dari backup ini.
- **Skema target = DDL v31 PERSIS `rebuildTableV31` (db.ts
  L1238-1243)**: products 13 kolom (stock REAL, ada image_url;
  TIDAK ada min_stock/expiry_date -- dead columns, tak pernah
  di-query app, terverifikasi grep), sale_items 12 (qty_per_base
  REAL, unit_name), purchases 8 (qty REAL).
- **Bug laten teridentifikasi (akar kronis)**: `migrate()`
  (db.ts L428-429) menambah min_stock+expiry_date tiap fullInit,
  padahal DDL rebuild v31 TIDAK memuatnya -> di DB existing
  `INSERT INTO tmp(13) SELECT * (15)` mismatch -> migrate31
  PASTI gagal -> fullInit crash loop tiap cold start. Stempel
  31 oleh skrip restore menghentikan loop tersebut.
- **`scripts/restore-db.js` (CJS -- package.json tanpa "type",
  libsql ESM via dynamic import)**: default DRY-RUN (inspeksi
  backup+target, tampilkan mapping kolom & rencana). `--execute`:
  (1) DROP 3 tabel, (2) CREATE DDL v31, (3) INSERT dari backup
  dgn `client.batch()` chunk 100 DML-only (keyset 500,
  mapping = irisan kolom backupâˆ©v31), (4) 6 index produksi
  (idx_products_barcode, idx_products_active, idx_si_sale,
  idx_sale_items_sale, idx_purchases_created,
  idx_products_active_name), (5) stempel schema_version
  `MAX(version,31)`, (6) verifikasi COUNT backup-vs-target +
  integrity_check + stamp + info sales intact. Idempoten.
  Env: `DATABASE_URL` + `DATABASE_AUTH_TOKEN` (target = DB
  produksi yang sama; F2/restore-turso.mjs utk impor DB BARU
  tetap tersedia).
- **Uji 19 Okt LULUS**: target file-lokal simulasi (stamp 30,
  sales intact, 3 tabel hilang) -> --execute: 236 products,
  shape/index/stamp identik DDL v31; run kedua = idempoten.
  Bug uji: args di-map `res.columns` (13) vs mapping (11) ->
  perbaiki pakai `map.use`; batch pattern = `batch(chunk,'write')`.
- **Aksi Gus Fi**: set DATABASE_URL + DATABASE_AUTH_TOKEN ->
  dry-run -> --execute -> Redeploy Vercel -> login (cold start
  SKIP fullInit karena stempel 31) -> cek Produk/Sales/Pembelian.
  **Data hilang permanen**: detail item transaksi lama
  (sale_items kosong di backup) -- row sales tetap ada.

### PIVOT RECOVERY F2: IMPORT VIA NODE.JS -- TANPA TURSO CLI (Gus Fi, 19 Okt 2026)
- Gus Fi TIDAK punya Turso CLI + Turso Studio tanpa tombol Import
  + Free Plan tanpa restore/PITR -> `scripts/restore-turso.mjs`
  (C7) import memakai HANYA @libsql/client (dep repo):
  - DDL dari sqlite_master (IF NOT EXISTS; tabel dulu urut
    topological FK, lalu index/trigger/view).
  - Data per tabel via client.batch() INSERT chunk 100 baris --
    batch Turso remote HANYA boleh berisi statement DML (bukan
    DDL di dalam batch; TIDAK ADA ATTACH -- tidak didukung
    Turso remote).
  - Validasi: hitungan baris per tabel (sumber vs target),
    PRAGMA integrity_check target, baca schema_version.
  - Flag: default DRY-RUN; --execute; --fresh (reset target);
    --source <file>; --chunk N. Token utk target libsql:// lewat
    env TURSO_TOKEN (Token dibuat di Turso Studio: halaman
    database -> bagian Settings -> Tokens -> Create Token;
    URL: libsql://<db>.<region>.turso.io di halaman yang sama).
- **UJI 19 Okt end-to-end**: import `Downloads\kopontren.db`
  (37 tabel, 75 objek DDL) -> DB file lokal: VALIDASI LULUS
  (semua count cocok), integrity ok, schema_version=21,
  --fresh dapat reproduksi ulang, guard "target terisi" aman.
  Bug awal: perbandingan rank() (d.type vs type-string) ->
  order DDL jadi acak; sudah diperbaiki.
- Catatan: DDL backup **TIDAK ADA deklarasi FK**
  (pragma_foreign_key_list kosong utk sales/sale_items dkk)
  -> urut data aman apa pun; urutan penting utk DDL.
- Eksekusi produksi:
  `set TURSO_TOKEN=...` lalu
  `node scripts/restore-turso.mjs libsql://<db>.<region>.turso.io --execute`
  -> Vercel: DATABASE_URL + DATABASE_AUTH_TOKEN -> Redeploy ->
  login pertama migrasi v21->v31 -> Turso Studio v31.
- **Saran tetap berlaku**: coba dulu export Turso Studio
  (state 19 Okt, update=true); file Downloads (3 Okt) = fallback.

### PIVOT RECOVERY: LOCAL BACKUP (Gus Fi via DeepSeek, 19 Okt 2026)
- **Konteks**: Turso Free tanpa PITR/restore (fitur berbayar) -> bila
  DB produksi rusak, jalur recovery = backup lokal.
- **Temuan Cline 19 Okt**: file `kopontren (1).db` TIDAK ada di PC
  ini; kandidat = `C:/Users/baiti/Downloads/kopontren.db` (424 KB,
  3 Okt): SQLite valid (integrity ok), schema_version **21**,
  users 4, products 236, sales **0**, audit_log 74 (terakhir
  2026-10-02T16:42Z). Data 3 Okt -> 19 Okt TIDAK tercakup; saran
  Gus Fi: coba dulu export Turso Studio (state 19 Okt, lebih baru),
  pakai file Downloads sbg fallback.
- **Scan SCHEMA db.ts**: 58 CREATE TABLE + 56 CREATE INDEX di
  literal SCHEMA SEMUA ber-guard IF NOT EXISTS -> hipotesis
  "DDL tanpa guard" gugur; hipotesis tersisa tetap (server Turso
  reject batch DDL / busy persisten / akses write terbatas --
  bukti di Vercel log `[api/auth/login] db() gagal`, db.ts L89).
- **Script prepared**: `scripts/restore-turso.mjs` -- draft awal
  (runbook turso CLI) GANTI oleh F2: import via @libsql/client
  tanpa CLI; lihat seksi F2 di atas (commit C7).
- **Urutan rekomendasi**: (1) log Vercel `[api/auth/login]
  db() gagal` -> meneguhkan hipotesis; (2) C3b bila perlu
  (DDL sekuensial + DML batch); (3) restore backup via script;
  (4) set env Vercel -> redeploy -> login pertama migrasi
  v21->v31 (<=90 dtk) -> Turso v31; (5) Wave 8 Item 2.

### DARURAT LOGIN v31 -- C3 FIX KE-2: MIGRASI BATCH + RETRY BUSY + TIMEOUT KLIEN 90s (menunggu Vercel + diagnostik Turso)
- **Temuan 19 Okt 23:00 (audit Cline + DeepSeek)**: `7668415` +
  `07234c3` sudah Ready di Vercel, tapi Gus Fi TETAP dapat
  "Waktu koneksi habis" di login. Probe produksi: POST
  /api/auth/login -> JSON 500 ("Server sedang bermasalah
  (database)") = kode baru AKTIF (self-heal + JSON 500 bekerja);
  layer DB-nya masih gagal.
- **Akar 1 (klien)**: login page memakai `fetchTimeout()` default
  10 detik; migrasi v31 (fullInit ~150 round-trip Turso) makan
  15-60 dtk -> browser abort dini -> "Waktu koneksi habis"
  menyesatkan padahal server sedang bekerja / akan sukses.
- **Akar 2 (server)**: tidak ada handling SQLITE_BUSY di db.ts:
  beberapa instance Vercel berebut migration di cold start
  (instance B jalan saat instance A pegang write-lock Turso) ->
  SQLITE_BUSY -> kegagalan berulang; self-heal (C1) hanya
  membuat percobaan ULANG, bukan membuatnya BERHASIL.
- **Fix (C3, 4 file)**:
  1. `Db.execBatch()` + `client.batch(stmts,'write')` (diverifikasi
     probe node backend file: OK + idempoten; tsc + build hijau):
     - fullInit: 23 statement SCHEMA -> 1 batch atomik
     - migrate31: 4 CREATE index -> 1 batch atomik
     - stempel schema_version: 2 statement -> 1 batch atomik
     (atomik = gagal di tengah TIDAK meninggalkan skema separuh)
  2. `withBusyRetry()` (backoff 400/800/1600/3200ms, max 4x, hanya
     utk SQLITE_BUSY/LOCKED; error lain propagasi langsung) di:
     SELECT stempel, fullInit SCHEMA, rebuild tx, index v31,
     stempel. rebuild tx aman di-retry (gagal = rollback total;
     tabel lama utuh; guard baris tetap jalan).
  3. login route `maxDuration` 60 -> 90 detik (headroom
     migrasi + retry; limit Hobby 300s).
  4. login page `fetchTimeout(..., 90_000)` + pesan abort jujur
     (">90 dtk ... coba lagi; setelah pembaruan sistem bisa
     lambat").
- **Gate `check-route-exports.mjs` diperlebar +`maxDuration`**:
  ternyata over-strict (kunci itu VALID utk Vercel App Router --
  bukti: `7668415` deploy Ready; tanpa perubahan gate, `npm run
  gate` lokal menolak file yang sudah sah di Vercel).
- **Hipotesa BELUM TERBUKTI (perlu akses Turso Studio)**: bila
  akses WRITE produksi Turso terbatas/missing, semua write
  gagal instan (500 cepat, konsisten dgn probe). Diagnostik
  Gus Fi: `SELECT version FROM schema_version` + test write
  `INSERT INTO settings(key,value) VALUES('__writetest','1')
  ON CONFLICT(key) DO NOTHING; DELETE FROM settings WHERE
  key='__writetest';`. Bila DB read-only utk Vercel -> tambah
  env Vercel `DATABASE_REPLICA_URL` (= Database URL Turso;
  @libsql/client merutekan write ke primary) lalu Redeploy.
- **Gate lulus**: tsc 0, check-route-exports OK, check-theme-gate
  OK, next build OK, probe batch file-backend OK, 0 non-ASCII
  baris baru, skema TIDAK berubah (percepatan + retry saja).
- **STATE**: C3 PUSHED; MENUNGGU: (1) Vercel Ready, (2)
  diagnostik Turso (version + test write), (3) retry login 2-3x
  (percobaan pertama setelah deploy = cold start migrasi,
  tunggu <=90 dtk).
  PERBARUI 19 Okt (setelah push): deploy `bb71e89`/`ce4c094`
  **READY & LIVE** -- marker C3 ">90 dtk" terkonfirmasi di
  chunk `/_next/static/chunks/app/login/page-417dddf4b4c7ac52.js`.
  TAPI probe `POST /api/auth/login` (kredensial dummy) MASIH
  500 JSON db-error dalam 15-16s -> `db()` init TETAP gagal
  setelah batch+retry. Error PERSIS ada di Vercel function
  logs (Gus Fi): grep `[api/auth/login] db() gagal`
  (login/route.ts L89 -- log object error asli),
  `[db] init/migrasi gagal` (db.ts L1521), dan
  `[db] ... SQLITE_BUSY` (db.ts L112).
  Hipotesis tersisa: (1) **server Turso reject batch DDL**
  -- probe lokal (native libsql win32) MENERIMA DDL di
  `client.batch()` (`_probeddl`: CREATE TABLE/INDEX di batch
  OK), sehingga batasan (bila ada) hanya di sisi SERVER
  remote; log Vercel akan memutuskan. Bila terkonfirmasi ->
  C3b: pisahkan DDL (exec sekuensial, semua `IF NOT EXISTS`
  idempoten) dari DML (batch; stempel `INSERT ON CONFLICT`).
  (2) SQLITE_BUSY persisten. (3) akses write Turso utk Vercel
  terbatas/read-only -> langkah cadangan
  `DATABASE_REPLICA_URL`.
- **BUG LATEN TEMUAN (DI LUAR SCOPE -- catat utk audit nanti)**:
  kolom `products.image_url` ada di cols rebuildTableV31 & DB
  produksi v30, TAPI TIDAK ada di literal SCHEMA products ->
  fresh DB akan punya 1 kolom kurang dari produksi (baca di DB
  produksi aman; hanya fresh DB terdampak).

### DARURAT LOGIN v31 -- FIX DEPLOY LEPAS, MENUNGGU VERIFIKASI PRODUKSI (C1 `31060e7` + C2 `7668415`, 19 Okt 2026)
- **Problema (URGENT)**: login produksi gagal ("Waktu koneksi
  habis"). Akar: cold start Vercel dengan DB Turso masih stempel
  v30 -> fullInit + migrasi v31 (~150 round-trip Turso) melewati
  durasi default fungsi; kegagalan jadi PERMANEN per instance
  karena `db()` menyimpan promise rejected tanpa reset -> 500
  body kosong -> `res.json()` klien throw -> pesan menyesatkan
  "kesalahan jaringan".
- **Commit `31060e7`** "fix(db,v31): self-heal init failure +
  honest login 500 + maxDuration 60" (4 file): db.ts self-heal
  (reset _db/_dbPromise saat gagal + console.error penyebab
  asli), COUNT-guard rebuildTableV31 sekuensial, login route
  balas JSON 500 eksplisit, login/page.tsx res.json().catch +
  pesan 5xx jujur, vercel.json +functions glob maxDuration 60.
- **Deploy `31060e7` ERROR 2s** (master + main): config
  validation Vercel gagal SEBELUM build -- glob
  `"**/app/api/**/route.ts"` di `functions` BUKAN pola valid
  untuk Next.js App Router (docs Vercel: route App Router
  memakai `export const maxDuration` per file; limit Hobby =
  300s, jadi angka 60 bukan masalah -- masalahnya pola glob).
- **Commit `7668415`** "fix(db,v31): maxDuration per-route
  (App Router) + revert vercel.json functions glob" (2 file,
  +7/-4; dual-push terverifikasi `git ls-remote` = `7668415`):
  (a) vercel.json REVERT byte-identik dengan `0f6f3e2`
  (deployment Ready); (b) login/route.ts +`export const
  maxDuration = 60` (mekanisme resmi App Router; Hobby/Pro
  sampai 300s).
- **Gate lulus**: tsc 0, next build OK, vercel.json
  byte-identik vs `0f6f3e2`, 0 non-ASCII, frozen tak
  tersentuh, skema tak berubah.
- **CATATAN DESAIN**: route login = pintu masuk migrasi v31 di
  cold start produksi. Satu request login yang menyelesaikan
  migrasi (<=60s) -> DB ter-stempel v31 -> semua 70 route API
  kembali cepat tanpa ubahan lain.
- **STATE**: PUSHED, MENUNGGU VERIFIKASI Vercel (Gus Fi):
  (1) dashboard -- deploy `7668415` Ready? (2) function logs --
  baris `[db] init/migrasi gagal: ...`? (3) test login
  (tunggu 15-60s cold start migrasi). (4) Turso Studio --
  `schema_version` = 31?
- **NEXT**: Wave 8 item 2 = Barcode ID (setelah login
  terverifikasi).
  19 Okt 23:15: hasil verifikasi: (1) deploy Ready tercapai
  (`7668415` + `07234c3` Production); (3) login TETAP gagal
  ("Waktu koneksi habis") -> lanjut entry C3 di atas; (4)
  belum terkonfirmasi (perlu Turso Studio + test write).

### WAVE 8 ITEM 1: AUDIT ANOMALI LEPAS -- deteksi keanehan audit_log (C1 `f7613ff`, 19 Okt 2026; ACC Gus Fi via DeepSeek: audit final LULUS)
- **Scope (Q72, Wave 8 item 1, TODO "Q72 Konsolidasi data -- deteksi
  anomali")**: READ-ONLY deteksi anomali di atas audit_log -- 3 aturan
  tanpa perubahan skema: A1 bulk delete (hapus massal pada 1 tabel
  dalam 1 menit), A2 price jump (loncat harga > 50% pada diff JSON
  flat `fieldToDiff`, banding old vs new field price/price_wholesale/
  hpp/cashback_max), A3 after-hours (aktivitas lokal 19:30-05:00,
  hanya aksi tulis). Sampel <=500 baris audit_log terbaru (jendela
  24 jam).
- **Commit C1 `f7613ff`** "feat(ui): Q72 audit anomaly detection
  (bulk delete, price jump, after-hours)" (7 file, +599/-5;
  3 baru + 4 modifikasi; dual-push master+main terverifikasi
  `git ls-remote` = `f7613ff`):
  (a) `src/lib/audit-anomaly.ts` (BARU, 206 baris, murni/zero-import,
  bebas non-ASCII, export `detectAnomalies` + types `AnomalyFlag` /
  `AuditLogRow` + `ANOMALY_RULES`).
  (b) `src/app/api/audit/anomalies/route.ts` (BARU, 44 baris,
  GET, role admin/manager/pengurus, respons { flags, as_of,
  analyzed_count }).
  (c) `scripts/test-audit-anomaly.ts` (BARU, 161 baris, hermetic,
  31 asersi, bebas non-ASCII).
  (d) `src/lib/notify.ts` (+45): import types, 2 notify-type baru
  (`anomaly_price_jump` pri 2 ke /admin/produk, `anomaly_audit`
  pri 3 ke /admin/audit), `runAnomalySweep()` (dedupe 60 mnt,
  best-effort), `runCron` + case `anomaly` + `all` kini menjalankan
  sweep (kembali `{ job: 'all', purged, flagged }`).
  (e) `src/components/admin/audit-client.tsx` (+91/-0): section
  "Keanehan" -- fetch saat mount + tombol Perbarui, daftar
  severity-colored (warn = rose / info = slate), sample IDs
  `#id`, state kosong/error, `Dipindai dari N aktivitas terakhir`.
  (f) `src/app/api/notifications/cron/route.ts` (docstring:
  `?job=` kini menyertakan `anomaly`).
  (g) `package.json` (+`test:audit-anomaly`, rantai `test:all`
  +`node scripts/test-audit-anomaly.ts` -> kini 36 suite).
- **Gate lulus (19 Okt)**: tsc --noEmit EXIT 0;
  test-audit-anomaly 31/31; test:all rantai penuh -- sedaya suite
  PASS (catatan: chain abort di `test-brand-sync` karena flake
  teardown Node di Windows `Assertion failed: UV_HANDLE_CLOSING`,
  BUKAN bug kode; 2 file setelahnya -- multisatuan 31/31 dan
  audit-anomaly 31/31 -- dijalankan manual, lulus); 0 non-ASCII
  di file baru & di baris tambah (audit-client +1 ellipsis legacy
  `Memuat keanehan...` sudah dinetralkan); frozen tak tersentuh
  (public/sw.js, V1 laporan-admin-client.tsx, src/lib/coop.ts);
  fiqih: tidak ada; skema: tidak berubah.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `f7613ff`; record ini = commit C2).
- **NEXT**: Wave 8 item 2 = Barcode ID (menunggu arahan Gus Fi),
  lalu Pending Cart / Customer Display / RAT.

## 2026-10-14
## 2026-10-14
### V2 MULTI-SATUAN LEPAS -- stok fraksional (C1 `60008d2`, 19 Okt 2026;
ACC Gus Fi via DeepSeek: audit 19 Okt LULUS)
- **Scope (V2, TODO L2463 "V2 = deferred")**: presisi fraksional
  multi-satuan -- stok REAL (3 desimal, ruling D3), qpb REAL
  (D5, 0.001-999), pembelian/restock fraksional (D1 TERMAUK),
  CSV titik desimal saja (D2, koma OOS -> 0), HPP pack =
  Math.round ke rupiah utuh (D4). Fiqih = precision only, rumus
  zakat/neraca TAK berubah (tashih 1 baris, tercatat di TODO L2454
  + design doc). Skema **v31** (products.stock REAL +
  sale_items.qty_per_base REAL + purchases.qty REAL; preseden v29,
  aditif, integer eksak sebagai REAL). **BACKUP DB WAJIB sebelum
  deploy** (upgrade v30 -> v31).
- **Commit C1 `60008d2`** "feat(v2): multi-satuan fractional (stock
  REAL, qpb REAL, purchases REAL)" (17 file, +404/-122;
  16 modifikasi + 1 baru; dual-push master+main terverifikasi
  `git ls-remote` = `60008d2`):
  (a) `src/lib/multisatuan.ts` (BARU, HERMETIS -- r3, STOCK_EPS
  1e-6, validateQpb R6 strict, stockNeeded R2/R1, hppPerUnit R3,
  parseStockInput R7) = sumber tunggal aritmetika pack.
  (b) `src/db.ts` skema v30 -> v31 rebuild REAL (additif; data
  lama integer = presisi penuh).
  (c) API: products (POST/PUT/bulk) + [id] + migrate/products +
  purchases + sales + [id] + returns + product-import -- stok/qpb
  fraksional end-to-end (decrement/restock = stockNeeded, HPP
  snapshot hppPerUnit di sale_items).
  (d) `pos-client.tsx`: input stok desimal + HPP pack live + cap
  fraksional `Math.floor((stock + STOCK_EPS) / qpb)` (smoke 8/8,
  qpb 0.5 & 0.333).
  (e) Test: test-multisatuan 31/31 (T1-T5 base + V2 fraksional +
  R6/R7 + compat), test-zakat 40/40 (fraksional 3.5 kg -> zakat
  875, trunc 35000 x 2.5%), test-neraca 38/38 (Gula 3.5 kg: stok
  total 145.000, units 16.5, aset 1.120.000, modal 1.090.000).
  0 non-ASCII di baris tambah (higien audit 19 Okt: 7 header
  box-drawing di test-multisatuan.ts -> ASCII `--`).
- **Gate lulus (19 Okt)**: tsc --noEmit EXIT 0; check-route-exports
  OK; check-theme-gate OK; next build "Compiled successfully";
  test:all 36/36 ALL_PASS (test-zakat 40/40, test-neraca 38/38,
  test-multisatuan 31/31, test-wholesale 39/39, test-gl 102/102,
  margin/split/dropship/konsinyasi/akad/coop/zis/coa/snapshot/gates
  sedaya lulus); 0 non-ASCII di diff tambah; frozen tak tersentuh
  (public/sw.js, V1 laporan-admin-client.tsx, src/lib/coop.ts);
  fiqih = precision only (0 mekanisme baru); data = integer ->
  REAL eksak.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `60008d2`; record ini = commit C2).
- **NEXT**: Wave 8 / V3 / istirahat -- Gus Fi pilih. Design doc
  `P-V2-MULTISATUAN.md` (repo root, 210 baris, C2) = arsip.

### P14 LEPAS -- Offline confidence (C1 `8096d2f`, 14 Okt 2026; ACC Gus Fi
via DeepSeek: audit 14 Okt LULUS)
- **Scope (P14, TODO L1299)**: status data per modul + stempel
  "Terakhir online" -- komunikatif, bukan biner. Murni UX/status:
  TIDAK mengubah transaksi, skema (v29), atau file fiqih. Data per
  modul DIBACA dari localStorage sisi klien (kop:lastfetch:<module> +
  kop:lastonline); stempel hanya DITULIS oleh fitur (bukan
  instrumentasi page-load) -> jujur "Belum ada catatan akses".
- **Commit C1 `8096d2f`** "feat(ui): P14 offline confidence
  (last-online stamp + module status)" (6 file; dual-push master+main
  terverifikasi `git ls-remote` = `8096d2f`):
  (a) `src/lib/offline-status.ts` (BARU, 100 baris, HERMETIS -- 0
  non-ASCII, 0 import @/db / next/): API read/record (KvStore
  minim, SSR-safe: store null -> null/no-op) + label DISUSUN dari
  confidence.ts (sumber tunggal P15-A): freshnessOf /
  lastFetchLabel (freshness + syncLabel) / lastOnlineLabel / syncOf.
  (b) `src/components/shell.tsx` (+29/-5): stempel "Terakhir online"
  ditulis ke localStorage saat (baru) online; strip offline kini
  informatif ("... Data mungkin tidak dapat dimuat. Terakhir online
  Hari ini").
  (c) `src/app/admin/health/page.tsx` (+8/-2): render
  ModuleStatusPanel (cacheKeys hoist + nowIso).
  (d) `src/app/admin/health/module-status-client.tsx` (BARU, 136
  baris, 'use client', co-located di route health): tabel "Status
  Data per Modul" -- 10 modul (kas, belanja, hutang, konsinyasi,
  member, produk, koperasi, zakat, qris, laporan) + drill-down;
  kolom Sinkron = placeholder jujur utk P15-B (antrean per modul),
  selalu "Tersinkron" (komunikatif, bukan asersi database); footer
  "Terakhir online" + "Referensi ter-cache (per-instance, TTL 60
  dtk)".
  (e) `scripts/test-offline-status.ts` (BARU, suite #35, 37 assert:
  key, read/write mock Map, SSR-safe null-store, isValidStamp,
  freshnessOf, lastFetchLabel + paritas dgn confidence,
  lastOnlineLabel + paritas ageLabel/ageDays, syncOf paritas,
  hermetis-assert) + `package.json` (chain test:all 34 -> 35 +
  script test:offline-status).
- **Gate lulus (14 Okt)**: tsc --noEmit EXIT 0; test:all 35/35
  ALL_PASS (suite #35 = 37/37); 0 non-ASCII di lib; frozen tak
  tersentuh (public/sw.js, laporan-admin-client.tsx V1,
  src/lib/coop.ts); TANPA perubahan skema (v29 intact);
  zero fiqih impact.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `8096d2f`; record ini = commit C2).
- **NEXT**: P15-B audit confidence (exhaustive) -- antrean sinkron
  per modul (P14 hanya placeholder jujur) menunggu definisi scope;
  Wave 7 fitur menyusul (Gus Fi pilih).

### P15-A LEPAS -- Confidence language standar (C1 `2e3f587`, 14 Okt
2026; ACC Gus Fi via DeepSeek: audit 14 Okt LULUS)
- **Scope (P15, TODO L1300)**: standardisasi label confidence --
  freshness ("Terakhir diperbarui {umur}"), kelengkapan ("Data
  lengkap"), sinkron ("Tersinkron"/"Menunggu sinkronisasi"), klaim
  data ("Data per HH:MM WIB"/"Belum ada data"), loading ("Memuat...",
  "Muat lebih banyak"); TIDAK memakai "berhasil" di toast sukses
  (pola "Transaksi dipertahankan").
- **Commit C1 `2e3f587`** "feat(ui): P15 confidence language
  (freshness/sync/empty standar)" (13 file, +275/-36; dual-push
  master+main terverifikasi `git ls-remote` = `2e3f587`):
  (a) `src/lib/confidence.ts` (BARU, 93 baris, HERMETIS -- 0 import
  db/next, 0 non-ASCII): ageDays/ageLabel/freshnessStamp/
  COMPLETE_LABEL/emptyLabel/syncLabel/wibTime/wibTimeSec/
  dataPerLabel = satu sumber label seluruh aplikasi.
  (b) `src/lib/health.ts`: delegasi ageDays+ageLabel ke
  confidence.ts (import `./confidence.ts` -- Node ESM type-stripping
  butuh ekstensi; `allowImportingTsExtensions: true`) + re-export
  (konsumen `@/lib/health` aman).
  (c) dashboard admin: klaim data -> dataPerLabel(wibTime(now))
  ("Data per 06.30 WIB").
  (d) pos-client.tsx: chip sinkron "Tersinkron {HH:MM:SS} WIB"
  (lastSync lokal) + "n menunggu sinkronisasi" (syncLabel 0/1/n) +
  toast "Transaksi dipertahankan".
  (e) audit/data/konsinyasi/shift: "Muat lebih banyak"; member:
  "Member baru didaftarkan"; ui.tsx: "Memuat data..." -> "Memuat...".
  (f) api/products/[id]: "Produk berhasil dihapus" -> "Produk
  dihapus" (violation laten ditemukan + diperbaiki).
  (g) `scripts/test-confidence.ts` (BARU, suite #34, 34 assert --
  proof delegasi `health.ageDays === confidence.ageDays`, zona WIB
  fixed, hermetic) + chain test:all 33 -> 34.
- **Gate lulus (14 Okt)**: tsc --noEmit EXIT 0; test:all 34/34
  ALL_PASS; 0 hit "berhasil"/"Memuat data"/"Muat lebih banyak log"
  di src/; frozen tak tersentuh (public/sw.js,
  laporan-admin-client.tsx V1, coop.ts); TANPA perubahan skema.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `2e3f587`; record ini = commit C2).
- **NEXT**: P14 Offline confidence (status per modul) -- PLAN
  menyusul; P15-B audit confidence (exhaustive) menunggu definisi.

### P15-B LEPAS -- Health panel real-time sync + POS antrean (C1
`f907694`, 14 Okt 2026; ACC Gus Fi via DeepSeek: audit 14 Okt LULUS)
- **Scope (P15-B, TODO L1301, ruling Gus Fi 14 Okt -- scope B1)**:
  kolom Sinkron panel /admin/health NYATA utk modul kas = antrean
  offline POS (key beku P13.1 `kopontren_pos_queue_v1`, satu sumber
  di lib); modul lain online-only -> 0 antre = "Tersinkron"
  (komunikatif, bukan asersi database). Stempel freshness 5 modul
  (kas/member/produk/koperasi/zakat) DITULIS fiturnya HANYA saat
  live-fetch sukses (bukan cache/page-load); flush antrean POS:
  error jaringan = break + retry otomatis (perilaku lama, diam),
  error server = toast "Sinkronisasi berhenti: {err}" + antrean
  tetap tersimpan (sebelumnya diam -- kasir tak tahu flush
  berhenti).
- **Commit C1 `f907694`** "feat(ui): P15-B health panel sync stamps
  + POS queue tracking" (10 file, +230/-56; dual-push master+main
  terverifikasi `git ls-remote` = `f907694`):
  (a) `src/lib/offline-status.ts` (+25/-10): `POS_QUEUE_KEY`
  (kontrak beku P13.1, satu sumber runtime + panel) +
  `readPendingCount` (pure, SSR-safe null->0, JSON korup/bukan
  array->0, read-only 0 setItem) + HAPUS dead export
  `lastFetchLabel` (panel menyusun sendiri: `freshnessOf` +
  `syncOf`); hermetis intact (0 non-ASCII, 0 import @/db|next/).
  (b) `src/components/pos-client.tsx` (+15/-7): konstanta lokal
  OFFLINE_QUEUE_KEY hapus -> `POS_QUEUE_KEY` (nilai identik,
  migrasi nol); stempel 'kas' cabang sukses live (cadangan cache
  SENGJAJA tak di-stempel); flush: error jaringan = break,
  error server = `showToast('Sinkronisasi berhenti: ...', 'error')`
  + break; 1 baris kosmetik em-dash ("shift belum dibuka -- ...").
  (c) `module-status-client.tsx` (+25/-10): Row + field pending;
  useEffect `readPendingCount` utk kas; kolom Sinkron =
  `syncOf(r.pending)` (amber bila > 0); doc header + teks footer
  sesuai semantik P15-B.
  (d) 4 admin client (stempel `recordLastFetch('<mod>', ...)`
  cabang live-fetch sukses, pola sama pos-client):
  member-client (+2), produk-client (+2), koperasi-client (+2),
  zakat-client (+3).
  (e) `scripts/test-p15b-queue.ts` BARU (135 baris, suite #36, 17
  assert, HERMETIS: mock Map localStorage + SSR null store: key
  beku P13.1, readPendingCount 7 skenario + read-only spy,
  round-trip stempel, null store no-op, paritas syncOf <->
  confidence.syncLabel) + `package.json` (script test:p15b-queue
  + chain test:all 35 -> 36).
  (f) `scripts/test-offline-status.ts` (-21): terkoordinasi dgn
  (a): hapus import + 4 asersi `lastFetchLabel` (37 -> 33).
- **Gate lulus (14 Okt)**: tsc --noEmit EXIT 0; test:all 36/36
  ALL_PASS (suite #35 = 33/33, suite #36 = 17/17); npm run gate
  EXIT 0 (next build); 0 non-ASCII di lib; frozen tak tersentuh
  (public/sw.js, V1 laporan-admin-client.tsx, src/lib/coop.ts);
  TANPA perubahan skema (v29 intact); zero fiqih impact.
- **Deviation diterima**: KOSMETIK SAJA -- 1 baris em-dash di
  pos-client ("- " -> "-- "), bagian file yang sama.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `f907694`; record ini = commit C2).
- **NEXT**: P15-B audit confidence exhaustive (B2+) menunggu
  definisi scope Gus Fi; Wave 7 fitur menyusul.

### Q46 LEPAS -- Top-10 (top kasir + top transaksi) (C1 `ef351ae`,
15 Okt 2026; ACC Gus Fi via DeepSeek: ruling 14 Okt GO CODE)
- **Scope (Q46, TODO L1315)**: top kasir + top transaksi di pengurus
  dashboard (Opsi 1: minimal, UI only, frozen-safe; top produk =
  sync only). Murni read-only insight -- TIDAK mengubah transaksi,
  skema (v29), atau file fiqih.
- **Commit C1 `ef351ae`** "feat(ui): Q46 top-10 -- top kasir + top
  transaksi (pengurus dashboard)" (2 file, +159/-2; dual-push
  master+main terverifikasi `git ls-remote` = `ef351ae`):
  (a) `src/app/api/reports/route.ts` (+58): topKasirRaw (LEFT JOIN
  users; GROUP BY COALESCE(u.id,0); null -> "Tanpa kasir") +
  topTxRaw (ORDER BY total DESC LIMIT 10) + kasir batch IN(...)
  (pola /api/sales, N+1 prevention) + payload +2 field
  (top_kasir, top_transaksi; additive -- konsumen lama takpecah).
  (b) `src/components/pengurus-dashboard-client.tsx` (+82): type
  TopKasir/TopTransaksi/ReportData; 2 card baru (grid md:2) --
  "Top Kasir" (rank, N transaksi, omzet) + "Transaksi Terbesar"
  (tanggal+status, kasir, pelanggan, metode, total); sync period
  preset 7/30/365; reuse Table/Td/Th/Trow, rp(), payMethodLabel,
  fmtDate; empty state "Belum ada penjualan."
- **Gate lulus (15 Okt)**: tsc --noEmit EXIT 0; test-report-rows
  31/31; test-laporan 197/197; test-golden 70/70; gate
  (check-route-exports) OK; 0 non-ASCII di added lines; frozen tak
  tersentuh (public/sw.js, V1 laporan-admin-client.tsx,
  src/lib/coop.ts); TANPA perubahan skema (v29 intact); zero fiqih.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `ef351ae`; record ini = commit C2).
- **NEXT**: Numpad POS (Wave 7 item #8) -- LEPAS (lihat di bawah).

### NUMPAD LEPAS -- POS numpad mobile (Uang Diterima) (C1 `ab013c4`,
15 Okt 2026; ACC Gus Fi via DeepSeek: ruling 15 Okt GO CODE)
- **Scope (Wave 7 #8)**: on-screen numpad utk input nominal di POS
  (mobile only). Opsi 1 minimal: Uang Diterima wae. Murni UX --
  TIDAK mengubah logika transaksi, skema (v29), atau file fiqih.
- **Commit C1 `ab013c4`** "feat(ui): POS numpad (mobile) -- Uang
  Diterima" (1 file, +37; dual-push master+main terverifikasi `git
  ls-remote` = `ab013c4`):
  (a) `src/components/pos-client.tsx` (+37): `PosNumpad`
  component (3x4 grid: 1-9, C clear, 0, < backspace; h-12
  buttons, grid-cols-3, gap-1.5, dark mode) + render di
  section Cash (`lg:hidden`). Additive only: quick buttons
  (SET) tak berubah, numpad (APPEND) baru.
- **Gate lulus (15 Okt)**: tsc --noEmit EXIT 0; test:inflight
  11/11; test:split 22/22; test:report-rows 31/31; 0 non-ASCII;
  frozen tak tersentuh (public/sw.js, V1 laporan-admin-client.tsx,
  src/lib/coop.ts); TANPA perubahan skema (v29 intact); zero fiqih.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `ab013c4`; record ini = commit C2).
- **NEXT**: Foto produk (Wave 7 #9) -- audit menyusul.
### FOTO LEPAS -- Foto produk (URL manual) (C1 `d381353`, 16 Okt 2026;
ACC Gus Fi via DeepSeek: audit 16 Okt LULUS)
- **Scope (Wave 7 #9)**: field `image_url` di form produk + thumbnail
  kartu POS + kolom tabel admin. Opsi A: URL manual (bukan
  upload). Additive only -- TIDAK mengubah logika transaksi, skema
  (v29), atau file fiqih. Kolom `image_url` sudah ada (v29), tanpa
  migration.
- **Commit C1 `d381353`** "feat(ui): foto produk -- URL manual (form +
  POS card)" (4 file, +75/-25; dual-push master+main terverifikasi
  `git ls-remote` = `d381353`):
  (a) `src/app/api/products/route.ts`: POST +`image_url` (clamp
  500 char, prevent DB bloat).
  (b) `src/app/api/products/[id]/route.ts`: PUT +`image_url` +
  audit trail.
  (c) `src/components/admin/produk-client.tsx`: form field
  "Foto produk (URL)" + emptyForm + type + thumbnail tabel.
  (d) `src/components/pos-client.tsx`: card thumbnail 48x48
  (lazy + async + referrerPolicy no-referrer) + fallback icon
  Package bila kosong.
- **Gate lulus (16 Okt)**: tsc --noEmit EXIT 0; test:inflight
  11/11; test:split 22/22; test:report-rows 31/31; 0 non-ASCII;
  frozen tak tersentuh (public/sw.js, V1 laporan-admin-client.tsx,
  src/lib/coop.ts); TANPA perubahan skema (v29 intact); zero
  fiqih.
- **STATE**: LEPAS (dual-push terverifikasi: origin/master =
  origin/main = `d381353`; record ini = commit C2).
- **NEXT**: Multi-satuan (Wave 7 #10) -- AUDIT read-only
  menyusul (tashih T1-T5 sudah tercatat; tunggu approval plan
  Gus Fi).




## 2026-10-13
### P13 LEPAS -- Health Center `/admin/health` (admin-only, 7 kartu)
(13 Okt 2026; ACC Gus Fi via DeepSeek: "GO COMMIT" -- audit diff
14 Okt: LULUS; commit C1 `ce4a509`)
- **Scope (definisi P13, TODO L1298; UX-8 Operational Safety)**:
  dashboard status sistem -- DB, Koneksi, Versi, Cache, Log, Backup
  terakhir, Notifikasi. Bahasa komunikatif (P15): tiap kartu punya
  penjelasan + drill-down ke sumber (P9).
- **Commit C1 `ce4a509`** "feat(admin): P13 Health Center dashboard"
  (9 file; dual-push master+main, akan diverifikasi `git
  ls-remote`):
  (a) `src/lib/health.ts` (BARU, ~255 baris, hermetis pure -- pola
  coop.ts -> low-stock.ts, TANPA dependensi server): 7 kartu +
  summary; ambang D-P13 (dbWarnMs 500 / dbBadMs 2000 /
  backupWarnDays 30); helper ageDays/ageLabel/shortDate; seluruh
  string ASCII tanpa emoji/unicode.
  (b) `src/app/admin/health/page.tsx` (BARU, ~171 baris): server
  component, guard `role === 'admin'` (pola /admin/data),
  force-dynamic; query `schema_version` + `audit_log` 24 jam +
  `settings` (backup_last/backup_last_by) + `vapid_keys` +
  COUNT `notifications`; DB tak terjangkau = kartu GAGAL/OFFLINE
  (bukan 500); stempel build = baca marker SW-BUILD di
  public/sw.js (frozen; TIDAK dimutasi); "Muat Ulang" = link
  halaman sendiri (tanpa polling).
  (c) `src/app/api/backup/route.ts`: setelah sukses, catat settings
  `backup_last` (ISO) + `backup_last_by` (pelaku) -- TIDAK ada
  perubahan skema, tanpa migrasi.
  (d) `src/lib/ref-cache.ts`: +`cacheStats()` (read-only, jumlah
  key per-instance, TTL 60 dtk).
  (e) `src/db.ts`: `SCHEMA_VERSION` (29) diekspor (dulu const
  lokal).
  (f) `src/components/kpi-card.tsx`: KpiCard +prop `tip`
  (TermTip); backward-compatible, tak ada break konsumen; KpiGrid
  tak berubah.
  (g) `src/components/sidebar.tsx`: +IconPulse (SVG inline,
  mengikuti icon system LOCK) + item "Kesehatan" (level 'admin',
  href /admin/health) di MENU_ITEMS + `/admin/health` di
  ADMIN_GROUP_DEFS.
  (h) `scripts/test-health.ts` (BARU, suite #33, 37 assert) +
  `package.json` chain test:all 32 -> 33.
- **Gate lulus (13 Okt)**: `tsc --noEmit` EXIT 0; `test:all`
  33/33 ALL_PASS (suite 33: 37 passed, 0 failed); `npm run gate`
  EXIT 0 (route-exports OK; theme-gate LULUS; next build, 62
  halaman static; /admin/health = force-dynamic tak terhitung
  static); 0 non-ASCII file baru/ubah di bagian berubah
  (health.ts, page.tsx, test-health.ts, kpi-card.tsx, sidebar.tsx,
  package.json bersih; backup/route.ts, db.ts, ref-cache.ts punya
  non-ASCII PRE-EXISTING di baris tak diubah -- hunk kluwih
  ASCII); frozen files TIDAK tersentuh (`public/sw.js`, V1
  `laporan-admin-client.tsx`, `src/lib/coop.ts`); TANPA
  perubahan skema (Turso tetep v29).
- **STATE**: LEPAS (dual-push master+main terverifikasi `git
  ls-remote`: origin/master = origin/main = `ce4a509` pada C1;
  record ini = commit C2).
- **NEXT**: Wave 7 -- menenti arahan Gus Fi.

### GRID LEPAS -- KpiGrid mobile polish (1 kolom <360px) (commit
`01b65e2`, 13 Okt 2026; ACC Gus Fi via DeepSeek: "GO COMMIT")
- **Persetujuan 13 Okt (via DeepSeek)**: Option A disetujui = 1
  kolom (<360px) / 2 kolom (360-1023px) / 3 kolom (lg); Option B
  (tetep 2 kolom, tanpa perubahan riil) ditolak. Alesan: kartu
  KPI cekik di layar alit (lebar kartu @360px = 158px; nilai
  text-2xl mepet; @390px = 173px masih mepet utk nominal rupiah
  panjang). Filosofi: gampang dipahami (mobile lega) + apik.
- **Commit C1 `01b65e2`** "ui(2c-followup): KpiGrid mobile polish
  -- 1 kolom <360px, 2 kolom 360+" (1 file, +6/-4; dual-push
  master+main terverifikasi `git ls-remote`: origin/master =
  origin/main = `01b65e2`):
  `src/components/kpi-card.tsx` (KpiGrid): `grid grid-cols-2
  gap-3` -> `grid grid-cols-1 min-[360px]:grid-cols-2 gap-3`
  (Tailwind 3.4 native arbitrary variant -- TIDAK ada perubahan
  config; JSDoc diperbarui). Scope: visual only (tanpa logika,
  tanpa API/DB, tanpa komponen baru, tanpa ikon baru).
- **Konsumen**: KpiGrid hanya 2 dashboard (admin/dashboard 6
  kartu + pengurus/dashboard 5 kartu) -- tak ada konsumen lain.
- **Tunda (out-of-scope, ruling 13 Okt)**: `text-xl
  min-[390px]:text-2xl` utk nilai KpiCard -- nominal rupiah
  panjang @360-390px masih mbakak 2 menithi (rapi via row
  stretch); batch terpisah bila Gus Fi menghendaki.
- **Gate lulus (13 Okt)**: `tsc --noEmit` EXIT 0; `test:all`
  32/32 ALL_PASS EXIT 0; `npm run gate` EXIT 0 (route-exports OK;
  theme-gate LULUS; next build OK, 62/62 halaman); 0 non-ASCII
  (scan byte keempat kpi-card.tsx); `git status` = hanya
  kpi-card.tsx berubah; frozen files (`public/sw.js`, V1
  `laporan-admin-client.tsx`, `src/lib/coop.ts`) TIDAK tersentuh;
  tanpa perubahan skema.
- **STATE**: LEPAS. C2 docs = commit ini.
- **NEXT**: panel admin (P13 Health Center) / Wave 7 -- menunggu
  arahan Gus Fi (Grid LEPAS; Wave 7 menunggu pemilihan item).

### COUNTER LEPAS -- badge "stok menipis" (header global) + count API
(commit `aa8f875`, 13 Okt 2026; ACC Gus Fi via DeepSeek: "GO COMMIT")
- **Persetujuan 13 Okt (via DeepSeek)**: definisi D1-D6 Counter
  disetujui; DeepSeek mengoreksi D4 tertulis ("admin/manajer
  only") -- RULING: gudang MASUK, sesuai `FEATURE_MATRIX.stock =
  ['admin','manajer','gudang']` (sumber kebenaran gating tier;
  sama dengan widget W5.4 + CTA). Audit DeepSeek diff lengkap:
  LULUS.
- **Commit C1 `aa8f875`** "counter: low-stock badge (header) +
  count API" (6 file, +359/-1; dual-push master+main, verified
  `git ls-remote`: origin/master = origin/main = `aa8f875`):
  (a) `src/lib/low-stock.ts` (BARU, 62 baris, hermetic pure,
  pola coop.ts -> jurnal.ts): `LOW_STOCK_THRESHOLD = 10`
  (batas < 10, identik widget dashboard OQ-22; TIDAK pakai
  alert_threshold), `LOW_STOCK_COUNT_SQL` (COUNT alias n),
  `lowStockGate` (anon -> 401 / denied -> 403 / ok -> 200, map
  `LOW_STOCK_STATUS`), header `no-store`, `lowStockCount`
  (normalisasi: angka bulat >= 0, selain itu null),
  `lowStockLabel` (lebar "N produk stok menipis" / sempit "N").
  (b) `src/app/api/low-stock-count/route.ts` (BARU, 45 baris):
  GET read-only; gerbang tier D4 (kasir/pengurus/pembelian/
  member = 403 + hint 'stock'); query COUNT(*) products active
  stock < 10 (payload ringan, bukan katalog); gagal query =
  { count: null } 200 (badge tak muncul, bukan 5xx); Cache-
  Control: no-store.
  (c) `src/components/low-stock-badge.tsx` (BARU, 103 baris):
  pill amber + dark (tone satu, konsisten strip offline),
  ikon triangle-alert SVG inline 14px (tanpa emoji/unicode),
  target sentuh >= 44px; teks "N produk stok menipis" md+ /
  "N" mobile, aria-label/title = teks lebar; fetch saat mount +
  re-fetch fokus jendela bila >60 dtk sejak sukses terakhir,
  offline lewati; loading/gagal/count 0/tak berwenang =
  render null (tanpa spinner).
  (d) `src/components/shell.tsx` (EDIT +4): badge = item
  pertama grup kanan header, SEBELUM pemicu palette (D2);
  gating tier 'stock' di shell via `canAccess` -- DIIMPOR DARI
  `@/lib/features` (modul pure), TIDAK dari `@/lib/auth`
  (nilai-impor modul server ke client = build error --
  tertangkap di gate pertama, diperbaiki sebelum green).
  (e) `scripts/test-low-stock-count.ts` (BARU) = suite #32
  (20 cek): threshold D1 (10), bentuk SQL, gerbang 401/403/200
  utk semua role, map status + header, normalisasi, label,
  BUKTI batas di SQLite in-memory nyata (stock 9 masuk, 10
  tidak, inactive tidak -> 3; insert -> 4; kosong -> 0), modul
  bebas non-ASCII.
  (f) `package.json`: + `test:low-stock-count`; `test:all`
  31 -> 32.
- **Gate lulus**: `tsc --noEmit` EXIT 0; `test:all` 32/32
  ALL_PASS EXIT 0; `npm run gate` EXIT 0 (route-exports:
  `/api/low-stock-count` hadir di build 62 halaman; theme-gate
  LULUS; next build OK); 0 non-ASCII (scanning byte keempat
  file baru); `public/sw.js`, `laporan-admin-client.tsx`
  (V1), `coop.ts` TAK TERSentuh; TIDAK ada perubahan skema.
- **Proses**: `next build` + `test:all` melebihi umur sesi
  foreground (battery; perintah panjang kepotong) -> dieksekusi
  via scheduled-task sekali-pakai dengan policy battery
  override, output ke file; semua task helper dihapus
  setelah selesai.
- **STATE**: LEPAS. C2 docs = commit ini.
- **NEXT**: panel admin (P13) / Wave 7 -- menunggu arahan Gus
  Fi (Grid LEPAS `01b65e2`, seksi "GRID LEPAS" di atas; Wave 7
  menunggu pemilihan item).

### TURSO V29 VERIFIED + WAVE 6 COMPLETE (verifikasi Gus Fi + audit
DeepSeek, 13 Okt 2026)
- **Turso v29 terverifikasi di produksi**: backup Turso oleh
  Gus Fi (file lokal `kopontren (1).db`, git-ignored via
  `.gitignore` pattern `* (1).db`) + verifikasi Turso Studio:
  tabel `approval_requests` WONTEN (paling bawah daftar; semua
  tabel sibling hadir: audit_log, member_settings, vapid_keys,
  settings, categories, product_units, debts, returns,
  sale_cancellations, product_prices, bundles, stores,
  push_subscriptions, point_history, schema_version,
  zakat_settings, zakat_history, payables, user_pins,
  notifications, notification_settings, notification_logs,
  zakat_gold_standards, coa, journal_entries, journal_lines,
  zis, akad, akad_events, coop_members, coop_savings, coop_shu,
  coop_pinjaman). `approval_requests` hanya dibuat migrasi v29
  -> migrasi = TERAPLIKASI. DB produksi aman; fitur P2
  (approval flow) saged mlampah.
- **Audit DeepSeek (13 Okt): LULUS. Sedaya aman.** Wave 6 =
  12 item LEPAS: P3a, P3b, P2, Banner PWA, Emoji sweep, P3d,
  P1(c), Phase 2a, 2b, 2c, P3c, + migrasi Turso v29.
- **Koreksi catatan**: record commit P3c = `5d1d585` (bukan
  `db4f21a` yang tercantum di pesan audit -- SHA itu tidak
  ada di repo; hasil terminal flaky sesi sebelumnya). Dua ref
  ter-sync: origin/master = origin/main = `5d1d585`.
- **Sisa (opsional, tanpa definisi/keputusan)**: W5.4 close
  audit (pending -- sudah ter-resolusi oleh audit close W5 atas),
  admin panel (evaluasi, tanpa ruling). Counter: LEPAS 13 Okt
  (`aa8f875`, seksi "COUNTER LEPAS" atas); grid tetap tanpa
  definisi. W5.1 PINJ-1 tetap tashih-gated.
- **STOP point per arahan audit**: tak ada commit kode
  lanjutan; tunggu arahan Gus Fi (istirahat / Wave 7 / item
  opsional -- counter sudah LEPAS, pilihan tersisa: grid /
  admin panel / Wave 7).

### WAVE 5 CLOSED -- close audit LULUS (13 Okt 2026; record commit
tanpa kode, GO Gus Fi via DeepSeek)
- **Close audit read-only @ HEAD `2ef21f0` (13 Okt) = LULUS.**
  5 item Wave 5 semua ter-shipping; 14 commit valid, semua
  ancestor HEAD (origin/master = origin/main = `2ef21f0`):
  - W5.1 PINJ-1: `1783bbc`+`5e9df1a`+`08199ea` (LEPAS 9 Okt;
    tashih OQ7-OQ9: COA 1130, denda sadaqah memo-only, lunas
    sekaligus)
  - W5.2 NEG-1: `0d2615e`+`2f23803`+`377a126` (LEPAS 8 Okt;
    produk titipan flag-gated, stok negatif sah)
  - W5.3a B1+B2: `1961a4f`+`e2db9a1` (LEPAS 8 Okt; period-picker
    URL + inflight guard zis)
  - W5.3b OQ13+OQ14: `e2c8f0c`+`8669cbc`+`27994bf` (LEPAS 10 Okt;
    flip 6030 open + rekon #16 GL_CASH)
  - W5.4 OFF-1 P2: `5740004`+`888eb3f`+`c1a1a16` (LEPAS 8 Okt;
    banner offline global shell + refresh reconnect)
- **Gates segara @ HEAD**: tsc --noEmit 0; test:all 31/31
  ALL_PASS; gate (check-route-exports + next build, 59 rute) 0;
  non-ASCII 0; sw.js/V1/coop.ts tak tersentuh.
- **Catatan minor (record-only, bukan gap fungsional)**:
  - G1: W5.3b rekaman "LEPAS 10 Okt" padahal ad=cd commit = 8 Okt
    (eksekusi 8 Okt; konfirmasi/lepas 10 Okt).
  - G2: OFF-1 "P3" pernah disebut di baris NEXT tetapi tak
    terdefinisi -- resmi: OFF-1 ditutup pada P2.
- **Resolusi baris "NEXT: W5.4 close audit"** (seksi W6 atas) =
  terpuaskan oleh audit ini. Sisa opsional: admin panel +
  counter/grid (tanpa definisi). Definisi default Counter
  disetujui Gus Fi 13 Okt: badge "N produk stok menipis" pada
  header -- RESOLUSI: Counter LEPAS 13 Okt (`aa8f875`, seksi
  "COUNTER LEPAS" teratas); grid tetap tanpa definisi. W5.1
  PINJ-1 tetap tashih-gated.
- **STOP**: (RESOLUSI) Counter plan saged LEPAS 13 Okt;
  arahan berikutnya = Grid / panel admin / Wave 7.

## 2026-10-12
### P3c LEPAS -- Unduh Data Saya (CSV self-scope member) (commit `9b68d49`, 12 Okt 2026)
- **Commit `9b68d49`** "P3c: Unduh Data Saya -- CSV self-scope
  (poin/transaksi/koperasi)" (5 file, +703/-2; dual-push
  master+main terverifikasi: origin/master = origin/main =
  9b68d49; ACC Gus Fi 12 Okt):
  (a) `src/app/api/members/ekspor/route.ts` BARU (96 baris):
  `GET /api/members/ekspor?jenis=poin|transaksi|koperasi`
  -- self-scope by member_id (401 belum login, 404 kartu
  tak terhubung/member tak dikenal, 400 jenis tak valid);
  koperasi pakai pola cocok-nama P1c lower(trim(name)) +
  pinjaman via id IN (...); output CSV+BOM, attachment,
  no-store.
  (b) `src/lib/member/ekspor-csv.ts` BARU (225 baris,
  hermetis, zero-import @/): csvEscape (dobel-kutip/koma/
  baris-baru/null), header Indonesia, tanggal WIB
  (isoToWib), label reason + metode bayar, nama file
  member-ekspor-{jenis}-{YYYY-MM-DD}.csv; bukti self-scope
  di level SQL: semua query SELECT ikut member_id.
  (c) `personal-dashboard-client.tsx` (+154/-2): seksi
  "Unduh Data Saya" (3 tombol jenis + "Unduh Semua"
  sekuensial + progress list + AbortController) reuse
  helper P3d (downloadExportCsv/downloadAll,
  ExportProgressList) -- tanpa duplikasi mesin unduh.
  (d) `scripts/test-member-export.ts` BARU (227 baris) =
  suite #31 test:all (31 checks: csvEscape 6, jenis,
  scope SQL A!=B 5, build 3 jenis (BOM/header/WIB/label/
  NULL), kosong = header saja, nama file, non-ASCII).
- **Gate (12 Okt)**: tsc --noEmit 0; test:all 31/31
  ALL_PASS (suite ke-31 = member-export); npm run gate
  exit 0 (check-route-exports + check-theme-gate +
  next build; /api/members/ekspor hadir di build);
  non-ASCII 0 di 5 file; frozen file (sw.js, V1,
  coop.ts, export-center admin) tak tersentuh.
- **NEXT = W5.4 close audit / W5.1 PINJ-1 (tashih-gated) /
  Wave 6 -- tunggu arahan Gus Fi.**

### PHASE 2c LEPAS -- centralize BRAND_ACCENTS + fix copy pay label (commit `fb5d122`, 12 Okt 2026)
- **Commit `fb5d122`** "2c P2: Centralize brand accents + fix pay
  label copy" (6 file, +112/-18; dual-push master+main terverifikasi
  `git ls-remote`: origin/master = origin/main = fb5d122; ACC Gus Fi
  via DeepSeek 12 Okt -- "lanjut terus. aku manut sampeyan"):
  (a) **Single source `BRAND_ACCENTS` kini di `src/lib/tokens.ts`**
  (BARU, 5 preset: maroon #7a1835, green #16774b, blue #1d4f91,
  dark-maroon #5c1224, slate #475569 = nilai ac500 layer CSS T2
  globals.css). Konsumen: `shell.tsx` (meta theme-color; list hex
  lama diganti) + `admin/pengguna-client.tsx` (peta swatch META
  lokal dihapus; kini `const META = BRAND_ACCENTS`).
  (b) **Copy fix**: `key-cheatsheet.tsx` hotkey 2 "QRIS (pay)" ->
  "QRIS/WA (pay)" -- selaras label tunggal payMethodLabel di
  lib/pay-methods.ts (komunikatif).
  (c) **Guard `scripts/test-brand-sync.ts` (BARU, 12 assert)**:
  5 kunci preset; maroon = CSS :root --ac500; 4 preset = CSS
  [data-brand] --ac500; shell + pengguna-client mengimpor dari
  @/lib/tokens; tak ada lagi peta hex lokal; label cheatsheet.
  npm test:brandsync; masuk chain test:all = 30 suite.
- **Gate lulus (12 Okt)**: tsc --noEmit 0; test:all 30/30 green
  (0 failures, term. suite baru); guard test:brandsync 12/12;
  0 non-ASCII; frozen gate utuh (public/sw.js, V1
  laporan-admin-client.tsx, src/lib/coop.ts tak tersentuh).
- **Koreksi catatan sesi**: skema final = lib/tokens.ts yang
  MENYIMAN BRAND_ACCENTS (lib single-source pattern), BUKAN
  "pengguna-client owns + tokens re-export" (skema awal yang
  dilaporkan); tetap SATU sumber via import -- filosofi DRY
  terjaga. Catatan hex: nilai lama META uppercase (#7A1835),
  token baru lowercase (#7a1835) -- nilai sama, tanpa delta
  visual.
- **DITUNDA**: counter/grid (belum ada definisi) -- nunggu ruling.
- **NEXT = Phase P3c (admin panel) -- plan dulu, TUNGGU approval.**

### W5.1 GO STALE -- ruling STEP 3 (12 Okt) diterima; W5.1 sudah LEPAS 9 Okt
- **Ruling Gus Fi (via DeepSeek, 12 Okt)**: "W5.1 (PINJ-1) STEP 3
  (CODE) GO" -- GO memuat plan 9 file (db v27 + lib + 2 op + tab
  Pinjaman + posisi + glosarium + suite R + docs + record,
  3-commit structure). GO ternyata disusun dari checklist pra-9-Okt;
  audit status repo (12 Okt) menunjukkan SEMUA item plan sudah
  ter-shipped dan tercatat "W5.1 LEPAS 9 Okt" (TODO L2054 [x]).
- **Verifikasi per item plan GO (semua = SUDAH ADA):**
  (1) db.ts: tabel coop_pinjaman + idx(member_id,status) + COA seed
  1130 open/0 -- ter-shipped v27, kini SCHEMA_VERSION=29 (v28 P3a
  close 2080; v29 P2 approval_requests).
  (2) src/lib/coop-pinjaman.ts: op pinjam (D1130>K1010) + bayar
  (D1010>K1130), gl-on/off, ref_id idempoten coop#<m>:pnj#/byr#<loan>.
  (3) /api/koperasi: case pinjam (L976) + case bayar (L1048) + loans
  di GET + REKAP_ACCOUNTS +1130.
  (4) koperasi-client.tsx: Tab 5 "Pinjaman" (COOP_TABS 5 tab).
  (5) lib/laporan/posisi.ts: ASET_LANCAR +1130 (L95).
  (6) glosarium: 3 entri Qardh / Pinjaman Anggota / Denda Sadaqah di
  src/lib/glossary.ts (sumber data glosarium-client; bukan hardcode
  di client).
  (7) scripts/test-coop-pinjaman.ts (29 assert P1-P13) + package.json
  test:pinjaman + test:all (28 suite).
  (8) docs SOP-ADMIN / SOP-MANAJER / DOKUMENTASI-APLIKASI: seksi
  Pinjaman (Qardh) hadir.
  (9) record: commit 08199ea (MEMORY + TODO) LEPAS 9 Okt.
- **Commit W5.1 (di git history, dual-push master+main):**
  feat `1783bbc` "feat(pinj-1): W5.1 qardh -- coop_pinjaman + 1130 +
  pinjam/bayar ops + tab Pinjaman + R-suite" + docs `5e9df1a`
  (w5.1) + record `08199ea`.
- **Verifikasi segar (12 Okt, @ f465cd2, tree bersih, origin
  master+main sinkron):** tsc --noEmit exit 0; test:all exit 0
  (semua suite green; 28 suite); file proteksi utuh (public/sw.js,
  V1 laporan-admin-client.tsx, src/lib/coop.ts,
  lib/laporan/calk.ts).
- **Deviasi terekam (tak dikode-kan ulang):** teks GO "GL bayar:
  D1130 sisa / K1010 sisa" = kebalik typo; desain ter-shipped +
  ter-tashih = bayar D 1010 -> K 1130 (kas masuk, piutang turun)
  -- TETAP (sesuai tashih OQ7-OQ9 + rekaman LEPAS 9 Okt).
- **Ruling (12 Okt, via DeepSeek): W5.1 = RESOLVED** -- tak ada
  tindak lanjut kode; lanjut = **Phase 2b (fresh audit + STEP 2
  plan; TUNGGU approval sebelum kode).** Item terkait yang masih
  open (TIDAK bagian W5.1): W5.1 UI P2 Fix D (DITUNDA, P2 kosmetik
  -- revisit bila ada complaint) + Turso prod stamp v27/v28/v29
  verification = manual Gus Fi.
- **Ruling lanjutan (12 Okt, via audit DeepSeek): PILIHAN 1 ACCEPT** =
  W5.1 RESOLVED -> langsung Phase 2b; opsi re-audit & "GO as written"
  DITOLAK (duplikat 1783bbc, risiko konflik).
- **Scope Phase 2b (per ruling)** = **P1 #5 dedup ekspor** +
  **P2 #6 ACTION_LABEL feed** (label jelas, gampang dipahami -- filosofi
  Gus Fi). Item audit-baru Cline (truncation laporan, kartu mobile
  ZIS/persetujuan, theme gate) = BUKAN scope 2b resmi.
- **STEP 1 2b SELESAI (12 Okt)** -- plan report: (a) P1 #5: duplikat
  sesungguhnya = build baris laporan GANDA di
  src/components/pengurus-dashboard-client.tsx (exportCsv L73-104 vs
  exportXlsx L106-151, struktur RINGKASAN/METODE/TOP/HARIAN identik;
  /admin/ekspor = detail per-transaksi /api/reports/csv, bentuk LAIN,
  tak bisa dipakai dashboard). Rencana: extract `buildReportRows` +
  `csvCell` ke `src/lib/admin/report-rows.ts` (node-testable, tanpa
  DOM, hermetis ala export-download.ts) + test baru
  `scripts/test-report-rows.ts`; CSV byte-identik (BOM `\uFEFF` dipertahankan).
  (b) P2 #6: ACTION_LABEL = 35 key vs 62 key audit nyata (scan
  logAudit call-sites + dynamic) -> tambah ~44 label (coop:*,
  akad:*, kas:*, konsinyasi:*, products:bulk-*, user:*_requested,
  debt/payable:pay/delete, auth:login/logout, zis:record,
  data:reset, purchase/expense:create, dsb.); fallback raw
  dipertahankan; file = activity-feed.tsx saja (presentational;
  admin + pengurus dashboard tak disentuh). GO diterima 12 Okt ->
  STEP 2+3 LEPAS (blok di bawah).
- **STEP 2+3 2b LEPAS (12 Okt) -- commit `b5e001b`, dual-push
  master+main (5 file, +418/-79): Phase 2b SELESAI.**
  (a) P1 #5 LEPAS: `src/lib/admin/report-rows.ts` BARU
  (zero-import; buildReportRows/csvCell/flattenCsvRows/xlsxSheets;
  payMethodLabel + fmtDate di-injeksi pemanggil) +
  `scripts/test-report-rows.ts` BARU (38 assert PASS; npm
  test:report-rows masuk chain test:all = 29 suite).
  pengurus-dashboard-client.tsx (+19/-60): exportCsv + exportXlsx
  kini memakai modul tsb -- layout CSV/XLSX byte-identik dgn
  export lama (regression guard: test-report-rows).
  (b) P2 #6 LEPAS: activity-feed.tsx (+55 baris): 53 entri
  ACTION_LABEL baru (angka aktual per diff; estimasi plan ~44) --
  inventaris audit log kini berlabel; fallback raw utk aksi tak
  dikenal dipertahankan.
  Gate: tsc --noEmit 0; next build 0; check-route-exports +
  check-theme-gate OK; test:all 29 suite 0 failures; ASCII bersih.
  Lanjutan = menunggu ruling langkah berikutnya.
- **AUDIT PHASE 2b CLOSED (12 Okt, DeepSeek): LULUS -- + koreksi
  1: klaim "Phase 2a pending / never committed" = STALE. 2a
  sudah LEPAS `0191a5e` (ui(2a): flat hero + KPI token colors +
  shared KpiCard + member menu icons; 4 file +139/-140), induk
  langsung HEAD `59a52dc` (merge-base --is-ancestor = YES).
  Verifikasi di tree: kpi-card.tsx (KpiGrid/KpiCardDef/
  lg:grid-cols-3) + sidebar.tsx (IconCard/IconGauge/IconCap/
  IconGlosarium, inline SVG). 2 keputusan 2a ter-masukan:
  Hutang->risk-600/400 + Grid->lg:grid-cols-3. SHA audit yg
  kosong terisi: 2b-3 = `aef64e8`. Status riil Wave 6:
  P3a/P3b/P2/Banner/Emoji/P3d/P1(c)/2a/2b = CLOSED; 2c + P3c
  belum mulai -- tunggu ruling.
- **Catatan**: memori "fresh audit" = salah sesi (obrolan lama W5.1).

### P1(c) MEMBER-SIDE PINJAMAN VIEW -- read-only pinjaman koperasi di /member (LEPAS, commit `29d1acf`, dual-push master+main)
- **Lingkup (P1 Zero Thinking UX, sub-item c)**: seksi
  "Pinjaman Koperasi" pada dashboard member `/member` (read-only),
  data diambil server-side langsung dari DB TANPA endpoint baru
  (menambah `page.tsx` yang sudah server-render).
- **Identitas (solusi name-based, batasan tanpa ubah skema)**:
  tak ada FK `users` -> `coop_members`; link yang feasible =
  `lower(trim(name))` antara nama `members` dan `coop_members.name`.
  Bisa cocok beberapa baris coop_members (semua id diambil). UI
  menampilkan disclaimer "Data berdasarkan nama. Jika ada
  perbedaan, hubungi admin."
- **Cakupan tampilan**: SEMUA pinjaman anggota tercocok dari
  `coop_pinjaman` (urutan `created_at DESC`). Filter default
  "Aktif" + toggle "Sedaya". Metrik turunan: jumlah pinjaman
  aktif, total sisa, jatuh tempo terdekat; per pinjaman
  StatusBadge (overdue / aktif amber / lunas hijau).
- **File (additive, 2 file, +154/-10)**:
  (a) `src/app/member/page.tsx`: + type `MyLoanRow`; + langkah 4
      (lookup `coop_members` name-based + query `coop_pinjaman`
      + flag `overdue` via `wibToday`); + prop `loans` ke client.
  (b) `src/components/member/personal-dashboard-client.tsx`:
      + prop `loans`, + state `loanFilter` (default 'aktif'),
      + kartu "Pinjaman Koperasi" (3 tile metrik + FilterPill
      + list + empty state "Belum ada pinjaman" / "semua lunas").
- **Gate lulus**: `tsc --noEmit` exit 0; 0 non-ASCII di 2 file;
  `test:all` 28/28 suite green (exit 0; suite akhir
  `test-admin-export` PASS 26/0 + ALL_PASS). Frozen gate
  `public/sw.js`, `laporan-admin-client.tsx`, `coop.ts` tak
  tersentuh.
- **STATE**: LEPAS -- `29d1acf` (2 file, +154/-10) dual-push
  master+main (verified `git ls-remote`: kedua ref = 29d1acf).
  File temp helper `n_*.txt` dibersihkan sebelum commit.
- **Batasan (dicatat)**: identitas name-based = best-effort link;
  keanggotaan koperasi yang eksak butuh ubah skema (FK
  `users` -> `coop_members`) atau field login. Tidak dieksekusi
  sebelum ruling/ACC Gus Fi.
- NEXT = P3c (menunggu arahan Gus Fi); sub-item P1 sisanya
  (a/b/d dst) masih terbuka.

## 2026-10-10
### P3d ADMIN EXPORT CENTER -- unduh CSV + cetak formal di /admin/ekspor (LEPAS, commit C1 `5363da9` + C2 docs, dual-push master+main)
- **Lingkup (Option A, desain 10 Okt)**: pusat ekspor
  administrasi di route terpisah `/admin/ekspor` (tier admin,
  guard `isAdmin`), orkestrasi full frontend TANPA endpoint
  server baru: unduh CSV per modul + batch sekuensial + abort;
  cetak formal re-use `/api/laporan/formal`. `CSV_MODULES`
  hard-coded: `/api/reports/csv` + `/api/keuangan/csv`;
  period default `startOfDayJakarta(-29).slice(0,10)` ..
  `todayWibStr()`.
- **File (additive)**:
  (a) `src/lib/admin/export-download.ts` (~242 br; zero-import;
      pembangkit CSV/JSON blob + unduh Blob + polling).
  (b) `src/components/admin/ekspor/export-progress.tsx` (ikon
      status inline-SVG).
  (c) `src/components/admin/ekspor/export-center-client.tsx`
      (period picker + unduh per-modul + batch + abort + link
      cetak formal -> /admin/laporan).
  (d) `src/app/admin/ekspor/{layout,page}.tsx` (metadata +
      guard `isAdmin` + `Shell`).
  (e) `src/components/sidebar.tsx`: + `IconExport` (inline-SVG)
      + `MENU_ITEMS` (level 'admin') + grup `Sistem` + prefetch.
  (f) `package.json`: + `test:admin-export`, `test:all` jadi
      28 entry (append `node scripts/test-admin-export.ts`).
  (g) `scripts/test-admin-export.ts` (Node type-strip;
      PASS 26/0).
- **Gate lulus**: `tsc --noEmit` exit 0; 28/28 suite green
  (27 `scripts/test-*.ts` + `approval-flow.mjs`, termasuk
  `test:admin-export`); 0 non-ASCII semua file P3d + sidebar;
  frozen gate `laporan-admin-client.tsx`, `public/sw.js`,
  `coop.ts` tak tersentuh.
- **STATE**: LEPAS -- C1 `5363da9` (8 file, +836/-1) sudah
  dual-push master+main (verified `git ls-remote`); C2 docs =
  commit ini. 465 file temp `n_*.txt` dibersihkan sebelum C1.
- NEXT = P1c / P3c (menunggu arahan Gus Fi).

### TUTORIAL EMOJI SWEEP LEPAS -- 9 docs + 9 public/tutorial + 2 src komentar (audit 10 Okt, commit `7ba4371`)
- **`7ba4371`** (20 file, +176/-113; parent `2e7cf6a`; dual-push
  `origin/master` + `origin/main` @ `7ba4371`, kedua ref remote
  terverifikasi identik):
  (a) 9 `docs/*.html` -- semua emoji/glyph diganti ikon inline SVG
      + blok CSS `.doc-ic`; 0 baris konten non-SVG (pure swap).
  (b) 9 `public/tutorial/*.html` -- mirror sync:tutorial dari docs
      (docs = sumber kebenaran); 14 baris drift-resolution
      pre-existing kini byte-identik dgn docs; 0 konten baru
      selain SVG.
  (c) 2 komentar src non-user-facing (zero runtime impact):
      `src/app/admin/dashboard/page.tsx` up-triangle -> `^`;
      `src/app/api/backup/route.ts` orange-circle -> `ORANGE`.
- **Gate lulus**: `tsc --noEmit` exit 0; `test:all` 27/27 green
  (per-suite, termasuk test-invariants 40/0, test-golden,
  test-inflight 11/0, approval-flow 63/0); emoji scan bersih
  semua file in-scope; `sync:tutorial` 9/9 byte-identik; CRLF
  utuh.
- **Harness fix (transparansi)**: temuan "test-invariants
  phase-2 abort" + "test:all FAIL" sebelumnya = ARTIFAKT harness,
  BUKAN regresi -- (1) cap `execFileSync` 180s membunuh E2E
  restore-drill yang legitim >180s (2x `next dev` +
  `removeWithRetry` s.d. 90s) -> naikkan 900s; (2) typo runner
  `test-coop-penjualan.ts` (tak ada) vs `test-coop-pinjaman.ts`
  (real) + duplikat `test-laporan.ts` -> koreksi ke 27-entry
  chain `package.json`. Pasca-fix SEMUA green.
- NEXT = **P3d** (admin export center: CSV + formal print di
  `/admin/ekspor`; 3 keputusan Option A: route `/admin/ekspor`
  terpisah, orkestrasi frontend tanpa endpoint server baru,
  cetak formal re-use `/api/laporan/formal`).

### BANNER PWA LEPAS -- ikon inline SVG ganti emoji (audit 10 Okt, commit `a48136d`)
- **`a48136d`** (1 file, +17/-2, `src/components/sw-register.tsx`;
  parent `1da3a16`; dual-push `origin/master` + `origin/main` @
  `a48136d`, kedua ref terverifikasi identik): emoji U+1F195 di
  banner update PWA diganti ikon refresh inline SVG (16px, viewBox
  24, stroke-2, currentColor, text-amber-600, shrink-0,
  aria-hidden); em-dash & ellipsis di baris yang ditulis ulang
  dinormalkan ASCII; "Memuat..." line tak disentuh (minimal diff).
- **Audit (10 Okt) -- LULUS, LULUS, SAH, GO COMMIT** (via Gus Fi
  / DeepSeek): aturan "no emoji/unicode di produk; ikon = inline
  SVG" dipatuhi. Gate: tsc 0; test:all 27/27 green (per-suite);
  0 non-ASCII di baris yang ditambah; public/sw.js + V1
  laporan-admin-client.tsx + coop.ts tak tersentuh.
- **Catatan harness**: foreground `node` test:all batch ter-kill
  oleh terminal harness (per-suite kill); hasil = run per-suite
  terpisah + detached launcher `n_ta_14h_launch.js`.

### P3a LEPAS -- tutup COA 2080 (SHU Berjalan) + skema v28 (10 Okt 2026)
- **Ruling**: 2080 (SHU Berjalan) TAK DIPAKAI alur SHU
  (SHU flow = 3020/3030/3040/3050/3060/5080; lanjutan ruling
  Q6 W4.1 5 Okt) -> ditutup.
- **`3f4a8cf`** (5 file, +45/-21; dual-push `origin/master` +
  `origin/main` @ `3f4a8cf`; kedua ref remote terverifikasi
  identik):
  (a) `src/db.ts` -- seed 2080 `pending/1 -> closed/0` +
  UPDATE eksplisit di upgrade path (DB v27: seed ON CONFLICT
  DO NOTHING tak menimpa baris lama; idempoten, fresh =
  no-op) + komentar blok 6030 (7 -> 6 akun pending) +
  `SCHEMA_VERSION 27 -> 28`. Murni aditif; DB stempel v27
  menjalankan fullInit sekali lagi saat cold start (lesson
  v16; BACKUP DB WAJIB sebelum deploy).
  (b) 4 test file -- asersi COA disinkron (P3a mirror seed):
  test-akad `CLOSE_2080_SQL` di M1 + M2; pending 13 -> 12,
  closed 1 -> 2 (5050 + 2080), nd 13 -> 12; ctrl 2080 =
  closed/0. test-coop `CLOSE_2080_SQL` M1 + M2. test-zis +
  test-gl counts disesuaikan.
- **Gate lulus**: `tsc --noEmit` exit 0; test-gl 102/0;
  test-zis 68/0; test-akad 175/0; test-coop 132/0;
  `test:all` 26/26 exit 0 (full-suite); 0 non-ASCII di 4
  test file (db.ts = existing, tak berubah).
- **Turso v28**: skema v28 (close COA 2080) murni aditif
  (UPDATE eksplisit + seed). DB prod stempel v27 -> fullInit
  sekali lagi saat cold start (lesson v16). Verifikasi =
  manual Gus Fi pasca-deploy.
- NEXT = **P3b** (ZIS Rekap -- planning menyusul).

### P3b LEPAS -- ZIS Rekap (commit `bd60cc2`, 10 Okt 2026)
- **Ruling Gus Fi (via audit DeepSeek)**: diff P3b LULUS;
  2090 OQ-1 = LABEL ONLY (builder `lib/zis.ts` tak diubah);
  wakaf disposal = baris terpisah (jurnal manual W3.5, tak
  dijumlah dgn ZIS); tabel bulanan dipertahankan (default
  scope); C1 (kode) + C2 (docs) = 2 commit.
- **C1 `bd60cc2`** (4 file, +533/-0; dual-push
  `origin/master` + `origin/main` `ef9698e..bd60cc2`;
  kedua ref remote terverifikasi identik @
  `bd60cc26fd91e54269dbe5353d29d1c53490001f`):
  (a) `src/lib/zis-rekap.ts` BARU (171 baris) --
  `buildZisRekap(db, from?, to?)` import-free (type-only
  QueryDb, pola lib/laporan: posisi/calk/lka): by_kind
  (zero-fill 4 jenis zakat/infak/sedekah/wakaf) + monthly
  (bucket 'YYYY-MM' via substr, ASC -- occurred_at
  seragam ISO-WIB +07:00 sehingga prefix string
  deterministik; tanpa konversi zona, Turso-safe) +
  grand + c2090 (gl_balance = all-time
  SUM(credit)-SUM(debit) akun 2090, JOIN
  journal_entries anti-orphan pola posisi.ts;
  posted_in/unposted_in = count baris zis
  direction='in' dgn/tanpa posted_entry -- OQ-1: hanya
  'in' menulis 2090; D6: baris gl-off tak di-backfill,
  tak ikut gl_balance). Filter periode =
  occurred_at >= from AND occurred_at < to (perbandingan
  string leksikografis valid karena format seragam).
  (b) `src/app/api/zis/rekap/route.ts` BARU (54 baris) --
  GET only + force-dynamic; guard `currentUser` +
  `canAccess(user,'zis')` (D2: tier admin+manajer, sama
  /api/zis); `?from`/`?to` terima ISO-WIB atau
  'YYYY-MM-DD' (dinormalisasi tengah-malam WIB), 400
  bila format invalid atau from >= to; payload +
  `gl_enabled` (utk badge status GL di UI).
  (c) `src/components/admin/zis-client.tsx` -- card
  "Rekap ZIS" (di atas form Catat ZIS): period picker
  (Semua / Bulan ini / Tahun ini / Custom -- batas
  dihitung WIB via `wibToday`; mode custom = 2 input
  date YYYY-MM-DD; refetch on change) + tabel total per
  jenis (baris TOTAL) + tabel per bulan (cap 24 baris
  terakhir; disembunyikan utk mode 'Bulan ini') + 4
  kartu alokasi: Teralokasi (zakat/infak/sedekah keluar
  periode, dibook 5090/5100), Belum disalurkan (net
  operasional -- caption eksplisit "bukan saldo GL
  2090"), Wakaf disposal (keluar wakaf = disposal aset,
  jurnal manual 6020/1120 W3.5 -- TIDAK dijumlah),
  Saldo COA 2090 (GL, all-time; caption OQ-1 kumulatif
  + badge abu "GL off -- 2090 tidak bertambah" + badge
  amber "N baris masuk belum jurnal (D6)"). Type
  payload diduplikasi di client (pola ZisRow); 0
  emoji/ikon baru; class dark-mode; pakai Table/
  TermTip/Badge/rp/api existing.
  (d) `scripts/test-zis.ts` -- blok Z8 (Z8a DB kosong:
  zero-fill 4 jenis + grand 0 + monthly kosong + c2090
  nol; Z8b all-time: by_kind/grand/bucket 2 bulan +
  c2090.gl_balance = 4000000 hanya zakat in gl-on
  (OQ-1) + posted_in = 2 (HANYA in-row; koreksi
  ekspektasi test -- library benar) + unposted_in = 1
  (r2 gl-off, D6); Z8c periode Okt: from inklusif / to
  eksklusif + invariant c2090 all-time tak ikut filter)
  + shim `toQueryDb` (DatabaseSync node:sqlite ->
  QueryDb async, pola makeShim test-laporan.ts).
  test-zis kini **101 lulus / 0 gagal** (termasuk +20
  asersi Z8).
- **OQ-1 (2090) = LABEL ONLY**: semantik ZIS OQ-1
  (keluar dibook beban 5090/5100 via 1100, TIDAK
  mengurangi 2090) tetap -- rekap hanya MEMPERJELASKAN
  via UI; `lib/zis.ts` tak disentuh.
- **Gate C1**: `tsc --noEmit` exit 0; `test:all` 26/26
  exit 0; `test:zis` 101/0; 0 non-ASCII di 4 file; file
  proteksi tak disentuh (public/sw.js, V1
  laporan-admin-client.tsx, src/lib/coop.ts,
  src/db.ts, /api/zis GET/POST); **skema v28 tak
  berubah** (P3b = modul baca-only, tanpa migration).
- **Housekeeping**: 34 temp file P3a dihapus dari repo
  root sebelum C1 (commit bersih = 4 file P3b saja).
- NEXT = **P2 / P3d / P1c / P3c** (menunggu arahan
  Gus Fi).

### P2 LEPAS -- Q62 Approval flow (5 aksi, queue, decide; commit `5007f2f`, 10 Okt 2026)
- **Ruling Gus Fi (via audit DeepSeek)**: P2 GO CODE
  (10 Okt); Issue 1 ruling = CLOSED (pre-check + LIMIT 5000
  sudah ada di repo -- tanpa perubahan kode).
- **C1 `5007f2f`** (17 file, +1876/-72; dual-push
  `origin/master` + `origin/main` @ `5007f2f`; kedua ref
  remote terverifikasi identik):
  (a) `src/db.ts` -- `migrate30()` (konvensi penomoran
  mengikuti fungsi, bukan versi): tabel
  `approval_requests` + `idx_approval_status` +
  `idx_approval_pending`; `SCHEMA_VERSION 28 -> 29`.
  Purely additive; DB stempel v28 menjalankan fullInit
  sekali lagi saat cold start (lesson v16; BACKUP DB WAJIB
  sebelum deploy).
  (b) `src/lib/approvals.ts` BARU (490 baris, import
  minimal: `ROLES` dari `lib/features.ts`) -- allow-list
  5 aksi (user:create_admin, user:role, user:active,
  jurnal:reverse, kas:delete); state machine pending ->
  approved -> applied | rejected | withdrawn; dedupe
  idempoten per (action, target); aturan dua orang +
  pengecualian bootstrap (self-decide hanya bila pemohon
  satu-satunya admin aktif); dispatcher RE-VALIDATE guard
  saat apply (guardAction di dalam tx() route).
  (c) `src/app/api/approvals/route.ts` BARU (205) --
  GET tab menunggu/riwayat + POST op=decide / op=withdraw
  (audit approval:decide / approval:withdraw; invalidate
  gl:/kas:/reports: + notifyCashBalance saat apply).
  (d) Route lama kini membuat request pending, TIDAK
  eksekusi langsung: POST/PUT /api/users (create admin +
  active + role), POST /api/jurnal reverse, DELETE
  /api/kas -- password di-hash ke payload (salt +
  pass_hash, bukan plaintext).
  (e) UI: /admin/persetujuan (tab Menunggu + Riwayat;
  ikon inline SVG saja), sidebar menu + fitur
  'approvals' (tier admin), toast pending di
  pengguna/jurnal/kas client.
- test-golden GP-03 disesuaikan semantik P2 (role change
  via approval flow; audit user:roles_requested +
  approval:decide; bootstrap self-decide utk DB 1-admin).
  `scripts/test/approval-flow.mjs` BARU -- suite #27
  (63 asersi): state machine + guard + aturan dua orang +
  bootstrap + filter tab. test:all kini **27 suite green**.
- **Gate lulus**: `tsc --noEmit` exit 0; `test:all` 27/27
  exit 0; check-route-exports OK; `next build` exit 0
  (/admin/persetujuan + /api/approvals terdaftar); 0
  non-ASCII di baris yang ditambah; file proteksi tak
  disentuh (public/sw.js, V1
  laporan-admin-client.tsx, src/lib/coop.ts).
- **Deviation diterima (Gus Fi)**: Riwayat menyertakan
  status 'withdrawn' (4 status closed); bootstrap
  self-decide utk instalasi 1-admin (tanpa ini tak bisa
  menambah admin ke-2 -- deadlock).
- Turso v29: skema murni aditif (CREATE TABLE IF NOT
  EXISTS + index) -- migrasi tereksekusi saat cold start
  pertama setelah deploy; BACKUP DB WAJIB sebelum deploy.
- **PWA banner audit (10 Okt)**: banner "Versi anyar
  tersedia" `sw-register.tsx:148` memakai emoji U+1F195
  (bukan SVG) -- PRE-EXISTING (commit `d3e99f5`, 25 Sep),
  bukan Wave 6. Fix = ganti SVG refresh inline (amber-600,
  1 hunk), dijadwalkan SETELAH P2 (kosmetik, LULUS).
- NEXT = **P3d / P1c / P3c** (menunggu arahan Gus Fi) +
  fix PWA banner (STEP 3 instruksi 10 Okt).

### W5.1 UI P1 (FIX A+B) LEPAS -- POS toolbar overflow + dashboard p-4.5 (10 Okt 2026)
- **Ruling Gus Fi (via audit DeepSeek)**: diff Fix A+B
  LULUS; koreksi commit plan = A+B digabung 1 commit
  (C1), docs/record = C2; screenshot checklist
  didelegasi ke Gus Fi (manual, post-deploy); Fix C+D
  (P2 kosmetik) DITUNDA -- nunggu ruling.
- **C1 `8a1dcd3`** (2 file, +26/-26; dual-push
  `origin/master` + `origin/main` @ `8a1dcd3`):
  (A) `src/components/pos-client.tsx` -- pill kategori
  dipindah ke baris sendiri (sibling dari baris
  search + Scan Barcode; wrapper search jadi `mb-2`,
  baris pill = `no-scrollbar mb-3` + `role="tablist"`)
  -> input `flex-1` tak lagi collapse (akar: pill dulu
  di baris flex yang sama). A11y utuh: `role=tablist`,
  `aria-label="Kategori produk"`, `onKeyDown`
  (nav keyboard), `role="tab"` + `aria-selected`
  per pill; hotkey F1 (`searchInputRef`) tak
  disentuh. Logika (`setCat`, `categories.map`,
  props FilterPill) tak berubah.
  (B) `src/app/admin/dashboard/page.tsx` -- token
  mati `p-4.5` -> `p-4` (Tailwind 3.x tak punya
  `p-4.5`; KPI tile padding uniform 16px).
- **Atribusi defect UI (tabel)**:
  | Commit | Defek | Status |
  |---|---|---|
  | `5a4c6ce` fix(pos) | POS toolbar: pill + search 1 baris (collapse) | LULUS `8a1dcd3` (Fix A) |
  | `2efa660` feat/ui | KPI tile `p-4.5` (token mati) | LULUS `8a1dcd3` (Fix B) |
  | `2efa660` feat/ui | import rusak -> `next build` gagal | LULUS `1783bbc` (anak langsung `2efa660`) |
  | residual audit | Fix C (P2, kosmetik) | LULUS `e399147` (10 Okt) |
  | residual audit | Fix D (P2, kosmetik) | DITUNDA -- nunggu feedback pengurus |
- **Gate C1**: `tsc --noEmit` exit 0; `test:all`
  26/26 (detached cmd.exe polling, bypass timeout
  PowerShell); 0 non-ASCII di +26 baris; residue
  `p-4.5` = 0; dev: GET /kasir 200 (18.4 KB), GET
  /admin/dashboard 307 (auth, normal). File
  proteksi tak disentuh: public/sw.js,
  laporan-admin-client.tsx (V1), src/lib/coop.ts,
  src/db.ts.
- **Turso v27 (paralel, decoupled)**: skema v27
  (tabel `coop_pinjaman` + COA seed 1130) murni
  aditif (CREATE IF NOT EXISTS + ON CONFLICT DO
  NOTHING). DB prod stempel v26 -> fullInit sekali
  lagi saat cold start (lesson v16, ~15-20 dtk).
  Verifikasi = manual Gus Fi pasca-deploy (request
  AUTH pertama memicu migrasi).

### W5.1 UI P2 -- Fix C LEPAS (10 Okt 2026)
- **Ruling Gus Fi (via DeepSeek, 10 Okt)**: Fix C GO
  (P2, UX, minor); Fix D DEFER (dark mode default acceptable,
  nunggu feedback pengurus/kasir).
- **`e399147`** (1 file, +1/-1; dual-push `origin/master`
  + `origin/main` @ `e399147`):
  `src/components/pos-client.tsx` L1480 -- `max-h-64` ->
  `max-h-96` (cart items list: 256px -> 384px, +50%).
  Prevents cart clipping when >3 line items.
- **Gate**: `tsc --noEmit` exit 0; `test:all` 26/26;
  0 non-ASCII; a11y + hotkeys tak berubah (CSS class only).
  File proteksi tak disentuh: public/sw.js,
  laporan-admin-client.tsx (V1), src/lib/coop.ts, src/db.ts.
- **Fix D**: DEFER -- dark mode default acceptable;
  revisit hanya jika pengurus/kasir file complaint.

## 2026-10-09
### W5.1 (PINJ-1) LEPAS -- pinjaman anggota QARDH (9 Okt 2026)
- Ruling tashih OQ7-OQ9 GUS FI: (OQ7) akun COA **1130** 'Piutang
  Anggota (Koperasi)' -- **BUKAN 1030** (Piutang Penjualan tetap
  live, tak terpakai modul ini; audit STEP 1 menaruh OQ3 lama =
  1030, tashih memperbaiki ke 1130); GL pinjam D1130 > K1010,
  bayar D1010 > K1130. (OQ7-sub) 1130 masuk `ASET_LANCAR`
  (src/lib/laporan/posisi.ts, 1 baris) -> ikut neraca V2. (OQ8)
  denda = **sadaqah memo-only**: kolom `catatan` pinjaman, TIDAK
  ada kaki jurnal (F3.3 #6: tak pernah jadi pendapatan). (OQ9)
  semua YA: bayar sekaligus (lump sum; 1 pinjaman = 1 pelunasan,
  409), pinjam ganda diizinkan, anggota keluar = pinjaman tetap
  aktif, tabel di coop_members (member_id), sadaqah input manual.
- **C1 feat**: (1) `src/db.ts` skema v27: tabel `coop_pinjaman`
  (id, member_id, akad qardh, margin 0, pokok, sisa, tanggal_mulai,
  tanggal_jatuh_tempo, status aktif|lunas, catatan, created_by/at)
  + index + COA seed 1130 open/0 + bump v27 (murni aditif: CREATE
  IF NOT EXISTS + ON CONFLICT DO NOTHING). CATATAN: skema v27 +
  lib draf pertama sudah masuk history via commit 2efa660
  (feat/ui batch); C1 ini = fix lib ke API jurnal.ts sebenarnya
  + seluruh wiring. (2) lib baru `src/lib/coop-pinjaman.ts`
  (mirror coop-modal; `postJournalInTx` dari jurnal.ts:
  buildCoopLoanDisbursementSpec/PaybackSpec murni +
  recordCoopLoanInTx/closeCoopLoanInTx; guard UPDATE status='aktif'
  -> double pay = PINJAMAN_NOT_ACTIVE). (3) route /api/koperasi:
  op `pinjam` (validasi: pokok integer > 0, jatuh tempo wajib & >=
  mulai, catatan <= 200, member ada -> 404) + op `bayar` (sadaqah
  integer >= 0; memo concatenation ke catatan; 409 lunas; 404
  tak ada) + GET `loans` (LIMIT 100) + REKAP_ACCOUNTS +1130
  (baris rekap ke-10). (4) client /admin/koperasi: tab ke-5
  "Pinjaman" (form pinjam + daftar + badge lateg + form bayar via
  useConfirm; tier baca: form disembunyikan) + TIPS 3 entri.
  (5) posisi.ts +glossary.ts (Qardh/Pinjaman Anggota/Denda Sadaqah).
  (6) suite baru `scripts/test-coop-pinjaman.ts` (29 assert
  P1-P13, node:sqlite in-memory + DDL mirror v27).
- **C2 docs**: SOP-ADMIN/SOP-MANAJER/SOP-PENGURUS +
  DOKUMENTASI-APLIKASI (ops 10 -> 12; tabel +2 baris; glosarium
  +1 baris; peran baca mention tab Pinjaman).
- **C3 record**: MEMORY + TODO (W5.1 PINJ-1 TUNDA -> [x] LEPAS).
- **Gate**: tsc 0 + test:all **26/26** (chain s.d. test-inflight
  ALL_PASS) + gate (check-route-exports + next build 59/59) +
  file baru 0 non-ASCII. File proteksi tak disentuh: public/sw.js,
  src/lib/coop.ts, laporan-admin-client.tsx.
- **Sesudahnya**: Wave 5 close audit + Wave 6 (migrasi + SOP).
  Deploy: BACKUP DB manual (lesson v16); DB stempel v26 akan
  fullInit sekali lagi saat cold start.

## 2026-10-08
### PLAN A LEPAS -- ikon inline SVG semua item nav sidebar admin (8 Okt 2026)
- **1 commit feat (`feat(sidebar)`) + 1 commit docs (`docs(sidebar)`)** +
  dual-push master+main SETELAH commit (verify ls-remote + rev-list 0 0).
- (a) **`src/components/sidebar.tsx`** (SATU-SATUNYA file kode,
  diff +-518):
  - **Icon system LOCK**: render 16px (width/height "16"),
    viewBox 24, stroke-2 (strokeWidth 2, linecap/linejoin round),
    fill none, currentColor, aria-hidden="true"; TIDAK ada
    emoji/Unicode/ikon-font (konsisten dgn ikon baris lama).
  - **25 konstanta `Icon*` BARU** (block header `/** Plan A ... */`
    dlm file) + **6 ikon lama** (IconGL, IconJurnal, IconZis,
    IconAkad, IconKoperasi, IconGlosarium) = **31/31 item
    `MENU_ITEMS` punya `icon`** (tipe `MenuDef` = { href, label,
    level, roleLabel?, icon? } -- property `icon?` sudah ada,
    TANPA break; render nav sudah mendukung `it.icon`).
  - **TANPA sub-menu (ruling Q2=C)**: `ADMIN_GROUP_DEFS` (4 grup) +
    render TIDAK berubah; semua item tetap 1-level.
  - 25 ikon baru (nama konstanta): IconGauge, IconChart,
    IconGlobe, IconCart, IconFileChart, IconBox, IconBag,
    IconSwap, IconClock, IconUndo, IconWallet, IconQr, IconStar,
    IconHandCoins, IconCap, IconGift, IconPercent, IconUsers,
    IconClipboard, IconBell, IconShield, IconScale, IconUserCog,
    IconDatabase, IconUpload.
  - Pemetaan 31 item MENU_ITEMS (ikon bertanda * = 6 lama):
    / Ringkasan=IconGauge; /admin/dashboard Dashboard=IconChart;
    /pengurus/dashboard Dashboard Global=IconGlobe; /kasir
    Kasir=IconCart; /laporan Laporan & Rekap=IconFileChart;
    /admin/produk Produk=IconBox; /admin/belanja Belanja=IconBag;
    /admin/konsinyasi Konsinyasi=IconSwap; /admin/shift Shift &
    Kasir=IconClock; /retur Retur=IconUndo; /admin/kas
    Kas=IconWallet; /admin/qris QRIS=IconQr; /piutang Poin &
    Piutang=IconStar; /admin/hutang Hutang=IconHandCoins;
    /tutorial Tutorial=IconCap; /admin/glosarium Glosarium=
    IconGlosarium*; /admin/zakat Zakat=IconGift; /admin/zis
    ZIS=IconZis*; /admin/akad Akad=IconAkad*; /admin/koperasi
    Koperasi=IconKoperasi*; /admin/pengaturan-member Keuntungan
    Member=IconPercent; /admin/member Member=IconUsers;
    /admin/laporan Laporan Pengurus=IconClipboard;
    /admin/notifications Notifikasi=IconBell; /admin/audit
    Audit=IconShield; /admin/rekonsiliasi Rekonsiliasi=IconScale;
    /admin/gl GL=IconGL*; /admin/jurnal Jurnal GL=IconJurnal*;
    /admin/pengguna Pengguna=IconUserCog; /admin/data Data &
    Backup=IconDatabase; /admin/migrate Import CSV=IconUpload.
- **Gate (semua lulus)**: `tsc --noEmit` exit 0; `test:all` 24/24
  suite exit 0 (semua 0-fail); `gate` = check-route-exports OK +
  next build (compile + types + 59/59 page) exit 0; 0 non-ASCII
  (scan byte: sidebar.tsx = 0); guard TIDAK tersentuh
  (`public/sw.js`, engine `src/lib/coop.ts` intact --
  `git status` cuma sidebar.tsx M).
- **Catatan proses sesi ini (flaky terminal)**: output
  foreground tak bisa di-capture (shell integration rusak);
  proses background mati bila terminal ditutup. Fix: pakai
  `.bat` (`cmd /c`) + marker `.txt` (`.gate_build_done.txt`) +
  poll via READ-FILE (bukan run_commands, agar tidak membunuh
  tree). Insert editor >6000 char dipotong jadi 3 chunk.
- **W5.3a (kode B1+B2) = SELESAI 8 Okt** (commit C1 `1961a4f` +
  C2 record, hash di git log pasca-commit; detail = seksi W5.3a
  di bawah).
- **NEXT: W5.3b** (OQ13: flip `6030` pending -> open + OQ14:
  rekon #16 `GL_CASH`).

## 2026-10-07
### W4.6 LEPAS -- rekap per rumpun: agregasi server GET /api/koperasi + kartu UI tab Rekap + test R6a-R6g (7 Okt 2026)
- **3 commit (kontrak STEP 2, bukan 1)** + dual-push master+main
  SETELAH SETIAP commit (verify ls-remote + rev-list 0 0):
  - C1 `feat(W4.6)`: `route.ts` + `koperasi-client.tsx` +
    `test-coop.ts`.
  - C2 `docs(W4.6)`: glossary (group "Koperasi & SHU") + 4 SOP/DOK
    source + 4 mirror public/tutorial (SYNC-TUTORIAL-OK).
  - C3 `docs(W4.6)`: MEMORY.md + TODO.md (record ini).
  Hash C1/C2/C3 diisi di git log (pasca-commit).
- (a) **route.ts**: GET /api/koperasi return `rekap_rumpun:
  RekapRumpunRow[]` = { rumpun, member_count, pokok, wajib, sukarela,
  total } (6 field; OQ4/OQ6 -- rincian per jenis simpanan, bukan
  cuma total). Agregasi DILAKUKAN DI SERVER (satu sumber: balances
  per anggota dari `coopRekapBalances`; OQ2/OQ4 no-case: "Rumpun A"
  = "rumpun a"). Rincian pokok/wajib/sukarela + total DIKUMPULKAN
  per rumpun (accumulate per-kind, bukan cuma total). Anggota tanpa
  rumpun = baris `rumpun:null` = label "Tanpa rumpun", DIURUTKAN
  PALING BAWAH. Baca saja (semua peran; TIDAK ada op POST).
- (b) **koperasi-client.tsx**: kartu "Rekap per Rumpun" di tab
  Rekap (antara "Rekap Akun" & "Jurnal Closing"); + tipe
  `RumpunRow` (6 field) + `rekap_rumpun` di `CoopData` + TIPS.
  KARTU 6 KOL: Rumpun | Jumlah Anggota | Pokok | Wajib | Sukarela |
  Total (Rp) + baris TOTAL (<tfoot>) menjumlah semua rumpun (OQ5).
  Glosarium "Rekap per Rumpun" group = "Koperasi & SHU" (fitur
  koperasi, bukan akad).
- (c) **test-coop.ts R6** (db6 terisolasi; 4 anggota m1-m4 =
  "Rumpun A", "rumpun a", "Rumpun B", null; simpanan m1 10000
  pokok+5000 sukarela, m2 3000 wajib+2000 sukarela, m3 8000 pokok,
  m4 1000 sukarela; grand total 29000): 16 asersi -- R6a-R6e (3
  baris, member_count, tanpa rumpun, urutan), R6f1-f3 (SUM
  member_count=4; SUM per-jenis 18000/3000/8000; SUM total 29000),
  R6g (merge no-case + label "Rumpun A"), R6h-R6n (rincian
  pokok/wajib/sukarela per rumpun). test-coop kini 132/0.
- **Gate**: `tsc --noEmit` exit 0; `test:all` 24/24 exit 0;
  `node scripts/test-coop.ts` 132 passed / 0 failed; `gate`
  (check:routes) OK; 0 non-ASCII di file kode; `public/sw.js` +
  V1 `laporan-admin-client.tsx` + engine `src/lib/coop.ts` TIDAK
  tersentuh.
- **Pemeriksaan ulang sesi ini (P3 rulings dicatat)**:
  P3-1 `test:all` = **24** suite (regex sederhana undercount 21 --
  nama ber-hyphen tak match `test-[a-z0-9]+`); P3-2 DDL test-shu
  divergen vs engine; P3-3 asymmetry per_member (ops tulis admin/
  manajer, read semua); P3-4 fallback PowerShell exec-policy ->
  jalankan `node node_modules/tsx/dist/cli.mjs` (bukan npx);
  P3-5 hapus ~25 file `_audit_*.txt` + `tmp_*.txt` pra-commit
  (untracked, tak ikut `git add` eksplisit).
### W4.5b LEPAS -- jasa per-anggota 3050 > 2070 + pencairan tunai/transfer 3060 > 1010/1020 (7 Okt 2026)
- **Commit C1 `e7bba07`** (full
  `e7bba07e6078d006cfd125cb6838ba5d7e7a568a`;
  8 file +1235/-10 = 3 A baru + 5 M; dual-push
  master+main, rev-list 0 0):
  (a) **`src/lib/coop-jasa.ts` (BARU, 207 baris)**: op `jasa`
  (Q5: SELURUH pool 3050 dibagi rata-rata ke anggota AKTIF --
  bukan bunga; sisa pembulatan dipas ke urutan nama A-Z; 1
  distribusi/periode -> JASA_PERIOD_EXISTS 409, event-level
  termasuk gl-off, OQ15 D1). Jurnal AGREGAT D3050 > K2070 (1
  kaki debit + 1 kaki kredit per anggota), entry_date = hari
  terakhir periode (leap-aware). Guard: JASA_SHU_MISSING 404,
  JASA_NO_POOL, JASA_NO_ACTIVE. Porsi tercatat di rekap
  sukarela (jenis "jasa"); GL off = tercatat tanpa jurnal.
  (b) **`src/lib/coop-tunai.ts` (BARU, 181 baris)**: op `tunai`
  (OQ7-A: D3060 > C1010 kas / C1020 bank/transfer; nominal tak
  melebihi saldo 3060 -> coop_tunai:exceeds_balance 400;
  TUNAI_NO_POOL; 1 pencairan/periode -> TUNAI_PERIOD_EXISTS 409;
  gl-off = selalu 400). **Akun 5080 TIDAK PERNAH jadi leg
  (invariant saldo 5080 = 0; pencairan bukan beban).**
  (c) 5 M: route.ts (op jasa/tunai di dispatch -- koperasi kini
  10 op; tulis admin+manajer; closing tetap admin-only),
  koperasi-client.tsx (kartu "Jasa per Anggota" + "Pencairan
  Tunai/Transfer" di tab SHU; pengurus read-only), page.tsx,
  glossary.ts (+2 istilah), package.json (+test:coop5b,
  test:all). `scripts/test-coop5b.ts` (BARU, 469 baris;
  JB1-JB8 jasa + JT1-JT4 tunai; 49/49 asersi LULUS).
  Engine `src/lib/coop.ts` TIDAK disentuh; test:all exit 0;
  tsc exit=0; gate GATE=0.
- **Commit C2 `88824a7`** (full
  `88824a74a9b56be5b466c7a9fc68edfddc0f97e3`;
  8 file +36/-10; dual-push rev-list 0 0): 4 docs
  (DOKUMENTASI: ops 8 -> 10 + glosarium 2 istilah + note
  Mekanisme W4.5b; SOP-ADMIN: kartu jasa + pencairan tunai;
  SOP-MANAJER: ops jasa/tunai tulis; SOP-PENGURUS: read-only +
  list) + 4 mirror public/tutorial BYTE-IDENTIK (SHA-256 SAME
  x4; SYNC-TUTORIAL-OK 9 file; eccepsi AKUNTANSI tetap).
  Audit independen DeepSeek 7 Okt: LULUS (diff docs 15 insersi
  100% akurat).
- **OQ1-OQ17 (audit STEP 1 W4.5b)**: OQ7-A = tunai via
  C1010/1020 (5080 keluar dari leg jurnal); OQ9-OQ11 guard;
  OQ13 entry_date akhir periode; OQ15 D1 duplikat event-level.
- **N1 type-fix note**: klaim "tsc OK" era W4.4/W4.5a TIDAK
  akurat; isu type pada lineage itu ditemukan & diperbaiki
  selama W4.5b; per C1 `npx tsc --noEmit` exit=0.
- Pembersihan pra-commit (7 Okt): `src/lib/
  coop-amount-line.txt` (untracked, isi "77") DIHAPUS sebelum
  C1; 3 leftover step-A W4.5a terkonfirmasi hilang.
### W4.5a LEPAS -- modal anggota 3010 + jurnal closing 3020 (7 Okt 2026)
- **Commit `42cf80c`** (full `42cf80c497eaf867866ddd7ddc0d2ed8d8ee9a1f`;
  7 file +1023/-3 = 4 M + 3 A; dual-push master+main; ACC Gus Fi
  via DeepSeek -- audit independen PASSED, 0 must-fix):
  (a) **`src/lib/coop-modal.ts` (BARU, 114 baris)**: op `modal` =
  modal anggota (akun 3010; OQ9: BUKAN simpanan -- tak masuk
  2050/2060/2070, tak bisa ditarik, TIDAK di-refund saat keluar).
  SATU jurnal D1010 -> K3010 hanya saat GL aktif (GL off = tercatat
  saja, pola D1; entryId null). ref_id = 'coop#<member>:md#<savedAt>
  @<amt>#<uuid>' (uuid = DeepSeek NOTE 1, anti-kolisi event
  detik-satu); pre-check event duplikat -> COOP_MODAL_DUPLICATE
  (409); entry_date = saved_at. Validasi amount -> 400 'coop:'.
  (b) **`src/lib/coop-closing.ts` (BARU, 166 baris)**: op `closing`
  (Sek.3.2.6): nol-kan net P&L KUMULATIF all-time (self-healing,
  F-flag2) subset akun 4010/4020/4030 + 5010/5020/5030/5040 --
  4040 (PKGF wakaf) & 4090 (ZIS) DIKECUALIKAN (OQ1/F-flag1) -- ke
  3020 SHU Ditahan; laba = K3020, rugi = D3020 (3020 boleh
  negatif, OQ2); legs net-0 di-skip (OQ9); 1 closing/periode ->
  CLOSING_PERIOD_EXISTS (409), re-post = no-op idempoten, koreksi =
  jurnal pembalik manual (F-flag3, v1); CLOSING_NO_ACTIVITY (400)
  saat semua net = 0 (DeepSeek NOTE 2 -- bukan jurnal kosong);
  entry_date = hari terakhir periode (leap-aware, uji 2024-02-29);
  closing = ADMIN-ONLY (OQ7-B; Manajer 403) + GL off -> 400 gl_off
  (compute saja). Engine `src/lib/coop.ts` TIDAK disentuh
  (ruling W4.5; logika baru di 2 lib terpisah).
  (c) Route `/api/koperasi`: +2 op (modal, closing) + guard
  admin-only closing; UI `/admin/koperasi`: form "Modal Anggota"
  (tab Simpanan) + kartu "Closing Periode" (tab Rekap, admin-only);
  glosarium +2 istilah (Modal, Jurnal Closing);
  `scripts/test-coop5a.ts` (419 baris; M1-M4 + C1-C10 = 56/0,
  termasuk idempoten C6 & leap C9) + test:all (22 suite) exit 0 +
  tsc clean + gate GATE=0 + non-ASCII scan bersih. 2 bug tes
  ditemukan & diperbaiki sebelum commit (asersi M4b, urutan
  capture spec C6 sebelum post -- self-healing menonolkan nets).
- **Commit `96c6fb1`** (full
  `96c6fb13bcc0139576d665336fe629fe5a1d37f6`; 8 file +32/-16,
  docs-only; dual-push master+main): backfill tutorial W4.5a ke
  4 docs peran -- SOP-ADMIN (+h3 Modal 3010 + h3 Jurnal Closing
  3020 + catatan auto-jurnal "+ catat modal"); SOP-MANAJER
  (modal = write tersedia; closing = khusus Admin, form
  tidak ada); SOP-PENGURUS (read-only; rekap tampil 3010/3020 +
  baris closing); DOKUMENTASI-APLIKASI (tabel ops 6 -> 8 + 2 baris
  modal/closing + note akses (closing 403 utk Manajer) + glosarium
  2 istilah + mekanisme W4.5a) + 4 mirror public/tutorial
  (byte-identik, SYNC-TUTORIAL-OK 9 file, 0 script tag).
- **Gate lulus**: `public/sw.js` UNCHANGED; engine
  `src/lib/coop.ts` UNCHANGED; V1 `laporan-admin-client.tsx`
  UNCHANGED.
- NEXT = **W4.5b** (jasa per anggota rata-rata (Q5; konservatif,
  BUKAN bunga) + pencairan tunai/transfer SHU (akun 5080)).
  W4.6 = rekap per rumpun.

### W4.4b LEPAS -- backfill tutorial W4.3 Koperasi (setor/tarik/keluar) ke 4 SOP peran + DOKUMENTASI (7 Okt 2026)
- **Commit `cde17ac`** (full `cde17ac80294543d24ea1d83db554c567ad5ece5`;
  8 file +52/-4 = 8 M, docs-only; dual-push master+main; ACC Gus Fi
  via DeepSeek -- audit independen PASSED, 0 must-fix):
  Menutup gap tutorial W4.3 Koperasi (instruksi permanen) di
  4 docs peran (docs/) + 4 mirror public/tutorial (byte-identik,
  diverifikasi hash):
  (a) Tabel ops lengkap: 6 op (member_create, setor, tarik,
  status, keluar, shu) + rekap akun D2050/2060/2070 +
  K1010/3020/3030/3040/3050/3060; GL on/off konsisten; error
  code 400 (validasi) / 409 (konflik).
  (b) KELUAR = status terminal + refund pokok D2050 -> K1010;
  setoran wajib + sukarela TIDAK dikembalikan.
  (c) "Anggota koperasi" != "member" loyalty (Sek.7.3)
  tercatat eksplisit.
  (d) Form SHU tersembunyi utk pengurus (write-guard
  admin/manajer); penomoran seksi stabil (tanpa #8/#10).
  Jumlah baris tambahan per file: SOP-ADMIN +8, SOP-MANAJER +2,
  SOP-PENGURUS +3, DOKUMENTASI-APLIKASI +13 (docs; mirror
  identik). 0 tag <script> di 4 docs; semua baris tambahan
  murni ASCII; ikon hanya inline SVG.
- **Gate lulus**: sync-tutorial OK (byte-identik 4 pasang);
  `public/sw.js` UNCHANGED; engine `src/lib/coop.ts`
  UNCHANGED; V1 `laporan-admin-client.tsx` UNCHANGED.
- NEXT = **W4.5** (modal akun 3010 + closing journal
  Sek.3.2.6 + jasa per anggota rata-rata (Q5) + tunai 5080;
  rekon #16 ke W5.2). W4.6 = rekap per rumpun.

## 2026-10-06
### W4.4 LEPAS -- SHU distribusi (rasio input admin + 1 jurnal alokasi) (6 Okt 2026)
- **Commit `a141211`** (full `a141211abe8c4b9a09d725ce14e3907397e9ca46`;
  16 file +1045/-9 = 14 M + 2 A; dual-push master+main; ACC Gus Fi
  via DeepSeek -- audit independen 0 must-fix):
  (a) **`src/lib/shu.ts` (BARU, 215 baris)**: distribusi SHU, rasio
  input admin -- TANPA angka default (Sek.13 / PKGF sisi-pasif,
  keputusan #13.4). Alur OQ1=A (Sek.7.2.2): SATU jurnal alokasi
  D3020 (SHU Ditahan) -> K3030/3040/3050/3060 (cadangan umum /
  khusus, jasa, dibagi); 3 porsi dibulatkan (round(total*pct/100)),
  porsi "dibagi" = residu (total - SUM 3 porsi) sehingga SUM 4
  porsi SELALU = shu_total -> D=K terjamin. entry_date = AWAL
  PERIODE (period+'-01'), bukan tanggal posting (ruling correction
  2; jejak audit ke periode). Idempoten: ref_table='coop',
  ref_id='coop#shu#<period>', UNIQUE(ref_table,ref_id,type).
  Periode unik -> SHU_PERIOD_EXISTS (route map 409; koreksi =
  jurnal pembalik, BUKAN hapus). GL off = tercatat di coop_shu
  tanpa jurnal (pola D1). Guard input: SHU_PERIOD_INVALID
  (YYYY-MM) / SHU_TOTAL_INVALID / SHU_RATIO_INVALID / SHU_RATIO_SUM
  (SUM 3 rasio <= 100). Jasa per anggota (bobot rata-rata,
  keputusan Q5, konservatif, BUKAN bunga) + tunai/transfer (akun
  5080) = **W4.5** (ditunda setelah W4.4 -- skema D1).
  (b) **route `/api/koperasi` op `shu`**: guard tulis 403 (tier
  'koperasi' ATAU 'shu' = admin+manajer; pengurus/role lain =
  read-only); validasi -> 400; duplikat periode -> 409
  shu_period_exists; semua tulis SATU tx (engine + logAudit, pola
  W2.7/W3.3) + invalidate('coop:') dan invalidate('gl:').
  (c) **UI `/admin/koperasi`**: tab ke-4 "SHU" (tab "Rekap & SHU"
  jadi "Rekap"; riwayat SHU pindah ke tab SHU; baris lama tanpa
  rasio = "distribusi = W4.4"). Form: periode YYYY-MM + SHU total +
  3 input persen (cad umum / khusus, jasa) + porsi "dibagi" auto +
  pratinjau Rupiah live + tombol "Catat Alokasi SHU"; gate
  `canWrite` (mode baca = form tersembunyi). E.4: 4 kode validasi
  dipetakan ke toast polos. E.5: `useTablistNav` (arrow + Home/End,
  pola APG, sama dgn POS).
  (d) **Tutorial/docs**: seksi "Koperasi & SHU" di 4 docs
  (SOP-ADMIN +28, SOP-MANAJER +24, SOP-PENGURUS +17,
  DOKUMENTASI-APLIKASI +21) + 4 salinan public/tutorial (salin
  polos, IDENTIK via hash) + `glossary.ts` 6 istilah baru ("Koperasi
  & SHU": SHU / Cadangan Umum / Cadangan Khusus / Jasa Anggota / SHU
  Dibagi / Rasio Alokasi) + `glosarium-client.tsx` (GROUP_ORDER +
  "Koperasi & SHU") + `features.ts` `'shu': ['admin','manajer']` +
  TIPS 6 term di `koperasi-client.tsx` + `package.json` test:shu
  (masuk chain test:all).
  (e) **`scripts/test-shu.ts` (BARU, 327 baris)**: self-contained
  (in-memory node:sqlite; DDL journal/coop_shu mirror db.ts; TIDAK
  bergantung test-coop.ts -- file itu tak bisa dibaca/diedit di
  sesi awal). 45 assert: S1 hitung (round + residu; SUM 4 porsi =
  shu_total), S2 guard (total/periode/rasio + kasus positif),
  S3 GL-on (4 kaki D=K + ref_id + entry_date + rasio_json),
  S3b rasio 0/0/0 (hanya 2 kaki), S4 UNIQUE(period) + idempoten
  postJournalInTx, S5 GL-off (1 baris, 0 jurnal).
- **Gate lulus**: tsc --noEmit exit 0; test:shu 45/0; regresi aman
  (hanya 16 file W4.4 yang berubah); 0 non-ASCII di file baru
  (3 section-sign + 7 sigma di shu.ts ketahuan saat audit STEP 6
  -- dihapus, diganti "Sek."/"SUM" SEBELUM commit);
  `public/sw.js` + V1 `laporan-admin-client.tsx` + engine
  `src/lib/coop.ts` UNCHANGED.
- NEXT = **W4.5** (modal akun 3010 + closing journal Sek.3.2.6 +
  jasa per anggota rata-rata (Q5) + distribusi tunai/transfer akun
  5080; rekon #16 ke W5.2). **W4.4b** = backfill tutorial W4.3
  Koperasi -- commit TERPISAH setelah W4.4. W4.6 = rekap per
  rumpun. Setelah W4 habis = **W5 penguatan** (PINJ-1 pinjaman
  anggota -- tashih qardh/murabahah).

### W4.3 LEPAS -- API + UI koperasi (pola /api/akad, engine W4.2) + R-suite (6 Okt 2026)
- **Commit `d3865a2`** (full `d3865a2b41f64590f50fa6a4cee812dce8446033`;
  7 file +1510, dual-push master+main; ACC Gus Fi via DeepSeek --
  7 audit item ternyata FALSE POSITIVE; verifikasi benar =
  against w43-full-diff.txt (NO_HITS):
  (a) `src/app/api/koperasi/route.ts` = WIRING ONLY ke engine W4.2
  `@/lib/coop.ts` (5 fungsi *InTx). Rekap = 9 akun COA 4-digit
  W4.1 (2050/2060/2070 + 3010-3060), SUM(debit)-SUM(credit).
  Withdraw = 1 baris negatif (tanpa UPDATE/double-count). TIDAK
  ada addJv / coop_savings_jv / coop_savings.cat / settings.
  (b) UI `/admin/koperasi` (page.tsx + koperasi-client.tsx,
  SVG-only icons, guard admin) + sidebar/features/glossary.
  (c) **R-suite** `scripts/test-coop.ts` (+155, R1-R5, 25 assert):
  R1 rekap 9 akun (tak ada 5-digit); R2 setor D1010 ->
  K2050/2060/2070; R3 tarik = 1 baris -3000 (tak ada
  double-count); R4 keluar refund D2050 -> K1010 + status
  terminal + re-keluar no-op; R5 galat 404/409/400.
- **Gate lulus**: test-coop 116/0 (M+C+R); test:all HAS_FAILURE=0;
  tsc --noEmit 0 error; check-route-exports 0; next build 59/59.
  0 non-ASCII. `public/sw.js` + V1 `laporan-admin-client.tsx` +
  engine `src/lib/coop.ts` UNCHANGED.
- NEXT = **W4.4** (SHU: hitung input + rasio Sek.7.2 + posting
  distribusi). W4.5 = modal + closing. Setelah W4 habis =
  **W5 penguatan** (PINJ-1 pinjaman anggota).

### W4.2 LEPAS -- lib/coop.ts engine simpanan koperasi (6 Okt 2026)
- **Commit `fce2531`** (full `fce25314a907241aa3f62194111f24210da2a38e`;
  2 file +591/-2: `src/lib/coop.ts` (BARU, 367 baris) +
  `scripts/test-coop.ts` (+224/-2, C-suite); ACC Gus Fi via DeepSeek,
  audit independen 0 must-fix):
  (a) Engine simpanan Sek.7.2.3: setor `recordCoopSavingsInTx`
  D1010 -> K2050/2060/2070 per kind; tarik sukarela
  `recordCoopWithdrawInTx` D2070 -> K1010 + Option A (ruling 6 Okt):
  baris NEGATIF di coop_savings (guard sisa = SUM >= 0, selain itu
  throw); keluar `recordCoopMemberKeluarInTx` refund POKOK saja
  D2050 -> K1010 (wajib/sukarela TIDAK dikembalikan -- literal
  Sek.7.2.3) + status keluar TERMINAL (re-aktif ditolak; re-keluar
  = no-op, tidak ada refund kedua).
  (b) Pola lib/akad.ts: 0-preset (semua nominal = input admin),
  validasi ketat (anggota ada, kind, status, amount > 0),
  postJournalInTx idempoten (ref_id F1 per event:
  `coop#<id>:sv|wd|exit#...`), ref_table='coop', D1: gl-off = zero
  GL behavior change (event selalu tercatat di tabel; jurnal hanya
  saat gl_enabled='1').
  (c) Anggota: `createCoopMemberInTx` (status awal 'aktif';
  UNIQUE(name) clash -> throw) + `setCoopMemberStatusInTx`
  (aktif <-> nonaktif bebas; keluar = terminal) + helper saldo
  `coopSavingsBalance` (SUM aljabar termasuk baris negatif) +
  `coopKindAccount` (mapping kind -> 2050/2060/2070).
- **4 deviasi (diaudit, DDL-literal, di-ACC)**:
  1. coop_members tanpa kolom created_by/created_at (DDL v24
     literal Sek.7.1; audit trail via journal_entries
     ref_table='coop').
  2. Bug di TEST suite C4 (tarik sukarela sebelum setor) --
     di-fix di test, bukan lib.
  3. Konvensi balance_running `prev + (debit - credit)`: akun
     liabilitas NEGAT saat kredit (asersi C1 disesuaikan).
  4. Validasi kind selalu jalan walau gl-off (D1: event terekam
     = valid).
- **Gate lulus**: test-coop 91/0 (M-suite + C1-C6); regresi
  test-gl 102/0 + test-akad 175/0; tsc --noEmit 0 error; 0
  non-ASCII di file berubah; `public/sw.js` + V1
  `laporan-admin-client.tsx` + db.ts + package.json tak tersentuh.
- NEXT = **W4.3** (UI /admin/koperasi + API; absorb rekap W4.1 Q2
  ke tab Rekap). W4.4 = SHU, W4.5 = modal + closing.

## 2026-10-05
### W4.1 LEPAS -- skema v24 koperasi Level C (5 Okt 2026)
- **Commit `b9c0ae5`** (full `b9c0ae5ddfead632d127cfa6508826d076c6fae`;
  3 file +353/-9: `src/db.ts` + `scripts/test-coop.ts` (baru,
  M-suite) + `package.json` (+`test:coop`, masuk test:all 21
  suite); ACC Gus Fi via DeepSeek, audit independen 0 must-fix):
  (a) DDL 3 tabel koperasi Sek.7.1 (proposal) literal + rumpun
  (ruling Q4): `coop_members` (UNIQUE name, kolom rumpun),
  `coop_savings` (PK komposit member_id,kind,saved_at,amount),
  `coop_shu` (UNIQUE period) + index `idx_coop_savings`; murni
  aditif (IF NOT EXISTS).
  (b) Flip COA 6 akun `pending -> open` (3020/3030/3040/3050/3060/5080)
  -- 2 layer: seed array (fresh install) + UPDATE eksplisit di
  upgrade path (DB v23 lama; seed INSERT ON CONFLICT DO NOTHING
  tak menimpa baris lama). `2080` (SHU Berjalan) sengaja tetap
  pending (ruling Q6).
  (c) SCHEMA_VERSION 23 -> 24 + komentar header.
- **Rulings Q1-Q6 diterapkan di skema** (teks lengkap = pesan
  audit DeepSeek W4.1, 5 Okt): Q4 = DDL literal Sek.7.1 + kolom
  rumpun; Q6 = 2080 tetap pending; M-suite mencover keduanya +
  kontrol (PRAGMA per kolom, UNIQUE, PK komposit, index, COA
  count, 6 flip, 2080, upgrade path, stamp).
- **Gate lulus**: test-coop 45/0; regresi test-akad 175/0;
  test:all 21 suite RC=0, 0 gagal; tsc 0; 0 non-ASCII;
  `public/sw.js` + V1 `laporan-admin-client.tsx` tak tersentuh.
- **Backup DB pre-deploy (gate STEP 1)**:
  `data/backup-2026-10-05T06-20-56.sql` (47.720 byte = 46,6 KB,
  34 tabel, baseline skema v13 dev lokal) -- run awal crash
  karena bug row-index libsql di `scripts/backup-db.mjs`
  (`r.name[0]` = karakter pertama 'a' -> "no such table: a");
  fix commit `30a3ae5` (`r[0]` + iterasi `data.columns` +
  gitignore `data/backup-*.sql`).
- **STATE (verify live git, 5 Okt)**: W4.1 `b9c0ae5` dual-push
  master+main; ops-fix `30a3ae5`; entri docs ini = HEAD lokal
  (dual-push + ls-remote terverifikasi; dua ref sama).
- **NEXT = W4.2** (SELESAI 6 Okt, commit `fce2531`, lihat seksi
  2026-10-06); menyusul W4.3 (UI), W4.4 (SHU),
  W4.5 (modal + closing). **W5: + PINJ-1 (pinjaman anggota)** --
  tashih qardh/murabahah, akun COA baru, sumber dana (dicatat
  5 Okt; menunggu ruling/ACC Gus Fi; TIDAK dieksekusi sebelum
  approval).
- **Rulings Q1-Q3/Q5 -- amend docs (5 Okt; teks lengkap via pesan
  Gus Fi setelah audit W4.1; konteks awal Cline tak memuat
  ruling set ini, kini dicatat utuh)**:
  - **Q1 PINJAMAN: TUNDA ke W5 (PINJ-1).** Tidak ada di
    proposal Sek.7/12. Belum ada akun COA untuk pinjaman
    anggota. Shariah-first: perlu tashih (qardh? murabahah?
    sumber dana?) sebelum dieksekusi.
  - **Q2 LAPORAN: ABSORB ke W4.3 UI (tab Rekap).** 5 laporan
    formal sudah ada (W2.2-W2.6); koperasi tidak menambah
    entitas laporan terpisah -- rekap ditampilkan di tab
    Rekap W4.3.
  - **Q3 INTEGRASI: SETUJU.** GL posting built-in di setiap
    commit (pola D1, ref_table + ref_id per event). Rekon
    #16 masuk W5.2. W4.5 = modal (akun 3010) + closing
    journal (Sek.3.2.6).
  - **Q5 BOBOT JASA ANGGOTA: RATAAN (konservatif).** PKGF
    Sek.2.3 tidak men-set bobot; memakai nilai rata-rata =
    tanpa asumsi (tidak mengarang pembobotan). Manual
    override dimungkinkan kemudian jika ada ruling.


### OFF-1 PHASE 1 LEPAS -- offline read-only POS (cache snapshot + banner) (5 Okt 2026)
- **Commit `14d07d4`** (full `14d07d4601e02a4ac0708a2e6847859631634321`,
  1 file `src/components/pos-client.tsx` +133/-3; parent `68c36a7`;
  ACC Gus Fi via DeepSeek; manual test PASS Gus Fi 5 Okt):
  (a) snapshot POS (produk + kategori + member + member settings)
  disimpan ke localStorage key `kopontren_pos_cache_v1` tiap load
  live sukses (~300 KB, jauh di bawah kuota 5 MB); bila fetch
  gagal (offline), state terhidrasi dari cache + banner amber
  "OFFLINE -- data mungkin tidak terbaru (data per <stempel>)";
  banner di-reset saat load live sukses. Ref mirror (pola
  `queueRef`) utk products/categories/members.
  (b) handler 'online': `void flushQueue().then(() => void load())`
  + `void loadMembers()` -- flushQueue sendiri memanggil load()
  SETELAH sinkron; .then() menjamin load selalu jalan (termasuk
  saat queue kosong -> early-return) TANPA race (load paralel
  pra-flush bisa menulis cache stok lama berstempel fresh).
  (c) banner "Mode offline -- POS tetap berjalan. Transaksi akan
  tersimpan & tersinkron otomatis." (existing) tetap tampil.
- **Keputusan PII (TERDOKUMENTASI)**: cache localStorage memuat
  member (nama + phone = PII) -- keputusan sadar utk terminal
  kasir (device terkontrol); trade-off = POS tetap bisa baca data
  cadangan saat offline; tercatat di komentar kode + entry ini.
- **DITUNDA ke Phase 2**: (1) Plan B -- banner global offline di
  `shell.tsx` (sudah dicukupi banner per-halaman + existing
  "Mode offline" banner); (2) F3 -- refresh member-settings saat
  reconnect (saiki settings hanya difetch saat mount; reconnect
  hanya reload members + products/stock); (3) offline lebih luas
  (member/reports).
- **Manual test PASS (Gus Fi, 5 Okt 2026)**: DevTools Offline,
  cold start /kasir -- produk + stok tampil dari cache (Sajadah,
  buku batik, parfum oil, plastisin, solasi nachi, sticky note;
  stok 1/9/14 pcs dst), banner "Mode offline -- POS tetap
  berjalan" tampil. Catatan MINOR: banner cache "OFFLINE -- data
  mungkin tidak terbaru" mungkin belum tampak saat test (first
  visit = cache kosong, `loadPosCache()` null; banner hanya
  muncul bila state terhidrasi dari cache setelah fetch gagal)
  -- bukan blocker; verifikasi lanjut opsional: scan barcode +
  cart offline, checkout -> queue, back-online -> sinkron.
- CONSTRAINT dipatuhi: `public/sw.js` + V1
  `laporan-admin-client.tsx` tak tersentuh; ASCII-only (0
  non-ASCII); ikon SVG inline; dual-push + verify.
- **STATE (verify live git, 5 Okt)**: `origin/master` =
  `origin/main` = local HEAD = `14d07d4`.
- **NEXT = WAVE 4 (Koperasi)** -- OFF-1 Phase 2 menyusul.

## 2026-10-04
### FOLD NON-ASCII 8 UI LEPAS (4 Okt 2026)
- **8 file UI** (lib/format.ts,
  pengurus/dashboard,
  admin/member-client.tsx,
  admin/produk-client.tsx,
  admin/qris-client.tsx,
  command-palette.tsx,
  key-cheatsheet.tsx,
  pos-client.tsx) dibersihkan 22
  glyph non-ASCII (commit ini,
  parent 9247ab6; precedent B3
  659a6b3). Map: em-dash `--`
  (konvensi B3), ellipsis `...`,
  arrow `->` di komentar / `&gt;`
  di JSX text (`->` bikin
  TS1382), minus/en-dash `-`,
  rule komentar `-`, kunci
  `Up/Down`, middot `|`, sigma
  `sum`, `sm+`, "Beli jumlah
  minimum ke atas dapat diskon",
  `stok +/-`, bintang poin &
  emoji di-drop (tetap `N
  poin`). kpiDelta ditulis ulang
  bahasa-awam: `+12% vs
  kemarin` / `stabil vs
  kemarin` / `baru vs
  kemarin` / `+N baru, 30 hari
  ini`. Gate: tsc 0; test:all
  exit 0 (20 suite); scan
  8-file = 0 non-ASCII; next
  build OK. LESSON: test repo =
  20 script node di scripts/ via
  `npm run test:all`, BUKAN
  jest (`npx jest` = 0 test
  found).

### W3.x HOUSEKEEPING (B3/U1/U2) LEPAS (4 Okt 2026)
- **Commit `659a6b3`** (2 file +18/-12; ACC Gus Fi via
  DeepSeek, W3 FULL AUDIT): (B3)
  `src/app/api/konsinyasi/route.ts` -- 9 non-ASCII
  (8 em-dash + 1 ellipsis) -> ASCII `--`/`...` (B3
  strict-ASCII); (U1) copy zis-client: "Wakaf masuk:
  auto-jurnal D1120/K4100; wakaf keluar: manual (W3.5)";
  (U2) `statusBadge` zis-client distinguishes wakaf
  masuk (posted=green, GL off=gray, unposted=red) vs
  wakaf keluar unposted+GL on=amber "jurnal manual
  (W3.5)". 2 user-visible error strings em-dash -> `--`
  (semantics unchanged). Gate: tsc 0; test:all 20
  suite ALL PASS; 0 non-ASCII in both file. Dual-push
  `659a6b3`.
- **B1/B2/B4 ditunda ke W5 penguatan** (ruling Gus
  Fi 4 Okt): B1 posisi `pilihPeriode()` ignore
  `?periode=`; B2 zis-client double-POST; B4
  `laporan.formal` re-export non-idempoten.
- **NEXT = UX-1 BAHASA AWAM wave** (P1 laporan
  formal+akad+ZIS, P2 POS+konsinyasi+member; P3
  rekonsiliasi ditunda ke UX-2). FOLD pre-existing
  non-ASCII UI SELESAI (section FOLD di atas).
  Reuse `TermTip` (UX-3,
  sudah ada `ui.tsx`, a11y hover/pin/ESC) -- TIDAK
  bikin komponen tooltip baru. Glosarium page
  `/admin/glosarium` + `src/lib/glossary.ts`
  (E39 pattern). E23/E24 dicheck saiki. UX-1
  SEBELUM Wave 4 Koperasi (ruling: report tabs =
  permukaan sing bakal di-extend W4).
- **STATE `659a6b3`**: `origin/master` =
  `origin/main` = local HEAD = `659a6b3`.

### W3.5 LEPAS + LKA/POSISI ALIGN -- Wave 3 = 5/5 + rekonsiliasi universal (4 Okt 2026)
- **W3.5 LEPAS (commit `19a7d66`)**: ZIS auto-posting
  wakaf (in) -> jurnal D1120/K4100 via `recordZisInTx`
  (gated `gl_enabled`). test-zis +W10 (in wakaf ->
  jurnal 1 line + idempoten `UNIQUE(zis.id)`); test-gl
  +W8. Gate: tsc 0; test-zis 205/205; test:all 20 suite.
- **LKA + POSISI ALIGN LEPAS (commit `127b58d`, 5 file
  +148/-11)**: rekonsiliasi universal
  `lka.laba_bersih` == `posisi.laba_rugi_berjalan`:
  (a) LKA: blok pendapatan lain 4050-4100 (akad
  ijarah/murahabah + wakaf masuk) ditambahkan ke
  `laba_bersih`; 4040 (ujrah) = MEMO -- income pemilik,
  TIDAK masuk laba/rugi (P4 tashih, A1.1 LEPAS);
  (b) Posisi: 4040 dieksklusi dari PENDAPATAN + 6030
  (zakat keluar) masuk BEBAN (Sek.5.2);
  (c) `api/laporan/formal` + `laporan-formal-client.tsx`
  (blok Other Income LKA + label posisi + notes);
  (d) test-laporan +LE/LE2 (193 -> 197 assert).
  Dibuktikan: LE (tanpa 4040/6030) 3.100.000 ==
  3.100.000; LE2 (dengan 4040 + 6030) 1.070.000 ==
  1.070.000. Strictly additive (0 -> byte-identik);
  sign convention preserved (4xxx kredit, 5xxx/6xxx
  debit). Gate: tsc 0; test-laporan 197/197; test:all
  20 suite green; 0 non-ASCII; sw.js + V1 tak
  tersentuh.
- **STATE (verify live git, 4 Okt)**: `origin/master` =
  `origin/main` = local HEAD = `127b58d`.
- **NEXT = W3 FULL AUDIT** (bug + UX + UI, W3.1-W3.5
  termasuk LKA fix) WAJIB SEBELUM WAVE 4 (standing
  rule) -- menunggu ruling Gus Fi.

## 2026-10-03
### W3.4 LEPAS + Gate B + Vercel route-export fix + skema v21->v23 (3 Okt 2026) -- Wave 3 = 4/5
- **W3.4 LEPAS (commit `4199bcf`, 6 file +281/-38)**: bridge
  wakalah via konsinyasi + settlement GL (OQ-7 Option C,
  konsinyasi end-to-end). (a) `src/lib/akad.ts` +50: bridge wakalah
  auto-posting + settlement konsinyasi GL (goods-receipt D1040/K2020
  + settlement D2020/K1010, akad ju'alah); (b)
  `src/app/api/konsinyasi/route.ts` +15 hook wiring; (c)
  `scripts/test-akad.ts` +87 coverage settlement GL. OQ-7 RESOLVED
  (settlement D2020/K1010 kini dipost).
- **GATE B = `scripts/check-route-exports.mjs` (115 baris, BARU)**
  + `package.json` +2: guard anti value-export di route file
  Next.js App Router (route file hanya boleh HTTP handler + config
  key; extra value-export gagal `next build` di `.next/types`
  type-check). Pemicu = Vercel fix `f9f613c`.
- **Vercel route-export fix `f9f613c` (2 file +13/-2)**: de-export
  `GL_NOTES` (`/api/gl`) + `FORMAL_NOTES` (`/api/laporan/formal`).
  Root cause: Next.js App Router route file hanya boleh HTTP
  handler + config key (runtime/dynamic dsb); extra value-export
  gagal `next build` di `.next/types`. Local `tsc --noEmit` EXIT 0
  (tak menjalankan build) -> bug baru keliatan di Vercel. Gate B
  nunjukin kelas bug iki.
- **Skema v21->v23 (migration range)**: v21 = GL baseline W1.1
  `3eaf906` (coa 52 + journal_entries/journal_lines + gl_enabled);
  v22 = ZIS W2.7 `488d679` (tabel zis); v23 = akad W3.1 `51b6db8`
  (modul akad + akad_events + flip 9 COA). Current `SCHEMA_VERSION
  = 23` @ `src/db.ts` (line 1081).
- **STATE CORRECTION (verify live git, 3 Okt)**:
  - remote `origin` = `https://github.com/kita-foska/kopontren.git`
    (single remote; org `kita-foska` / repo `kopontren`; HTTPS).
  - `origin/master` = `origin/main` = `origin/HEAD` = `4199bcf`
    (HEAD -> master). Pengembangan tetap di branch `master`.
  - local `main` = **16 commit behind** `origin/master`
    (`git rev-list --count main..origin/master = 16`; main lokal
    tak di-fast-forward -- remote main sudah @ `4199bcf`). Angka
    16 terverifikasi (bukan 14).
- **Progres Wave 3 = 4/5**: W3.1 `51b6db8` + W3.2 `e56736f` +
  W3.3 `b5a4bb9` + W3.4 `4199bcf` (selesai); sisa W3.5 = jurnal
  manual 1120/4100/6020.

## 2026-10-01
### P3 ZAKAT TIJARAH LEPAS (1 Okt 2026) -- Soal 3 final + sitasi MUI dihapus
- **P3 Soal 3 (modal / `valuation_mode`) = RESOLVED â†’ Opsi B FINAL**
  (commit `66a619b`, C1): modal + untung, harga pasar saat jatuh haul;
  `valuation_mode` = market FINAL.
- **Sitasi fatwa MUI dihapus dari semua dokumentasi** (commit `ddd35e1`, C2):
  fatwa MUI TIDAK DICANTUMKAN (nomor MUI utk zakat belum
  terverifikasi; no. lama = fatwa musyarakah, domain DSN-MUI, tak berlaku
  utk zakat). Basis tashih kini = mayoritas ulama (Syafi'i / Maliki /
  Hanbali) + Muktamar NU ke-35 (nisab 85 g emas murni 24K). grep
  grep nomor fatwa MUI = 0 di semua file.
- **Snapshot + mirror ter-regenerate** (C3): `docs/AKUNTANSI-PROPOSAL.html`
  + re-sync `public/tutorial/akuntansi-proposal.html` via
  `node scripts/sync-tutorial.mjs` (SYNC-TUTORIAL-OK, 9 file), 0 MUI.
- **P3 LEPAS / SELESAI**: semua open item P3 TERJAWAB -- Soal 3 = Opsi B;
  verifikasi MUI = RESOLVED-removed (jadi catatan basis). Sisa P3 =
  implementasi spesifikasi F3.4+ (R6, commit terpisah); P4 konsinyasi
  tetap open (E25 dasar ujrah V1).

### F3.4+ W1.4: admin GL + Jurnal UI - SELESAI 1 Okt 2026 (commit `f28579a`, dual-push master+main)
- **8 file (+1147/-12; 6 baru + 2 ubah)**: pages
  `/admin/gl` + `/admin/jurnal`, API routes `/api/gl` +
  `/api/jurnal`, client `gl-client.tsx` + `jurnal-client.tsx`
  (list, detail, manual, reversal helper) + `sidebar.tsx`
  (menu baru). `src/lib/jurnal.ts` (engine W1.3) tak diubah.
- **Gate pre-commit bersih**: `tsc --noEmit` exit 0;
  `test:invariants` 0 gagal; 0 non-ASCII di 8 file;
  `public/sw.js` + file V1 tak tersentuh; ref remote
  `origin/master` + `origin/main` identik @ `f28579a`.
- **Progres Wave 1 (roadmap Â§12 proposal)**: W1.1 `3eaf906`
  (skema v21 coa 52 + jurnal); W1.2 `105b04e` (GL read-side
  `lib/gl.ts`); W1.3 `2ef3002` (auto-posting Wave 1, gated
  `gl_enabled`); W1.4 `f28579a` (UI); W1.5 `6d23e91` (rekon #15
  `JOURNAL_BAL` + #17 `GL_TZ`; #16 `GL_CASH` tetap W5.2)
  - **WAVE 1 = 5/5 LEPAS**.

### F3.4+ W1.5: rekon #15 JOURNAL_BAL + #17 GL_TZ - SELESAI
1 Okt 2026 (commit `6d23e91`, dual-push master+main)
- **4 file (+185/-17)**: `lib/rekonsiliasi.ts` (#15:
  per-entry `SUM(debit)=SUM(credit)` + orphan `journal_lines`
  + global D-K = 0; #17: semua `journal_entries.entry_date`
  berakhiran +07:00; 14 -> 16 cek, flag-only read-only) +
  `test-rekonsiliasi.ts` (SCHEMA + tabel journal_entries/
  journal_lines; seed sehat 2 entry seimbang +07:00; fase
  korup: entry tak seimbang + entry tanggal UTC;
  drift_total 16 -> 19) + `rekonsiliasi-client.tsx` (COLS 2
  cek baru) + `docs/qa/DATA-INVARIANTS.md` (invariant GL-1/
  GL-2; celah nomor #16 = `GL_CASH` ditunda W5.2).
- **Gate bersih**: `tsc --noEmit` exit 0; `test:rekon` +
  `test:gl` lulus; `test:all` semua 17 suite lulus (incl.
  golden + invariants E2E); 0 non-ASCII di 4 file; `public/
  sw.js` + file V1 tak tersentuh; ref remote `origin/master`
  + `origin/main` identik @ `6d23e91`.

### F3.4+ W2.1: auto-posting GL debt/payable/returns/ujrah - SELESAI
1 Okt 2026 (commit `ca0f39f`, dual-push master+main)
- **6 file (+350/-5)**: `src/lib/jurnal.ts` (5 builder auto:
  `journalForDebtPayment` D1010/K1030; `journalForPayablePayment`
  D2010/K1010; `journalForSalesReturn` D4030+D1040/K(cash|1030)+
  K5020; `journalForPurchaseReturn` D2010/K1040 at cost
  (builder-only, belum di-wire V1); `journalForConsignmentUjrah`
  D1010/K4040; + konstanta ACCT `HUTANG_KONSINYASI` 2020 /
  `RETUR_HPP` 5020; + helper `nowWib()` (rekon #17); + `JSpec.type`
  6 tipe baru) + 4 route hook (gated `gl_enabled === '1'`,
  `postJournalInTx` dalam tx V1): `api/debts/[id]` (PATCH pay),
  `api/payables/[id]` (PATCH pay), `api/returns` (POST),
  `api/konsinyasi` (aksi sell = ujrah) + `scripts/test-gl.ts`
  (fase W1-W7, +37 assert).
- **OQ-7 Option C (1 Okt, ruling Gus Fi)**: settlement konsinyasi
  D2020/K1010 + goods-receipt D1040/K2020 DITUNDA ke W3/W4 (posting
  settlement sendirian bikin 2020 tak rekonsiliasi -> drift
  JOURNAL_BAL #15). W2.1 HANYA post ujrah saat sell;
  `HUTANG_KONSINYASI` (2020) tetap di COA/ACCT, idle di W2.1.
- **Gate bersih**: `tsc --noEmit` exit 0; `test:gl` 98 ok / 0 fail
  (103 -> 98 = blok W6 settlement dihapus); 0 non-ASCII;
  `public/sw.js` + file V1 tak tersentuh; ref remote
  `origin/master` + `origin/main` identik @ `ca0f39f`.
- **Progres Wave 2 (roadmap 12)**: W2.1 `ca0f39f` (auto-posting
  debt/payable/returns/ujrah). **WAVE 2 = 1/7**.
  - W2.7 (governance): flip COA `4040` (ujrah) `pending -> open`.
  - W3/W4 (konsinyasi end-to-end, OQ-7 Option C): goods-receipt
    D1040/K2020 + settlement D2020/K1010 (re-introduce tipe
    `consignment_settle` + builder + hook aksi pay).

### F3.4+ W2.2: Laporan Posisi formal (Neraca) + API + shell tab /admin/laporan - SELESAI
1 Okt 2026 (commit `d91dbd0`, dual-push master+main)
- **6 file (+779/-12)**: 4 baru + 2 ubah:
  `src/lib/laporan/posisi.ts` (modul import-free `buildPosisi(db,at)`:
  neraca kumulatif s.d. `at`; aset lancar 1010..1110; aset tetap neto
  = 1050 - 1060 (akumulasi kredit-normal, sign fix 1060 = kredit-debit);
  investasi syariah 1080/1090; wakaf memo 1120/6020 TIDAK dijumlahkan
  ke total; kewajiban lancar/anggota/ZIS; ekuitas 3010-3070;
  laba/rugi berjalan = SUM 4xx - SUM 5xx; total_ekuitas_menutup =
  total_ekuitas + laba_rugi_berjalan; D=K = SUM(debit)=SUM(credit) s.d.
  `at` -> `flag_rekon15` (proxy rekon #15 JOURNAL_BAL TANPA import
  rekonsiliasi.ts)) + `src/app/api/laporan/formal/route.ts` (GET
  `?report=posisi&as_of=YYYY-MM-DD`; guard tier `laporan`; batas
  kumulatif `at = nextDay(asOf)` (entry_date < at); cache 60 dtk prefix
  `lapformal:`; `as_of` default hari ini WIB via `wibToday()`;
  try/catch -> JSON 500 tak bocor HTML; `FORMAL_NOTES` 5 item;
  dispatch report lain (laba-rugi/LPE/LAK/CALK) menyusul)
  + `src/components/admin/laporan-formal-client.tsx` (shell tab
  "Laporan Posisi" + "Laporan V1 (arsip)"; panel neraca + badge D=K +
  auto-posting + kopontren; warning merah bila D!=K + link
  /admin/rekonsiliasi; V1 di-lazy via `dynamic()`, file V1 tak diubah)
  + `scripts/test-laporan.ts` (harness `node:sqlite` in-memory, 4 fase:
  (A) seimbang (B) batas periode kumulatif (C) tak seimbang flag
  (D) DB kosong; 37 assert) + `page.tsx` (+5/-11 ->
  `LaporanFormalClient`, V1 di-impor lazy) + `package.json` (+2/-1:
  `test:laporan` + `test:all`).
- **Gate bersih**: `tsc --noEmit` exit 0; `test:laporan` 37/37 ok;
  0 non-ASCII di 6 file; `public/sw.js` + V1
  `laporan-admin-client.tsx` tak tersentuh; ref remote `origin/master`
  + `origin/main` identik @ `d91dbd0`.
- **W2.2 hardening (2 Okt, commit `663876b`, dual-push master+main)**:
  audit ruling B1-B4. (B1) card Rekonsiliasi sisi aset + `wakafTotal`
  + koreksi caption (wakaf = memo, BUKAN laba/rugi berjalan); (B2)
  route.ts: validasi `DATE_RE`+`Date.parse`, `nextDay` dipindah ke
  dalam try -> `RangeError` tertangkap jadi JSON 500; (B3)
  `FORMAL_NOTES` cache -> 'TTL backstop; mutasi GL tak
  auto-invalidate, tunggu TTL 60 dtk / Muat ulang'; (B4) posisi.ts:
  dokumentasi `flag_rekon15` = proxy D=K GLOBAL, bukan rekon #15
  per-entry/orphan (orphan journal_lines ter-exclude oleh JOIN).
  Gate: `tsc --noEmit` 0; `test:laporan` 37/37; 0 non-ASCII.
  UX/UI (U1-U4, a11y) DITUNDA ke UX-5/UX-6.
- **Progres Wave 2 (roadmap 12)**: W2.1 `ca0f39f`; W2.2 `d91dbd0`
  (+ hardening `663876b`).
  **WAVE 2 = 2/7**.
  - W2.3+ (menyusul): report lain di dispatch `?report=` (laba-rugi,
    LPE, LAK, CALK); penutupan jurnal closing (4xx/5xx -> 3020).
  - **Standing rule**: audit pasca-wave W2.2 -> hardening bug
    (B1-B4) SELESAI `663876b`; UX/UI (U1-U4, a11y) ditunda ke
    UX-5/UX-6. W2.3 mulai setelah go Gus Fi.

### F3.4+ W2.3: Laporan Laba-Rugi formal (LKA) + API + client tab - SELESAI
2 Okt 2026 (commit `6d8d5b7`, dual-push master+main)
- **4 file (+546/-18)**: `src/lib/laporan/lka.ts` (modul import-free
  `buildLka(db,at)`; laba-rugi kumulatif s.d. `at`; pendapatan neto =
  4010 - 4030 - 4040 + 4050; HPP neto = 5010 - 5020 (additive dBal,
  Opsi B); beban operasional 5xx byCode memo + subtotal (5010/5020
  TIDAK di-subtotal, S.5.2); laba kotor/bersih; blok memo 3010/3030/
  3040/6020; D=K proxy flag_rekon15 TANPA import rekonsiliasi.ts)
  + `src/app/api/laporan/formal/route.ts` (dispatch `?report=lka`
  -> buildLka; guard tier `laporan` + nextDay + cache 60 dtk +
  try/catch JSON 500)
  + `src/components/admin/laporan-formal-client.tsx` (tab baru
  "Laporan Laba-Rugi"; shell posisi+V1 tak berubah; panel LKA:
  preset period + rentang custom, statement bruto->bersih->HPP->laba
  kotor->beban (accordion byCategory)->laba bersih, blok memo di luar
  laba, D=K badge, Bagikan WA inline clipboard)
  + `scripts/test-laporan.ts` (4 fase LA-LD; 37 -> 60 assert; 0 new dep).
- **Sign fix (Opsi B, ruling Gus Fi)**: HPP neto = penjumlahan ADDITIVE
  `dBal` (sama dgn BEBAN di `posisi.ts`): `hppNeto = dBal(5010) +
  dBal(5020) = gross - returns`. 5020 = kredit-normal (retur HPP
  contra; live GL `journalForSalesReturn` = DR 1040 / CR 5020).
  `hpp.retur` = magnitudo positif utk tampilan P&L; neto tetap
  `gross - retur`. Fixture test LC2 di-correct ke mirror live GL
  (`DR 1040 / CR 5020`; sebelum salah de-bit 5020 yang bikin test
  lolos dgn bug).
- **Gate bersih**: `tsc --noEmit` exit 0; `test:laporan` 60/60;
  `test:all` 18 suite lulus; 0 non-ASCII di 4 file; `public/sw.js` +
  V1 `laporan-admin-client.tsx` tak tersentuh; ref remote
  `origin/master` + `origin/main` identik @ `6d8d5b7`.
- **Progres Wave 2 (roadmap 12)**: W2.1 `ca0f39f`; W2.2 `d91dbd0`
  (+ hardening `663876b`); W2.3 `6d8d5b7`. **WAVE 2 = 3/7**.
  - W2.4+ (menyusul): LPE, LAK, CALK; penutupan jurnal closing
    (4xx/5xx -> 3020).
  - **Standing rule**: audit pasca-wave W2.3 -> hardening bila ada
    bug (pola B1-B4 W2.2); mulai setelah go Gus Fi.

### F3.4+ W2.4: Laporan Perubahan Ekuitas formal (LPE) + API + client tab - SELESAI
2 Okt 2026 (commit `a4d90c7`, dual-push master+main)
- **4 file (+560/-6)**: `src/lib/laporan/lpe.ts` (BARU, modul data
  murni import-free `buildLpe(db,at)`; 7 kolom ekuitas 30xx
  (3010-3070) dgn pembuka (type=opening) + shu (type=closing) +
  alokasi (coop, 1 SQL pass byType/triple/byCode) - distribusi
  (=0 placeholder, real di W2.6, coop sudah memuat) = penutup;
  `cBal` kredit-debit sesuai SAK-EP, sama dgn `posisi.ts`;
  nama kolom bawa modul krn 3020-3070 status pending di COA;
  simpanan 2050/2060/2070 = KEWAJIBAN anggota -> memo kaki saja,
  TIDAK dijumlahkan ke total ekuitas; `d_k` global +
  `flag_rekon15` proxy (engine rekon asli = W2.7)) +
  `src/app/api/laporan/formal/route.ts` (dispatch `?report=lpe`
  -> buildLpe; guard tier `laporan` + `nextDay` + `lpe_notes`) +
  `src/components/admin/laporan-formal-client.tsx` (tab baru
  "Laporan Perubahan Ekuitas": tabel 7 kolom
  pembuka/shu/alokasi/distribusi/penutup + total, kaki memo
  simpanan, banner warning rekon-15, badge D=K; shell posisi +
  V1 tak berubah) + `scripts/test-laporan.ts` (LP1-LP4: happy
  path wash antar-akun, simpanan memo non-ekuitas, D=K rusak
  flag_rekon15=true, DB kosong; 60 -> 91 assert; 0 new dep).
- **Fix pre-commit (di-ACC Gus Fi)**:
  (1) Residu non-ASCII di lpe.ts + client (`Sek.` (Section
  symbol), `dgn` (times), `-` (minus)) -> diganti ASCII
  (per-line check 4/4 file clean).
  (2) Mismatch label COA 2050-2070: LPE mulanya
  "Simpanan Wajib/Sukarela/Dhuafa" (off-by-one) -> dikoreksi
  ke seed COA resmi `src/db.ts` baris 655-657 = 2050 Simpanan
  Pokok / 2060 Simpanan Wajib / 2070 Simpanan Sukarela
  (TIDAK ada perubahan COA; db seed sudah benar, cocok dgn
  `docs/akuntansi-proposal.md`).
- **Lesson W2.4: When using COA labels, verify against src/db.ts
  COA seed -- do NOT rely on proposal text or assumptions. The
  2050-2070 mismatch (Pokok/Wajib/Sukarela, not Wajib/Sukarela/
  Dhuafa) was caught pre-commit and fixed.**
- **Gate bersih**: `tsc --noEmit` exit 0; `test:laporan` 91/91;
  `test:all` 18 suite lulus; 0 non-ASCII di 4 file (per-line
  check); `public/sw.js` + V1 `laporan-admin-client.tsx` tak
  tersentuh; ref remote `origin/master` + `origin/main` identik
  @ `a4d90c7`.
- **Progres Wave 2 (roadmap 12)**: W2.1 `ca0f39f`; W2.2 `d91dbd0`
  (+ hardening `663876b`); W2.3 `6d8d5b7`; W2.4 `a4d90c7`.
  **WAVE 2 = 4/7**.
  - W2.6+ (menyusul): CALK; penutupan jurnal closing
    (4xx/5xx -> 3020).
  - **Standing rule**: audit pasca-wave W2.4 -> hardening bila ada
    bug (pola B1-B4 W2.2); mulai setelah go Gus Fi.

### F3.4+ W2.5: Laporan Arus Kas formal (LAK) + API + client tab - SELESAI
2 Okt 2026 (commit `d7ca0e8`, dual-push master+main)
- **4 file (+829/-6)**: `src/lib/laporan/lak.ts` (BARU, modul data
  murni import-free `buildLak(db,at)`, pola `posisi.ts`/`lka.ts`/
  `lpe.ts`; struktur Sek.5.4: kas usaha = 1010+1020, kas sosial
  1100 TERPISAH (anti-campur; invariant rekon #16 GL_CASH utk
  W5.2); klasifikasi per entri sesuai akun lawan: INVESTASI
  {1050,1070-1090}, PENDANAAN {3010,3060,2050-2070}, OPERASIONAL
  sisanya; transfer antar-kas (1010<->1020 / <->1100) BUKAN
  aktivitas -- 1010/1020<->1100 masuk footer
  `pergeseran_kas_sosial`; identitas footer konstruktif:
  saldo_awal + neto_aktivitas + pergeseran_kas_sosial = saldo_akhir
  (per akun: penutup = pembuka + masuk - keluar + transfer);
  `bal` = debit-credit utk kas 1xxx (konvensi SAK-EP sama dgn
  `posisi.ts`); rincian ZIS per akun lawan 4090/5090/5100/6030 +
  fallback "(lain)"; nama 1100 = "Kas ZIS" selaras seed
  `src/db.ts` baris 647; `d_k` global + `flag_rekon15` proxy) +
  `src/app/api/laporan/formal/route.ts` (dispatch `?report=lak` +
  LAK_NOTES; supported list kini ['posisi','lka','lpe','lak']) +
  `src/components/admin/laporan-formal-client.tsx` (tab baru
  "Arus Kas": footer tabel + identitas, blok aktivitas x3
  (neto + masuk/keluar + kode lawan info), tabel kas per akun
  (pembuka/masuk/keluar/transfer/neto/penutup), seksi ZIS
  terpisah + rincian; shell posisi/LKA/LPE + V1 tak berubah) +
  `scripts/test-laporan.ts` (L1-L5: golden (pembuka opening +
  3 aktivitas + transfer + pergeseran + identitas footer +
  rincian ZIS), batas periode, tak seimbang flag_rekon15, DB
  kosong, jurnal pembalik offset arus; 91 -> 137 assert; 0 new
  dep).
- **Fix pre-commit (di-ACC Gus Fi, terkapton sebelum commit)**:
  bug akumulasi per-akun di lak.ts: `k.masuk`/`k.keluar` (baris
  kas per akun) tak pernah terisi -- hanya total aktivitas
  `a.masuk`/`a.keluar` -- jadi tabel per akun tampil 0 saat neto
  benar. Diperbaiki ke akumulasi paralel; terkapton pre-commit
  oleh test L1.
- **Lesson W2.5-1: akumulasi multi-akun (loop per akun di dalam
  loop entri): total agregat bisa benar sementara kolom
  per-akun nol -- test wajib assert PER-AKUN, bukan hanya total
  modul.**
- **Lesson W2.5-2 (ulang lesson W2.4): label COA modul HARUS
  selaras seed `src/db.ts`, BUKAN teks proposal / asumsi
  (1100 = "Kas ZIS" baris 647, bukan "Kas Sosial (ZIS)").**
- **Gate bersih**: `tsc --noEmit` exit 0; `test:laporan`
  137/137; 0 non-ASCII di 4 file (per-line check); `public/
  sw.js` + V1 `laporan-admin-client.tsx` tak tersentuh; ref
  remote `origin/master` + `origin/main` identik @ `d7ca0e8`.
- **Progres Wave 2 (roadmap 12)**: W2.1 `ca0f39f`; W2.2
  `d91dbd0` (+ hardening `663876b`); W2.3 `6d8d5b7`; W2.4
  `a4d90c7`; W2.5 `d7ca0e8`. **WAVE 2 = 5/7**.
  - W2.6+ (menyusul): CALK; penutupan jurnal closing
    (4xx/5xx -> 3020).
  - **Standing rule**: audit pasca-wave W2.5 -> hardening bila
    ada bug (pola B1-B4 W2.2); mulai setelah go Gus Fi.

### F3.4+ W2.6: CALK (Catatan LK formal, Sek.5.5) + API + client tab - SELESAI
2 Okt 2026 (commit `4dd7891`, dual-push master+main)
- **5 file (+753/-6)**: `src/lib/laporan/calk.ts` (BARU, modul data
  murni import-free `buildCalk(db,at)` pola W2.2-W2.5; template
  Sek.5.5: item 1-3 teks statis panel klien + badge data
  (coop_registered, PKGF/wave); item 4-8 dari GL kumulatif
  (entry_date < batas): kas 1010/1020/1100 terpisah, piutang
  1030/1070/1110, hutang 2010/2020/2030/2040/2090/2100, ekuitas
  3010-3070 (+ total), simpanan 2050/2060/2070 = memo (kewajiban,
  BUKAN ekuitas), ZIS per jenis GL-only (zakat keluar 5090+6030;
  infak masuk 4090 / keluar 5100; sedekah lumps; wakaf masuk 4100
  + aset 1120 & memo 6020 -- memo, TAK masuk total aset), ZIS per
  periode (bulan entry, non-pembuka), akad berjalan 1070/1080/
  1090/2040; sign `natural()` identik `naturalBal` posisi.ts;
  `d_k` global + `flag_rekon15` proxy) + `route.ts` (dispatch
  `?report=calk` + CALK_NOTES; supported +calk) +
  `laporan-formal-client.tsx` (tab baru "Catatan LK (CALK)":
  CalkPanel (as_of + badge D=K/gl_enabled/kopontren + banner D!=K
  link /admin/rekonsiliasi), CalkKebijakan (item 1-3),
  CalkStatement (item 4-8 + badge GL-only), CalkPeristiwa (item 9
  input manual, draft localStorage per as_of -- TIDAK ke server);
  shell + V1 tak berubah; 0 new dep) + `scripts/test-laporan.ts`
  (C1-C4: golden GL-only + D=K, batas periode strict, tak
  seimbang flag_rekon15, DB kosong; 137 -> 174 assert) +
  `TODO.md` (note test:wakaf legacy -> CLEANUP W5/W6).
- **GL-only (skema v21)**: tabel zis/akad BELUM ada -- ZIS per
  jenis = aproksimasi akun COA (4090/5100 menyatukan
  infak+sedekah; 6030 memo syariah); pemisahan per jenis menyusul
  W2.7 (kolom `kind`), rincian per akad menyusul W3.1.
- **Gate bersih**: `tsc --noEmit` 0; `test:laporan` 174/174;
  `test:zakat` 37/37; 0 non-ASCII; `public/sw.js` + V1
  `laporan-admin-client.tsx` tak tersentuh; ref remote
  `origin/master` + `origin/main` identik @ `4dd7891`.
- **Progres Wave 2 (roadmap 12)**: W2.1 `ca0f39f`; W2.2 `d91dbd0`
  (+ hardening `663876b`); W2.3 `6d8d5b7`; W2.4 `a4d90c7`; W2.5
  `d7ca0e8`; W2.6 `4dd7891`. **WAVE 2 = 6/7**.
  - W2.7 (menyusul, commit Wave 2 TERAKHIR -> audit full Wave 2):
    modul ZIS (tabel zis Sek.8.2, skema v22, flip 2090/5090/4040
    'open'); penutupan jurnal closing (4xx/5xx -> 3020) menyusul.
  - **Standing rule**: audit pasca-wave W2.6 -> hardening bila ada
    bug (pola B1-B4 W2.2); mulai setelah go Gus Fi.

## 2026-09-30
### P4 TASHIH KONSINYASI TERJAWABâ€“DITERIMA (Gus Fi, 30 Sep) + C5 rekaman keputusan
- **Tashih dok. P4 (`P4-PROPOSAL-KONSINYASI.md/.html`)**: 3
  Setujuan, 0 Ora Setujuan, 0 Koreksi; **DITERIMA**.
  (1) Skema **wakalah bil ujrah** DISETUJUI (ujrah tercatat
  otomatis SAAT terjual; tagihan pemilik neto komisi; rate
  snapshot per titipan, tanpa perubahan sepihak -- `4f12818`
  + P4-B fleksibel). (2) Komisi **per kesepakatan (antardhin)
  + titipan terkunci** DISETUJUI (`konsinyasi_commission`
  default 20 = preset operasional aplikasi, BUKAN ketentuan
  syariah). (3) **Dasar hitung ujrah V1 DITERUSKAN KE ULAMA**
  (V1 = persentase harga PERJANJIAN, ma'lum; alternatif =
  ujrah mitsli; konfirmasi menyusul).
- **Commit `109777d`**: P4 md/html (STATUS TERJAWAB + seksi J
  lampiran jawaban + open items) + `SYARIAH-CHECKLIST.md`
  (STATUS TASHIH P4) + TODO (A1.1 LEPAS, UX-5, E25, guardrails).
- **C5 (commit ini)**: rekaman keputusan -- `docs/akuntansi-keputusan.md`
  (seksi baru "Keputusan P4": ringkasan + tindak lanjut + open
  items + lampiran teks jawaban) + `docs/akuntansi-proposal.md`
  (Â§0 note, baris 2020/4040 Â§2, Â§4.2, Â§5, Â§6, R6, W2.1, Â§14,
  Â§15.4 + baru Â§15.5) + regenerate snapshot
  `docs/AKUNTANSI-PROPOSAL.html` (banner Â§0, baris
  2020/4040, Â§4.2, Â§6.2, R6, W2.1, Â§14 + seksi 15.5 + fnote)
  + re-sync `public/tutorial/akuntansi-proposal.html` via
  `node scripts/sync-tutorial.mjs` (SYNC-TUTORIAL-OK, 9 file).
- **Dampak: R6 (aspek P4) LEPAS -- A1.1 LEPAS**: ujrah
  konsinyasi dipindahkan dari off-P&L (memo, baris "Ujrah
  Konsinyasi") ke pendapatan (4040 PKGF) + tagihan pemilik =
  settlement payable (2020 APL) -- eksekusi = commit terpisah
  saat F3.4+; mapping seksi I dokumen P4 TIDAK diubah diam-diam
  (tetap via commit tercatat).
- **Sisa/open P4**: (1) dasar hitung ujrah V1 (persentase harga
  PERJANJIAN) menunggu konfirmasi ulama (E25; bila koreksi =
  commit terpisah, pola F3.3); (2) eksekusi A1.1 = commit
  F3.4+; badge "provisional" UI ujrah kon. s.d. terjawab.
### P3 TASHIH ZAKAT TERJAWABâ€“DITERIMA (Gus Fi, 30 Sep) + revisi docs + snapshot (commit C2 + C3)
- **Tashih dok. P3 (`P3-TASHIH-ZAKAT.md/.html`)**: 1 Setujuan, 0
  Ora Setujuan, 1 Koreksi; Soal 3 belum dipilih (catatan B);
  keputusan tashih **DITERIMA** ("yang penting manut rumusan
  Nahdliyin ulama lan hasil bahtsul masail pondok pesantren").
  (1) Haul KOREKSI: anchor `2025-10-22` (mulai toko koperasi
  berjalan) â†’ haul pertama 22 Okt 2026; ta'jil boleh (musyawarah);
  penampang "seolah sudah haul" + keterangan "belum wajib karena
  belum nishab" (bukan nol); pembayaran TIDAK me-reset anchor.
  (2) Harga emas TERENDAH = final (min `zakat_gold_standards`
  jendela haul). (3) Modal (`valuation_mode` market/hpp) belum
  dipilih â†’ tetap provisional.
- **C2 `ac00791`**: `P3-TASHIH-ZAKAT.md` (STATUS + seksi G baru) +
  `.html` (kartu jawaban + prefill) + `docs/akuntansi-proposal.md`
  (Â§0 note, Â§8.2, Â§8.3, baris R6, Â§14, baru Â§15.4) +
  `SYARIAH-CHECKLIST.md` seksi F (STATUS TASHIH).
- **C3 (commit ini)**: regenerate snapshot `docs/AKUNTANSI-PROPOSAL.html`
  (banner + R6 + Â§8.3 + Â§14 + seksi 15 baru + fnote) + re-sync
  `public/tutorial/akuntansi-proposal.html` + TODO.md (item P3
  terjawab + open item baru: jawaban final Soal 3) + MEMORY.
- **Sisa/open**: (1) jawaban final Soal 3 (modal) dari pengasuh;
  (2) verifikasi judul MUI fatwa utk zakat -- RESOLVED-removed 1
  Okt 2026 (no. belum terverifikasi; dasar = konsensus ulama
  Syafi'i/Maliki/Hanbali + Muktamar NU ke-35); (3) implementasi
  spesifikasi koreksi + switch `zakat_history` = commit F3.4+
  (R6); P4 konsinyasi tetap open.
### F3.3 TERJAWAB -- jawaban tashih GUS FI + revisi + regenerate (3 commit, dual-push master+main)
- **Jawaban tashih GUS FI (30 Sep)** atas Â§13
  `docs/AKUNTANSI-PROPOSAL.html` (14 poin, via
  `/tutorial/akuntansi-proposal`): 12 Setuju, 0 Ora Setuju,
  2 Koreksi. #6: TIDAK ADA denda keterlambatan ("ini tidak
  usah, bisa dengan yang lain. tidak denda.") -> ak. 5050
  `status=closed`, skema denda dihapus dari Â§1.2/Â§5/Â§6/Â§8/Â§12.
  #14: WAKAF AKTIF (revisi keputusan #7 "Belum sekarang") ->
  ak. 1120/4100/6020 APL; booking = `zis kind='wakaf'` +
  jurnal manual (PSAK 112); build = W3.5 (total 32 commit
  tetap). Bonus: P3 zakat final via #2 (24K/market/haul +
  mustahik) -> R6: switch jembatan + hapus badge "provisional"
  saat F3.4+.
- **C1 `5a9bcac`**: `docs/akuntansi-keputusan.md` (audit trail:
  teks jawaban asli + ringkasan + dampak teknis) -- commit
  terpisah sesuai aturan F3.3.
- **C2 `3af7250`**: revisi `docs/akuntansi-proposal.md`
  (baru Â§15 "Revisi pasca-F3.3"; tabel Â§13 += kolom Jawaban;
  COA/LKA/CALK/modul akad/Â§8/Â§9/Â§12 disesuaikan).
- **C3 (commit ini)**: regenerate snapshot HTML (mirror Â§15 +
  band Â§13 "TERJAWAB 30 SEP" + baris `.ans` per item + update
  fnote @`3af7250`) + re-sync `public/tutorial` via
  `node scripts/sync-tutorial.mjs` (SYNC-TUTORIAL-OK, 9 file;
  copy = byte identik) + TODO.md + MEMORY.
- **Sisa**: F3.4+ = mulai implementasi (Wave 1: skema v21
  COA + jurnal double-entry + auto-posting + rekon #15/#17 +
  golden test, roadmap Â§12). Tashih P4 konsinyasi tetap
  pending (pola interface tashih sama, commit terpisah).
### Interface tashih AKUNTANSI-PROPOSAL.html + exception gate sync (3 commit, dual-push master+main)
- **Keputusan (Gus Fi, 30 Sep, via sesi DeepSeek)**: Â§13
  `docs/AKUNTANSI-PROPOSAL.html` dari snapshot centang (14 kartu,
  H1 `c3ade14`) jadi UI tashih interaktif: radio
  (Setuju / Ora Setuju / Koreksi) + textarea catatan per 14 poin;
  tombol "Copy Jawaban" + preview live (format output: "JAWABAN
  TASHIH - PROPOSAL AKUNTANSI KOPERASI AL-ITTIHAD" + tanggal + 14
  keputusan + ringkasan + perlu-ditindaklanjuti) -- JS vanilla
  inline (clipboard API + fallback execCommand, zero library).
- **Fix struktural (commit `b2d822b`)**: HTML H1 asli punya
  content stray (tabel 7.2/7.3 di luar `<section>`, langsung di
  `<main>`) -- direlokasi ke badan Â§7 + tag tutup konsisten.
- **Exception gate (commit `ef01d0d`)**: `sync-tutorial.mjs`
  ketambah `SCRIPT_ALLOW` ('AKUNTANSI-PROPOSAL.html') -- file itu
  saja boleh berisi script; docs lain tetap 0-script hard gate
  (viewer iframe `sandbox="allow-same-origin"` tanpa
  allow-scripts -> di dalam app <script> tetap TIDAK jalan;
  copy public/tutorial = salinan byte, exception konsisten di
  dua sisi). Keputusan tercatat di komentar source.
- **Print/aksesibilitas**: `@media print` sembunyikan tombol +
  preview (cetak tetap bersih = 14 poin + kolom isian); radio
  hit-area 44px; tema maroon tanpa ubah CSS dokumen.
- **Sisa**: F3.3 = jawaban tashih GUS FI (12/14 poin sudah via
  roadmap 29 Sep) -> F3.4+ implementasi. Pola sama utk
  `P3-TASHIH-ZAKAT.html` + `P4-PROPOSAL-KONSINYASI.html`
  (commit terpisah). [UPDATE 30 SEP: F3.3 TELAH TERJAWAB --
  12 Setuju + 2 Koreksi; lihat entry F3.3 di atas.]

## 2026-09-29
### Tutorial / dokumentasi in-app (T1-T3) - SELESAI 28-29 Sep
- **Perintah (ACC Gus Fi, 28-29 Sep)**: fitur dokumentasi in-app --
  HTML SOP + panduan di `docs/` bisa dibaca DALAM app (`/tutorial`),
  tanpa website terpisah. 3 commit (T1-T3), dual-push master+main.
- **T1 `784cd86` (28 Sep)**: `scripts/sync-tutorial.mjs` +
  `package.json` (`sync:tutorial`) + `public/tutorial/*.html` (9
  file: DOKUMENTASI-APLIKASI + 7 SOP-*.html + AKUNTANSI-PROPOSAL
  (F3.2 snapshot, H1 `c3ade14`)). Aturan sync: `docs/`
  = source of truth; `public/tutorial/` = hasil salin, TIDAK
  pernah diedit manual; gate 0 tag `<script>` (viewer iframe
  `sandbox="allow-same-origin"` TANPA allow-scripts -> pertahanan
  vs script injection); hapus file stale tak ada di MAP; cek
  ukuran paska-salin; pelanggaran = exit 1 SYNC-TUTORIAL-FAIL.
- **T2 `117e20a` (29 Sep)**: `src/lib/tutorial-data.ts`
  (TUTORIALS[8] slug/tittle/deskripsi -- map IDENTIK dg MAP sync;
  `slugOk()`/`tutorialBySlug()`), `src/app/tutorial/page.tsx`
  (landing: guard login + level personal = 7 role; grid 8 kartu),
  `src/app/tutorial/[slug]/page.tsx` (viewer: validasi slug ->
  notFound(); TutorialFrame = iframe `/tutorial/<s>.html`
  `sandbox="allow-same-origin"`), `src/components/sidebar.tsx`
  (link "Tutorial" level personal di 7 menu role + active match
  /tutorial; +item menu member; label level pengurus
  "Khusus Pengurus" -> "Semua Level"). tsc EXIT 0; build belum
  dijalankan di sesi T2 (verifikasi build saat deploy/CI).
- **T3 (commit ini)**: docs (MEMORY + TODO item baru di seksi
  "Fitur") -- fitur tutorial GENAP (T1+T2+T3).
- **H1 `c3ade14` (29 Sep) -- snapshot proposal F3.2**:
  `docs/AKUNTANSI-PROPOSAL.html` (748 baris) = snapshot 1:1 dari
  `docs/akuntansi-proposal.md` @ `e3cfd30` utk review F3.3.
  0 tag script (gate sync gagal-hard); tema maroon SOP-ADMIN; TOC
  anchor pill + `:target` highlight; Â§13 = 14 kartu keputusan
  amber + checkbox non-persist (print A4 utk rekam centang).
  `sync-tutorial.mjs` MAP += entry; `tutorial-data.ts` TUTORIALS
  += entry -> route `/tutorial/akuntansi-proposal`; public copy
  via `npm run sync:tutorial` (SYNC-TUTORIAL-OK 9 file). Dual-push
  main+master = `c3ade14`. Catatan: lokal `master` ditemukan
  masih di `84a3266` (stale) -> `git branch -f master c3ade14`
  lalu push (fast-forward sah). **Setelah F3.3** (keputusan
  Â§13 turun) -> regenerate HTML + re-sync (1 commit kecil).
  Sumber kebenaran tetap `docs/akuntansi-proposal.md`.
- **Sisa / catatan**: pixel-check /tutorial + 1 halaman viewer +
  404 (Gus Fi, non-blocking). Deploy: HTML public/ ikut mekanisme
  SW version-stamp yang sudah ada (stempel SW-BUILD berubah saat
  deploy) -- `public/sw.js` TIDAK pernah di-commit.
### Theme warna global (5 preset) - SELESAI T1-T4 29 Sep (dual-push master+main)
- **Arah (Gus Fi)**: kustomisasi warna app tanpa ubah kode. V1 =
  Option A: 5 preset (maroon default, green, blue, dark-maroon,
  slate), global setting (kontrol admin), UI dropdown di
  /admin/pengguna (kartu "Tema Warna" -- preseden: halaman itu
  sudah handle session_timeout via /api/settings).
- **Audit read-only (29 Sep)**: 187 pemakaian kelas `accent-*`
  terkompilasi statis (28 token berbeda) -> mekanisme = lapisan
  override CSS var (`--ac300..700` + `data-brand` di `<html>`,
  re-declare selector `accent-*` yg terpakai; varian alpha via
  `color-mix`); 5 situs hex mentah (globals.css x3, tokens.ts x2
  via T, manifest.json PWA statis = constraint); `wine`
  (cetak kartu) + `navy` (netral gelap) + role colors = TIDAK
  di-retheme; dark mode ortogonal (cookie user dark|light).
- **Plan 4 commit (ACC 29 Sep)**: T1 docs/color-theme-audit.md ->
  T2 globals.css (var brand + override layer, maroon = 0 perubahan
  visual) -> T3 settings.theme (`SHOP_SETTING_DEFAULTS`, validasi
  allow-list di PUT /api/settings + GET +ui, hook Shell set
  `data-brand` + meta theme-color) -> T4 docs + MEMORY.
  Fallback: tema tak dikenal/absen = `maroon`.
- **T1 `b230a3e` (29 Sep)**: dokumen audit + rencana T2-T4.
- **T2 `2c4940b` (29 Sep)**: `src/app/globals.css` +93/-1: var
  `:root --ac300..700` (nilai maroon = nilai saat ini) + 4 blok
  `html[data-brand=...]` (green|blue|dark-maroon|slate);
  `--accent` -> `var(--ac500)`; 38 aturan override UNLAYERED
  (text/bg/border/ring/shadow/accent-500 base + varian alpha via
  color-mix + hover/active/focus + dark: + .input). Maroon =
  pixel-identik. tsc EXIT 0 + build 0/0.
- **T3 `346229d` (29 Sep)**: 4 file +145/-3: `db.ts`
  `SHOP_SETTING_DEFAULTS.theme='maroon'` (tanpa migration,
  key-value); `api/settings` GET +theme, PUT allow-list 5 nilai
  (400 bila dilanggar, hex terbuka TIDAK masuk); `shell.tsx`
  fetch on mount -> `<html data-brand>` + `meta theme-color` +
  listen `kopontren:theme-change` (live, tanpa reload; offline ->
  maroon); `pengguna-client.tsx` kartu "Tema warna" (dropdown +
  swatch + Simpan; dispatch event on save) + migrasi checkbox
  `accent-[#7A1835]` -> `accent-[var(--ac500)]`. tsc EXIT 0 +
  `next build` 0/0 (56 halaman).
- **T4 (commit ini)**: docs (MEMORY + TODO + addendum
  `docs/color-theme-audit.md` Â§12) -- fitur theme GENAP T1-T4.
- **Sync point hex** (ubah bareng, ketiganya): var blocks
  globals.css = map `SWATCH` pengguna-client = map `META`
  shell.tsx (komentar `SYNC POINT` di kedua file TS).
- **Constraint dipertahankan**: PWA manifest.json tetap maroon
  statis (stabilitas install); hex mentah `lib/tokens.ts` tak
  di-ubah (SSR build-time); flash maroon saat load awal utk tema
  non-maroon diterima V1 (mitigasi V2 = script inline RSC di
  layout.tsx).
- **V2 opsional (non-blocking)**: live-push theme ke sesi lain
  yg terbuka (saat ini = diterapkan saat mount berikutnya);
  mitigasi flash; custom hex (saat ini allow-list admin saja).
- **Visual check 5 preset: Gus Fi SELESAI 29 Sep** -- semua
  preset ACC, tanpa penyesuaian hex; maroon = default
  pixel-identik terjamin.

## 2026-09-27
### Roadmap: bakpao.id CANCELLED + pembaruan urutan - 27 Sep
- **Keputusan (ACC Gus Fi)**: roadmap bakpao.id (7 fitur: live
  ticker multi-cabang, tangga loyalty tier, katalog hadiah +
  ranking, panel bagi-hasil per role, onboarding mitra/reseller,
  hero + trust badges, timeline + demo) = CANCELLED -- tidak perlu,
  tidak diimplementasi. Dihapus dari TODO.md + release gate (item
  diganti label CANCELLED); entry historis P0-C4 tetap asli
  (integritas log).
- **Urutan roadmap baru**: V2-2 COGS reversal (SELESAI, commit
  `980d57c` `8880ddb` `85d24b0` + docs `315ef66`) -> V2-1 I-7
  void reason (pending, butuh ACC pengurus) -> Fase 3 Akuntansi
  Terbaru (audit SAK EP / SAK Syariah / PAP -> proposal desain ->
  tashih -> implementasi) -> Maintenance (audit periodik, test,
  performance, ongoing).
### V2-2 (KRITIS): COGS/HPP reversal -- netting dua sisi - 27 Sep
- **Perintah (ACC Gus Fi)**: COGS reversal V2-2: P&L/KPI/Zakat net
  DUA SISI -- pendapatan dikurangi Î£ returns.amount (sudah V1), COGS
  dikurangi Î£ returns.cogs (baru V2-2). Snapshot di-write-time;
  retur lama = 0 (konservatif, TANPA backfill); 3 commit.
- **C1 `980d57c`** (schema + write path): `returns.cogs`
  INTEGER NOT NULL DEFAULT 0 via execColumn idempoten (purely
  additive); SCHEMA_VERSION 19â†’20 -- Turso fullInit sekali saat cold
  start berikutnya (~15-20 s). POST /api/returns snapshot `cogs =
  round(HPP item Ã— qty)` DI-WRITE-TIME; rumus HPP per-item sama
  persis P&L/reports/zakat: `si.cost_price` (snapshot saat sale);
  0/kurang (sale pre-V2-1) â†’ fallback harga beli produk saat ini
  (`products.cost_price`, pola COALESCE /api/reports). GET
  /api/returns +`cogs`; audit log +`cogs`; backup export/import
  +`cogs` (JSON lama â†’ `Number(r.cogs) || 0`).
- **C2 `8880ddb`** (netting P&L/KPI/zakat + UI): `lib/keuangan.ts`
  -- `labaKotor = bersih âˆ’ hpp + hppRetur` (payload +`hppRetur`
  additive; KEUANGAN_NOTES + header di-update); `api/reports` --
  KPI `profit = (penjualan âˆ’ retur) âˆ’ (HPP âˆ’ COGS retur)` + payload
  +`returns_total`; `api/zakat` -- laba periode net dua sisi;
  `lib/rekap.ts` -- statement WA V2-2 (baris "Dibalik COGS Retur" +
  footnote net); `laporan-admin-client.tsx` -- baris kondisional
  (hppRetur > 0), sub KPI "net penjualan âˆ’ net HPP (V2-2)",
  heading P&L (V2-2). test:rekap fixture +1 assert (20).
- **C3 `85d24b0`** (rekonsiliasi #14 + UI + test): cek 14 `RETURN_COGS`
  (flag-only read-only): `returns.cogs` harus = `si.cost_price Ã—
  qty` utk item ber-snapshot (cost_price > 0); baris snapshot 0
  (fallback harga beli produk saat write) tak dapat diverifikasi
  ulang â†’ dikecualikan; `cogs < 0` selalu drift. UI COLS/MONEY
  RETURN_COGS; test:rekon skema + seed + korup â†’ PASS 46 (14 cek).
- **Verifikasi (27 Sep)**: tsc clean; battery `test:invariants`
  40 / `test:rekon` 46 / `test:rekap` 20 / `test:zakat` 37 /
  `test:golden` 59 / `test:margin` 57; `next build` OK (sw.js
  stamped lokal -- TIDAK pernah di-commit).
- **Sisa**: V2-1 (I-7 void reason struktural) masih pending item
  tersendiri (butuh ACC pengurus); cek visual V2-2 = Gus Fi
  (non-blocking).
- **Docs (commit berikutnya, V2-2d)**: log V2-2 iki ing MEMORY.md +
  TODO.md item V2-2 dicentang.
### P0-C4 (KRITIS): Production release gate + sertifikasi produksi - 27 Sep
- **Perintah (ACC Gus Fi)**: P0-C4 = C4 finalis P0 Production
  Certification (C1â†’C4): gate doc + update docs (MEMORY/TODO) +
  cleanup scratch. Deliverable: `docs/qa/PRODUCTION-RELEASE-GATE.md`
  (baru; bahasa Inggris, sejajar GOLDEN-PATH.md/DATA-INVARIANTS.md)
  ngemu: (1) aturan gate ("ora ono sing ship menawa gate abang");
  (2) gate otomatis 7 item (`test:golden` prod + `test:invariants`
  prod + `test:rekon` + `test:roles` + regresi battery 12 skrip +
  `tsc --noEmit` + `next build`); (3) gate deploy/verifikasi Vercel
  (dual-push, Ready+Production, SW stamp berubah, sw.js ber-stamp
  PERNAH di-commit, smoke `/admin/produk`, live run rekonsiliasi --
  `drift_total` 0 ing data sehat); (4) tabel status C1â€“C4; (5) tabel
  4 bug produksi temuan P0; (6) cakupan sertifikasi (ORA ngemu:
  tashih P3/P4, batasan V1 KEUANGAN_NOTES, verifikasi operasional
  manual); (7) item P1/P2 non-blocking sisa + V2 ditunda +
  Kelompok P1â€“P15 + roadmap pasca-P0; (8) release rules standing.
- **4 bug produksi P0 (dokumentasi gate doc)**: (1) SQL products
  koma akhir -- intro `37d0a34` (grosir), 500 SETIAP GET
  /api/products ter-autentikasi, fix `662b654` (C1); (2)
  `point_history` missing saka backup export/import/DELETE/audit,
  fix `7f09341` (C2); (3) rekonsiliasi nulis `payables.owner_name`
  -- kolom nyata `supplier_name` (SQL "no such column" 500), fix
  `206350f` (C3); (4) KONSIN sub-cek overpay `amount_paid >
  tagihan` + settled disempurnakke `> 0`, fix `206350f` (C3).
  Kabeh papat ditemukang gate test P0 piyambak -- validasi cara
  P0 nemokak bug produksi nyata.
- **V2 DITUNDA (pasca-sertifikasi, liha gate doc seksi V2)**:
  V2-1 = I-7 void reason struktural (daftar alasan sah + risiko alur
  bisnis BUTUH ACC pengurus â†’ UX-6.5); V2-2 = COGS/HPP reversal
  (saiki V1 doc-note KEUANGAN_NOTES: retur COGS ora dibalik â†’
  laba/HPP ora akurat; implement reversal + sesuaikan invarian +
  rekonsiliasi). Roadmap pasca-P0: V2 â†’ Fase 3 Akuntansi Terbaru
  (audit SAK EP/SAK Syariah/PAP â†’ proposal desain â†’ tashih â†’
  implementasi) â†’ roadmap bakpao.id (7 fitur).
- **Cleanup**: scratch `_*.txt`/`_build.cmd` ing repo root dihapus
  lokal (git-ignored, ora ke-push). 2 CSV stok 09/23 tetep RETAIN
  (keputusan housekeeping 27 Sep; salah siji inggit tracked).
- **Verifikasi**: C4 = murni docs -- ora ana perubahan kode, mula
  gate tsc/build ora perlu; verif = isi file resik + `git status`
  bersih saka scope P0-C4.
- **Aksi**: commit 3 file (docs/qa/PRODUCTION-RELEASE-GATE.md anyar,
  MEMORY.md, TODO.md) dual-push master+main.
  **P0 Production Certification = SELESAI.**
### P0-C3 (KRITIS): Modul rekonsiliasi 13 cek read-only + admin UI - 27 Sep
- **Perintah**: rekonsiliasi data (flag-only, TANPA auto-fix): validasi
  konsistensi finansial antar modul. Deliverable:
  `src/lib/rekonsiliasi.ts` (modul murni bebas-import, QueryDb) +
  `GET /api/reconciliation` (guard tier 'laporan' = admin/manajer/
  pengurus; cache ref-cache key 'rekonsiliasi' TTL 60 dtk) +
  `/admin/rekonsiliasi` (shell server + `rekonsiliasi-client.tsx`
  lazy, kolom detail per id cek via config `COLS`, MONEY format
  `toLocaleString('id-ID')`) + sidebar (item "Rekonsiliasi" level
  'laporan', grup Sistem) + skrip `test:rekon`.
- **13 cek**: SALES_PAY (paidâˆ’change=total semua baris), SALES_MONEY
  (nominal tak negatif, INV-7), SPLIT (pay_split JSON valid + Î£=total
  + metode cash/tf/wa), SHIFT (30 rekap closed vs recompute window
  [start,end) kasir tsb; by_method tak dibandingkan), RETURN (orphan
  INV-3 + over-return per sale_item), STOCK (negatif, INV-1), DEBTS
  (remaining=amountâˆ’paid, INV-5), PAYABLES (idem, INV-6), POINTS
  (members.points = Î£ point_history earn/redeem/void/return --
  penyempurnaan INV-4: reason 'refund' TIDAK ditulis app manapun;
  'return' = rollback retur penuh), CASHBACK (cashback_balance = Î£
  reason cashback/cashback_use/return_cash), KONSIN (sisa â‰¥ 0 per
  guard 'sell'/'return'; tak overpay per guard 'pay'; settled â‡’
  lunas per guard 'close' -- ketiganya mirror /api/konsinyasi),
  KONSIN_UJRAH (Î£ komisi = Î£ kas masuk 'Ujrah Kon. %' -- per-row
  commission_rate snapshot, floor/unit = SQLite int div), KONSIN_PAY
  (Î£ amount_paid = Î£ kas keluar 'Kon. %').
- **Detail per cek**: status ok/drift + drift_count + â‰¤20 baris
  selisih (rows: Record[]); cek agregat kas (UJRAH/PAY) = 1 baris
  {expected, recorded}. Flag-only: modul TIDAK memodifikasi data.
- **Bug caught saat verifikasi skema**: cek PAYABLES awal menulis
  `owner_name` -- kolom nyata = `supplier_name` (src/db.ts L374,
  /api/payables, notify.ts) â†’ SQL "no such column" 500 bila tak
  di-fix. Cek KONSIN ditambah sub-cek overpay (`amount_paid >`
  tagihan) mirror guarded UPDATE aksi 'pay'.
- **Verifikasi**: `node scripts/test-rekonsiliasi.ts` (43 assert,
  node:sqlite in-memory, seed selaras-guard â†’ 13 ok; 12 mutation
  korup â†’ drift_total 16 dgn jumlah persis per cek + DB kosong +
  sanity NOTES) = **PASS 43 / FAIL 0 / ALL_PASS / EXIT 0**;
  `tsc --noEmit` EXIT 0; `next build` EXIT 0.
- **Aksi**: commit 8 file (rekonsiliasi.ts, reconciliation/route.ts,
  admin/rekonsiliasi/page.tsx, rekonsiliasi-client.tsx,
  test-rekonsiliasi.ts, package.json, sidebar.tsx, MEMORY.md) dual-
  push master+main.
### P0-C2 (KRITIS): Harness invarian data + bug backup point_history - 27 Sep
- **Perintah (ACC Gus Fi)**: P0-C2 = invarian data (duit + poin) dengan
  restore drill nyata. Deliverable: `scripts/test-invariants.ts`
  (40 cek: seed duit/poin -> invarian pre -> backup -> simulasi
  kehilangan total DB -> server restart -> restore -> verifikasi
  jumlah + invarian post) + `docs/qa/DATA-INVARIANTS.md` + skrip
  `test:invariants` (package.json).
- **BUG KRITIS PRODUKSI (ditemukan P0-C2)**: `src/app/api/backup/
  route.ts` TIDAK menyertakan `point_history` di ekspor (GET),
  impor (POST), daftar DELETE, maupun audit. Blame: `point_history`
  masuk skema `a6850f9` (2026-09-17, schema batch 2) + ledger
  `dbd5cd3` (09-18); cakupan backup terakhir diperluas `d435f57`
  (09-20) TANPA point_history. Dampak: backup JSON kehilangan
  riwayat poin member; restore ke DB segar = ledger hilang;
  restore ke DB lama = baris point_history stale/orphan (tak
  di-DELETE, tak di-INSERT) -> drift integritas. Fix P0-C2:
  `point_history` masuk type Backup, ekspor GET, daftar DELETE
  (setelah consignments, sebelum members), INSERT loop (ID
  eksplisit, `sale_id` nullable, `normTs`), + audit.
- **Bug harness (bukan produk)**: handle file SQLite di Windows
  baru lepas beberapa detik setelah pohon `next dev` dibunuh
  -> cek "DB file dihapus" gagal acak. Fix: `spawn detached +
  windowsHide` (proses grup sendiri), `stopServer` Windows loop
  `taskkill /T /F` sampai root PID mati (maks. 10x, jeda 1 dtk),
  `removeWithRetry` (jendela 90 dtk utk simulasi kehilangan,
  30 dtk utk cleanup akhir).
- **Verifikasi**: `tsc --noEmit` EXIT 0; `node scripts/
  test-invariants.ts` (dev) -> **PASS 40 / FAIL 0 / ALL_PASS /
  EXIT 0**; DB sementara bersih otomatis; tak ada sisa proses
  node.
- **Aksi**: commit 4 file (test-invariants.ts, DATA-INVARIANTS.md,
  package.json, backup/route.ts) dual-push master+main; Vercel
  auto-deploy fix backup; entry MEMORY.md ini menyusul di commit
  doc berikutnya.

### P0-C1 (KRITIKAL): Golden Path E2E release gate + bug SQL products - 27 Sep
- **Perintah (ACC Gus Fi)**: P0-C1 = golden path E2E test sebagai
  release gate. `scripts/test-golden.ts` + `docs/qa/GOLDEN-PATH.md`
  + skrip `test:golden` (package.json). 7 skenario GP-01..GP-07
  menjalankan API HTTP nyata (DB lokal baru), lalu cek invarian
  duit read-only di SQLite. Aturan: deploy Turso/Vercel hanya bila
  `test:golden` EXIT 0 (ALL_PASS).
- **BUG KRITIKAL PRODUKSI (ditemukan P0-C1)**: `src/app/api/products/
  route.ts`, kolom `wholesaleCol` punya koma akhir (di-intro commit
  `37d0a34` feat grosir) -> query jadi `SELECT p.*, ... AS wholesale,
  FROM products` -> `near "FROM": syntax error` -> **500 di SETIAP
  `GET /api/products` ter-autentikasi** (katalog produk tak bisa
  dimuat di /admin/produk). Fix: buang koma akhir. Ini bukti golden
  path menemukan bug nyata produksi.
- **Bug harness test**: `main()` membuat `adminJar` tapi TIDAK
  pernah login -> semua skenario admin-gated (GP-02..GP-07) tanpa
  cookie sesi -> 401 cascade (bukan flake dev-mode; deterministik).
  Fix: tambah login admin ke `adminJar` di `main()`.
- **Red herring diagnostik**: kredensial seed admin = `kopontren`
  (bukan `admin`); diagnostik awal pakai kata sandi salah -> 401
  misarah. Selalu verifikasi kredensial seed dulu.
- **gp03**: user multi-role dedikatif `gp03-kasir` (kasir, lalu
  tambah `pembelian`), re-login agar role aktif di-hormati; assert
  200/403 sesuai FEATURE_MATRIX. (Sebelumnya gp03 memutar admin
  seeded; kini tidak.)
- **Verifikasi**: `tsc --noEmit` EXIT 0; `next build` EXIT 0;
  `GOLDEN_MODE=prod` -> **ALL_PASS (59 PASS, 0 FAIL)**. Audit
  `user:create`/`user:roles`/`auth:switch-role` fired; roles gp03
  `[kasir, pembelian]` persisted.
- **Aksi pasca-deploy**: Vercel auto-deploy; Gus Fi verifikasi
  `/admin/produk` bisa dibuka (sebelumnya 500).

### UX-6 (FASE I): audit sistem komunikasi + rencana commit -- I-1 & I-3 SELESAI 27 Sep
- **Perintah (ACC Gus Fi, 27 Sep)**: audit read-only UX-6
  (Attention System) + rencana implementasi. Eksekusi
  **I-1, I-3, I-4, I-5, I-2, I-6, I-8**; **I-7 (void alasan
  struktural) = DITUNDA** (butuh penentuan pengurus: daftar
  alasan sah + risiko alur bisnis â†’ fase UX-6.5 setelah ACC).
  Prioritas: I-3â†’I-4â†’I-5â†’I-2â†’I-6â†’I-8. Aturan sesi: per commit
  diff â†’ ACC â†’ `tsc --noEmit` (+ build utk commit kode) â†’
  dual-push master+main; sw.js TIDAK PERNAH di-commit; D:
  target tulis, `kp-zip3` = read-only.
- **Koreksi konteks penting (audit)**: file `ui/toasts.tsx` /
  `ui/confirm.tsx` / `ui/index.ts` **TIDAK PERNAH ada** (disk +
  `git log --all -- src/components/ui/` kosong) -- target edit
  UX-6 = **`src/components/ui.tsx` monolit (1.112 baris)**:
  Toast `L449+`, `useConfirm` `L525+`, `Empty`/`PageSkeleton`/
  Table. Commit H5 `a0b9f79` real = 7 file (bukan 4 + ui/*).
- **Hasil audit 8 kategori** (verified read-only 27 Sep; detail
  commit-per-commit di TODO.md Â§ FASE I):
  - A Attention: 20 jenis notif / 3 prioritas (`notify.ts`
    L41-68); bell 30 dtk + badge 99+ + deep-link SPA (H5) +
    view pengurus read-only; **gap: tone `critical` (toast
    hanya info/success/error/warning), digest 0, DND 0**.
  - B Empty: 20 situs (16 file): **15 CTA, 5 tanpa CTA** â†’ I-4:
    `low-stock` L84, `notification-list` L141, `zakat` L637+L652,
    member dashboard L153 ("Belum ada transaksi").
  - C Loading: `PageSkeleton` standar; **3 situs "Memuatâ€¦"
    polos** = `laporan-admin` L459 (laba-rugi), L599 (neraca),
    L312 (jam sibuk).
  - D Error: pesan manusia di helper fetch OK; retry button
    hanya `konsinyasi` L234-246; err blocks `laporan-admin`
    L461/L601 = teks-only; **collapsible detail teknis 0**.
  - E Success: toast sukses aktif; **undo 0** (ikon `Undo2`
    hanya utk menu Retur, bukan fitur undo).
  - F Confirm: `window.confirm` = 0 (sisa doc-comment);
    `useConfirm` 11 file / 14 titik; **risk level 0;
    reason struktural utk void 0**.
  - G Help: `TermTip` 23 titik (UX-3); **Explain-This-Number 0;
    Help Center central 0**.
  - H Dashboard: admin = 6 KPI + LowStock (prediksi hari habis)
    + WA deep-link; pengurus = 5 KPI 30h + chart 7/30/365 +
    export CSV/XLSX/PDF/WA; **delta konteks 0; "what changed"/
    aktivitas feed 0** (data feed tersedia: `/api/audit`).
    Catatan: komentar halaman pengurus "deteksi anomali" TIDAK
    ada di client (hanya `SalesBarChart`) -- anomali bukan
    fitur, jangan di-klaim.
- **Refinements ACC (implementasi commit kode)**: I-2 = critical
  auto-dismiss 90 dtk + manual-close, **sound = SKIP (V1)**,
  undo = `showToast(msg, tone, action?)` (4 titik contoh
  dikonfirmasi saat implementasi); I-3 = delta server-side
  (admin: hari ini vs kemarin; pengurus: 30h vs 30h-sebelumnya)
  + TermTip pakan delta, 4â€“5 kartu; I-4 CTA: low-stock â†’
  `/admin/produk`, notification-list â†’ settings (**admin-only**;
  pengurus = tanpa CTA, pola kondisional H3), zakat x2 â†’ form
  zakat, member dashboard â†’ POS (kondisional); I-5 = primitive
  `ErrorState` (pesan + "Muat ulang" + `<details>` teknis) di
  2 blok `laporan-admin` + seragamkan pola konsinyasi; I-6 =
  `useConfirm` + `risk:1..5` (L1-2 tombol biasa, L3-4 merah +
  ringkasan dampak, L5 + input nama entitas) -- 3 contoh:
  hapus transaksi L3, purge audit L4, resetAll data L5; I-8 =
  kartu 2â€“3 baris di 2 dashboard (5 `/api/audit` terakhir +
  KPI mover, CTA â†’ Audit).
- **Out of scope FASE I** (jangan balik tanpa keputusan baru):
  DND global Â· digest harian (dicukupi report P2/P3 harian/
  mingguan/bulanan) Â· Help Center central Â· multi-role M1
  (tetap backlog UX-5.5/UX-6, trigger = kebutuhan nyata).
- **I-1 (commit ini)**: dokumen audit + rencana (MEMORY +
  TODO Â§ FASE I, termasuk status DITUNDA I-7). 0 kode.
  Langkah berikutnya = **I-3** (diff â†’ ACC â†’ tsc + build â†’
  dual-push).
- **I-3 (DONE `e484cbb`, dual-push master+main, 27 Sep)**:
  `kpiDelta(cur, prev, label)` di `lib/format.ts` + delta
  server-side 2 dashboard (admin: 2 kartu "Penjualan Hari Ini"
  vs kemarin + "Arus Kas 7 Hari" vs 7d-sebelumnya; pengurus:
  3 kartu 30h vs 30h-sebelumnya + "Member Aktif" absolut
  "â–² N baru"). Tone emerald/rose/slate; TermTip pakan delta.
  tsc + build EXIT 0.
  **Pixel-check Gus (halaman tak bisa dirender di env ini):**
  - `/admin/dashboard` light/dark/mobile -- baris delta 2 kartu;
    TermTip via ikon `?` (hover/tap).
  - `/pengurus/dashboard` light/dark/mobile -- sama, 3 kartu.
  - Edge case: periode sebelumnya kosong â†’ "â–² baru"; tak
    berubah (<0.5%) â†’ "â‰ˆ stabil"; 0 vs 0 â†’ baris delta tidak
    render.
- **Koreksi audit I-4 (27 Sep, saat re-audit pre-edit)**:
  target I-4 di path aktual -- `notification-list-client.tsx`
  (`src/components/admin/`, dipakai 1 rute `/admin/notifications`
  view admin+pengurus); zakat Ã—2 = `zakat-client.tsx` di
  `/admin/zakat` (empty log verifikasi emas + empty riwayat,
  **bukan** form "Belum diisi" -- form hanya state "Memuatâ€¦"
  saat load); member dashboard "Transaksi Saya" =
  `personal-dashboard-client.tsx` (sudah ada pola CTA
  kondisional `showPosCta` di "Riwayat Poin & Reward").
  Guard target diverifikasi: `/admin/produk` = `canAccess('stock')`
  (admin/manajer/gudang; pengurus & kasir tak termasuk â†’ CTA
  low-stock dibuat KONDISIONAL, pola H3) Â·
  `/admin/notifications/settings` = `isAdmin` (admin saja â†’
  CTA notif list juga kondisional, prop `canManageNotif`).
- **I-4 (DONE `6222bc70`, dual-push master+main, 27 Sep)**:
  6 file src + MEMORY + TODO (+123/âˆ’15): CTA kondisional di 5
  empty -- low-stock â†’ `/admin/produk` (prop `canManageStock` =
  `canAccess(user,'stock')`, di-pass dari admin/dashboard/page.tsx);
  notification-list â†’ `/admin/notifications/settings` (prop
  `canManageNotif` = `isAdmin`, dari admin/notifications/page.tsx);
  zakat Ã—2 â†’ CTA in-page `ctaOnClick` scroll ke anchor baru
  `#zakat-aksi` / `#zakat-gold` (tanpa rute anyar); "Transaksi
  Saya" member â†’ CTA POS kondisional (pola `showPosCta`, match
  "Riwayat Poin & Reward"). 0 endpoint anyar, 0 fetch anyar.
  tsc + build EXIT 0 (53/53 rute).
  **Catatan commit**: commit pertama `38538af` punya subject korup
  (BOM + `++` di depan, akibat `Out-File -Encoding utf8` PS) â†’
  di-amend pre-push â†’ `6222bc70` (verified: byte subject
  `f,e,a,t,(`; master = main = `6222bc70`). Pelajaran wajib:
  file commit message ditulis `[IO.File]::WriteAllLines(path,
  $lines, [Text.UTF8Encoding]::new($false))` + byte-verify
  subject (`git cat-file commit HEAD`) sebelum push.
  **Pixel-check Gus (4 item)**: `/admin/dashboard` low-stock
  empty -- kasir (widget, tanpa CTA) vs admin (CTA "Kelola
  Produk"); `/admin/notifications` empty -- admin +CTA "Ubah
  Pengaturan Notifikasi" vs pengurus tanpa; `/admin/zakat` -- 2
  empty state scroll halus ke form (bukan navigate); `/member`
  "Transaksi Saya" empty -- admin preview = CTA POS, member murni
  = tanpa CTA.
- **I-5 (DONE, 27 Sep -- commit I-5 = 5 file (3 src + MEMORY +
  TODO); hash I-5 = `99c973c`, di-backfill saat commit I-2)**:
  `ErrorState` primitive baru di ui.tsx (insert setelah `Empty`):
  `{text, onRetry?, tech?}` -- kartu rose + tombol "Muat ulang"
  (ghost) + `<details>` "Detail teknis" berisi `<pre>`
  `text-1xs` (perbaikan ACC: `text-[11px]` â†’ `text-1xs`,
  token F1). Dipakai di 3 blok: laporan-admin LaporanTab
  (`GET /api/keuangan`) + NeracaTab (`GET /api/neraca`; tombol
  header "Muat ulang" A3 TETAP, tidak disentuh) + konsinyasi
  `loadErr` (pola manual "Coba lagi" diseragamkan;
  `onRetry={load}` sah karena `load()` sudah clear err di
  awal; import `Button` tetap -- 12 use di file).
  0 endpoint/fetch anyar. tsc + build EXIT 0.
  **Pixel-check Gus (3 item)**: paksa gagal load (putus
  network / API error) â†’ `/admin/laporan` tab Laba-Rugi:
  kartu rose + "Muat ulang" + collapsible "Detail teknis"
  (isi `GET /api/keuangan -- <err>`); tab Neraca: `GET
  /api/neraca -- <err>`; `/admin/konsinyasi`: `GET
  /api/konsinyasi -- <err>` (tombol "Coba lagi" ad-hoc hilang
  â†’ ErrorState seragam).
- **I-2 (DONE, 27 Sep -- commit I-2 = 6 file (4 src + MEMORY +
  TODO); backfill: hash I-5 = `99c973c`)**: tone `critical`
  ditambahkan ke `ToastTone` (ui.tsx): bg-rose-500, role=alert +
  assertive; auto-dismiss critical & warning = 90 dtk (error tetap
  6 dtk, tone lain 4 dtk). Slot `ToastAction {label, run}` =
  tombol di dalam toast (klik = run() lalu tutup). `useToast` kini
  5-tuple -- backward-compat: destructure 2â€“4 elemen lama tetap
  valid, jadi host lain tak perlu diubah; hanya host produk/shift/
  zakat yang += prop `action`. 4 titik contoh: (1) produk-client
  delete ber-riwayat = soft-archive â†’ critical + "Urungkan"
  (PUT `active=1`); (2) bulk delete â†’ critical + "Urungkan" --
  refinement ACC: `ids` di-capture sebagai snapshot SEBELUM sukses
  clear `selected`; `bulk()` kini terima `extra.ids` + union
  action += `'active'` (endpoint sama, tier akses sama); (3)
  shift-client tutup shift â†’ critical tanpa undo ("rekap
  terkunci"); (4) zakat logGold `apply=true` â†’ warning 90 dtk +
  pesan bahasa-plain "koreksi dengan entri baru, log lama tidak
  dihapus" (deviasi kecil dari draft "(OOS undo)" -- jargon,
  diganti bahasa manusia). OOS tercatat: undo zakat (log
  append-only â†’ keputusan pengurus) + sound toast (SKIP V1).
  tsc + build EXIT 0.
  **Pixel-check Gus (4 item)**: hapus produk ber-riwayat â†’
  toast rose + tombol "Urungkan" (klik = reaktifkan, tabel
  refresh); bulk hapus 2+ â†’ "Urungkan" (semua diaktifkan lagi);
  tutup shift â†’ toast rose 90 dtk tanpa tombol; verifikasi harga
  emas dengan "Sinkronkan ke Pengaturan" â†’ toast amber 90 dtk.

### UX-5 H4: Breadcrumb visual (nested /admin/* /pengurus/*) -- SELESAI 27 Sep
- Implementasi (commit H4, 27 Sep, dual-push master+main):
  komponen pure `src/components/breadcrumb.tsx` + 3 hunk di
  `src/components/shell.tsx` (import + flag `showBreadcrumb` +
  render di top `<main>`). **0 edit halaman** -- rute nested =
  18 `/admin/*` + 1 `/pengurus/dashboard` ikut otomatis.
- Desain visual-only (tanpa logika): "Kopontren" = link tunggal
  ke `/`; item tengah inert (tanpa href -- /admin/ & /pengurus/
  tak punya index page); item terakhir `aria-current="page"`
  (bold). Separator `/`. Kamus label terpusat `LABELS` (gaya
  H2) + fallback kapital: QRIS, Data & Backup, Pengaturan
  Member; 3 level `/admin/notifications/settings` = "Kopontren
  / Admin / Notifikasi / Pengaturan". Deep-link SPA = milik H5.
- **Gap H2 ditemukan saat audit H4**: guard-fail
  `pengurus/dashboard` masih `redirect('/')` (file ke-11;
  batch H2 = 10 file). Fix = commit terpisah (H2 fix):
  import `roleHome` + `redirect(roleHome(user.role))`.
  Total I-5 selesai = **11 file** (kasir, laporan, piutang,
  retur, pengurus/dashboard, admin/{audit,dashboard,hutang,
  pengaturan-member,shift,zakat}).

### UX-5 H5: Notif deep-link SPA + bell pengurus (view admin|pengurus) -- SELESAI 27 Sep
- Implementasi (commit `a0b9f79`, 27 Sep, dual-push master+main;
  7 file): `auth.ts` +`isNotifViewer` (admin|pengurus);
  `shell.tsx` L93 bell admin|pengurus; `notification-bell.tsx`
  `onItem` = `router.push` (SPA, tanpa reload) + link eksternal
  `window.open('_blank')`; guard `/api/notifications` (list/count/
  read) + halaman `/admin/notifications` saka `isAdmin` â†’
  `isNotifViewer`, guard-fail = `roleHome(user.role)` (pola H2);
  copy hero "(admin & pengurus)".
- **Keputusan Q3 = opsi (a)**: VIEW = admin + pengurus
  (read-only); PENERIMA notifikasi tetep **admin-only**
  (`notify.ts` `getAdminUserIds` unchanged) â†’ bell pengurus =
  count 0. Follow-up "pengurus sebagai penerima" (prefensi +
  opt-in push) = backlog UX-6+. Settings + send + cron tetep
  admin-only.
- Pixel-check (Gus Fi, 6 item): (1) login **pengurus** â†’ bell
  keliatan (count 0); (2) `/admin/notifications` bukak
  (read-only); (3) settings tetep guarded; (4) login **kasir** â†’
  `/admin/notifications` = redirect `roleHome`; (5) link internal
  = SPA (ora reload); (6) link eksternal = new tab (bila ana).
- `tsc --noEmit` EXIT 0. **Pixel-check Gus Fi (BELUM)**:
  1 hal. `/admin/*` (mis. `/admin/produk`) di light + dark +
  mobile (wrap): breadcrumb tampil "Kopontren / Admin /
  Produk"; link "Kopontren" kerja; item terakhir bold.

### MULTI-ROLE M1: SUBSTANTIAL SELESAI (ACC eksekusi Gus Fi, 27 Sep; M1-1..M1-4 + M1-6 done; M1-5 = verify; riwayat keputusan di bawah)
- **Pertanyaan Gus Fi (27 Sep)**: account multi-role (siji akun duwe
  role langkung saka siji, mis. admin + member + kasir + pengurus).
  **Keputusan: ora diimplementasi saiki** -- model saat ini
  single-role (`users.role`); multi-role = backlog **M1** (TODO.md
  Kelompok M), target fase **UX-5.5 utawa UX-6**, tanpa kode saksaiki.
- **Alasan**: scope gedhe (DB `users.roles` array + migrasi skema
  v18; pemilihan role ing login; menu adaptif; audit "acting as
  which role"); model single-role saiki aman lan kasil; durung ana
  user sing ngbutuhke.
- **Rancangan M1 (besik diimplementasi)**: **primary role + access
  tambahan** -- primary role mrenteki menu utama; access tambahan liwat
  "mode switch"/dedicated link; audit log ngemot "acting as primary
  role"; session nggolongi role context. **Langkung aman ketimbang
  "union sagedhah role"** (menu campur + audit bingung). Estimasi
  ~4â€“5 commit: (1) skema v18 `users.roles` + migrasi idempoten;
  (2) auth/session role context; (3) pilih role login + menu adaptif;
  (4) audit "acting as"; (5) docs + resync kp-zip3.
  **Trigger**: nalika Gus Fi ngramesake kabutuhan nyata (contone
  siji wong sing sekaligus pengurus + member).
- **Pandhuan interim**: wong sing butuh peran pirang-pirang = akun
  pirang-pirang (HP/email beda); **jangan share akun** (audit trail
  per-akun tetep resik); admin bisa ndeleng card member dhewe ing
  `/member` (H3) menawa dipasangke.
- **EKSEKUSI M1 (ACC Gus Fi, 27 Sep)**: urutane M1 sadurunge P0
  Production Certification (Golden Path C1â†’C4). Patang keputusan desain
  wis ACC: (1) model **primary + additional (mode switch),
  active-role-only** (ora union-all); (2) kabeh user saged multi-role,
  admin ngassign via Pengguna page; (3) default role aktif mung login
  = **primary** ("last used" ora di-persist ing V1); (4) audit:
  snapshot `audit_log.user_role` = **acting role** (zero perubahan
  20+ route), event anyar `auth:switch-role` nrekam
  `{active_role: {before, after}, primary_role}`, **ora nambah kolom
  anyar** ing audit_log. Skema **Option A**: `users.roles` JSON +
  `sessions.active_role`, migrasi **V19**. Dokumen:
  `docs/m1-multirole.md`. Commit plan: M1-1 docs â†’ M1-2 skema V19 â†’
  M1-3 auth â†’ M1-4 UI â†’ M1-5 audit â†’ M1-6 test + release gate.
  **Renomer (ACC 27 Sep)**: commit `cc45511` ditag **M1-3-prep**
  (header shell, bagian dari M1-4) -- bukan M1-3. Maka: M1-3 = auth.ts +
  POST /api/auth/switch-role + session active-role; M1-4 = UI switcher
  (dropdown) + PUT /api/users edit role/roles; M1-5 = audit; M1-6 =
  test + docs + release gate. Progres: M1-1 selesai (`2dea8a3`),
  M1-2 selesai (`411f5b7`), M1-3-prep selesai (`cc45511`),
  M1-3 selesai (`b3b4f34`), M1-4 selesai (`0908155`),
  M1-6 selesai (`9a5f73c`).
  - **M1-4 `0908155` (4 file, +368/âˆ’28, 27 Sep)**: UI role
    switcher (dropdown shell/sidebar) + `pengguna-client`
    multi-role editor + `api/users/route.ts`: GET now includes
    `role` + `roles`; PUT validates explicit -- unknown role â†’
    400 "Role tidak valid." (BUKAN diam-diam 'kasir' / silent
    demote); guard self primary role; guard last admin demote;
    audit `user:roles` with before/after.
  - **M1-6 `9a5f73c` (4 file, +118/âˆ’24, 27 Sep)**:
    `parseUserRoles` moved to pure module `lib/features.ts`
    (testable under Node, no server deps); `scripts/test-roles.ts`
    added (30 assertions: ROLES set, normRole, parseUserRoles,
    release-gate gate); `package.json` += `"test:roles"` script
    (release-gate = `npm run test:roles` hijau).
    **Pitfall Node 24 + Windows**: `process.exit()` di akhir
    test â†’ libuv fastfail `UV_HANDLE_CLOSEREG` (exit 0xC0000409);
    fix = `process.exitCode` + keluar alamiah. tsc EXIT 0,
    build EXIT 0, test-roles ALL_PASS.
  - **M1-5 (audit)**: `auth:switch-role` + `user:roles` events
    sudah ada -- verify in release gate. Next: P0 Production
    Certification.

- **H2 scope final (27 Sep)**: redirect role-aware **tanpa redirect anyar
  saka `/`** (ngguyu Q2: home `/` tetep kanggo kabeh role, dashboard =
  drill-down): post-login + reauth PIN + setup PIN -> `roleHome(role)`
  (member -> `/member`; role internal -> `/`); guard-fail 10 sub-halaman
  (`kasir/laporan/piutang/retur/admin/{audit,dashboard,hutang,
  pengaturan-member,shift,zakat}`) `redirect('/')` ->
  `redirect(roleHome(user.role))` (ngguyu I-5); root `/` tanpa
  redirect (draft awal ngemu redirect member ing root -- kabale,
  ora selaras catetan plan). Peta terpusat: `HOME_BY_ROLE` +
  `roleHome()` ing `src/lib/features.ts` (re-export `@/lib/auth`).


### UX-5 FASE H: Information Architecture -- AUDIT SELESAI 27 Sep (H0 docs; ACC Q1-Q4; plan H0-H6)
- **Audit read-only (27 Sep, sesusih FASE G)** -- scope: sidebar,
  role-based UX, dashboard per role, alur kritis, mobile nav,
  breadcrumb + deep-link. Sumber: `sidebar.tsx` (groupsFor L243-304;
  ADMIN_GROUPS L31-75; PREFETCH L14-26), `bottom-nav.tsx` (NAV L41-68),
  `auth.ts` (FEATURE_MATRIX L64-76; canAccess L79), `shell.tsx`
  (L18 bottomnav-exclude /kasir; L89 bell admin-only),
  `notify.ts` (NOTIFY_TYPES L41-68: 20 jenis + prioritas + link
  statik), `notification-bell.tsx` (L123 `window.location.href`),
  guard per halaman (zakat/kas/qris/konsinyasi = isManager atau
  canAccess; pengaturan-member/pengguna/data/migrate = admin-only;
  notifications = isAdmin).
- **10 temuan (I-1..I-10)**: I-1 menu manajer "Keuntungan Member" â†’
  `/admin/pengaturan-member` admin-only = dead-end; I-2 filter
  group-level kasar (group "Sistem" ngusir item legal `/admin/laporan`
  dr manajer); I-3 hierarchy route adhoc (top-level `/` `/kasir`
  `/laporan` `/piutang` `/retur` vs nested `/admin/*` `/pengurus/*`);
  I-4 member ndeleng ringkasan toko purno (matriks: member =
  dashboard pribadi read-only); I-5 ora ana role-home (redirect
  unauthorized selalune â†’ `/`); I-6 alur shift kasir sakabÃ¨h 3 layar
  (ora ana shift-day screen); I-7 ora ana onboarding wizard first-run
  (mung banner `pw_default` ing `/` L80-97); I-8 breadcrumb = 0 situs;
  I-9 notif deep-link statik per jenis + full reload + bell mung
  admin; I-10 copy stale `/` L286-290 "baris atas di desktop"
  (ora ana top-row -- navigasi = hamburger drawer + bottom nav).
- **ACC Gus Fi Q1-Q4 (27 Sep)**: Q1 Loyalty **fold â†’ OPERASIONAL**
  (4 group: UTAMA/OPERASIONAL/KEUANGAN/SISTEM); Q2 home `/`
  tetep kanggo kabeh role (ora redirect role home; dashboard =
  drill-down, ora home); Q3 bell **+ pengurus read-only**
  (ORA kasir -- shift alerts wis ana ing POS UI); Q4 shift-day
  screen (I-6) + onboarding wizard (I-7) **defer â†’ UX-6+** (backlog).
- **H1 -- mapping itemâ†’level (verifikasi 27 Sep)**: saben item menu
  entuk level `Feature | 'ops' | 'admin'`: `Feature` â†’ `canAccess`;
  `'ops'` â†’ `isManager` (mirror guard Konsinyasi/Kas/QRIS -- ora ana
  Feature key 'ops' ing FEATURE_MATRIX, sengaja: menu level mung
  display, guard tetep isManager); `'admin'` â†’ mirror guard
  admin-only (pengaturan-member, notifications, pengguna, data,
  migrate). Mapping: UTAMA = Dashboard(laporan), Dashboard
  Global(laporan), Ringkasan(personal); OPERASIONAL = Kasir(pos),
  Produk(stock), Belanja(supplier), Konsinyasi(ops), Shift(shift),
  Retur(pos), Member(member), Keuntungan Member(admin);
  KEUANGAN = Kas(ops), QRIS(ops), Piutang(piutang), Hutang(supplier),
  Zakat(zakat), Laporan & Rekap(laporan); SISTEM = Laporan
  Pengurus(laporan), Notifikasi(adminâ†’H5), Audit(audit),
  Pengguna(admin), Data & Backup(admin), Import CSV(admin).
  Dampak: I-1/I-2 sirna (filter item-level, sumber siji = guard);
  label role-specific ("Produk & Stok (Opname)", "Hutang Supplier")
  â†’ label global siji (nuansa UX = tau Gus Fi).
- **H5 -- verifikasi 27 Sep**: `/admin/produk` **ORA** support
  `?focus=` (produk-client: search client-side `q`, ora ngguyu
  searchParams) + tabel `notifications` ora ana kolom
  entity-id/meta (schema: user_id,type,title,message,link,read,
  created_at) â†’ **V1 = link statik + navigasi SPA** (router,
  ganti `location.href`); entity-focus `?focus=<id>` = backlog
  follow-up (butuh schema + produk-client). Side-requirement Q3:
  bell pengurus **wajib** ngemong guard `/api/notifications`
  (GET/count) + `/admin/notifications` saka `isAdmin` â†’
  admin|pengurus (view read-only).
- **H5 -- SELESAI 27 Sep @ `a0b9f79`** (Q3 opsi (a)): viewer =
  admin + pengurus (read-only); penerima notifikasi tetep
  admin-only (`getAdminUserIds` unchanged â†’ bell pengurus = 0);
  detail + pixel-check 6 item = Â§ UX-5 H5; follow-up "pengurus
  sebagai penerima" (prefensi + opt-in push) = backlog UX-6+.
- **Plan commit (ACC'd)**: H0 docs (iki) â†’ H1 regroup +
  item-level filter + fix I-10 â†’ H3 member personal dashboard
  (filtered: poin/status/QR + transaksi saya; read-only; CTA QR
  badge) â†’ H2 role-aware redirect (ora ana redirect anyar saka `/`)
  â†’ H4 breadcrumb (mung nested `/admin/*` `/pengurus/*`, visual
  only) â†’ H5 deep-link SPA + bell pengurus (+ guard notif) â†’
  H6 docs + resync `kp-zip3` + pixel-check list. Total 6 commit
  + H0. Oka scope: I-3 route hierarchy, I-6, I-7, G2-full
  ternary `pos-client:714/892/901`, entity-focus = mangkase UX-6+.

### UX-4 FASE G: Modal size + Toast tones - G1+G2 SELESAI 27 Sep
- **G1 @ `99a3b20` (dual-push master+main, 3 file)**: `Modal`
  entuk prop `size?: 'sm'|'md'|'lg'` (default `'md'` = kelas
  lawas persis â†’ zero-delta). Token `MODAL_WIDTH`: sm=`max-w-xs`
  (320), md=`max-w-lg` (512, default), lg=`max-w-2xl` (672).
  Migrasi 2 dialog manual: `member-qr-badge` (default `md` --
  layar QR + meta) + `product-label` (`sm` -- 1 kolom label).
  tsc EXIT 0, build EXIT 0 (53/53).
- **G2 @ `0ffb072` (dual-push, 23 file +156/âˆ’108)**: toast
  semantik. `ToastTone = 'info'|'success'|'error'|'warning'`
  (ui.tsx) + `TOAST_TONE_CLASS` (info = kelas lawas persis
  zero-delta; success emerald-600, error rose-600 +
  `role="alert"` + `aria-live="assertive"` + auto-close 6s,
  warning amber-500). `Toast` entuk prop `tone` (default `'info'`).
  `useToast` saiki return 4-tuple `[msg, showToast, clearToast,
  tone]` -- backward-compatible (destructure 2/3 elemen lawas
  tetep valid). 22 file consumer ketambah `tone={toastTone}` +
  54 call ketag: **53 'error'** (mangga 22 file; LEFT=0) +
  **1 'warning'** (member-qr-badge: popup diblokir browser).
  Verifikasi: tsc EXIT 0 + build EXIT 0 (53/53) +
  `git status` = 23 M persis (sw.js untracked/gitignored --
  ora ngrusak git).
- **PITFALL KANGGO SESSION KENGSI (kritis)**: `member-qr-badge`
  duwe `useEffect` deps `[member, onQrChanged, showToast]` --
  elemen #2 lawas = `setMsg` (identitas stabil). Implentasi
  `showToast`/`clearToast` anyar WAJIB **`useCallback`** (deps
  kosong) sanalika efek ora re-run saben render (risk infinite
  fetch loop). Identitas stabil dipunyatakne kaya lawas.
- **Backlog G2-full (disingkirne, ora dipikuli G2-min)**:
  `pos-client:714/892/901` = ternary campuran
  success/error (`r.ok ? d.message : 'Transaksi gagal'` etc.)
  -- ditinggal `'info'`; butuh keputusan per kasus (mangkase
  ngrusak UX-5).
- **G3 (commit iki, dual-push)**: docs (MEMORY + TODO) + resync
  `kp-zip3` (kp â† D: full-mirror `src/` + `README.md`;
  `TODO.md`/`MEMORY.md` out-of-scope konvensi -- kp snapshot
  tanpa docs; `belanja-db.ts`/`backup.ts` = ora ana nang 2
  sisi = konsisten).
  **Pitfall resync**: `Copy-Item -Recurse src` = 7 file ing
  folder `api/**/[id]/` ora kecopy (kurung siku = wildcard
  regex PS, gagal diam-diam) -- bener: `Copy-Item -LiteralPath`
  per folder `[id]`. MD5 final: 0 differ.
- **G4 = pixel-check Gus Fi (5 item)**:
  1-3. 3 modals: **Panduan Kasir** (UX-2, ora owah G1/G2 --
     kontrol), **QR member** (`md` default), **label produk**
     (`sm`).
  4. Toast `'error'` (contone: kas save gagal â†’
     `bg-rose-600`, auto-close 6s).
  5. Toast default `'info'` (kelas lawas persis â†’
     zero-delta visual; kontrol positif).
- **Aturane git (pencatetan FASE G)**: repo = **1 remote
  tunggal `origin`** (github.com/kita-foska/kopontren,
  dikonfirmasi 27 Sep) -- dual-push = `git push origin master`
  + `git push origin master:main`. `public/sw.js` =
  untracked/gitignored (stempel build lokal; JANGAN
  di-commit -- sesuai aturan Â§ Cleanup).

### UX-4 FASE F: Typography scale cleanup - SELESAI 27 Sep (F0-F3, dual-push master+main; sisa: pixel-check HP)
- **Audit read-only (27 Sep, F0)**: `text-[10px]` = 26 +
  `text-[11px]` = 36 = **62 situs, 17 file** (ora ana
  arbitrary px liyane; angka 67 saka rencana 26 Sep = stale,
  tree saiki = 62). Per file: pos-client 23,
  member-qr-badge 8, charts 4, notification-bell 4,
  laporan-client 4, produk-client 3, ui 2,
  pengurus-dashboard 2, member-client 2, sidebar 2, shell 2,
  kas-client 1, notification-settings 1,
  notification-list 1, product-label 1, bottom-nav 1,
  qris-client 1.
- **Token ready** (FASE A, usage 0): `text-2xs` = 10px/15px,
  `text-1xs` = 11px/15px nang `tailwind.config.ts`.
  Standard scale: xs 282, sm 157, 2xl 44, lg 12, xl 7,
  base 5, 3xl 1.
- **Inkonsistensi micro-label KPI card** (4 varian):
  dominan `text-xs font-bold uppercase tracking-wide`
  (~30 situs) vs `pengurus-dashboard:316/324` +
  `pos-client:2267/2296/2319` (`text-[11px]`; pos-client
  uga `tracking-wider`) vs `notification-bell:203` +
  `notification-list-client:157` (`text-[10px]
  font-semibold`) vs `sidebar:172` (domain sidebar;
  `text-[10px] font-bold tracking-wider`). `ui.tsx:33
  Badge` = 11px font-bold (vs KPI + header `text-xs
  font-bold`). tracking/leading = CLEAN (0 arbitrary).
  Weight: bold 214 / extrabold 83 / semibold 44 / medium 5.
- **ACC Gus Fi (27 Sep, kabeh saranku ditampi)**:
  - Q1: **Opsi A** - keep `text-2xs`/`text-1xs` + swap
    mekanis (10pxâ†’2xs, 11pxâ†’1xs); Opsi B (retire â†’
    text-xs) ditolak.
  - Q2: include `ui.tsx:33 Badge`â†’`text-xs` (F2 = 10
    situs: pengurus-dashboard 316/324, pos-client
    2267/2296/2319, notification-bell 203,
    notification-list 157, ui Badge :33).
  - Q3: **4 commit terpisah** (F0 docs / F1 token /
    F2 label / F3 docs+resync) - isolasi diff.
  - Q4: `sidebar:172` **as-is** (documented exception:
    domain compact nav sidebar).
- **Out-of-scope FASE F (dicathet wae, durung ana
  aksi)**: blok receipt inline (`pos-client:1957-2051`,
  5 inline styles 14/13/11/10px + `globals.css:173` 9pt
  thermal 58mm), `sidebar:172` (Q4), label field
  login/pin (`text-xs font-semibold` - kandidat `.label`
  CSS ngendi), header seksi `zakat-client` `text-sm
  extrabold`, `member-client:527/535` (ora ana kelas
  ukuran - inherit).
- **Risk note (dicathet)**: `text-[10px]`/`text-[11px]`
  mung ngowahi font-size (line-height = inherit);
  `text-2xs`/`text-1xs` uga ngowahi line-height (15px) -
  delta â‰¤1px nang titik kenceng (badge h-5, receipt
  preview `pos-client:1833/1876`, bottom-nav `:88` +
  `leading-none`) - bagean pixel-check (item 1/2/6/7/8).
- **F0 SELESAI @ `d1f7574`**: catat audit + ACC (MEMORY +
  TODO) + bersihke scratch lokal `_fasef-*.txt`
  (`D:\Ngudi Susilo\`, di luar repo, konvensi
  git-ignored lokal). Dual-push.
- **F1 SELESAI @ `2ff5091`**: token map 61 owah 17 file
  (`text-[10px]`â†’`text-2xs`, `text-[11px]`â†’`text-1xs`;
  mekanis - weight/tracking/leading/werna saka situs
  tetep padha; blok receipt inline + print OUT-OF-
  SCOPE). 62 situs audit âˆ’ 1 (sidebar:172 Q4 as-is) = 61.
  Verify: residual `text-[10px]` = 1 (mung sidebar:172),
  `text-[11px]` = 0; tsc EXIT 0 + build EXIT 0 (sw.js
  revert) + dual-push master+main.
- **F2 SELESAI @ `ce7e0cd`**: `.card-label` (`@apply
  text-xs font-bold uppercase tracking-wide text-slate-
  500 dark:text-slate-400` nang `@layer components`,
  globals.css:93) + unifikasi 10 situs (Q2): pengurus-
  dashboard:316/324, pos-client:2267/2296/2319,
  notification-bell:203, notification-list:157,
  Badge ui.tsx:33 `text-1xs`â†’`text-xs`. 6 file +13/âˆ’8.
  Delta visual (ACC'd): KPI label 11pxâ†’12px + dark
  variant; pos h3 tracking-widerâ†’wide; bell/list meta
  10px semiboldâ†’12px bold. Residual `tracking-wider` =
  sidebar:172 (Q4) + member-qr-badge:231 (ora nang Q2
  list = out-of-scope, ora disentuh). tsc EXIT 0 +
  build EXIT 0 + dual-push master+main.
- **F3 (commit iki)**: docs update (MEMORY + TODO, FASE
  F F0-F3) + pixel-check list final (8 item, delta F2
  dicathet) + resync kp-zip3 `src/` (mirror + MD5
  verify). Dual-push.
- **Pixel-check list F1+F2 (Gus Fi, ing HP)**:
  1. `/kasir` - receipt preview + mini-button Lunas/
     10k...100k + hotkey hint.
  2. `/kasir` - tab kategori + payment pills + KPI
     badges (TogglePill badge 2xs extrabold; chip
     emerald/amber 10pxâ†’2xs) + modal Panduan Kasir h3
     `.card-label` 12px (delta F2).
  3. `/home` + dashboard pengurus - label kartu KPI
     `.card-label` 12px bold (delta F2: 11pxâ†’12px +
     dark variant) + sub-line nilai (1xs).
  4. `/laporan` - label KPI + sub-line "Periode
     terpilih".
  5. `/admin/notifikasi` - label meta panel bell/list
     `.card-label` 12px bold (delta F2: 10px semibold
     â†’12px).
  6. Cetak kartu member / QR / label - konfirmasi
     muat 58mm (blok print durung disentuh).
  7. `/admin/produk` - chip sku mono (2xs) + garis
     hint (1xs).
  8. Bottom nav - label (2xs + `leading-none`).
- **Catatan operasional**: local branch `main` isih
  stale (behind 34; mung artifact lokal -- remote main =
  master = `013a182` padha; dual-push via `git push
  origin master:main`; local `main` ora diurati).

### UX-4 FASE E: Card unification + FilterPill/TogglePill - SELESAI 27 Sep (E0-E4, dual-push master+main)
- **Audit read-only (ora kode)**, laporan lengkap nang sesi AI 27 Sep:
  - Card: hero 5 site drifty (3x `shadow-md` vs 2x flat; aturan
    `.hero-bg` = flat tanpa shadow); modal/panel 3 radius x 3
    shadow (Modal `card`+`rounded-xl`, QR/label `rounded-2xl
    shadow-xl`, bell/tooltip `rounded-xl shadow-lg`); tile hover
    drifty (admin `hover:-translate-y-0.5` vs pengurus
    +`hover:shadow-md`); stray `shadow` mentah (`sidebar.tsx:187`,
    print `pos-client:2110`); anomali `pos-client:1781`
    `font-bold shadow-md` (shadow neng teks - pixel-check Gus).
  - Pill: label lama `sub-sm` (audit 26 Sep) ora ana nang tree -
    chip saiki raw button. Kandidat: F1 `laporan-client:248-259`
    (chip periode rounded-full); F2 `pos-client:1213-1241` (tab
    kategori, hover micro-drift vs F1); T1 `pos-client:1561-1599`
    (segmented payment + "Campur" amber); T2 `produk-client:551-562`
    (toggle status soft-tint emerald/slate); T3 `produk-client:623-632`
    (toggle satuyune nang mobile - `<Button variant="ghost"
    active>`; 2 bahasa visual kanggo satusemanti).
  - `Button` wis ada `active` + `aria-pressed` (ui.tsx) -> pill
    gampang dipasang; 79 raw-button exception tetep (blok sumber
    pill = 5).
- **Proposal (dhuwurena)**: Opsi A - kelas CSS + 2 primitive, ora
  `<Card>` React (container statis): `globals.css` += `.card-hero`
  (flat), `.card-dialog` (`rounded-2xl shadow-xl`), `.card-pop`
  (`rounded-xl shadow-lg`), `.tile-hover`; `ui.tsx` += `<FilterPill>`
  (unifikasi F1+F2) + `<TogglePill>` (mode `tinted`=T2 /
  `segmented`=T1, accent `amber`, ikon + badge opsional).
- **Commit plan**: E0 (docs+koreksi kp, commit iki) -> E1
  (primitif add-only) -> E2 (migrasi card, ~8 file, delta visual)
  -> E3 (migrasi pill, 3 file, delta visual) -> E4 (docs +
  dual-push + sinkron kp-zip3); maks 7 commit manawa E2/E3 split.
- **ACC Gus Q1-Q5 (27 Sep, kabeh IYO)**: Q1 hero flat (3x
  `shadow-md` ilang); Q2 dialog = `rounded-2xl shadow-xl`,
  popover = `rounded-xl shadow-lg`; Q3 T3 mobile -> tinted
  selaras T2 (parity desktop+mobile); Q4 `pos-client:1781`
  shadow teks dihapus; Q5 deprecate clone
  `C:\Users\baiti\Desktop\kp` (kanonik = `D:\Ngudi Susilo\kp-zip3`).
- **E1 `05c65aa`** (feat/ui, add-only): `globals.css` +=
  `.card-hero` (flat) / `.card-dialog` / `.card-pop` /
  `.tile-hover` + token shadow; `ui.tsx` += `<FilterPill>`
  (F1+F2) + `<TogglePill>` (mode `tinted`/`segmented`, accent
  `amber`, ikon + badge opsional; auto `type="button"` +
  `aria-pressed`, passthrough spread role/aria/title/disabled).
- **E2 `06cbe8b`** (refactor/ui, 11 file, delta visual): hero 5
  site flat via `.card-hero`; modal/panel via `.card-dialog` /
  `.card-pop` (Modal, QR/label, bell/tooltip); tile hover
  standar `.tile-hover`; stray `shadow` (`sidebar.tsx:187` +
  print `pos-client:2110`) distandarkan; anomali
  `pos-client:1781` `font-bold shadow-md` DIHAPUS (Q4).
  tsc EXIT 0, `next build` EXIT 0 (53/53 rute).
- **E3 `4572b3f`** (refactor/ui, 3 file +30/-59, delta visual):
  F1 `laporan-client` - 4 chip periode -> `FilterPill`; F2
  `pos-client` - tab kategori (Semua + N) -> `FilterPill`
  (`role="tab"`/`aria-selected` spread; drift hover distandarkan
  `hover:bg-slate-100 dark:hover:bg-navy-800` = normalisasi E1,
  BUKAN regression); T1 `pos-client` - 3 metode bayar ->
  `TogglePill` segmented (ikon + badge 1-3), "Campur" ->
  `TogglePill` accent=amber badge 4; T2/T3 `produk-client` -
  toggle status Aktif/Nonaktif desktop + mobile -> `TogglePill`
  tinted (Q3: 2 bahasa visual jadi satune; `!!p.active` ngarep
  prop boolean). tsc EXIT 0, build EXIT 0.
- **E4 (commit iki)**: docs (MEMORY/TODO) + sinkron kp-zip3
  (mirror `src/`: copy semua file, hapus 3 file yatim
  `navpills.tsx`/`themetoggle.tsx`/`logout.tsx`, hash-verify
  MD5 per file 0 differ) + dual-push. Q5 FINAL:
  `C:\Users\baiti\Desktop\kp` = DEPRECATED (stale, reference-only);
  `D:\Ngudi Susilo\kp-zip3` = KANONIK (resync rutin, non-git).
- **Housekeeping decision (27 Sep)**: 2 CSV stok 09/23
  (`stok-export-20260923.csv` + `stok-import-admin-20260923.csv`)
  = RETAIN (material item 4 upload CSV; salah satune tracked);
  scratch `_*.txt/_*.ps1` = git-ignored lokal (tetep nang D,
  ora ke-push); `.cline/` = data lokal Cline (untracked; wengi
  di-gitignore).
- **Pixel-check list (Gus Fi, pasca E2+E3)**:
  1. `/home` + dashboard admin/pengurus - hero card flat (ora
     shadow), tile hover standar.
  2. Modal QR/label + popover bell/tooltip - radius/shadow
     standar `card-dialog`/`card-pop`.
  3. F1 `/laporan` - 4 chip periode (Hari ini/7 hari/30
     hari/Semua): state active + inactive.
  4. F2 `/kasir` - tab kategori (Semua + N): active/inactive +
     hover `bg-slate-100`.
  5. T1 `/kasir` - metode bayar tunai/transfer/QRIS segmented
     (ikon + badge 1-3); "Campur" amber badge 4.
  6. T2/T3 `/admin/produk` - toggle Aktif/Nonaktif desktop +
     mobile (tinted, parity Q3).
  7. `pos-client:1781` - anomali shadow teks wis ilang (Q4).
- **Koreksi kp (S5)**: section "Aturan kerja repo" wis di-update
  (3 entitas; kp-zip3 = kanonik). E0 mung docs -> ora ana
  sinkron kp.

### UX-4 FASE D: tabel primitives + cleanup CSS legacy -- SELESAI 27 Sep (4 commit, dual-push master+main)
- **D0 `4dd28c2`**: chore(css) -- hapus 5 rules `.btn` yatim
  (`.btn`/`.btn-primary`/`.btn-ghost`/`.btn-danger`/`.btn-amber`)
  dr `globals.css` (debt B.4: laporan sebelumnya menyebut sudah
  terhapus, padahal belum) + 2 komentar stale di `ui.tsx`.
- **D1 `0637ee7`**: feat(ui) -- tambah primitive `Table`/`Th`/`Td`/
  `Trow`/`TEmpty` + 3 konstanta kelas (TH_CLS, TD_CLS, TROW_BORDER)
  di akhir `ui.tsx` (add-only; kelas legacy `.th`/`.td`/`.table-row`
  dibake sebagai Tailwind supaya `globals.css` bisa dibersihkan
  pasca-migrasi). `Table`: w-full + `minW` + `stickyHead`; `Trow`:
  hover + border none/top/bottom + spread atribut tr mentah;
  `TEmpty`: baris colSpan penuh + teks tengah.
- **D2a `9a20a1b`**: refactor(admin) -- migrasikan 7 tabel legacy ke
  primitives (dual-push).
- **D2b `5ac6080`**: refactor(tables) -- migrasikan 4 tabel admin
  terakhir: `kas-client` (4 kol + TEmpty colSpan 4 + CTA
  scroll-to-form), `pengguna-client` (5 kol + TEmpty colSpan 5),
  `migrate-client` (3 tabel: T1 stickyHead + T2/T3 rose panel,
  `Trow border="none"` + pemisah border-t rose), `zakat-client`
  (2 tabel: T4 `border="bottom"` + highlight emerald kondisional +
  last:border-0; T5 log history). 5 file, +126/âˆ’141; rules
  `.th`/`.td`/`.table-row` dihapus dr `globals.css` (âˆ’9 baris).
  `kas`+`pengguna` = 2 file terakhir yg pakai CSS legacy (scan
  repo-wide); `migrate`+`zakat` manual Tailwind â†’ dimigrasi utk
  konsistensi, bukan cleanup CSS.
- **Delta approved (keputusan 27 Sep, Opsi A -- 6+2)**:
  (1) header `px-3 py-2`â†’`px-3 py-2.5` + bold uppercase slate-500;
  (2) sel `py-1.5`/`py-2`â†’`py-2.5` (8â†’10px); (3) rose panel
  (migrate T2/T3) teks 12â†’14px; (4) `w-full`â†’`min-w-[32rem]`;
  (5) weight/werna header dibake nang primitive; (6) zakat
  `w-full`â†’`min-w-[32rem]` + sel 10px; (7) kas+pengguna: dividers
  & hover `.table-row` ilang â†’ selaras bahasa app-wide D2a (ora
  dividers, ora hover; konsistensi nggantosi keunikan per-file;
  manawa dikepengke, siji baris `Trow className` per file);
  (8) kolom pungkasan `px-3` simetris (zakat T4/T5 + migrate
  T2/T3 kolom "Alasan": padding 12px kiwa-tengen).
- Verifikasi: `tsc --noEmit` EXIT 0; `npm run build` EXIT 0
  (53/53 rute); grep `className="th"`/`className="td"`/`table-row`
  nang `src/**` = 0 referensi fungsional (sisa = 2 doc comment
  `ui.tsx` L833/L906 -- follow-up opsional, ana item TODO);
  `public/sw.js` clean (stamping build tak ngrusak file tracked).
- **Exception disengka (tinggal)**: 79 raw `<button>` Phase B
  (chip sub-sm "Maks" `pos-client`, toggle status `px-2.5 py-0.5`
  `produk-client`, tombol fill emerald "Riwayat" `member-client` --
  liwat keputusan FASE B2/C2/C3 di ndhuwur; revisit manawa 5+
  chip sub-sm).
- **Pixel-check real device: GUS FI pasca-push** -- 4 halaman durung
  visual diverifikasi: `/admin/audit`, `/admin/member`,
  `/admin/produk`, `/admin/data` (+ tabel FASE D liyane manawa
  durung ketoke). Breakage â†’ follow-up commit.

### UX-4 FASE C: migrasi Button + hapus CSS legacy -- SELESAI 27 Sep (commit 3a59c9a, dual-push master+main)
- 30 file (+561/âˆ’583): ~120 tombol raw `.btn/*` digantikan komponen
  `<Button>` (FASE B.1 @ `592b230`: 5 varian primary/outline/ghost/
  danger/link Ã— 3 ukuran sm 36 / md 44 / lg 52 px + link override
  teks via `className` aman). Aturan legacy dihapus dr `globals.css`:
  `.btn`, `.btn-primary/-secondary/-ghost/-danger/-success/-sm`,
  `.btn-xs`, `.field`, `.card-field`, `.card-field-error`. Error state
  diseragamkan `text-red` â†’ `text-rose` (token `risk`=rose; 22 file).
- Exception disengka (keputusan FASE B2/C2/C3 di atas): chip sub-sm
  ("Maks" `pos-client`, toggle `px-2.5 py-0.5` tabel `produk-client`)
  + tombol fill emerald "Riwayat" kartu mobile `member-client` TETAP
  raw button -- override `bg-*` kalah deterministik (slate/rose menang)
  + override min-height via `className` rapuh (Tailwind CSS order).
- Verifikasi: `tsc --noEmit` EXIT 0; grep `btn-*`/`.field`/`.card-field`
  = 0 referensi fungsional (karena aturan CSS-nya sendiri sudah
  dihapus, jadi tak bisa hidup diam-diam); `next build` EXIT 0;
  `public/sw.js` skip-worktree tak terganggu.
- **Pixel-check real device: GUS FI pasca-push** -- tombol kini global
  min-height 44px + werna varian; bila ada breakage â†’ follow-up commit.

### UX-4 FASE B2 (C2): keputusan chip sub-sm -- "Maks" (27 Sep)
- Chip sub-sm (mis. "Maks" di `pos-client`, toggle status `px-2.5 py-0.5`
  di tabel `produk-client`) **disengaja dipertahankan sebagai raw
  button** -- tak di-`<Button>`-kan. Alasan: terlalu kecil untuk size
  Button saiki (sm 36 / md 44 / lg 52 px) + override min-height via
  `className` rapuh (Tailwind CSS order). **Revisit manawa mudhun
  5+ chip sub-sm** â†’ tambah size `xs` ing wiwitan.
- Link variant: override werna teks via `className` aman & deterministik
  (slate/rose/emerald mudhun accent ing CSS generated -- alphabetik),
  nalika override werna fill (bg-*) LORA bisa (slate/rose menang) â†’
  tombol fill emerald (mis. "Riwayat" kartu mobile `member-client`)
  tetep raw button, dilaporakÃ© minangka exception.

## 2026-09-26
### UX-4 FASE A: Design Tokens -- SELESAI 26 Sep (commit 5698b74, dual-push master+main)
- Acuan: goal document UX (95 usulan, 8 fase; roadmap E1-E40/P1-P15/Q41-Q95).
  Re-implementasi dari versi kp (D: primary mulai 26 Sep). 9 file, +143/âˆ’47:
  (1) `tailwind.config.ts`: role alias `risk`=rose, `success`=emerald,
  `attention`=amber, `info`=blue, `gold`=amber, `wine`=#7A1C1C; fontSize
  2xs/1xs; radius card/field; shadow card; zIndex nav/overlay/modal/toast/pop.
  (2) `globals.css`: var semantik `:root`; `.card`/`.input`/`.btn`/`.hero-bg` â†’ token.
  (3) `src/lib/tokens.ts` BARU: objek `T` (25 key) utk JS/SVG/inline/print.
  (4) `layout.tsx`: themeColor `T.accent500`.
  (5)â€“(9) `member-qr-badge` (13 edit), `migrate-client` (8), `audit-client` (2),
  `product-label` (7), `pos-client` (8): redâ†’rose, skyâ†’blue,
  hex mentah â†’ `T.*` / `bg-wine-700`.
- Aturan ke depan: hex mentah di komponen larangan; wajib `T.*` /
  kelas Tailwind. (Hex sisa hanya di file token + 1 komentar doc
  `ui.tsx:17`, bukan style -- accepted.)
- Verifikasi: `tsc --noEmit` exit 0; sweep `red-*`/`sky-*` = 0;
  `next build` exit 0, 53/53 rute.
- Catatan: push S3 ikut mem-push `a16e058` (revisi laporan 26 Sep)
  yang tadinya baru local D.

### Aturan kerja repo (S5, 26 Sep - koreksi FASE E0, 27 Sep)
- **Hanya `D:\Ngudi Susilo\kopontren-app` utk write + commit (primary).**
- 3 entitas "kp" (koreksi 27 Sep):
  1. `D:\Ngudi Susilo\kp-zip3` = **snapshot file reference resmi**
     (plain file, BUKAN git clone; tanpa MEMORY.md/TODO.md).
     Resync = salin file dr D (`Copy-Item -Recurse src` + file
     terkait), verifikasi hash per file. Terakhir sinkron: pasca
     G3 FASE G (pasca `0ffb072`, 27 Sep, full-mirror `src/` +
     hash-verify MD5 per file 0 differ).
  2. `C:\Users\baiti\Desktop\kp` = git clone lama (stale @
     `9a20a1b` D2a) - **DEPRECATED (keputusan final Q5, 27 Sep)**:
     reference-only, JANGAN sinkron rutin; kanonik =
     `D:\Ngudi Susilo\kp-zip3`. Manawa perlu sekali: `git fetch
     origin && git reset --hard origin/master` (untracked scratch
     dibersihkan manual dhisik).
  3. `D:\Ngudi Susilo\kp-zip` = snapshot legas (layout lama,
     tanpa `src/app`) - DEPREKASI, jangan dipakai lagi.

### UX-2: EmptyState CTA + PanduanKasir (26 Sep)
- **Acuan goal document (Gus Fi, 3 file, 95 usulan, 8 fase UX-2 s.d.
  UX-8).** UX-2 = R2 (EmptyState CTA) + R4 (PanduanKasir) -- SELESAI
  hari ini, 2 commit, dual-push master+main tiap commit.
- **R2 -- EmptyState CTA** (commit `32d0538`, 12 file, +225/âˆ’51):
  `EmptyState` menerima `ctaVariant="primary"` -- hanya dashboard +
  laporan yang pakai primary; CTA scroll-to-form (6 ID target
  terverifikasi) + import `canAccess` di laporan; upgrade banner
  shift di POS. Verifikasi: tsc 0, `next build` EXIT 0 (53 rute --
  +1 `/api/zakat/gold-standards` dari `ebe2e8a`, expected), smoke
  10/10 route (307â†’login utk guarded), dual-push @ `32d0538`.
- **R4 -- PanduanKasir** (commit `e7130c3`, 1 file `pos-client.tsx`,
  +90/âˆ’19): tombol ghost "Panduan kasir" (ikon `BookOpen`) di banner
  shift + modal "Panduan Kasir" 3 seksi: (1) **Cara transaksi** --
  5 langkah: 1 pilih produk (F1/scan), 2 pilih pembeli
  **(opsional)**: F2 nama bebas / F8 member terdaftar (poin
  loyalitas otomatis), 3 bayar: 1 tunai Â· 2 QRIS Â· 3 transfer Â·
  4 campur (F6) + F3 uang diterima, 4 simpan (F4), 5 struk
  (F5 / Ctrl+P) + bagikan WA; (2) **Pintasan** -- CHEAT_ROWS +
  catatan (panah/+/-/Del di luar kolom ketik; Ctrl+H bisa ditahan
  Chrome â†’ via menu Laporan); (3) **Jika ada masalah** -- 4 bullet
  aksi konkret: internet mati (lanjutkan saja, antre offline
  sinkron otomatis), item salah (â†‘â†“ / +âˆ’ / Del / Ctrl+R), sudah
  tersimpan tapi keliru (buka Laporan & Rekap Ctrl+H; retur via
  halaman Retur), lupa pintasan (tekan ?). Opsionalnya pembeli
  terverifikasi di `checkout()`: payload `customer`/`member_id`
  boleh kosong. Verifikasi: tsc 0, build EXIT 0, dual-push @
  `e7130c3`. **Pixel-check real device: Gus Fi pasca-push** --
  bila ada breakage â†’ follow-up commit.
- **SW.js guard -- KOREKSI 26 Sep (verifikasi `git ls-files` +
  `check-ignore` + `ls-files -v` + `git log --all`)**: `public/sw.js`
  **TER-TRACK** ing index; **bukan** gitignored (`check-ignore`
  kosong, ora ana pattern sw ing `.gitignore`). `git ls-files -v` =
  `S public/sw.js` â†’ skip-worktree AKTIF, file katon werni ing
  `git status`. `git log --all -- public/sw.js` katon stempel
  SW-BUILD sawetara commit kepungkur (`3b38685`, `d3e99f5`, etc.) --
  file iki saged ing repo. Dadi bener = opsi (a), **bukan** (b)
  (klaim UX-2 "gitignored/ta track" ora bener). Guard sing bener:
  skip-worktree + disiplin mboten `git add public/sw.js` dhewe.
  Perencanaan future-proof: TODO.md line ~180 "sw.js refactor
  template-generate" bakal ngasilake `public/sw.src.js` ter-track +
  `public/sw.js` generated + `public/sw.js` ing `.gitignore`.
- **UX-3: TermTip + StatusBadge + rename `.grad-hero`** (26 Sep):
  - **TermTip** (`src/components/ui.tsx`): hover + click/tap pin, ikon
    `CircleHelp` (lucide), render di bawah label, `max-w-[220px]`,
    anchor `left`/`right` otomatis via `getBoundingClientRect()`
    (elemen di separuh kanan layar â†’ tooltip ke kiri). ESC + klik luar
    tutup. Diterapkan di: `laporan-admin-client` (HPP, Laba Kotor),
    `zakat-client` (Nishab, Haul, Kadar, Mode Penilaian),
    `produk-client` (HPP tabel + form), `konsinyasi-client` (Komisi).
  - **StatusBadge diperluas** (`ui.tsx`): `STATUS_MAP` kini mencakup
    `open`, `settled`, `overdue`, `active`, `done`, `habis`, `tipis`,
    `aman`, `wajib`, `belum`, `provisional`, `running`, `closed`
    (13 status). Tambah tone `maroon` dan `gold` ke `Badge`.
    `StatusBadge` menerima override `tone` + `label` untuk jumlah
    dinamis. Diterapkan di: `piutang-client`, `hutang-client`,
    `konsinyasi-client` (status Selesai/Aktif), `produk-client`
    (Habis/Tipis/Aman).
  - **Rename `.grad-hero` â†’ `.hero-bg`**: definisi di `globals.css`
    + 7 file tsx (login, pin, pin/setup, admin/dashboard,
    admin/notifications, admin/notifications/settings, page.tsx,
    pengurus/dashboard). Alasan: nama lama "grad" menipu karena
    background-nya solid flat, bukan gradient.
  - Verifikasi: `tsc --noEmit` exit 0 (0 error).

### Konsolidasi revisi progres + rencana depan UX (26 Sep, sesi AI)
- **Revisi user (10 poin) diterapkan di dokumen** (tidak mengubah kode):
  "SIAP PRODUKSI" â†’ **Engineering: Production Candidate;
  Operational/Syariah: Pending Verification/Tashih**; klaim "0
  engineering WIP" dihapus (UX-2 masih berjalan, UX-3 belum mulai);
  **zakat 24K diturunkan ke PROVISIONAL/configurable** (MUI Komisi
  Fatwa 2026 masih mengkaji karat utk zakat penghasilan; std 14K
  BAZNAS 2026 = zakat pendapatan/jasa -- jangan digeneralisasi ke
  perdagangan; riwayat std di `zakat_gold_standards` append-only);
  akumulasi harian = mekanisme implementasi (bukan fiqih final);
  ta'jil = provisional, tidak menggeser haul; **P4 "default 20%" =
  preset operasional, bukan ketentuan syariah**; mapping akuntansi
  (supplier goods â‰  revenue; ujrah â†’ revenue; hak pemilik â†’
  settlement payable) = **provisional nunggu tashih P4**.
- **BARU `PROGRESS-2026-09.md`**: laporan 36 bagian (periode
  18â€“26 Sep) versi revisi + rujukan (MUI, BAZNAS zakat perdagangan,
  DSN-MUI 113/2017, BAZNAS zakat penghasilan 2026). HEAD git aktual
  saat konsolidasi = `10c8e87` (komit UX-1a P1â€“P4), clean.
- **TODO.md**: seksi baru "RENCANA KEDEPAN -- UX MASTER PLAN & BACKLOG
  (usulan, nunggu ACC)" -- roadmap fase UX-2..UX-8 (UX-4 = Design
  System, UX-5 = IA/role-based, UX-6 = Attention + Explain This
  Number, UX-7 = Power User/Ctrl+K, UX-8 = Operational Safety),
  10 prioritas utama, gate kualitas "5 rasa / 6 kata", backlog
  **E1â€“E40 (Experience Layer) + P1â€“P15 + Q41â€“Q95** (95 item,
  BELUM kode -- tunggu ACC), aturan "jangan dulu" Bagian-35, +
  checklist HP **"TermTip mobile viewport edge check"** (masuk
  daftar Gus setelah UX-3).
- **SYARIAH-CHECKLIST.md**: 4 edit target nyelarke revisi (Seksi F
  nisab/karat provisional; tabel baris 10; P3-b; P4) -- klaim lama
  24K-final dipertahan sebagai histori 24 Sep, di-overwrite
  in-line "Koreksi 26 Sep".
- Commit lokal master; **belum push** (nunggu Gus).

### ZAKAT v17: payment_type di zakat_history (26 Sep)
- **Permintaan user**: catat media pembayaran zakat di riwayat zakat
  (UI + API). 4 nilai: `cash` (tunai) / `transfer` (transfer bank) /
  `qris` / `other` (lainnya); nilai tak dikenal atau kosong
  dinormalisasi ke `cash` (konservatif, selaras default baris lama).
- **Skema v16â†’17** (`src/db.ts`): kolom additive
  `zakat_history.payment_type TEXT NOT NULL DEFAULT 'cash'`; DB
  existing dapat kolom lewat `execColumn` idempoten (guard
  `PRAGMA table_info`) saat cold start -- tanpa rewrite baris lama.
  `CREATE TABLE` fullInit ikut kolom + `SCHEMA_VERSION = 17`.
- **Modul murni anyar `src/lib/zakat-payment.ts`** (pola
  `zakat-period.ts`, tanpa dependensi Next): `ZAKAT_PAYMENT_TYPES`
  (readonly const) + `ZakatPaymentType` + `normalizePaymentType(v)`.
  Catatan: Next.js melarang *value export* selain HTTP handler di
  `route.ts` (type-check `OmitWithNull` gagal) â†’ helper TIDAK boleh
  diekspor dari `src/app/api/zakat/route.ts`, dipindah ke lib.
- **POST `/api/zakat`**: field opsional `payment_type` di body â†’
  `normalizePaymentType` â†’ INSERT `zakat_history`; `logAudit`
  `zakat:record` after-JSON memuat payment_type.
- **GET `/api/zakat/history`**: SELECT + tipe baris + ekspor CSV
  kol. `payment_type` (setelah `note`); baris lama tampil 'cash'
  (default DB).
- **UI `/admin/zakat`** (`zakat-client.tsx`): select "Media
  Pembayaran" di form catat zakat (default 'cash'), kolom "Media"
  di tabel riwayat; `ZakatHistoryRow.payment_type: string`.
- **Verifikasi**: `npm run test:zakat` 18/18 ALL_PASS; `next build`
  EXIT 0. (Env lokal: `@next/swc` & 35 paket lainnya sempat rusak --
  `npm install` memperbaiki; bukan issue kode.)

### ZAKAT -- FASE 2: status provisional (26 Sep)
- **STATUS PROVISIONAL**: Provisional -- implemented based on strongest
  available fiqh position. Pending tashih by pengasuh. Subject to
  correction. (Formula periodik konservatif per P3: haul 1 tahun
  tetap, laba terakumulasi sejak `last_zakat_date`, modal @ HPP,
  harga emas manual 24K; + pencatatan media pembayaran v17.)
  FASE 2: Step 1 (implementasi posisi terkuat) SELESAI -- menunggu
  tashih pengasuh (`P3-TASHIH-ZAKAT.md`). (Step 2 provisional
  terapkan di entry di bawah: "ZAKAT -- FASE 2 Step 2".)
- **Catatan audit (waktu itu) -- formula yang live masih FORMULA
  LAMA**: `modal + laba + piutang âˆ’ hutang` + HPP, harga emas
  manual 24K (v17 hanya menambah pencatatan media pembayaran,
  TANPA mengubah formula). Status provisional = keputusan untuk
  MENJAGANYA secara sementara, BUKAN formula baru. (Koreksi
  trancribes lama: kutipan "modal + laba âˆ’ hutang âˆ’ piutang" salah;
  code asli `src/app/api/zakat/route.ts` = `modal + laba +
  piutang âˆ’ hutang`.)

### ZAKAT -- FASE 2 Step 2: logika P3 provisional (26 Sep)
- **Lakukan Step 2 SEBELUM hasil tashih** (keputusan user): logika
  P3 diimplementasikan sebagai posisi provisional; revisi hasil
  tashih pengasuh = komit terpisah (Step 3 = P4 dokumen hanya).
- **Modul murni anyar `src/lib/zakat-valuation.ts`** (pola
  `zakat-period.ts`, tanpa dependensi Next): `computeValuation`
  (mode market/hpp; market default, V1 proxy = harga jual produk),
  `computeAccrual` (proporsional hari haul sejak anchor),
  `computeHaulAnchor` (fallback: `haul_start_date` â†’
  `last_zakat_date` â†’ awal bulan WIB; clamp â‰¤1 thn utk anomali
  + 29 Feb), `computeBalance`.
- **Haul anchor**: `last_zakat_date` TIDAK lagi me-reset siklus
  akumulasi -- pembayaran zakat = ta'jil, hanya audit trail +
  fallback bila `haul_start_date` kosong.
- **Skema v17â†’18** (`src/db.ts`, add-ops `execAdditive`):
  `zakat_gold_standards` (append-only: karat, price, source,
  price_date, created_by; index `price_date` DESC) +
  `ZAKAT_SETTING_DEFAULTS.valuation_mode = 'market'`.
- **Route `/api/zakat`**: GET+POST memuat `valuation_mode`,
  `haul_anchor`, `accrued`, `days_in_haul`; GET juga
  `gold_standard` (log terbaru) â†’ harga efektif; cache
  `zakat:calc` TTL 15 mtk.
- **Route anyar `/api/zakat/gold-standards`**: GET (tier
  `laporan`+) 100 baris terbaru; POST admin-only (insert).
- **UI `/admin/zakat`** (`zakat-client.tsx`): label status
  provisional + banner amber, select `valuation_mode` +
  form/tabel log standar emas (TANPA hapus -- append-only),
  stat card Haul & Akumulasi, detail kalkulasi memuat
  anchor/hari/accrual/standar emas (setting vs log).
- **Test `scripts/test-zakat.ts`**: +9 kasus (total 37) -- mode
  penilaian (market/hpp), accrued proporsional + edge (anchor
  masa depan = 0), settlement balance, fallback anchor. SEMUA PASS.
- **Verifikasi**: `npm run test:zakat` 37/37 ALL_PASS;
  `npx tsc --noEmit` EXIT 0; `next build` EXIT 0.
- **Catatan sitasi P3 (1 Okt 2026)**: referensi fatwa MUI utk zakat
  yg dahulu dicantumkan DILEMAHKAN -- nomor fatwa MUI utk zakat
  tijarah belum terverifikasi, dan no. lama (fatwa pembiayaan
  musyarakah, domain DSN-MUI muamalah) tidak berlaku utk zakat.
  Dasar tashih kini memakai konsensus ulama (Syafi'i / Maliki /
  Hanbali) + Muktamar NU ke-35 (nisab 85 g emas murni 24K). Tersimpan di
  `P3-TASHIH-ZAKAT.md` Â§D (md+html), SYARIAH-CHECKLIST Â§F, TODO.
- **Catatan**: skema v18 add-ops -- DB turunan (Vercel Turso)
  butuh migration/PRAGMA saat cold start; jangan rewrite data.

### FASE 2 Step 3: dokumen P4 only -- SELESAI (26 Sep, commit 3, dual-push master+main)
- **Perintah user (26 Sep, pasca-verify commit 2 `ebe2e8a`)**:
  lanjutkan Step 3 = P4 dokumen only -- TANPA perubahan kode,
  TANPA migrasi baru; tunjukkan diff sebelum commit; tunggu review.
- **Mapping akuntansi P4** (posisi fiqh terkuat, PROVISIONAL)
  ditambahkan ke `SYARIAH-CHECKLIST.md` (item P4) +
  `P4-PROPOSAL-KONSINYASI.html`: (a) barang supplier (pemilik
  titipan) â‰  revenue Kopontren; (b) ujrah Kopontren = revenue --
  V1 off-P&L (memo baris "Ujrah Konsinyasi"), dipindahkan ke
  pendapatan setelah tashih pengasuh; (c) hak supplier =
  settlement payable (tagihan neto komisi). Label: "Provisional --
  implemented based on strongest available fiqh position. Pending
  tashih by pengasuh. Subject to correction."
- **TODO.md**: item A1.1 (koreksi keuangan pascataashih P4)
  ditambahkan; item Step 3 di-update ke status DRAFT.
- **Status: SELESAI -- Commit 3 (26 Sep, dual-push origin master +
  master:main; 5 file: SYARIAH-CHECKLIST + P4 html/md + TODO +
  MEMORY).** Klarifikasi user 26 Sep: `P4-PROPOSAL-KONSINYASI.md`
  (sumber md) KINI ikut di-update agar md â‰¡ html (divergence =
  risiko audit).

### UI/UX audit high-priority: perbaikan P1â€“P4 (26 Sep)
- **P1 font**: 'Plus Jakarta Sans' dideklarasikan di
  `tailwind.config.ts`/`globals.css` tapi TIDAK PERNAH di-load
  (tanpa @import/fontsource) â†’ app render pakai system font.
  Fix: `next/font/google` `Plus_Jakarta_Sans` di `src/app/layout.tsx`
  (self-hosted, `variable: '--font-jakarta'`, `display: 'swap'`) +
  `<html className={jakarta.variable}>`; `globals.css`
  body `font-family` & `tailwind.config.ts` `fontFamily.sans` kini
  mengawali dengan `var(--font-jakarta)` (fallback chain tetap).
- **P2 tema**: init script `layout.tsx` dulu selalu paksa 'dark'.
  Kini: bila belum ada cookie `theme` eksplisit, ikut OS
  `prefers-color-scheme` (light/dark); cookie eksplisit tetap menang;
  fallback catch tetap dark. `globals.css`: `:root{color-scheme:
  light}` + `html.dark{color-scheme:dark}` (scrollbar/control browser
  ikut tema).
- **P3 kontras WCAG AA**: `text-amber-600` â†’ `text-amber-700` di
  20 tempat/11 file (dashboard, banner POS, badge, kartu
  hutang/piutang, migrate, zakat, laporan, `admin/data`,
  member-qr; tone Badge `amber` di `ui.tsx` ikut); pair
  `text-slate-500 dark:text-slate-500` â†’ `text-slate-600
  dark:text-slate-400` di 26 tempat/9 file; label sumbu/legenda
  chart & 'Memuat dataâ€¦' PageSkeleton (ui.tsx) diperkuat serupa.
- **P4 input & keseragaman**: keyboard numerik fisik di
  `pin-pad.tsx` (angka 0â€“9 = digit, Backspace = hapus, Escape =
  clear; guard: abaikan bila fokus di input/textarea/select; handler
  via ref agar listener satu-kali tetap fresh); target sentuh 44px --
  hamburger sidebar mobile & notification bell `h-9 w-9`â†’`h-10 w-10`;
  `tabular-nums` pada nilai kartu dashboard, blok totals/mix/
  close-shift POS, rata-rata chart; `role="alert"` pada paragraf
  error login + PIN auth + PIN setup; `prefers-reduced-motion` kini
  mematikan juga utilitas Tailwind (pulse/ping/bounce/spin);
  `manifest.json` `background_color` â†’ `#170A0E` (brand, bukan
  putih).
- **Verifikasi**: `next build` OK (52/52 static pages, type check
  lulus). Sisa audit yang TIDAK dikerjakan hari ini (prioritas
  lanjutan di TODO): rekap kasir `GET /` tanpa data (P1 fungsional)
  & label total belanja menipu di `belanja-client` -- masih open.

### UX-6 FASE I: I-6 useConfirm risk levels L1â€“L5 (27 Sep, commit I-6)
- `useConfirm` ui.tsx kini menerima param `risk` (default 2):
  L1 = tanpa modal (proceed langsung) Â· L2 = confirm biasa (15 situs
  lama tak berubah, backward-compat) Â· L3 = tombol merah + box
  "Dampak" (`impact[]`) Â· L4 = L3 + textarea alasan wajib (tombol
  disabled sampai teks non-kosong setelah `trim()`; alasan
  diteruskan ke `proceed(info?.reason)` -- **V1: BELUM dikirim ke
  server; wire V2 = tambah param `reason` di DELETE `/api/audit`
  + rekam ke audit log**) Â· L5 = L3 + kolom `typeToConfirm`
  (ketik frasa persis, case-sensitive).
- Heuristic lama `variant={confirmLabel==='Hapus'?'danger':'primary'}`
  **PENSION** â†’ `variant={risk>=3?'danger':'primary'}` (label
  'Hapus' lama di produk L224/L452 = soft-archive â†’ primary aman).
- 3 situs: `/admin/kas` `removeEntry` (L3 + impact[2]),
  `/admin/audit` `purge` (L4 + alasan), `/admin/data` `resetAll`
  (L5 + ketik `RESET SEMUA DATA`). OOS: migrasi L1 utk aksi
  non-destruktif; `importJson` tetap L2.
- Backfill hash: I-2 = `8d585f4` Â· I-5 = `99c973c` Â· I-6 = `4de83fd`
  (report di seksi ini; backfill dilakukan di seksi I-8).
- Pixel-check Gus (3 item): (1) kas â†’ box rose "Dampak" + tombol
  merah; (2) audit â†’ textarea alasan, tombol disabled sampai diisi;
  (3) data â†’ harus ketik `RESET SEMUA DATA` persis.
- Backfill hash I-6 (selesai di commit I-8 docs): I-6 = `4de83fd`.

### UX-6 FASE I: I-8 activity feed "Apa yang berubah" (27 Sep, commit I-8)
- `src/components/activity-feed.tsx` baru (presentational, tanpa state
  -> aman di server component): kartu "Apa yang berubah" = 5 audit
  log terbaru + maks. 3 KPI mover (non-flat; urutan halaman =
  penjualan -> arus kas -> member) + CTA "Lihat audit log" ke
  `/admin/audit` (hanya render bila user punya tier `audit`).
  `ACTION_LABEL` = 35 aksi dikenal; tak dikenal fallback raw action.
  `timeAgo`: "baru saja" / "Xm lalu" / "Xj lalu" / "HH.mm" (WIB).
- Feed server-side (philosophy I-3, tanpa fetch klien): kedua page
  dashboard query `audit_log ORDER BY id DESC LIMIT 5` langsung;
  movers = `kpiDelta` I-3 yang sudah ada (admin: hari ini vs kemarin
  + 7h vs 7h; pengurus: 30h x3, termasuk member baru).
- Guard `canAccess(user,'audit')`: pengurus punya tier audit
  (read-only ok); user tanpa tier -> kartu tersembunyi total
  (bukan dead-end UI kosong).
- Verifikasi: tsc exit 0 + `next build` exit 0 (53/53); sw.js tetap
  unstamped (placeholder, tak di-commit).
- Pixel-check Gus (3 item): (1) kartu feed di /admin/dashboard +
  /pengurus/dashboard (5 baris feed + chip mover + CTA);
  (2) pengurus tanpa tier audit -> kartu feed tersembunyi total;
  (3) aksi tak dikenal -> tampil raw action name.

## 2026-09-25
### GROSIR v1: harga grosir per produk + integrasi POS (25 Sep)
- **Scope (disetujui user): UI admin + API + POS + test.** Struk WA &
  laporan sengaja TIDAK diubah (unit_price dari POS sudah memuat harga
  grosir, jadi HPP otomatis benar; v2: HPP per tier + struk grosir).
- **Modul murni anyar `src/lib/wholesale.ts`** (pola `perks.ts`):
  `effectiveWholesalePrice(basePrice, qty, tiers, global)` +
  `bestTierPct` + `globalWholesalePct` + `parseWholesaleJson`.
  Rumus disetujui user: **pct = MAKS(tier terbaik utk qty, global
  `wholesale_min`/`wholesale_discount`)** -- paling menguntungkan
  pembeli; dasar hitung **base_price** (deterministik); harga **manual
  kasir menang** (ora di-restore). 100% tanpa dependensi proyek.
- **Admin UI `/admin/produk`**: seksi "Harga grosir (opsional)" di
  modal form -- baris tier (min_qty, discount%) + preview Rp + tombol
  tambah/hapus; simpan = `POST /api/products/[id]/prices`
  (replace-all, hanya bila seksi tier tersentuh; produk baru simpan
  produk dulu baru tier).
- **API anyar `GET/POST /api/products/[id]/prices`** (Turbo/`db.ts`):
  GET = login (POS & admin baca); POST = admin/manajer (gate
  `canAccess(user,'products')`), semantik REPLACE dalam `tx()`
  (Turso atomic batch, lokal sekuensial), validasi (min_qty int â‰¥ 1
  â‰¤ 100000, discount 0â€“99, duplikat min_qty â†’ diskon terbesar,
  maks 20 tier), audit `product:wholesale` (before/after JSON),
  `invalidate('products:')`.
- **`/api/products` (GET)**: kolom anyar `wholesale` (subquery
  `json_group_array(json_object('min_qty',...,'discount_percent',...))`
  per produk, COALESCE '[]', urut min_qty ASC) -- 1 round-trip, tanpa
  N+1; additive (konsumen lama tak terpengaruh). Index anyar
  `idx_product_prices_product (product_id, min_qty)` di `db.ts`.
- **POS (`pos-client.tsx`)**: `autoPrice(product, qty)` dari modul
  (tier produk + global); harga otomatis di `add`/`setQty`
  (naik/kurang qty â†’ recompute kecuali baris manual); `setPrice`
  (input "Ubah harga") set flag `manual` -- harga tidak di-restore;
  baris dihapus/ditambah lagi â†’ balik auto; effect recompute saat
  `memberSettings` tiba (setting global bisa lambat dari produk).
  Badge: kartu grid "Grosir" (produk punya tier) + baris keranjang
  "Grosir âˆ’X%" (harga otomatis) / "Harga manual" (kasir set).
  Checkout payload `unit_price` tak berubah â†’ struk & server tetap benar.
- **Verifikasi**: `tsc --noEmit` 0 error; `next build` 0 (route
  `/api/products/[id]/prices` terdaftar); `npm run test:wholesale`
  (anyar) 38/38; regresi semua suite PASS (margin, split, phone,
  clientip, konsinyasi, neraca, points).
- Item TODO GROSIR (`wholesale_min`/`wholesale_discount` global +
  `product_prices`) kini TERGUNAKAI -- global + per-produk sudah ikut
  perhitungan POS (setting global sebelumnya memang sudah ada di
  `/admin/pengaturan-member` tapi belum terpakai).

 ### QrisClient: encoder QRIS + admin UI + monitor grosir v1 (25 Sep)
 - **QRIS (PLACEHOLDER pralayar, disetujui user):** NMID provider belum
   turun â†’ fitur dibangun offline-first. `src/lib/qris.ts` = modul MURNI
   (TLV + CRC16-CCITT, tanpa DB/DOM/Node API; deterministik):
   `buildQris/buildQrisStatic/buildQrisDynamic/crc16Ccitt/parseQrisTlv`.
   Standar QRIS-BI: PFI 0111 statis / 0112 dinamis (+tag 54), tag
   29 'ID' + 30 NMID + 31 NMID2?, 52 MCC?, 53 '360', 58 'ID', 59 nama,
   60 kota?, 62 '1', 63 CRC (CCITT-FALSE 0xFFFF; check value publik
   "123456789"â†’29B1). UI `/admin/qris` (isManager, sidebar item "QRIS"
   antaraman "Kas" & "Shift & Kasir"): form NMID/NMID2/MCC/kota +
   preview QR statis 1024px (`qrcode` `toDataURL` client-side) +
   download PNG + copy payload + state "QRIS OFFLINE" bila NMID kosong;
   nama merchant = `store_name` (bukan key tersendiri). Settings key
   `qris_nmid/qris_nmid2/qris_mcc/qris_city` (default kosong di
   `SHOP_SETTING_DEFAULTS`; saveSettings hanya menulis key yang ada di
   defaults â†’ WAJIB ada di situ; audit otomatis via `saveSettings`).
   PUT `/api/settings` validasi: nmid/nmid2 â‰¤32, mcc 4 digit|'', kota
   â‰¤30. POS mock barcode (`pos-client.tsx` L2086-2121) TIDAK disentuh
   (batch #5 scope). Test `npm run test:qris` 28/28.
 - **Monitor grosir v1 `scripts/zz-grosir-monitor.mjs`** (ops, disetujui):
   READ-ONLY. Dua mode koneksi: Turso **raw HTTP** (pola
   `backup-turso-http.mjs`, tanpa driver native) utk produksi;
   `node:sqlite` bawaan (readOnly) bila `DATABASE_URL` `file:` (dev
   lokal). Cek: row grosir 7 hari via `effectiveWholesalePrice`
   DIIMPORT dari `src/lib/wholesale.ts` (satu sumber rumus; harga
   manual kasir diflag INFO sesuai aturan 3), margin per baris
   (omzetâˆ’HPPâˆ’komisi konsinyasi), konsinyasi via
   `sales.konsinyasi/konsinyasi_commission`, audit log 7d, probe
   HTTP 5xx `APP_URL` (default
   `https://kopontren-hijrah.vercel.app`, `APP_URL=off` utk skip;
   200/401/403 = sehat). Exit 1 bila 5xx / baris rugi / DB tak
   terjangkau. Fallback skema lama (tanpa kolom P4) otomatis.
   Uji live 25 Sep: 5 route produksi bebas 5xx âœ…, 0 baris rugi.

### KONSINYASI: fix 2 bug + UX perjelas form (25 Sep) -- DUAL-PUSH dbc5d45
- **Bug 2 (kritis) -- tombol "Terima Konsinyasi" â†’ error "Aksi tidak dikenal"**
  (regresi P4-B `0e34c45`): `create()` di `konsinyasi-client.tsx` tidak pernah
  mengirim field `action` ke `POST /api/konsinyasi`, sedangkan server P4-B
  switch-case pada `b.action` â†’ default = 400. Skenario nyata = klien PWA
  ber-cache LAMA (pre-P4-B) bertemu server P4-B. Fix commit `e027596`:
  client kirim `action: 'create'` eksplisit (+ validasi harga), dan server
  toleran `if (!b.action) b.action = 'create'` (defense-in-depth; semua
  aksi selain create TETAP wajib mengirim `action`).
- **Bug 1 -- kolom "Rp / unit (harga perjanjian)" 0 nyangkut**: default
  `agree_price: 0` (number) â†’ klik/ketik tak mengilangkan 0. Fix `e027596`:
  default `'' as string | number` + `placeholder="0"` + onChange raw-string
  + konversi `Number()` saat submit (kosong = 0 = valid).
- **UX Perjelas (`dbc5d45`, 1 file +208/âˆ’115):** card panduan "Cara Kerja
  Konsinyasi" (4 langkah + contoh Rp 100.000 komisi 20% = toko Rp 20.000 /
  pemilik Rp 80.000); form re-layout step 1Â·Pemilik / 2Â·Barang / 3Â·Harga &
  Komisi + hint sederhana tiap field; kotak "Perhitungan otomatis (per unit)"
  LIVE via `splitConsignment` (rumus PERSIS server: floor komisi, pemilik =
  harga âˆ’ komisi; + baris total qty); card "Rate per-pemilik" â†’ "Komisi
  Khusus Pemilik" (label "Komisi tersimpan:"); istilah teknis dihapus dari UI
  ("Pre-fill", "Rate", "Ujrah" â†’ "Komisi otomatis terisi", "Komisi",
  "Pendapatan toko"); paragrah syariah disederhanakan tanpa membuang inti
  (disepakati saat titipan, tercatat otomatis saat terjual, tidak di muka,
  titipan berjalan tak bisa diubah sepihak).
- Verifikasi: `tsc --noEmit` exit 0; 7 suite semua 0 gagal (margin 57,
  phone 26, clientip 16, split 15, konsinyasi 47, neraca, points);
  `next build` exit 0. Dual-push `master`+`main` = `dbc5d45` -- catatan:
  push `main` pertama REJECTED (local `main` masih `13945f4`/v16,
  origin/main = `d461ef5`; di-fix via `git branch -f main origin/main`
  + `git push origin master:main`).
- MANUAL QA tunggun user (HP): klik kolom harga â†’ 0 hilang (placeholder),
  langsung ketik; "Terima Konsinyasi" â†’ toast "Konsinyasi diterima &
  tercatat"; kolom komisi auto-terisi saat nama pemilik cocok.

### PWA: notifikasi update -- banner "Versi anyar tersedia" (25 Sep)
- **Audit awal:** `public/sw.js` sudah `skipWaiting()` (install) +
  `clients.claim()` (activate) + marker SW-BUILD per build âœ…; yang
  KURANG: tidak ada listener `message` SKIP_WAITING, dan
  `sw-register.tsx` tidak mendeteksi `updatefound` â†’ user tak pernah
  tahu ada versi baru (SW baru aktif di navigasi berikutnya saja).
- **Implementasi (2 file):**
  1. `sw.js`: `self.addEventListener('message', â€¦)` â†’
     `SKIP_WAITING` â†’ `skipWaiting()` (eksplisit, untuk tombol Perbarui).
  2. `sw-register.tsx`: state `updateAvailable` -- listener
     `updatefound` â†’ `reg.installing` `statechange` â†’ bila `installed`
     DAN halaman masih punya `controller` â†’ banner; + race-check
     (`reg.installing !== reg.active` saat register). Banner kuning
     bawah layar (fixed, z-50, 44px, print:hidden):
     - **"Perbarui"** â†’ postMessage SKIP_WAITING â†’ tunggu
       `controllerchange` â†’ `location.reload()`; fallback `setTimeout`
       2 detik bila event tak fire; guard double-reload.
     - **"Nanti"** â†’ `sessionStorage['kopontren_sw_update_dismissed']`
       â†’ banner lenyap utk sesi tab ini; muncul lagi saat aplikasi
       ditutup & dibuka ulang (load baru).
  Desain: TIDAK ada auto-reload (kasir boleh tetap mengetik; SW baru
  otomatis ambil alih di navigasi berikutnya via claim-on-activate).
- Verifikasi: `node --check sw.js` OK; `tsc --noEmit` exit 0;
  `next build` EXIT 0 (51/51 halaman); regresi 6 suite 0 gagal
  (margin 57, split 15, phone 26, konsinyasi 47, neraca 33, points 27).
- Manual QA tunggun user di HP: deploy â†’ tutup paksa PWA â†’ buka lagi â†’
  banner "ðŸ†• Versi anyar tersedia" â†’ tap "Perbarui" â†’ reload versi baru;
  atau "Nanti" â†’ lenyap; tutup PWA â†’ buka â†’ banner muncul lagi.

### KEPUTUSAN FINAL P3+P4 â†’ GUS FI Â· A3 LIVE Â· v16 MENUNGGU DEPLOY VERCEL
- **P3 (tashih zakat) + P4 (proposal konsinyasi)**: keputusan user/Gus Fi (25 Sep) --
  dikirimkan sendiri oleh Gus Fi (P3 â†’ ke ulama, P4 â†’ ke pengurus); Cline standby
  sampai ada hasilnya. Cline tidak perlu action apa pun.
- **A3 (Neraca) KONFIRMASI LIVE di Vercel:**
  - `/api/neraca` (produksi) â†’ 401 "Belum login" = endpoint ADA (build pr-A3 = 404);
    middleware sengaja lewati `/api/*` â†’ 401 datang dari handler route sendiri.
  - Marker sw.js produksi kini `3f017aa7ef77` -- ubah dari `4c31dc0c5819`
    (ikon fix `7e6cb37`) â†’ build ter-deploy memuat A3 `15266cd`.
  - Konfirmasi visual tab "Neraca" di PWA = bagian user-test â‘¡ (HP).
- **v16 `13945f4` (SCHEMA_VERSION 15â†’16 + retry UI konsinyasi) BELUM live di Vercel**:
  push dual-branch terverifikasi (`main` = `master` = `13945f4`; git lokal bersih,
  hanya 3 CSV user untracked = material item â‘£), tapi marker sw.js produksi masih
  `3f017aa7ef77` (build A3) â†’ build Vercel utk `13945f4` belum sampai production.
  CATATAN TEKNIS: marker Vercel di-stamp acak per build (`inject-sw-version.mjs`
  fallback randomBytes di env fresh -- seed BUILD_ID baru dibuat `next build`
  setelah inject) â†’ canary-nya "marker â‰  `3f017aa7ef77`", BUKAN hex tertentu.
  Tak ada Vercel CLI/token lokal â†’ user cek dashboard (project kopontren â†’
  Deployments: cari `13945f4`; status Build failed/queued â†’ baca log).
- **KABAR (25 Sep, screenshot user): v16 `13945f4` WIS LIVE di Vercel**
  (deployments: Ready + Production, branch `main` & `master`). Form konsinyasi
  nang HP: kolom Komisi Toko (%) muncul (P4-B live); statistik 0/0/0 render
  normal â†’ `/api/konsinyasi` produksi OK â†’ migrasi Turso v16 wis keeksekusi
  (kolom `commission_rate` kedherek; menawi gagal kudu 500 "no such column"
  + tombol "Coba lagi").
- **Anomali sw.js (pentang kanggo canary):** probe langsung produksi
  `/sw.js` (curl, 25 Sep) â†’ header `age: 37220` (â‰ˆ10,3 jam, pr-v16) +
  `cache-control: public, max-age=0, must-revalidate` â†’ edge Vercel isih
  nyebar sw.js basi (marker isih `3f017aa7ef77`). Marker git v16 =
  `67561e9c440e` (owah saka `05c129e243ec` commit 13945f4); nilai riil
  build Vercel = stamp random anyar (inject-sw-version). Dadi canary
  "marker â‰  `3f017aa7ef77`" kudu ditindak sawise edge re-validate /
  deploy sabanjane -- PWA HP entuk SW anyar nalika muat maneh. Mboten
  blocker; kode app v16 wis live (runtime serverless tiasa stale-cache).

- **Checklist pasca-deploy v16 (user)**:
  1. Reload PWA di HP (SW update -- marker baru)
  2. Buka /admin/konsinyasi â†’ request AUTH pisanan memicu migrasi Turso v16
     sekali jalan (cold start Â±15â€“20 s; request anonim ora njampuh DB)
  3. Error transien â†’ tombol "Coba lagi" (retry UI v16)
- **Roadmap final (25 Sep):**
  - Engineering WIP = 0. "A4 (Jam Sibuk)" TIDAK ada di roadmap -- "A4" = Top
    produk (âœ… sudah bangun); bagian "Jam Sibuk" tak pernah dipplanning (0 hit
    kode/docs; dikonfirmasi 24 Sep).
  - TUNDA (keputusan user): QRIS asli (NMID) Â· grosir Â· `point_history`
    (redemsi poin).
  - `[r]` risiko rendah diterima: throttle XFF per-instance Â· PII GET
    `/api/audit` Â· `cash_low` monitoring Â· validasi `pay_split` import backup
    (TER-KUNCI 25 Sep: `normalizeSaleImport` + test:split) Â· ZAKAT known
    issues Â±7 jam UTC (boundary laba + CSV riwayat DIFIX 25 Sep; sisa
    `reports/csv` timestamp kosmetik).
  - P5 (denda) = di luar cakupan (tak pernah diimplementasi; tak perlu dibangun).
  - Sisa non-engineering: â‘¡ uji manual HP Â· â‘¢ checklist /admin/zakat Â·
    â‘£ upload CSV ke Turso Â· P3/P4 (Gus Fi).
  - â‘  test ikon PWA Edge sudah LULUS 24 Sep.

## 2026-09-25
### Batch integrity #1 + #3 (25 Sep, ACC Gus Fi)
- **#1 validasi pay_split import backup** -- audit nembokake logika wis
  ana (Batch F, inline `backup/route.ts`); diekstrak dadi helper murni
  `normalizeSaleImport` (`src/lib/pay-methods.ts`, semantik identik:
  JSON well-formed + whitelist `cash/tf/wa` + Î£===total â†’ simpan;
  mung â†’ null legacy; `amount_paid` â‰¥ total; `change` cash mung).
  Lock: `test:split` **22 checks** (7 anyar).
- **#3 zakat WIB (Â±7 jam)** -- bug: `created_at >= 'YYYY-MM-DD'` (tgl
  WIB) vs ISO-UTC â†’ periode miwiti 07:00 WIB. FIX: modul murni
  `src/lib/zakat-period.ts` (`wibDayStartUtc`, `currentWibMonthDate`,
  `wibToday`, `isoToWib`); `/api/zakat` query laba+COGS pake
  `wibDayStartUtc(period_start)`; CSV riwayat kolom `paid_at (WIB)` +
  nama file `wibToday()`. Lock: `test:zakat` **18 checks** (anyar).
- TSC exit 0 Â· build OK Â· `npm run test:split` + `test:zakat` ALL_PASS.
  Sisa (low): timestamp export `reports/csv` isih UTC (kosmetik).

## 2026-09-24
### P3 + P4 DOKUMEN LIVE + SYNC MAIN (24 Sep, KONFIRMASI GUS FI)
- Tashih zakat + proposal konsinyasi LIVE: commit `9dbc22c` (10 file;
  koreksi terminologi akad konsinyasi **Wakalah bil Ujrah** + standar
  nisab emas **24 karat murni**; `P3-TASHIH-ZAKAT.md`,
  `P4-PROPOSAL-KONSINYASI.md`, silang-referensi SYARIAH-CHECKLIST +
  MEMORY + README). `next build` exit 0; repo bersih (file sementara
  & probe sudah dibersihkan).
- **Koreksi hash:** commit sebenarnya = `9dbc22c` (laporan user
  menulis `8cedb6b` -- hasil git log/ls-remote = `9dbc22c`).
- **Sinkronisasi main (temuan saat konfirmasi):** `origin/main`
  masih `0e34c45` (tertinggal), `origin/master` = `9dbc22c` â†’
  dual-push `git push origin master:main` â†’ kini `origin/main` =
  `origin/master` = `9dbc22c`. Vercel (build saka `main`) kini
  deploy seluruh seri 24 Sep (P4-A/B + P3 + terminologi + 24K +
  dokumen).
- Keputusan Gus Fi: P3 â†’ kirim ulama (tashih zakat); P4 â†’ kirim
  pengurus (keputusan konsinyasi); update setelah keputusan.
- Sisa item tersusun: tashih P3 (3 pertanyaan: haul, verifikasi
  harga emas 24K, modal HPP vs pasar) Â· keputusan P4 pengurus +
  tashih ulama basis ujrah V1 Â· user-test â‘¡ uji manual pasca-deploy
  nang HP Â· â‘¢ checklist /admin/zakat 10 item (TODO L259â€“268; item 9
  = sub-test "Bug #1 (A1â€“A5)") Â· â‘£ upload CSV ke Turso sendiri Â·
  [r] risiko rendah diterima (termasuk `cash_low` monitoring) Â·
  TUNDA: QRIS (NMID) Â· grosir Â· point_history.
### KONFIRMASI FINAL GUS FI + CHECK A2/A3/A4 (24 Sep, pasca P4-B)
- P4-B `0e34c45` KONFIRMASI OK: 8 file +360/âˆ’36; tsc 0, build 0,
  `test:konsinyasi` 47/47, regresi `test:margin` 57/57 +
  `test:split` ALL_PASS. Chain lengkap: P4-A `4f12818` â†’ P4-B
  `0e34c45` â†’ P3 `9dbc22c` â†’ docs `d1c0c7e`/`6c6ab64` (main=master).
- **Check "sisa A2/A3/A4?" -- JAWABAN BUKTI KODE:**
  - A2 (Arus Kas) = **SUDAH BANGUN**: `/admin/kas` (jurnal + auto),
    dashboard admin "Arus Kas 7 Hari", WA push pengurus "Arus Kas
    30 Hari", kartu "Arus kas neto" di laporan, `keuangan.ts`
    (scope eksplisit fase A2; piutang/hutang sengaja keluar --
    itu cakupan zakat, bukan kas).
  - A4 (Top Produk) = **SUDAH BANGUN**: seksi "Top produk"
    `laporan-admin-client.tsx`.
  - A3 (Neraca) + A4 bagian "Jam Sibuk" = **TAK PERNAH
    DIPLANNING** (0 hit di TODO/MEMORY/SYARIAH-CHECKLIST + kode)
    â†’ bukan sisa WIP; hanya request baru kalo Gus Fi mau.
  - A1 (P&L Laba-Rugi) = SELESAI `0564e71` (MEMORY L1159).
- **â‘  Test ikon PWA Edge = LULUS 24 Sep** (TODO L603) â†’ sisa
  user-test tinggal â‘¡ HP + â‘¢ checklist zakat + â‘£ upload CSV.
- **0 WIP engineering**: working tree bersih utk kode/docs; sisa
  hanya ` M public/sw.js` (artefak lokal -- JANGAN commit, policy
  PWA; Vercel stamp sendiri) + 3 CSV user untracked
  (`_products_update.csv`, `stok-export-20260923.csv`,
  `stok-import-admin-20260923.csv`) = material item â‘£.
### P4 Konsinyasi + komisi store / akad WAKALAH BIL UJRAH (24 Sep, FASE P4)
- Keputusan pengurus: komisi toko 20% dr harga jual. Akad
  **wakalah bil ujrah** (koreksi 24 Sep dsr riset Syafi'i + Bahtsul
  Masail; ref. Fatwa DSN-MUI No. 113/DSN-MUI/IX/2017): toko = wakil
  pemilik, upah TIDAK di muka, hanya terhitung saat barang terjual;
  barang dikembalikan (ora payu) tanpa komisi; pemilik dapat 80%.
  (Awalnya tertulis "ju'alah" -- dsr Syafi'i, bentuk "laku = beli,
  tidak laku = kembali" = gharar â†’ BUKAN ju'alah; mekanik tidak
  berubah.)
- Setting baru `konsinyasi_commission` (SHOP_SETTING_DEFAULTS, default
  '20', admin bisa ubah 0-100 via PUT /api/settings).
- Kolom `consignments.commission_rate` = SNAPSHOT rate saat titipan
  (kontrak berjalan tidak berubah walau setting global berubah; baris
  lama default 20).
- **P4-B (24 Sep):** komisi FLEKSIBEL per kesepakatan (antardhin):
  field "Komisi toko (%)" di form titipan (boleh beda per barang;
  0 = tanpa komisi) + default per-pemilik via setting
  `konsinyasi_owner_rates` (JSON {nama: rate}; kartu "Rate per-pemilik"
  + aksi save/delete_owner_rate di /admin/konsinyasi, audit log).
  Prioritas rate titipan baru: input eksplisit > per-pemilik > global.
  Titipan aktif TIDAK bisa diubah rate-nya oleh app (snapshot --
  tanpa perubahan sepihak; utk ubah: tutup â†’ titip ulang, musyawarah).
  Helper `resolveCommissionRate`/`parseOwnerRates` (lib/konsinyasi.ts,
  tanpa dependensi); audit create + `commission_source`.
- `src/lib/konsinyasi.ts` (helper murni): `clampRate` + `splitConsignment`
  (komisi floor per unit; pemilik + komisi = harga persis, tanpa pecahan).
- `/api/konsinyasi`: tagihan pemilik NETO komisi; action `sell` mencatat
  OTOMATIS kas masuk `Ujrah Kon. <pemilik> - <barang>` = qty Ã— komisi
  unit (hanya jika >0) + invalidate kas/reports.
- Laporan: memo P&L V1 baris baru `Ujrah Konsinyasi` (keuangan.ts,
  UI P&L, WA rekap, CSV). Catatan V1 baru: JANGAN catat manual --
  otomatis, anti dobel hitung.
- Backup: kolom `commission_rate` ikut export/restore (backup lama
  tanpa key â†’ 20).
- UI konsinyasi: badge "Komisi toko X% Â· Ujrah Rp â€¦", "Tagihan pemilik",
  hint akad wakalah bil ujrah dr `commission_rate_default`.
- Verifikasi: `tsc --noEmit` exit 0; `test:konsinyasi` 47/47
  (P4-B: parseOwnerRates + resolveCommissionRate); `test:margin`
  57/57; `test:split` ALL_PASS; `test:clientip` 26 ok; `next build`
  sukses.
- Dokumen `P4-PROPOSAL-KONSINYASI.md` (24 Sep): proposal pengurus --
  tabel opsi deliberasi + permohonan keputusan + risiko/penahan.
  Status: menunggu approval pengurus; tashih sisa â†’ ulama.
- TASHIH tersisa utk ulama (BASIS UJRAH -- hasil riset 24 Sep): V1 =
  % harga PERJANJIAN (ma'lum â†’ SESUAI Syafi'i); harga jual aktual =
  gharar dlm Syafi'i klasik (DSN-MUI No. 112/DSN-MUI/IX/2017
  membolehkan persentase asal disepakati & diketahui; alternatif:
  ujrah mitsli). V1: komisi dr harga perjanjian -- konsisten, harga
  jual tidak direkam terpisah; off-sales.
### P4-Tashih + P3 Zakat (riset Syafi'i & Bahtsul Masail, 24 Sep 2026)
- **Koreksi akad konsinyasi: ju'alah â†’ WAKALAH BIL UJRAH** -- dsr
  madzhab Syafi'i, bentuk "barang laku = dibeli, tidak laku =
  kembali" = gharar (Ibnu Qudamah al-Mughni; Syekh Ibnu Utsaimin)
  â†’ akad yang tepat: pemilik (muwakkil) memberi kuasa ke toko
  (wakil) utk menjual + upah (ujrah). Ref. Fatwa DSN-MUI No.
  113/DSN-MUI/IX/2017. Mekanik & data TIDAK berubah; hanya
  terminologi UI/dokumen/komentar kode yang disetel.
- **Komisi 20% = sah** -- komisi persenan = ujrah ma'lum (mayoritas
  Bahtsul Masail HIPJAS VI 2023, Hasyiyah al-Jamal; sejalan
  DSN-MUI No. 112/DSN-MUI/IX/2017: persentase boleh asal jelas &
  disepakati kedua pihak).
- **Zakat: harga emas = 24 KARAT MURNI** -- Muktamar NU ke-35:
  emas 14 karat TIDAK sah utk nisab (bukan emas murni; nisab emas
  campuran dihitung dr kandungan emas murninya). Syafi'i: nisab =
  85 g emas murni. Setelan app: label UI /admin/zakat "Harga emas 24
  karat per gram (Rp)" + hint karat; komentar db.ts & route zakat
  disetel; formula & default (85 g, 2,5%) TIDAK berubah.
- File terubah: src/lib/konsinyasi.ts, src/lib/keuangan.ts,
  src/db.ts, src/components/admin/konsinyasi-client.tsx,
  src/components/admin/zakat-client.tsx, src/app/api/zakat/route.ts,
  P4-PROPOSAL-KONSINYASI.md (+seksi H), SYARIAH-CHECKLIST.md,
  P3-TASHIH-ZAKAT.md.

### PWA icon-180 fix + exact-source headers (lanjutan 24 Sep)
- **Akar masalah (final):** `public/icon-180.png` server-side KORUP
  (1,921 B, kotak putih + garis biru); ikon/logo/manifest
  cache-first nang SW v11 + Windows icon-cache â†’ .ico taskbar PWA
  kothakan putih, stuck (PWA terinstall di periode rusak).
- **`608074d` (master+main):** regen `public/icon-180.png`
  (11,493 B = logo âœ“ pixel-inspected sharp) + `?v=2` cache-busting
  (`manifest.json` + `apple-touch-icon` di `layout.tsx`) + aturan
  cache ikon/logo/logo â†’ `max-age=86400` (ora immutable global).
- **`7e6cb37` (master+main):** aturan ikon/logo `next.config.mjs`
  diganti source EXACT (`/icon-180.png`, `/icon-192.png`,
  `/icon-512.png`, `/logo-kopontren.svg`, `/favicon.ico`,
  `/manifest.json`) -- pengganti wildcard `/(icon|logo)-:path*`
  sing curiga bikin build Vercel stall/queue stuck.
- **Verifikasi lokal:** `tsc --noEmit` exit 0 + `npm run build`
  EXIT 0 (48 page) ngemuhi config anyar (Register-ScheduledTask +
  `.build-out4.txt` = `BUILD_EXIT=0`). stamp sw.js lokÃ¡l
  `c0aac38143af` = artefak build, JANGAN commit.
- **Cutover Vercel LIVE (~14:30 24 Sep):** sw.js
  `SW-BUILD 4c31dc0c5819`; `icon-180.png` live = 11,493 B âœ“;
  `manifest.json` live `?v=2` âœ“; ikon/logo/favicon CC =
  `public, max-age=86400` âœ“; `/sw.js` = `max-age=0,
  must-revalidate`; `/_next/static/*` tetep `immutable` âœ“.
- **Test user "Nuclear Reset" LULUS (24 Sep):** uninstall PWA +
  hapus folder Edge (`Chrome (PWA)`/`Default\Service Worker`/
  `Cache`/`Code Cache`) + `iconcache*.db`/`thumbcache*.db` â†’
  `ie4uinit.exe -show` â†’ reboot â†’ clear browsing "All time" â†’
  install maneh â†’ **logo taskbar KATON âœ“ + Start menu KATON âœ“ +
  PWA fungsional âœ“**. Item PWA/Favicon TUTUP -- 0 engineering.
- **Prosedur "nuclear reset" kanggo user (UDH LULUS -- saka
  reference bilangan kali balik gagal):**
  â‘  Uninstall PWA (klik kanan shortcut taskbar/Start â†’ Uninstall)
  â‘¡ Tutup Edge total â†’ hapus `%LOCALAPPDATA%\Microsoft\Edge\User
     Data\Chrome (PWA)` + `Default\Service Worker` + `Default\Cache`
     + `Default\Code Cache` + `%LOCALAPPDATA%\Microsoft\Windows\
     Explorer\iconcache*.db` & `thumbcache*.db` â†’ `ie4uinit.exe
     -show` â†’ reboot
  â‘¢ Edge â†’ Clear browsing data "All time" (cached images + site
     data/service workers)
  â‘£ Install PWA maneh â†’ ikon taskbar/Start menu = logo (detail
     kelÃ¨k: TODO.md seksi "PWA / Favicon").
### Cleanup file scratch root (24 Sep, commit `ba5f272`)
- 113 file scratch dihapus nang root (SEMUA untracked/gitignored --
  aman, tak anatracked yg kena): `.audit-*.txt` (17),
  `.build-*.txt`+`.tsc-*.txt` (7), `_*.txt`/`_*.log`/`_*.json`
  (88), `*.log` top-level (6: swc, build_utf8, build-check,
  build-payables, rebuild_bs, server2.err). Root: 119 â†’ 24 file.
- 6 `.mjs` DIPINDAH ke `desktop-archive/` (gitignored, tetep
  available -- ora dihapus): `_txlib.mjs` + `_probe4.mjs`
  (bukti bug `tx()` -- sesuai komentar .gitignore "Bukti yg
  di-retain") + 4 tool sesi (`_extract-pdf.mjs`, `_pdf2csv.mjs`,
  `_fetch-products.mjs`, `_gen-stok-csv.mjs`).
- `.gitignore` +3 pattern (`.audit-*.txt`, `.build-*.txt`,
  `.tsc-*.txt`) biyara sesi mangkase tak numpuk untracked maneh.
- JANGAN HAPUS (udh dijaga): CSV data user (`stok-*.csv`,
  `_products_update.csv`), `src/`, `public/sw.js` (artefak build --
  JANGAN commit; Vercel nglewati dhewe), `public/icon-*.png`,
  script user (`build.ps1`, `smoke.ps1`, `server.ps1`,
  `rebuild.bat`), `state.txt` + `DEPLOY-VERCEL.txt` (TRACKED --
  hapus bakal ngrusak git history). `scripts/zz-*` = kosong.
- Verifikasi pasca-cleanup: `tsc --noEmit` EXIT 0 + `next build`
  EXIT 0 (48/48 page). Catatan: `npx` PS kena ExecutionPolicy --
  pakai `node node_modules\typescript\bin\tsc` /
  `node node_modules\next\dist\bin\next build` langsung.
### Batch F: integrity `1a07ed1` + tz WIB `c392237` (perbaikan audit)
- **integrity (commit `1a07ed1`)**: `amount_paid`/`change` tak lagi
  dipercaya dari klien. POST /api/sales: `amount_paid = max(total,
  paid)` (partial paid tak mungkin lagi) + `change` di-recompute
  server (cash = paidâˆ’total; tf/wa/split = 0). POST /api/backup
  (import) dinormalkan identik (`paidNorm`/`changeNorm`) agar
  restore tak memvalidasikan kembali inkonsistensi. Alur
  offline-queue tak berubah -- clamp hanya di sisi penerima.
- **tz WIB (commit `c392237`)**: boundary periode kini WIB (UTC+7),
  bukan tengah malam UTC: cutoff overdue `payables/route.ts`,
  `piutang-client` + `hutang-client` (baca timezone device),
  `laporan-client`, `reports/csv` (`startOfDayJakarta` â†’
  `T00:00:00+07:00`). Akar bug periode lama: regex server menolak
  tanggal ISO-UTC penuh, sehingga parameter periode terabaikan
  diam-diam & semua query tercap 365 hari.
- **F-1 (audit Batch F): ditandai STALE -- tanpa perubahan kode.**
  Re-verify menunjukkan temuan tak lagi berlaku; hanya tercatat di
  MEMORY.md + TODO.md.
- Verifikasi: `tsc --noEmit` EXIT 0 + `npm run build` EXIT 0
  (kedua commit). Dual-push `master` + `main` (keduanya kini
  `c392237`). `public/sw.js` TIDAK ikut commit (aturan: Vercel
  stamp sendiri). Test PWA Edge taskbar masih **PENDING hasil**
  (lihat TODO seksi "PWA / Favicon").
- **Catatan lingkungan dev (verified 24 Sep 2026, diuji 4Ã—):**
  - Proses panjang (mis. `npm run build`, `tsc`) **kudu** dijalankan via
    **`Register-ScheduledTask`** (trigger *Once* di now+2 detik,
    RunLevel Limited, `-ExecutionPolicy Bypass` di dalam action
    `cmd.exe /c`). Satu-satunya mekanisme yg survive close terminal
    di environment Cline chat ini.
  - **Jangan andalkan `Start-Process`, anak proses, atau
    `schtasks /create /on`** -- mereka mati setiap terminal session
    ditutup (build-nya tidak jalan, hanya script pembuatnya yg
    sempat jalan).
  - Jebakan: `Unregister-ScheduledTask -TaskName X` memunculkan
    prompt interaktif konfirmasi `[U/Y/A/C]` (tanpa `-Force`) --
    pakai `-Force` / jawab `Y`.
  - Pola task: action = `cmd.exe /c "cd /d <repo> & tsc --noEmit
    > .o.txt 2>&1 & npm run build >> .o.txt 2>&1 & exit /b 0 >
    .done.txt"`; verifikasi lewat file output, karena command
    foreground akan timeout sebelum build selesai.
- **FINAL (24 Sep 2026) -- konfirmasi 4 commit, engineering TUTUP 0 sisa.**
  Head `8ba2885` (`origin/master` = `origin/main`): `1a07ed1`
  (integrity) Â· `c392237` (tz WIB) Â· `f6ccfbc` (docs Batch F) Â·
  `8ba2885` (docs lingkungan). FASE 2+3, Batch Bâ€“F: semua live.
- **Sisa `[r]` risiko rendah (diterima, BUKAN bug -- TODO.md L98â€“232):**
  1. throttle login keyed `X-Forwarded-For` (per-instance, bisa
     dirotasi) -- accepted; mitigasi PIN 3Ã— salah â†’ sesi dimusnahkan
     + lock 5 mnt.
  2. GET `/api/audit` menampilkan `old_value/new_value` (termasuk
     PII member) ke tier pengurus -- sesuai desain role internal;
     tinjau bila perlu.
  3. `cash_low`: pemicu `notifyCashBalance()` hanya monitoring,
     tanpa aksi otomatis -- diterima.
  4. Validasi `pay_split` saat IMPORT backup (ðŸŸ  review) --
     opsional; POST /api/sales kini sudah dinormalisasi (`1a07ed1`),
     import backup punya guard dasar.
  5. ZAKAT known issues (TODO L113): export CSV riwayat + boundary
     periode laba masih basis UTC (`created_at >= date-only`
     leksikografis) â†’ meleset Â±7 jam; **`c392237` TIDAK menutup
     ini** (6 file: payables/reports-csv/2-client/laporan-client/
     format.ts saja). Sisa tracked [r].
- **TUNDA (keputusan user, 3 fitur):** QRIS resmi (NMID belum
  siap) Â· grosir/perks member Â· `point_history` (loyalty).
- **User-test PENDING hasil (4):** (1) test ikon taskbar PWA di
  Edge -- user handle 24 Sep: uninstall â†’ clear site data â†’ restart
  Explorer â†’ install ulang â†’ cek logo; jika gagal â†’ debug sesuai
  TODO L333â€“343 (`chrome://serviceworker-internals`,
  `chrome://components`, flag `edge-automatic-https-encryption-
  disabled`). (2) uji manual pasca-deploy nang HP (22 Sep).
  (3) checklist `/admin/zakat` 10 item (TODO L259â€“268).
  (4) upload CSV ke Turso sendiri.

## 2026-09-23
### Batch E: keyboard-nav tablist (APG) + sync audit a11y
- `4545e4d` (master) -- helper `useTablistNav` di `ui.tsx` (ArrowRight/Left
  wrap + Home/End, aktivasi otomatis focus+click+setKey, import type
  alias `ReactKeyboardEvent` agar tak shadow DOM KeyboardEvent Modal);
  4 grup: admin/belanja-client (in/out L107), admin/data-client
  (backup/audit L160), admin/konsinyasi-client (active/done L333),
  POS kategori (tablist L1154 + pill `role="tab"`/`aria-selected`,
  getKey iâ†’i===0?'':categories[i-1]). tsc EXIT 0, next build EXIT 0
  (compile 4.8 s, Overall passed, route /admin/* ter-build).
- TODO L204: item audit a11y UI lama (Modal âœ•/ESC/focus-trap,
  skeleton kontras, panel hotkey, Toast aria-live) ditandai [x] --
  sudah live @ `c364b2c` (+ batch 5 hotkey POS F6â€“F9 & cheatsheet `?`),
  diverifikasi 23 Sep: grep 0 sisa + `git merge-base --is-ancestor`.
- âš ï¸ TRAP KETEMU: working copy pagi ini sempat berisi modifikasi
  BELUM ter-commit (belanja-client 2-tablist inTab/outTab ~550 baris
  vs HEAD 266 baris single-tab; imports ui.tsx beda). Semua kerja
  di atas berbasis HEAD `46708a1`. Jika ada perubahan lokal yg
  belum di-commit di mesin lain, itu belum masuk repo.
- Vercel: live production @ `46708a1` terkonfirmasi (HTTP 307â†’/login,
  buildId baru `UOsfn6k55w3NuzxN8AV64`, bukan pre-21 Sep
  `GCE-OvNduy2JlV5shvyiS`). Dashboard "Ready @ 46708a1" = cek user.

## 2026-09-21 -- Kopontren Al Ittihad (kasir & pembukuan)

Memory permanen utk sesi pengembangan berikutnya. Detail kronologis ada di
`state.txt`; daftar kerja yang belum: `TODO.md`.

## Arsitektur inti
- **Next.js 15 App Router + Turso/libSQL** (`@libsql/client`). Tidak ada DB
  lokal selain dev `file:`. Semua timestamp disimpan **UTC ISO**
  (`YYYY-MM-DDTHH:MM:SS.sssZ`); tampilan WIB via `src/lib/format.ts`
  (`startOfDayJakarta()` kembalikan string UTC ISO, BUKAN format spasi WIB --
  jangan bandingkan string campur format).
- `src/db.ts`: skema + migrasi idempoten + **gate `schema_version`**
  (SAAT INI `SCHEMA_VERSION = 15`). Cold start: kalau versi DB < 15 â†’
  `fullInit` sekali; selain itu 1 SELECT saja. **Aturan: statement skema
  baru WAJIB diiringi bump `SCHEMA_VERSION`** (kalau tidak, DB lama tidak
  akan pernah dapat migrasi).
- Transaksi: `tx(d, fn)` -- Turso: `c.transaction('write')` lalu
  `commit()` bila sukses / `rollback()` bila gagal (perbaikan 24 Sep:
  dulu close() saja DROP transaksi â†’ write `tx()` hilang di produksi;
  kini eksplisit commit/rollback). `file:` lokal: sekuensial
  auto-commit (bug @libsql/client 0.15 -- tx file LOST, jangan pakai
  lokal utk test integritas).
  **Caveat (diterima, pre-existing):** `tx()` memakai singleton
  `DbShim.c` bersama -- dua `tx()` benar-benar paralel di satu process
  Vercel hangat bisa interleave; kalau muncul anomali lintas-request,
  follow-up: shim fresh per transaksi. Bukti semantik lib: `_txlib.mjs`
  (close = 0 baris, commit = 1 baris). Probe produksi: `_probe4.mjs`.

## Keamanan (jaga konsistensinya)
- Password: scrypt + salt per user (`hashPassword`/`randomSalt` di
  `src/lib/auth.ts`). Perbandingan selalu `crypto.timingSafeEqual`.
- Sesi: cookie HttpOnly `kopontren_session` + cookie pendamping non-HttpOnly
  `kopontren_session_exp` (plafon countdown klien). Idle timeout via
  `settings.session_timeout` (default 3600 dtk; PUT `/api/settings` admin,
  clamp 60â€“7 hari).
- PIN: 4â€“6 digit, anti-pattern (sekuensial/semua sama/sama password),
  lockout `PIN_MAX_ATTEMPTS=5` â†’ `PIN_LOCK_SECONDS=900` (tabel `user_pins`).
  **`changePin` juga menghitung kegagalan + lockout** (audit 18 Sep 2026).
- Throttle login: per username+IP, 10 gagal/15 mnt â†’ kunci 15 mnt
  (in-memory per instance, di `src/app/api/auth/login/route.ts`).
- Role: **7 role + matriks terpusat** (implementasi 18â€“20 Sep 2026,
  commit `b83b75e`) -- detail di bagian "## Matriks Permission 7 Role"
  di bawah. `normRole` menormalkan nilai tak dikenal â†’ `kasir`;
  `isManager` = admin + manajer (pengurus keluar dari tier ops sejak
  18 Sep -- kini read-only). Kasir tetap hanya mutasi data miliknya
  (sale.kasir_id === user.id, retur shift sendiri, retur hanya
  transaksi sendiri).
- `CRON_SECRET` dipbandingkan constant-time (`timingSafeEqual`) di
  `/api/notifications/cron`.

## Strategi cache (jangan ubah asal)
- `src/lib/ref-cache.ts`: in-memory per instance, TTL 60 dtk, **cap 256
  key** (eviksi tertua; penting -- key `members:totals:<q>` mengikuti
  string pencarian user). `invalidate(prefix)` dipanggil di setiap route
  WRITE yang menyentuh data tersebut (`products:`, `kas:`, `reports:`,
  `members:`, `belanja:`, `notif:`, `audit:`, `settings:member`).
  **Catatan `kas:` (23 Sep, verifikasi FASE 1):** prefix `kas:` = BACKSTOP
  -- saat ini TIDAK ADA key cache `kas:â€¦` (key nyata: `reports:<from>`,
  `products:active`, `belanja:totals`, `members:totals:<q>`,
  `settings:member`, `audit:tables`, `notif:list:<â€¦>`, `reports:hourly:<from>` (Batch #5, jam sibuk)), jadi
  `invalidate('kas:')` di 10 route tulis adalah no-op yang INTENTIONAL
  (ongkos ~0): kalau kelak ada `cached('kas:â€¦')`, semua route mutasi
  sudah memanggil invalidate -- tidak perlu disisir ulang. Didokumentasi
  juga di doc-header `src/lib/ref-cache.ts` (commit `ae430f6`).
- `src/lib/ttl-cache.ts`: helper terpisah (cap 100) -- legacy, dipakai
  minimal sekarang.
- Header `Cache-Control: public, max-age=60` HANYA untuk response yang
  user-independent (agregat reports, katalog produk). Payload yang
  membawa field per-user (dulu `role` di /api/products) TIDAK BOLEH
  di-cache browser.
- `getMemberSettings()`/`getZakatSettings()` di db.ts: cache modul 30 dtk,
  invalidated otomatis saat save.

## Pola kerja git (PENTING -- beda dari kebiasaan)
- Repo: `https://github.com/kita-foska/kopontren.git` (per 18 Sep 2026;
  sebelumnya `verica1937/kopontren-app`). Branch lokal: `master` (HEAD)
  + `main` (mirror).
- Pengembangan di branch **`master`**; **`main` = cermin master**
  (Vercel build dari `main`). Sinkron dual-branch:
  `git push origin master:master && git push origin master:main`
  (fast-forward push; main & master kini berbagi sejarah sejak sinkron
  GitHub -- JANGAN `git merge` antar keduanya).
- Git: `C:\Program Files\Git\cmd\git.exe`; node: `C:\Program Files\nodejs\node.exe`.
- **JANGAN commit `public/sw.js`**: setiap `npm run build`,
  `inject-sw-version.mjs` men-stamp ulang `// SW-BUILD:<hex>` (seed
  `.next/BUILD_ID` + timestamp) â†’ file berubah tiap build lokal;
  Vercel men-stamp sendiri saat build. (Aturan sama utk `out/`, `data.db`.)
- `.gitignore`: pola `_*` menyeluruh (file scratch `_*.{txt,log,...}`
  otomatis diabaikan) + `*.log` + tsbuildinfo.

## Konvensi kode
- Route handler API: `currentUser()` â†’ 401; guard role â†’ 403; validasi
  body defensif (`Number(...)` + floor + clamp; `req.json().catch(()=>({}))`).
- Query Turso: cap baris (limit â‰¤ 50 + offset) utk daftar; agregat global
  lewat `cached('...')`; N+1 â†’ batch `IN (...)` (pola ada di
  `/api/sales`, `/api/shifts`).
- Notifikasi: SEMUA best-effort (`try/catch` + `console.warn`), tidak
  boleh memblokir/merollback transaksi bisnis.
- Audit: `logAudit()` (tidak pernah throw) di setiap mutasi.
- UI: ikon `lucide-react` (jangan emoji), komponen dasar di
  `src/components/ui.tsx` (`api`, `Modal`, `Toast`, `Badge`), tema
  "Blue Notebook" (navy dark default + light). POS dirender lazy
  (`pos-lazy.tsx`) -- jangan imporkan `pos-client` dari page awal.
- Bahasa UI: Indonesia.

## Lingkungan & jebakan
- Windows PowerShell: command foreground Cline bisa "terpotong" (exit 1
  palsu) -- jalankan build panjang dengan `Start-Process` detached +
  polling file, atau `& node node_modules/next/dist/bin/next build`.
- Verifikasi selalu: `npx tsc --noEmit` lalu `next build` (48 page,
  First Load JS terberat ~123 kB).
- Modal QRIS di POS masih MOCK (NMID placeholder) -- bukan gateway nyata.
- Backup JSON (`/api/backup`) mencakup produk/penjualan/pembelian/kas/
  konsinyasi/member/shift/audit + `debts`/`payables`/`returns` (sejak
  commit `c02421b`, 21 Sep 2026) -- sisa yang belum: notifications
  (+ log push), member_settings/zakat (lihat TODO.md).

## PWA Installability (21 Sep 2026 -- JANGAN dibalikkan)
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
  jalan via `npm run build` â†’ `scripts/inject-sw-version.mjs`) â‡’
  `public/sw.js` tak berubah di git saat test lokal; Vercel
  men-stamp sendiri tiap deploy.
- **Guardrail sw.js (26 Sep -- keputusan user, commit docs
  `2bd27a1`/`10c8e87` telah ikut memuat stamp -- HARMLESS):**
  `public/sw.js` = **source file with build stamp**, BUKAN pure
  artifact (di-stamp in-place tiap `npm run build`). Keputusan:
  **tetap tracked (Option A) + guardrail `skip-worktree`**.
  Nilai stamp ter-commit **tidak memengaruhi production** --
  Vercel selalu re-stamp di cloud build. Disiplin:
  1. **JANGAN commit `public/sw.js` versi ter-stamp**; sebelum
     commit: `git checkout -- public/sw.js`.
  2. Clone `D` memakai `skip-worktree`
     (`git update-index --skip-worktree public/sw.js`) agar
     mutasi stamp lokal tak men-`pollute` status.
     **KHUSUS clone `D` -- JANGAN terapkan di clone `kp`.**
     (Perintah bersifat per-clone; cek dengan `git ls-files -v |
     Select-String '^S'`.)
  3. Follow-up (BELUM, terpisah): refactor template-generate --
     `public/sw.src.js` sebagai template ter-track;
     `inject-sw-version.mjs` MEN-GENERATE `public/sw.js`
     (template+stamp); `public/sw.js` masuk `.gitignore`. Lihat
     item di TODO.md.

## PWA Favicon -- Ikon Taskbar/Start Menu (22 Sep 2026, commit `046b80c`)
- **Akar masalah:** `public/favicon.ico` lama KORUP (10.861 byte, ICO
  tidak valid) â†’ Edge tak bisa ekstrak ikon aplikasi PWA; ikon taskbar
  & Start menu tampil default/generic.
- **Fix (046b80c):** generate ulang `public/favicon.ico` = ICO
  multi-size VALID (4 entry: 16/32/48/64) dari `icon-512.png` via
  `sharp` (`scripts/_gen-favicon.mjs`), hasil 5.635 byte;
  + bump cache `public/sw.js` â†’ v11 (paksa SW lama re-fetch aset).
- **Verifikasi LIVE (22 Sep):** `https://kopontren-gamma.vercel.app`
  menyajikan `/favicon.ico` = 5.635 byte (`image/vnd.microsoft.icon`),
  PERSIS file lokal â†’ deploy `046b80c` Ready & produksi live
  (halaman login app + manifest.json valid: icon-180/192/512,
  theme `#8A1538`).
- **Test client-side (DIANGKAT USER, Edge laptop -- PENDING hasil):**
  tunggu deploy â†’ uninstall PWA di Edge â†’ clear site data â†’ restart
  Explorer â†’ install ulang PWA â†’ cek logo nang taskbar/Start menu.
  Bila masih gagal: hapus cache ikon Windows manual + restart +
  install ulang, lalu laporkan. Cache ikon taskbar milik sisi
  Windows -- fix server baru terlihat setelah PWA di-install ulang /
  cache ikon dibersihkan.
- `scripts/_gen-favicon.mjs` & bukti sementara = file scratch (pola
  `_`, tak di-commit); `public/favicon.ico` & `public/sw.js` hasil
  `046b80c` sudah dual-push master+main.

## Audit Kode 3 Pass (20 Sep 2026)
Audit menyeluruh request terakhir (fungsional / keamanan /
performa-integritas). `tsc --noEmit` BERSIH. Temuan:

- **ðŸ”´ Backup import `audit_log` PK collision (DIFIX):** import INSERT
  baris `audit_log` dgn id eksplisit (`insA`), tapi daftar DELETE import
  & `/api/backup/reset` TIDAK membersihkan `audit_log` â†’ di DB live
  (ada log audit), import gagal 500. Fix: DELETE-then-INSERT per tabel
  (aman; audit = forensik, boleh terhapus saat restore).
- **ðŸŸ  `sales/[id]` DELETE vs retur:** FK `returns.sale_id` (ON) --
  jika transaksi punya retur, `DELETE FROM sales` bisa throw FK â†’ 500;
  meski lolos, retur sudah restock +1 dan delete restock penuh lagi
  (stok dobel) & jurnal kas (sale/refund) tidak direverse.
- **ðŸŸ  Race read-then-write:** plafon retur dibaca SEBELUM `tx`
  (returns/route.ts:94â†’109) -- 2 POST concurrent bisa melebihkan restock;
  cek stok POS (`prod.stock < qty`) vs `UPDATE stock = stock - ?` bisa
  oversell bila 2 transaksi concurrent. Probability rendah (kasir
  tunggal), dampak integritas data.
- **ðŸŸ¡ `debts/[id]` payment TIDAK masuk `cash_entries`** (bandingkan
  `payables/[id]` yang tulis 'expense' dalam 1 tx + invalidasi kas) --
  inkonsistensi pembukuan piutang vs hutang.
- **ðŸŸ¡ Retur refund pakai `unit_price` asli baris, mengabaikan
  `sale_items.discount`** â†’ refund/jurnal bisa lebih besar dari yang
  benar-benar dibayar pelanggan.
- **âšª `audit_log.ip_address` ambil `x-forwarded-for`/`x-real-ip` mentah**
  -- bisa di-forge klien (dampak forensik saja, bukan auth).
- **âœ… Diverifikasi BAIK:** matriks 7 role + guard tiap route konsisten
  (DELETE debts/payables = admin-only; kasir hanya transaksi sendiri);
  PIN lockout + timingSafeEqual; `CRON_SECRET` constant-time; SQL semua
  parameterized; `sales.client_ref` punya UNIQUE index partial
  (`idx_sales_client_ref WHERE client_ref != ''`) â†’ dedupe offline queue
  aman sampai di level DB; ref-cache berbatas 256 key + TTL 60 dtk.

## ZAKAT Tijarah & Known Issues (18 Sep 2026)
- **Bug #1 DI-FIX** (commit `6ef487b`, dual-push master+main):
  `computeZakat()` di `/api/zakat` kini **mengurangkan hutang dagang** --
  `SUM(payables.remaining)` dgn `status='open'` -- dari harta bersih
  (dulu hard-coded `hutang = 0`; statcard "Hutang" selalu Rp 0).
  Arahnya: piutang (`receivables` open) **ditambah**, hutang dagang
  **dikurangkan** â†’ harta bersih = modal + laba + piutang âˆ’ hutang
  (konsisten fiqh zakat tijarah).
- **Known issues:**
  - âœ… (25 Sep, batch #1+#3) Batas periode LABA zakat TIDAK LAGI
    perbandingan UTC mentah: 00:00 WIB dikonversi 17:00 UTC hari
    sebelumnya via `wibDayStartUtc` (`src/lib/zakat-period.ts`); export
    CSV riwayat zakat memformat `paid_at` WIB (header `paid_at (WIB)`);
    nama file pakai `wibToday()`. Test: `npm run test:zakat` (18 checks).
  - â³ `reports/csv` export: timestamp masih ditulis **UTC mentah**,
    UI tampil WIB (beda Â±7 jam) -- kosmetik, di luar batch 25 Sep
    (belum difix).
- **Known behavior -- `/sw.js` redirect (temuan 18 Sep 2026, bukan
  regression):** fetch `/sw.js` **tanpa cookie sesi â†’ 307 redirect ke
  `/login`** (whitelist `isStaticPublic` di `src/middleware.ts` hanya
  mengontrol header `Cache-Control`, TIDAK melewati session guard).
  Implikasi: PWA tidak bisa diinstall dari halaman publik -- service
  worker baru ter-fetch setelah login. Karena aplikasi internal, ini
  **acceptable**; kalau kelak ingin PWA installable dari landing page,
  perlu me-whitelist `/sw.js` di session guard middleware.

## Matriks Permission 7 Role (commit b83b75e, teruji manual 20 Sep 2026)
- **7 role**: admin, manajer, pengurus, kasir, gudang, pembelian, member
  (`ROLES` di `src/lib/auth.ts`; nilai tak dikenal â†’ `kasir` via
  `normRole`).
- Matriks terpusat: `FEATURE_MATRIX` + `canAccess(user, feature)`
  di `src/lib/auth.ts` (admin selalu lolos; guard API = 403; layout
  admin cukup cek login; sidebar per role; `products/bulk` per-aksi --
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
    tooltip IP/UA. **`SCHEMA_VERSION` 10â†’11**: WAJIB, agar DB
    prod (v10) menjalankan `fullInit`+`migrate()` sekali lagi saat
    cold start berikutnya -- tanpa bump, kolom baru tak akan pernah
    sampai ke DB lama dan semua `logAudit` (INSERT 4 kolom) gagal
    diam-diam.

## Audit 3 Putaran -- Hardening (21 Sep 2026)
Lanjutan audit 3-pass (fungsional / keamanan / performa-integritas).
Semua temuan diverifikasi ulang ke kode; fix dijalankan 2 batch
(`tsc --noEmit` + `next build` BERSIH di kedua commit):

**Batch A -- `c02421b` (kritis + medium, 6 file):**
- Backup diperluas: `debts`, `payables`, `returns` (+ kolom
  `client_ref` di sales) masuk export/DELETE/INSERT import;
  dilanjutkan `d435f57`: + `notifications`, `notification_settings`,
  `notification_logs` (export/DELETE/INSERT), import `audit_log`
  kini 13 kolom skema v11 (user_name, user_role, ip_address,
  user_agent) -- bug PK collision tetap ditutup oleh
  DELETE-before-INSERT; payload version 2 â†’ 3. `point_history`
  TUNDA (di luar cakupan, keputusan user).
- Import `audit_log` kini DELETE-then-INSERT; urutan DELETE
  FK-safe (returns â†’ sale_items â†’ sales â†’ â€¦ â†’ debts/payables/
  audit_log) â†’ bug PK collision selesai.
- `sales/[id]` DELETE: restock di-clamp qty sudah diretur (net),
  jurnal `cash_entries` "Retur #id" dihapus, baris `returns`
  dihapus â†’ tidak ada lagi stok menggembung / kas terdistorsi.
- `returns` POST: re-validasi plafon `SUM(qty)` DI DALAM `tx`
  (TOCTOU tertutup); violasi â†’ 400 + rollback.
- `sales` POST: guarded decrement
  `UPDATE â€¦ SET stock = stock - ? WHERE id = ? AND stock >= ?` +
  cek `changes === 1` â†’ race oversell tertutup, stok tak negatif.
- `backup/reset`: + DELETE returns/debts/payables; `audit_log`
  sengaja TIDAK dihapus (akun + rekam jejak audit).
- UI `admin/data-client.tsx`: teks entitas & warning
  import/reset disesuaikan.

**Batch B -- `f280f60` (minor hardening, 9 file):**
- konsinyasi: guarded UPDATE sell/return/pay di level SQL
  (`qty_sold + ? <= qty_received`, `amount_paid + ? <= tagihan`)
  â†’ double-submit tak lagi overpay/oversell.
- debts/[id] pay: guarded update + jurnal kas MASUK
  `cash_entries` "Bayar piutang Â· â€¦" (sejajar payables
  "Bayar hutang") + `invalidate('kas:','reports:')`.
- payables/[id] pay: guarded update; data berubah â†’ 400.
- members: DELETE kini dalam `tx` + urutan FK-safe (null
  `sales.member_id` dulu); pencarian LIKE escape meta-char
  (`% _ \`) + `ESCAPE '\'`.
- products POST/PUT: harga/HPP/stok clamp â‰¥0 (mencegah angka
  negatif merusak laba, COGS & kalkulasi zakat).
- reports GET: `days` clamp 1â€“3650 (dulu â‰¤0 â†’ full-scan 1970).
- logout: fallback `findSessionUser()` -- logout sesi
  idle-expired kini tetap tercatat di audit.
- notifications GET: error `pruneOldNotifications` kini
  `console.warn` (tak ditelan diam-diam).

**Known issues (belum difix / accepted -- 21 Sep 2026):**
- Throttle login pakai `X-Forwarded-For` (per-instance, bisa
  dirotasi); mitigasi: 3x salah PIN â†’ sesi dimusnahkan + lock
  5 mnt â†’ accepted risk.
- GET `/api/audit` menampilkan `old_value/new_value` (termasuk
  PII member) ke tier pengurus -- sesuai desain role internal;
  tinjau bila perlu.
- Cetak struk / struk WA: DIVERIFIKASI AMAN -- nama customer/produk
  masuk JSX React (auto-escape) + `window.print()` (CSS
  `.receipt-print`, tanpa document.write/innerHTML/dangerously
  SetInnerHTML); teks struk/rekap WA di-encodeURIComponent utk
  `wa.me` (nomor disterilkan non-digit). Lihat TODO.md [x].
-`audit_log` auto-purge harian (job `audit` di cron; default 90
  hari) - TODO [x] SELESAI; purge manual admin tetap tersedia.
- Stale cache lintas instance Vercel â‰¤60 dtk (accepted,
  terdokumentasi).
- Retur refund KININ dihitung dari harga efektif (commit
  `2a34a8f`, 22 Sep) - TODO [m] ditutup.
- `point_history` belum masuk backup/restore (TUNDA -- 21 Sep
  2026, keputusan user, di luar cakupan perluasan backup).

## Status Produksi & Uji (update sesi akhir)
- 17 fix live di Vercel (chain `851e219` â†’ `a4fdd00`; Batch A
  `c02421b`+`d435f57`, Batch B `f280f60`, dst.). **Test manual
  12 langkah DITUNDA** (Makfi sibuk) -- checklist tetap terbuka;
  import backup legacy v2 â†’ skema v3 tetap berisiko data lama
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
  print 58mm) -- tanpa ðŸ”´/ðŸŸ  baru; ðŸŸ¡ kelengkapan jejak `pay_split`
  di audit `sales:create` difix (`4431e80`). Perf terukur:
  First Load JS maks 133 kB (< target 150), shared 103 kB,
  Middleware 34 kB, 48 page. FASE UI/UX = laporan menunggu
  approval (Modal âœ• <44px + tanpa ESC/focus-trap; kontras teks
  skeleton rendah; belum ada panel bantuan hotkey POS) -- kode UI
  belum diubah apa pun.

- **Struk thermal 58mm + @page kondisional (perbarui)**: `.receipt-print`
  = 58mm/2mm/9pt/1.3 (commit `82fccdb`); `@page` global A4 8mm utk
  laporan `.print-area`; saat cetak struk `printReceipt()` (pos-client)
  inject `@page 58mm/0mm` + hapus saat `afterprint` (fallback 4 dtk) --
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
  `barcode` produk -- discan CameraScan kasir (jsQR, lookup
  `addByBarcode`) atau diketik manual; nomor barcode juga dicetak
  teks monospace utk scanner USB 1D / input manual. Grid 2 kolom A4,
  pilihan 2â€“24 lembar, print window + `document.write` (pola
  MemberQrBadge; semua nilai di-escape HTML). Produk tanpa barcode â†’
  toast penunjuk ke tombol Ubah. Lib `qrcode` sudah ada di deps
  (dipakai juga MemberQrBadge). TODO [x].

- **QRIS DITUNDA (keputusan user, 22 Sep 2026)**: QRIS mock (SVG acak +
  NMID fiktif `ID102003004050`) hanyalah PLACEHOLDER -- **belum
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
  MAX(`birthday_discount`, base) -- yang paling untung (keputusan
  user), cap 90%; (2) cashback = `cashback%` dari total SETELAH perk,
  dikredit `members.cashback_balance` + ledger `point_history`
  (reason 'cashback'); (3) poin dihitung dari total setelah perk
  (dulu sebelum perk); (4) auto-tier (badge/status saja, tanpa
  diskon tambahan -- keputusan user): `members.tier` dihitung ulang
  dari akumulasi `total_spent` vs `tier_silver`/`tier_gold` (bisa
  turun ke silver/nona bila di bawah ambang). Kolom baru
  `sales.member_discount` (pisahkan dari kolom `discount` manual).
  GET `/api/members` kini kirim `birth_date`, `tier`,
  `cashback_balance` (gate tier 'pos'). UI POS: chip perk preview
  (badge tier, diskon, cashback) + struk (kartu/thermal/WA/salin):
  baris diskon member / cashback / tier. GROSIR DITUNDA (keputusan
  user: fokus perk dulu); redemsi poin & pemakaian
  cashback_balance = langkah berikutnya (fitur 2 -- SELESAI 23 Sep,
  commit `66a3db9` + fix `1b98a24`; detail di bagian di bawah).

## Penjaga Margin Perk Member (commit `4dee370`, 23 Sep)
- Modul murni `src/lib/perks.ts` = SATU-SATUNYA sumber rumus perk,
  dipakai bersama POST /api/sales (otoritatif) + preview POS +
  unit test `node scripts/test-margin.ts` (`npm run test:margin`,
  57 test). JANGAN tambah import proyek di sini -- harus tetap
  bisa dieksekusi Node langsung (type-stripping).
- Pipeline perk (urutan): (1) diskon member = % dari subtotal
  SETELAH diskon manual, cap 90%; ultah aktif â†’ MAX(birthday,
  base); (2) redeem: nominal, poin (1 poin = `point_value` Rp)
  dipakai DULU, sisa dari `cashback_balance`, cap di total
  setelah diskon + ketersediaan saldo; (3) cashback = % dari
  total SETELAH diskon & redeem â†’ kredit saldo (liabilitas,
  TIDAK mengurangi total saat ini); (4) poin = total /
  `points_every`; (5) auto-tier dari akumulasi `total_spent`
  (badge/status saja).
- PENJAGA MARGIN (anti rugi): margin kotor = subtotal âˆ’ Î£(costÃ—
  qty); cap perk otomatis = max(0, margin âˆ’ diskon manual);
  pangkas berurutan cashback â†’ redeem â†’ diskon (diskon paling
  "keras" utk pembeli â†’ dipertahankan terakhir). Diskon manual
  menembus margin = SOFT: flag `manual_over_margin` (audit
  `sales:margin_clamped` / `sales:manual_over_margin` + notifikasi
  admin `margin_alert`), penjualan TIDAK diblokir (keputusan
  user). HPP produk = 0 â†’ margin dianggap = subtotal (guard tak
  pernah memotong -- aman).
- POST /api/sales kini balas blok `sale.margin` (diagnostik:
  grossMargin, cap, clamped, clampedAmount, manualOutflow,
  manualOverMargin) + ledger `point_history` reason: `earn`,
  `cashback`, `redeem` (delta NEGATIF = poin terpakai),
  `cashback_use` (delta NEGATIF = Rp terpakai), `void`,
  `refund`, `refund_cash`. Kolom baru `sales.redeem` +
  `sales.cashback`. UPDATE members guarded
  `WHERE points â‰¥ ? AND cashback_balance â‰¥ ?` (race 2 transaksi
  paralel satu member tak bisa oversell saldo).

## Redemsi Poin + Saldo Cashback -- rollback DELETE (baseline
`66a3db9` + fix `1b98a24`, 23 Sep)
- UI POS: dulu checkbox "Tebus poin/saldo" (auto-max); KINI input
  nominal bebas + tombol "Maks" (follow-up -- lihat seksi "Redemsi
  Parsial" di bawah); nominal `redeem`; poin dulu lalu saldo;
  + 2 baris struk.
- DELETE /api/sales/[id]: guard anti-double-delete -- hapus baris
  sales DULU, cek `changes === 1` baru restock/rollback member;
  race 2 DELETE paralel â†’ seluruh batch di-rollback (tak ada
  restock/kredit dobel). Tier di-rehitung setelah
  `total_spent` turun (badge tak stale). Rollback redemsi
  terbaca PRESISI dari ledger (`SUM ABS(delta)` per reason +
  `SUM(amount)`), jejak `refund`/`refund_cash`; jumlah `amount`
  SAMA di earn/cashback/redeem/cashback_use agar agregat &
  audit konsisten.
- `.gitignore` + lokal: `_prod` (dump turso prod), `_ts.json`,
  `db.txt` -- JANGAN commit.

## Redemsi Parsial -- input nominal (follow-up UI, 24 Sep 2026)
- Checkbox "Tebus poin/saldo" (auto-max) GANTI jadi input nominal
  Rp (`redeemInput`) di POS: kasir ketik nominal bebas, di-clamp â‰¤
  `redeemMax` (= poinÃ—point_value + cashback_balance, plafon total).
  Tombol "Maks" = perilaku auto-max lama (shortcut).
- Preview live "Tebus âˆ’Rp X (N poin + Rp Y cashback)" pakai rumus
  SAMA server (perks.ts): `N=min(floor(redeem/pointValue),
  availPoints)`, `Y=min(redeemâˆ’NÂ·pointValue, availCb)`. Nominal >
  saldo â†’ warning + auto-clamp. Backend TIDAK berubah (POST
  /api/sales sudah terima `b.redeem` nominal sejak baseline Fitur 2).
  TSC + `next build` lolos. **Fitur 2 (redemsi) 100% selesai.**

## Bug check 3x utk perk/redemsi/DELETE (23 Sep -- tanpa temuan
blocking)
- FUNGSIONAL: POSTâ†”DELETE konsisten -- ledger reason simetris,
  jumlah `amount` per reason sama, re-hitung tier memakai ambang
  `tier_silver`/`tier_gold` yang sama dgn `computePerks`. Edge
  pre-ada (tercatat TODO [r]): `amount_paid`/`change` dipercaya
  dari klien (tak di-cross-check vs total) -- rencana Fitur 3
  menutup utk transaksi bercampur (Î£ split divalidasi server).
- KEAMANAN: guard utuh (POST `canAccess 'pos'`; override harga,
  diskon line & transaksi HANYA manager; DELETE `isManager`;
  PATCH sales status sendiri-atau-manager); SQL tetap
  parameterized; `redeem` di-floor + cap ketersediaan;
  notifikasi margin best-effort tak memblokir/merollback.
- PERFORMA: margin guard = murni hitungan (0 query tambahan);
  guarded redeem UPDATE = 1 round-trip; re-hitung tier = mrow
  (SELECT yang sudah ada) + `getMemberSettings()` (cache modul
  30 dtk) + 1 UPDATE -- tak ada N+1; agregat kas/laporan tetap
  di-cache 60 dtk; `point_history(member_id)` terindeks.

## Fitur 3 -- Pembayaran Campuran (SELESAI -- approval user)
- Keputusan user: SPLIT PENUH saja (Î£ = total, tanpa piutang;
  bayar-sebagian = follow-up terpisah). Whitlist metode {cash,
  tf, wa} (QRIS resmi menyusul bila NMID siap -> tambah `qris`
  ke whitelist + PAY_LABEL).
- Skema v13: `sales.pay_split` JSON TEXT NULL
  (`[{"m":"cash","a":50000},{"m":"tf","a":50000}]`); baris lama /
  1-metode = NULL (fallback `pay_method` + `total`).
- Validasi server POST /api/sales: metode âŠ‚ whitelist, nominal
  integer > 0 per bagian; **Î£(split) = total final PERSIS**
  (dicek di dalam tx, setelah perk member); `change` = 0 &
  `amount_paid` = total; `pay_method` = metode dominan (bagian
  terbesar) -- baris lama tak berubah.
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
  tetap valid), laporan baris "(campur)", UI POS: tombol "ðŸ”€
  Campur" + input nominal per metode + indikator Lunas/Selisih
  live; payload `pay_split` ikut antrean offline.
- Uji: `npm run test:split` (node:sqlite in-memory -- agregat
  per-metode & cash-portion utk baris legacy + mixed, 15 check).
- QRIS resmi DI LUAR cakupan (TERTUNDA -- NMID).

## Batch UI + Hotkey (21 Sep 2026) -- 7 commit, HEAD `9782a89`
- **Logo (95c70b5):** chip persegi `h-9 w-9` (Image `h-full w-full object-contain`)
  + brand "Kopontren AL ITTIHAD" semua lebar -- perbaikan bug #14
  (atribut width/height 36 mengunci aspect ratio).
- **Batch 3 (c3ce06c): tema + keluar pindah ke hamburger.** `shell.tsx`
  kini `'use client'` (+ `useRouter`): handler `toggleTheme` (logika cookie
  identik ThemeToggle lama) & `handleLogout` (POST `/api/auth/logout` +
  `router.push('/login')`) di-pass ke `HamburgerNav` â†’ `Sidebar`. Di bawah
  nav panel: item "Ganti Tema" (ikon dinamis CSS: darkâ†’Sun, lightâ†’Moon) +
  "Keluar" (rose). `themetoggle.tsx` & `logout.tsx` DIHAPUS (f03d6b7).
  Header kini: hamburger + logo/brand | nama+badge role + bell (admin).
- **Batch 4 (c364b2c): a11y.** `Modal` (ui.tsx): ESC tutup, focus-trap
  Tab/Shift+Tab, fokus awal elemen pertama + restore saat tutup,
  `role="dialog" aria-modal aria-label`, tombol âœ• min 44px (`min-h-11
  min-w-11`). `Toast`: live region `role="status" aria-live="polite"`
  PERSISTEN (kosong = sr-only, jangan unmount -- SR tak mau live region
  baru). `PageSkeleton`: kontras naik (`bg-slate-300`/`dark:bg-navy-500`,
  label slate-500).
- **Batch 5 (7ab05d2 + 9782a89): hotkey kasir.** Hook baru
  `src/lib/useHotkeys.ts` (map handler stabil via useRef: listener 1x,
  isi map fresh tiap render; handler yang preventDefault -- di luar aksi
  input teks & shortcut browser tetap normal). F1â€“F5 + ESC TIDAK berubah
  (memori otot). Baru: F6 toggle split (cart tidak kosong, di luar modal),
  F7 buka/tutup shift (modal sesuai `currentShift`), F8 fokus select
  member, F9 fokus input diskon (hanya admin), panah â†‘/â†“ seleksi item
  keranjang (+ highlight ring, clamp), +/- qty item terpilih (clamp stok
  via setQty), Del/Backspace hapus item, Enter di kolom uang diterima =
  checkout (guard uang kurang tetap jalan), Ctrl+P cetak struk, Ctrl+M
  member, Ctrl+H â†’ `/laporan` (CATATAN: Chrome menahan Ctrl+H -- tak
  bisa dicegah page-side; Firefox/Edge OK; fallback = menu), Ctrl+R reset
  pesanan tanpa transaksi (antrean offline TIDAK disentuh). Cheatsheet:
  tombol `?` di judul keranjang + key `?` (guard: ketik `?` di input teks
  tidak membuka panel).
- **REGRESI DB (3724e36) -- temuan bug check, PENTING:** `sales.kasir_id`
  cuma ada di `CREATE TABLE` (tak berlaku utk DB existing) + tak ada
  `execColumn` â†’ di Turso produksi kolom HILANG: `CREATE INDEX
  idx_sales_kasir` gagal, `INSERT INTO sales (kasir_id,â€¦)` & guard retur
  `SELECT â€¦ kasir_id` = "no such column". FIX: `execColumn(d, 'ALTER
  TABLE sales ADD COLUMN kasir_id INTEGER')` (idempoten) + bump
  `SCHEMA_VERSION 14`. Baris lama kasir_id NULL = transaksi historis
  tanpa atribusi; guard hanya membatasi role kasir (pengurus/admin leluwa).
- **Verifikasi:** `tsc --noEmit` exit 0 Â· `next build` 48/48 Â·
  `test:split` 15/15 Â· `test:margin` 57/57 Â· dual-push master+main
  `9782a89` (ff juga membawa 7 commit main tertinggal). `public/sw.js`
  tetap tidak di-commit (stamp di-inject lokal saat build).
- **STATUS LIVE (22 Sep 2026):** 8 commit (`95c70b5`â€¦`f0d17c8`) sudah
  di master + main; Vercel auto-deploy dari `main`. **skema v14 terpasang
  pada cold start pertama pasca-deploy** -- buktinya = smoke test transaksi
  POS baru di HP user: INSERT `kasir_id` jalan tanpa "no such column".
  (Query `schema_version` tak bisa dari lokal: `.env` lokal hanya
  `DATABASE_URL` dev-DB; token Turso produksi hanya di Vercel env.)
- **Keputusan sisa item:** QRIS asli TUNDA (NMID), grosir/perks member
  belum dimulai, `point_history` backup TUNDA (keputusan 21 Sep: di luar
  cakupan). File scratch sesi di-gitignore (`_*` pola + `scripts/zz-*`);
  bukti di-retain lokal: `_txlib.mjs`, `_probe4.mjs`.

## Produk & Stok -- Revisi Pendekatan (23 Sep 2026)
- Cline TIDAK lagi butuh akses Turso langsung utk fetch stok/import
  (credential Turso di `.env` lokal tidak diperlukan). Pendekatan:
  Cline generate CSV stok dari DB dev, USER upload sendiri ke Turso.
- Artefak: `stok-export-YYYYMMDD.csv` di root project (untracked,
  jangan di-commit -- user ambil lokal). Header:
  `id,nama_produk,barcode,kategori,stok,hpp,harga_jual,status`.
- Mapping kolom DBâ†’CSV: `products.name`â†’nama_produk,
  `products.category`â†’kategori (kategori = TEXT langsung di tabel
  `products`, bukan join tabel `categories`), `products.cost_price`â†’hpp,
  `products.base_price`â†’harga_jual, `products.active`â†’status
  (1='aktif' / 0='nonaktif'), `products.barcode`â†’barcode (banyak
  masih kosong â†’ field dibiarkan kosong).
- Generator: `_gen-stok-csv.mjs` (scratch gitignored, re-runnable):
  buka `data/kopontren.db` read-only via `node:sqlite`, tulis UTF-8
  TANPA BOM + quoting RFC-4180 (field mengandung koma/quote
  di-wrap tanda kutip, quote internal dobel). Contoh nyata:
  produk `double tap 1,2 cm` (id 127) ter-export dgn benar.
- Ekspor 23 Sep: 237 baris (semua aktif). Baris 237 = `ZZ-GUARD-TEST`
  (baris uji manual di DB dev, tidak ada di codebase) -- flag:
  hapus sebelum upload bila Turso produksi tak punya baris tsb.

## Phone guard format-insensitive + purchases floor (23 Sep 2026)
- **Commit `f2b398e` fix(members): phone duplicate guard
  format-insensitive + test 26 checks** (dual-push master+main):
  - `src/lib/phone.ts`: `canonicalPhone` (normalize "+62/62/0" â†’
    digit kanonik) + `phoneOwner(d, phone, exceptId)` -- pemilik nomor
    selain `exceptId` lewat pembanding DUA bentuk (teks apa adanya
    sesuai kolom/index `idx_members_phone_uniq` + bentuk kanonik),
    parameterized IN(...) -- duplikat beda penulisan tertangkap di
    lapisan aplikasi SEBELUM constraint mentah (dulu: HTTP 500
    "Kesalahan jaringan." di POS).
  - `src/app/api/members/route.ts`: helper lokal `phoneOwner` dihapus,
    import dari `@/lib/phone`; POST guard 409 + try/catch fallback
    400, PUT guard (kecuali diri sendiri) 409.
  - `scripts/test-members-phone.ts` (`npm run test:phone`): **26
    checks, 0 gagal** -- index unik tolak teks mentah, index terima
    teks beda kanonik sama (bukti guard app wajib), query kanonik vs
    tersimpan "+62â€¦", kecuali diri â†’ null, dll.
  - Verifikasi: `tsc --noEmit` exit 0 Â· `test:phone` 26/26.
- **Commit `6b4b179` fix(purchases): floor unit_cost ke rupiah penuh**
  -- `Math.max(0, Math.floor(...))`: nominal pecahan tak lagi membuat
  `qtyÃ—unit_cost` pecahan â†’ agregat kas/laporan & harga modal
  konsisten.
- `public/sw.js` TIDAK di-commit (stamp lokal `ea8ac407f7aa` =
  artefak build lokal; Vercel re-stamp saat build). CSV stok
  (`stok-export/import-20260923.csv`, `_products_update.csv`)
  tetap untracked -- user upload sendiri (PENDING).
- **Vercel: DEPLOY TERKONFIRMASI LIVE (23 Sep):** stamp produksi
  berubah `SW-BUILD:7706b506c8ab` -> `1d0b1c0f67b6` (build s/d
  `c4d77e4`) -> `3d3c7a7f47e6` @ 00:04 (build s/d `e0aed83`,
  diff konten vs sw.js lokal tanpa baris stamp = 0 baris).
  Catatan: stamp di-seed `BUILD_ID + Date.now()` per build (lihat
  `scripts/inject-sw-version.mjs`), jadi stamp prod TIDAK PERNAH
  = stamp lokal DAN re-stamp tiap deploy -- kriteria sukses =
  stamp prod BERUBAH dari baseline + konten non-stamp identik
  lokal, bukan match stamp. Cara verifikasi tanpa Vercel CLI/token:
  `curl https://kopontren-gamma.vercel.app/sw.js` lalu grep
  `SW-BUILD:` + Compare-Object vs `public/sw.js` (skip baris stamp).
- **AUDIT 3x (23 Sep): tanpa bug kritis baru** -- detail + temuan
  minor (schema mati `stock_opname`, `invalidate('kas:')` no-op,
  fetch klien tanpa timeout) tercatat di TODO.md. Semua key
  `cached()` (7 site) terverifikasi punya pasangan
  `invalidate(prefix)` yang benar; oversell-guard
  `WHERE stock >= ?` + guard `changes === 1` tetap konsisten.
- **Hardening IP klien (23 Sep):** `src/lib/client-ip.ts`
  `clientIp(req)` -- ambil KANAN-paling `x-forwarded-for` (hop yang
  ditambahkan edge Vercel; kiri-paling bisa di-forge klien) +
  validasi IPv4/IPv6, sampah -> `'unknown'`. Dipakai oleh
  `logAudit` (forensik audit_log.ip_address) DAN `throttleKey` di
  `/api/auth/login` -- sebelumnya kunci throttle
  `username|IP` bisa diputar penyerang via header palsu sehingga
  lockout anti brute-force tak pernah terpicu. Test
  `npm run test:clientip` (16 checks). `x-real-ip` tetap jadi
  fallback bila XFF absen.


## Fix minor FASE 1 + drop stock_opname + FASE 2 (23 Sep 2026)
- **Commit `c088861` fix(client): timeout 10 dtk di semua fetch** --
  helper baru `src/lib/fetch-util.ts`: `fetchTimeout(url, init?, ms=10_000)`
  (AbortController; menggabungkan `init.signal` bila ada) + `isAbort(e)`
  + pesan galat spesifik "Waktu koneksi habis. Silakan coba lagi."
  Cakupan: `api()` di `ui.tsx` (menutup SEMUA caller helper: POS,
  laporan, piutang, retur, belanja, hutang, kas, konsinyasi, audit,
  shift, produk, pengguna, member, zakat, dsb.), `/api/auth/login`,
  PIN verify, PIN setup (cek sesi + POST), `session-watcher` (polling
  30 dtk + refresh), logout `shell.tsx` (kini + catch -- dulu bisa
  hang tanpa redirect), export CSV zakat. Pengecualian: batch import
  produk `migrate-client` = 60 dtk (batch 50 baris tidak boleh
  terpotong Turso lambat).
- **Commit `ae430f6` docs(cache): `kas:` backstop** -- hanya doc
  (header ref-cache.ts); bukan bug, tidak ada perubahan perilaku.
- **Commit `c46f4fa` chore(db): drop `stock_opname` + SCHEMA_VERSION 15** --
  CREATE TABLE + CREATE INDEX dihapus dari skema fullInit; langkah v15
  baru `DROP TABLE IF EXISTS stock_opname` + `DROP INDEX IF EXISTS
  idx_stock_opname_created` sebelum stamp versi. DB produksi (stempel
  14) akan menjalankan `fullInit` SEKALI saat cold start pertama pasca
  deploy (pola sama dengan bump v9â†’14 -- terbukti aman); data lama
  (bila pernah diinput manual) tetap bisa dipulihkan dari snapshot
  backup Turso pra-drop. Butuh opname lagi â†’ migration baru + v16.
- **FASE 2 (UI Modern + Komunikatif): AUDIT UI/UX LENGKAP SELESAI,
  TUNGGU APPROVAL user sebelum ubah UI.** Detail temuan per halaman di
  `TODO.md` (seksi "FASE 2 -- Audit UI/UX"). Prinsip yang disepakati:
  tidak ada perubahan UI sebelum approval; rekomendasi dipecah per
  batch agar tiap batch kecil & mudah di-approve.
- **FASE 2 BATCH A: DISELESAIKAN -- commit `9ef700e` (23 Sep 2026).**
  Eksekusi 4 item bug fungsional (1 commit, 10 file, +377/-199):
  1. **Guard busy 8 form** (useState per-file, konsisten dgn POS/
     LowStock): piutang, hutang, belanja (tab in & out), kas,
     konsinyasi (`post` + 5 tombol KonsCard), produk (save/stock/
     toggle; bulk sudah guard), member, pengguna (6 operasi).
     Setiap submit async kini `if (busy) return` + `finally
     setBusy(false)`, tombol `disabled` saat request.
  2. **Label belanja tidak menyesatkan:** "(50 transaksi/pengeluaran
     terbaru)" â†’ "(dari semua data)" -- total memang agregat global
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
     user):** (1) double-tap form â†’ tap ke-2 diabaikan âœ“,
     (2) label total belanja "dari semua data" âœ“,
     (3) footer "Menampilkan X dari N transaksi" âœ“,
     (4) toast kas + pengguna âœ“. â†’ Batch B di-approve.
- **FASE 2 BATCH B (mobile tabelâ†’card): DISELESAIKAN -- commit
  `cb792aa` (23 Sep 2026).** 5 file, +273/-8, MURNI RENDER LAYER
  (state/logika/data tak disentuh): kas, shift, produk, member,
  audit. Pola: tabel `hidden sm:block` + card list `sm:hidden`
  memakai source data yang sama (`data.rows`, `all` + `openList`,
  `filtered`, `shown` jendela virtual member -- spacer
  `padTop`/`padBottom` diduplikat di card agar scroll container
  virtual tetap akurat, `logs` audit). Hit-area 44px: tombol aksi
  card `h-11` mobile / `sm:h-9` desktop; `.btn`/`.input` sudah
  bawa `min-height:44px` sehingga tombol `.btn-*` lama tak perlu
  diubah. Fix khusus Batch B: (a) hapus jurnal kas di card = ikon
  `Trash2` (lucide) 44Ã—44 + `aria-label` (tabel desktop tetap link
  teks "hapus"), (b) toggle Aktif/Nonaktif produk kini TERGUNA
  di mobile lewat card (dulu hanya tabel desktop; checkbox
  "Setor kas" shift di card 44px utk admin, load-more 44px).
  `public/sw.js` sengaja TIDAK di-commit (prebuild `npm run build`
  me-stamp ulang: stamp lokal kini `01d183d5d618`).
  Verifikasi: `tsc --noEmit` exit 0 (output kosong), `npm run
  build` exit 0 (rute export lengkap, First Load JS shared
  103 kB). Dual-push `master` + `main` @ `cb792aa`.
- **FASE 2 BATCH C (konsistensi UI): DISELESAIKAN -- commit
  `ec9d9c9` (23 Sep 2026).** 22 file, +181/âˆ’77, MURNI
  PRESENTASIONAL (tak ada ubah data/state/API/DB):
  1. **Label metode bayar terpusat:** `lib/pay-methods.ts`
     kini punya `PAY_METHOD_LABEL` + `payMethodLabel()`; 6 map
     lokal (rekap, pengurus-dashboard, pos-client, laporan-client,
     shift-client, home) dihapus â†’ 16 call-site pakai helper.
  2. **Skeleton seragam:** 7 page wrapper `next/dynamic` (audit,
     hutang, pengaturan-member, shift, zakat, piutang, retur)
     `loading="Memuat komponen..."` â†’ `<PageSkeleton />`.
  3. **Low-stock badge:** "14hr: 0/j" â†’ "belum ada penjualan
     14 hari", "Â±N hr" â†’ "habis dalam N hari".
  4. **Aksen h1:** konsinyasi/produk/belanja dapat span
     `text-accent-500`; laporan amberâ†’accent.
  5. **Bug pin/setup:** status tak dikenal/fetch gagal dulu
     nyangkut "Memeriksa sesiâ€¦" â†’ kini lanjutkan UI + state
     `checkFailed` + hint amber "tak bisa cek sesi, lanjutkan
     saja" (POST tetap memvalidasi sesi server-side).
  6. **Unduhan tanpa tab flicker:** 4 tempat
     `window.open('/api/backup')` & `window.open('/api/reports/csvâ€¦')`
     (data-client Ã—2, laporan-client, laporan-admin-client) â†’
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
    SEMUA OK -- (1) label bayar âœ“, (2) skeleton âœ“, (3) low-stock âœ“,
    (4) aksen h1 âœ“, (5) pin/setup âœ“, (6) unduhan blob âœ“.
    Batch C final â†’ Batch D di-approve.

## FASE 2 BATCH D (a11y polish): DISELESAIKAN -- commit `e9ebfdb`
  (23 Sep 2026)
  - 30 file, +194/âˆ’161, MURNI ATRIBUT (tak ada ubah
    data/state/API/DB, tak ada ubah layout/perilaku):
    1. **aria-expanded Ã—3** (sebelumnya 0 di seluruh repo):
       `laporan-client` (akordion transaksi, `aria-controls=
       lap-detail-{id}` + id di panel), `notification-bell`
       (toggle panel, `aria-controls="notif-panel"` + id di panel),
       `sidebar` (tombol menu mobile drawer).
    2. **role=tablist Ã—3 baru** (+ `role="tab"` +
       `aria-selected` di 6 tombol tab): `belanja-client`
       (in/out), `data-client` (backup/audit), `konsinyasi-client`
       (active/done). Catatan: `pos-client` L1139 sudah punya
       `role="tablist"` bawaan (tak diubah). Panel tab berupa
       fragment/kondisional -- wiring `aria-controls` panel
       sengaja dilewati (minimal viable, tanpa wrap baru).
    3. **type="button" Ã—154 tombol di 30 file** (estimasi awal
       grep single-line ~65; scanner nesting-aware menemukan
       lebih banyak karena banyak tag `type=`-nya beda baris /
       auditor melewatkan tombol tanpa atribut di beberapa file).
       Tombol submit form login (`type="submit"`) TIDAK diubah --
       satu-satunya `<form>` di app.
    4. **Sumbu chart:** label x `SalesBarChart`
       (`charts.tsx`) `text-[9px]` â†’ `text-[11px]`.
  - Verifikasi: `tsc --noEmit` exit 0, `npm run build` EXIT 0;
    grep: `aria-expanded`=3 (full coverage -- tak ada kontrol
    fold/collapse lain di repo), `role="tablist"`=4 (3 baru +
    1 eksisting pos-client), `text-[9px]` di charts=0, scanner
    `<button` tanpa `type` = 0 pelanggaran.
  - `public/sw.js` tidak di-commit (di-restore pasca build,
    stamp lokal `9aa319458960`). Dual-push `master` + `main`
    @ `e9ebfdb` (ls-remote kedua ref = `e9ebfdbâ€¦`).
  - Sisa pending: test ikon PWA di Edge (urutan 3 test user),
    QRIS / grosir / point_history (tunda, NMID).

## Konvensi fetch klien (23 Sep 2026)
- Klien: SEMUA fetch lewat `fetchTimeout` (`@/lib/fetch-util`),
  default 10 dtk; pesan galat timeout via `isAbort(e)`. Jangan buat
  helper terpisah per halaman. (`checkSession` di `/login/pin` sudah
  punya AbortController sendiri + abort saat unmount -- biarkan, sudah
  patuh aturan 10 dtk.)

## Re-Verifikasi LIVE -- Batch A `bf52f63` (23 Sep 2026, 19.00)
- **URL produksi = `https://kopontren-gamma.vercel.app`** (project
  Vercel terhubung `kita-foska/kopontren`, build dari `main`).
  âš ï¸ `kopontren-app-sapiens-ai.vercel.app` (URL lama di dokumen awal)
  sekarang **404 semua path**, dan `kopontren-app.vercel.app` masih
  menyajikan build **lawas (pra-21 Sep)**: `/sw.js`, `/manifest.json`,
  `/api/*` â†’ 307 `/login`, `/login/pin*` â†’ 404, buildId
  `GCE-OvNduy2JlV5shvyiS`. Keduanya BUKAN produksi -- JANGAN dipakai
  utk verifikasi.
- Vercel dashboard (screenshot user 23 Sep): `bf52f63`, `9ef700e`,
  `c46f4fa`, `bd86ffa`, `e0aed83` semua **Ready + Production** âœ“.
- Fingerprint LIVE âœ“ (HTTP 23 Sep, `kopontren-gamma`): `/sw.js` 200
  (baru, bukan 307), `/manifest.json` 200, `/api/shifts` &
  `/api/sales` â†’ **401 JSON** (middleware passthrough -- behavior
  post-`db10160` âœ“), `/login/pin` 200, `/login/pin/setup` 200.
- **Semantik stamp SW-BUILD**: `// SW-BUILD:<12hex>` =
  `sha1(.next/BUILD_ID + Date.now())` yang ditulis
  `scripts/inject-sw-version.mjs` SAAT BUILD (vercel.json
  `buildCommand`). **BUKAN hash git** -- tak bisa di-resolve `git log`
  (jangan kejar). Stamp live saat ini `7c86f8f64937` vs
  `db032f04f915` ter-commit lokal -- NORMAL (tiap build men-stamp
  ulang; isi file 137 baris selain stempelnya IDENTIK).
- Cold start v15: terpenuhi pada **akses pertama dari HP setelah
  deploy ini** -- browser deteksi diff /sw.js â†’ install SW baru â†’
  `skipWaiting` â†’ activate purge cache lama â†’ `fullInit` sekali.
- Koreksi bagian "Batch A" di atas: sejak `c46f4fa` (commit
  `public/sw.js` + `scripts/inject-sw-version.mjs`), `public/sw.js`
  **DI-COMMIT** (dengan stamp); build Vercel men-stamp ulang tiap
  build, jadi diff git per push tetap ada.

## âš ï¸ ATURAN POKOK -- SYARIAH FIQH MUAMALAH (24 Sep 2026)

> **Prinsip: "Syariah nomer 1, fitur nomer 2."** Semua fitur BERSifat AMANAH + SYAR'I.
> Setiap fitur BARU wajib: (1) tentukan akad, (2) cek bebas riba, (3) cek bebas gharar,
> (4) cek bebas maysir, (5) cek bebas dzalim, (6) ridha/tanpa paksaan, (7) tashih ulama
> bila ada syubhat. Checklist lengkap: **`SYARIAH-CHECKLIST.md`** (root repo).

### Hasil Audit Syariah (24 Sep 2026, 6 fase, seluruh kodebase)
- **Riba: âœ… TIDAK ADA** -- grep seluruh src: tidak ada bunga, denda keterlambatan, biaya
  admin tersembunyi. Piutang (debts) & hutang (payables) = qardh/utang dagang tanpa
  tambahan; pembayaran capped di sisa (overpay mustahil); due_date hanya pengingat ("Tunggak" = badge, bukan biaya).
- **Gharar: âœ…** -- semua akad ma'lum: harga (base_price/cost_price per produk), qty stok,
  agree_price konsinyasi, due_date, dan preview perk (diskon+redeem+cashback) dihitung
  client SEBELUM submit (rumus satu sumber: `src/lib/perks.ts`).
- **Maysir: âœ… TIDAK ADA** -- tidak ada undian/lotre/giveaway.
- **Dzalim: âœ… umumnya** -- penjaga marjin (perks cap = margin kotor, trim urut
  cashbackâ†’redeemâ†’diskon) melindungi store dari penjualan rugi; manual diskon > margin
  hanya "soft-flag" (catatan minor operasional).

### Klasifikasi fiqh per fitur
| Fitur | Akad | Status |
|-------|------|--------|
| POS jual-beli | Bai' | âœ… |
| Piutang | Qardh tijari (tanpa bunga) | âœ… |
| Hutang supplier | Dayn tijari | âœ… |
| Konsinyasi | Salam al-bi' / wakalah -- 100% hasil ke pemilik (agree_price), BELUM ada komisi store | âœ… (jika kelak ada komisi â†’ ju'alah, % disepakati di muka) |
| Poin loyalty | Tawadhi'/hibah (gratis, jadi potongan, tak bisa ditarik tunai) | âœ… |
| Cashback | Ta'diyah/pengecualian utang (store-credit, tebus = potongan, tak tunai) | âœ… label "Saldo Reward" terpasang (f1, commit f4479b3) |
| Tier | Status kumulatif (badge, ambang jelas) | âœ… |
| Diskon member/grosir/ultah | Hibah (ultah = tawadhi') | âœ… |
| Retur | Khiyar 'aib/syarat | âœ… DITRIM (f2): retur 100% membatalkan poin & saldo reward transaksi tsb (ledger 'return'/'return_cash', plafon MAX(â€¦âˆ’?,0) anti-negatif) |
| Zakat tijarah | Kewajiban | â“ formula periodik (laba sejak last_zakat_date; modal @ HPP; harga emas manual) â†’ perlu tashih ulama |

### Keputusan terikat (WAJIB, sampai tashih ulama)
1. **JANGAN** implementasi denda keterlambatan sebagai pendapatan store (haram).
   Jika butuh insentif ketepatan waktu â†’ uang ke kas amal/pondok (ta'zir sosial).
2. **JANGAN** tambah undian/lotre/giveaway maysir.
3. **JANGAN** bikin penarikan tunai cashback/poin (tetap store-credit).
4. UI: label "Cashback" â†’ **"Saldo Reward"**, "Poin" tetap. âœ… SELESAI (f1, 24 Sep 2026, commit f4479b3).
5. Fix minor: balikkan poin/reward saat retur penuh âœ… SELESAI (f2, 24 Sep 2026, commit f4479b3).
   Detail: `returns/route.ts` cek "notFull" (semua item sudah diretur penuh), lalu ambil
   SUM delta `point_history` scope sale_id untuk reason 'earn' (poin) & 'cashback' (rupiah)
   â†’ tolak pakai `MAX(pointsâˆ’?,0)` / `MAX(cashback_balanceâˆ’?,0)` + jejak 'return'/'return_cash'.
   `sales/route.ts` tak perlu diubah (sudah menulis 'earn' & 'cashback' per sale_id).
   Bonus: sign error void di `sales/[id]/route.ts` (cashback_balance + bukan âˆ’) ikut dibetulkan.
6. Tashih ulama: (P3) formula zakat -- haul 1 tahun tetap, laba konservatif, harga emas;
   (P4) skema komisi konsinyasi bila store mau margin.

### Status FASE A1 (P&L UI) -- SELESAI & COMMITTED (0564e71, 24 Sep 2026)
- `laporan-admin-client.tsx`: import + tipe (LabaRugi, PlPreset, PlRow, plPresetRange,
  plPeriodLabel) + shell tab "Ringkasan|Laba-Rugi" âœ…. **LabaRugiTab body SELESAI** (blok 24 Sep 2026):
  tab menampilkan: preset 1/7/30/bulan/tahun + rentang custom, statement brutoâ†’bersihâ†’HPPâ†’laba kotorâ†’
  beban (accordion byCategory)â†’laba bersih, blok Memo di luar laba, kotak Catatan V1, tombol Bagikan WA.
- Backend A1 juga sudah ada: `src/app/api/keuangan/` + `src/lib/keuangan.ts`
  (queryKeuangan + KEUANGAN_NOTES), `rekap.ts` (+ buildLabaRugiWa, label 'Saldo Reward').
- tsc --noEmit âœ… & next build âœ… (24 Sep 2026). Kode commit `0564e71` (4 file) --
  approval user (tes manual P2 rollback + tab Laba-Rugi: preset, rentang custom, bagikan WA).
- Lanjut (non-eng, ditanam user 24 Sep 2026): P3 tashih ulama (zakat) -- user siapin dokumen tashih Â· P4 keputusan pengurus (konsinyasi/ju'alah) -- user siapin proposal Â· P5 âœ… (denda tak pernah diimplementasi) Â· â‘¡â‘¢â‘£ tes manual.
- Follow-up (24 Sep 2026, commit 552c8e2): label sisa P1 -- `perks.ts` soft-flag,
  `rekap.ts` baris WA rekap ("Saldo Reward"), SYARIAH-CHECKLIST P1/P2 âœ….
  Label CSV P&L (`api/keuangan/csv/route.ts`) ter-commit di A1 `0564e71`.

## Fix "Kesalahan Jaringan" Neraca + Fitur Riwayat Poin (24â€“25 Sep 2026)

### Fix Kesalahan Jaringan (tab Neraca) -- SELESAI & DUAL-PUSH
- Root cause: exception tak tertangani di /api/neraca (Turso/Vercel transien)
  bocor sebagai halaman HTML 500; `api()` di ui.tsx membaca badan non-JSON tsb
  sebagai "Kesalahan jaringan." (padahal server error).
- Commit `bb5ba7b` (ui.tsx: `api()` membedakan fetch-gagal = jaringan vs
  respons non-JSON/5xx = "Server sedang bermasalah (HTTP X)" + tombol muat
  ulang) + `6d6eae1` (route.ts /api/neraca: try/catch global -> JSON 500
  "Gagal memuat neraca. Silakan coba lagi."; cache sukses terakhir tetap
  backstop TTL 60 dtk) + `84e8ac6` (sw stamp + log sesi). dual-push
  master+main @ `84e8ac6` (Vercel auto-build dari main).
- Lesson penting: menulis .ts via PowerShell (Set-Content/Get-Content)
  merusak encoding file (BOM + mojibake -> error tsc kaskade). Perbaikan
  = `git checkout -- <file>` lalu terapkan ulang via editor Cline (UTF-8
  bersih). JANGAN tulis kode .ts lewat PowerShell.

### Fitur: Riwayat Poin & Reward per member (point_history) -- TERVERIFIKASI LOKAL
- Ledger `point_history` (tertulis POST /api/sales + DELETE /api/sales/[id],
  sejak fitur redemsi 23 Sep) kini punya LAYER TAYANGAN.
- Endpoint baru `GET /api/members/[id]/points?limit=&offset=` (tier 'member':
  admin/manajer; limit default 20 maks 50; tanpa cache; JSON 500 on error --
  pola neraca).
- `src/lib/points.ts` (modul murni, teruji node:sqlite):
  `POINT_REASON_LABEL` (7 reason: earn/redeem/void/refund = poin;
  cashback/cashback_use/refund_cash = rupiah/"Reward") + `pointReasonLabel`
  (fallback UPPER) + `isPointUnit` + `queryPointHistory` (ORDER BY
  created_at DESC, id DESC) + `countPointHistory`.
- `/admin/member`: aksi "Riwayat" (tabel desktop + kartu mobile Batch B) ->
  modal: kartu saldo (poin + Saldo Reward), baris ledger terbaru-dulu
  (label reason + delta berwarna + "Tx #id"), "Muat lebih banyak" (paginasi
  20), empty state, error state + muat ulang, busy guard + guard respons
  basi (ref member-aktif).
- `npm run test:points` (27 cek, ALL_PASS). Regresi: 6 suite 0 gagal; tsc 0;
  `next build` EXIT 0 (route /api/members/[id]/points terdaftar).
- Sisa pending berikutnya: QRIS (butuh PPO eksternal). GROSIR v1
  (per-produk + global + POS) SELESAI 25 Sep (lihat bagian GROSIR
  di atas & TODO item [x]); tinggal QRIS asli.

## âš ï¸ ATURAN BAKU NGUDI SUSILO (24 Sep 2026, WIS DIBACA)

### Konteks
Folder `D:\Ngudi Susilo\` = induk ekosistem **Yayasan Pendidikan Islam Ngudi Susilo**
(pondok + unit usaha, 20+ sub-foldernya: kopontren-app, BMT, Agribisnis, Madin-TPQ,
Panti-Asuhan, Berkah-Tour, kitab, Pegon-AlIttihad, dll). Setiap folder lembaga punya
`CLAUDE.md` kekhususan sendiri; file aturan dasar di ROOT = `CLAUDE.md` + `README.md`.

### Aturan baku (dari `D:\Ngudi Susilo\CLAUDE.md`)
1. **ADAB**: takzim tapi tak kaku; bahasa ikut pertanyaan (Indo santun / Jawa krama alus,
   jangan ngoko); **mengaturkan, bukan mendikte** (beri pilihan + untung-rugi); jaga aib; ringkas.
2. **RAMBU BERKAS**: jangan mengubah berkas tanpa diminta; TUNJUKKAN dulu apa yang akan
   diubah, baru kerjakan setelah setuju; jangan hapus apa pun; jangan susun ulang dari
   nol rancangan lama (baca dulu, kerja di atasnya); file baru â†’ folder lembaga yang sesuai.
3. **RAMBU FIQIH (PALING UTAMA)**: **JANGAN menyimpulkan hukum fiqih sendiri** -- bukan
   wewenang AI. Sebut kitab + bab bila merujuk; bila tak yakin, KATAKAN TIDAK YAKIN.
   Membantu berpikir, bukan menetapkan hukum. Gono-gini = bahan musyawarah, bukan fatwa qath'i.
4. **JANGAN mengarang angka** -- data tak diketahui â†’ bilang tidak tahu, periksa ke sumber.
5. **Data pribadi = amanah** (nama santri, no. HP wali, identitas anggota, mustahik, anak
   asuh) -- jangan ditempelkan ke luar.
6. **Sistem produksi via Mas Eko** (pengguna meminta; AI merumuskan permintaan dengan jelas).
7. **Keputusan koperasi (akad, SHU, harga) ada forumnya** -- Pengurus & RAT; AI hanya
   menghitung & menyiapkan usulan.
8. **Bila ragu, bertanya.** Kekeliran sendiri â†’ koreksi terus terang.

### Prinsip utama (PRINSIP JANGKAR, semua lembaga)
- Usaha = **jalan ngaji** (dunia + akhirat).
- **Halal & thoyyib bagi semua pihak**, bukan cuma lembaga.
- **Meringankan, bukan menekan** -- barokah di atas hitungan.
- Adab pesantren jadi bingkai, termasuk urusan teknologi.
- **Aspek syar'i & muamalah WAJIB tashih ulama.**
- Setiap orang yang terlibat unit muamalah (pengurus, anggota, nasabah) **wajib mengaji/
  memahami muamalahnya lebih dulu** (dhawuh Gus Fi 23 Ags 2026) â†’ aplikasi unit usaha
  perlu komponen edukasi/literasi muamalah, bukan cuma fitur transaksi.

### Konfirmasi
Setiap perintah yang menyalahi aturan baku KUDU dikonfirmasi ulang ke user sebelum
dieksekusi. Cek terakhir (24 Sep 2026): audit syariah + file `SYARIAH-CHECKLIST.md`
sesuai aturan (tashih ulama tetap jalur pemutus; AI tidak menetapkan hukum). âœ…

### Ringkasan
- Folder: `D:\Ngudi Susilo\` (root proyek; repo kita = `D:\Ngudi Susilo\kopontren-app\`)
- File aturan: `CLAUDE.md` (dasar, auto-read), `README.md` (peta induk ekosistem),
  tiap lembaga punya `CLAUDE.md` sendiri. Operasi: `PASANG-DI-LAPTOP-GUS-FI.md`,
  `SUDAH-PINDAH.md`, `DAFTAR-GARAPAN.md`.
- Prinsip: halal-thoyyib Â· meringankan Â· adab pesantren Â· tashih ulama wajib Â· muamalah
  didahului literasi.
- Ekosistem: YPI Ngudi Susilo (induk) â†’ PP Al Ittihad, Sekolah Formal, Madin & TPQ, Panti
  Asuhan | Kopontren, BMT, Berkah Tour, Agribisnis (unit usaha) | PT Sewangi Hati N. (F&B).
  **Aturan baca: pondok SEJAJAR unit usaha, tidak menaungi.**

### Siap
Cline siap konfirmasi ulang kalau ada perintah menyalahi aturan baku. âœ…
## Sesi 25 Sep 2026 -- Batch #4 UX polish + reports/csv WIB (ACC Gus Fi)

- **Konteks**: setelah Batch #1 (pay_split import, `0dbecf4`) + #3 (zakat WIB,
  `54b22e6`) terverifikasi LIVE, Gus Fi ACC #4 = Phase 2 UX + fix
  low-priority `reports/csv` UTC. #2 `stock_opname` dikonfirmasi selesai
  (drop 24 Sep, `c46f4fa`).
- **Hasil**:
  - P3 teks "Menu pengurus â€¦ navigasi atas" (`src/app/page.tsx` L279) â†’
    diupdate: "menu navigasi -- baris atas di desktop, tombol hamburger di
    layar kecil".
  - P3 dropdown filter user `/admin/audit` (sebelumnya hanya user dari 50
    log pertama) â†’ **fix server-side**: `GET /api/audit` kini kembalikan
    `users` dari tabel `users WHERE active=1` (cache 60 dtk `audit:users`);
    `audit-client.tsx` pakai `data.users` + fallback turunan log (kompat
    respons lama).
  - P3 hint `pin/setup` â†’ **TERVERIFIKASI SUDAH ADA** sejak Batch C
    (banner amber "Tak bisa cek sesi -- lanjutkan sajaâ€¦",
    `src/app/login/pin/setup/page.tsx` L147-152). Tak ada kerja.
  - Keyboard-nav tablist (APG, 4 grup) â†’ **TERVERIFIKASI 4/4 terwired**
    (belanja in/out L41, data backup/audit L36, konsinyasi L62, POS
    kategori L227; hook `useTablistNav` di `src/components/ui.tsx`).
  - `reports/csv` timestamp UTC mentah â†’ helper baru `utcToWib()` di
    `lib/format.ts` (pure UTC+7, deterministik, tak tergantung TZ mesin);
    kolom CSV kini `created_at_wib` ('YYYY-MM-DD HH:MM').
- **Commit + push**: `61dadd4` polish(ux) + `74f704d` fix(reports/csv) +
  `349ffa0` docs, dual-push `master` + `main` â†’ Vercel auto-deploy.
- **Verifikasi**: `tsc --noEmit` exit 0; `test:split` 22 + `test:zakat`
  18 + `test:wholesale` PASS; `next build` EXIT 0 (SW-BUILD
  `a228a8be2623`).
- **Catatan gotcha**: `npm`/`npx` PowerShell kena execution policy â†’
  `npm.cmd`/`npx.cmd`; `git push 2>&1` muncul NativeCommandError (kosmetik)
  tapi push sukses; `src/components/ui` itu FILE `ui.tsx`, bukan dir --
  grep dir kosong menipu.
- **Dikonfirmasi LIVE 25 Sep (ACC Gus Fi)**: uji manual 3 item lolos
  (dropdown user audit, kolom `created_at_wib`, teks dashboard mobile).
  Batch #4 resmi ditutup.
## Sesi 25 Sep 2026 -- Batch #5: Kartu Membership + Jam Sibuk (ACC Gus Fi)

- **Konteks**: audit infrastruktur QR (kolom `members.qr_code` ada tapi
  tak terpakai di UI; `PATCH /api/members/[id]` `{regenerate_qr}`
  admin-only sudah ada; `lib/qr.ts` generateQrToken + keunikan token) +
  kesiapan data kartu (tier, cashback_balance, total_spent) & grafik
  (timestamp sales). Gus Fi ACC rencana 2 commit additive -- tanpa
  migration DB, tanpa ubah shape API (hanya +`qr_code` di SELECT).
- **C1 -- Kartu Membership** (`member-qr-badge.tsx` ditulis ulang +
  `member-client.tsx` + `api/members/route.ts`):
  - `GET /api/members` SELECT + `qr_code` (additive). Guard tier `pos`
    (admin/manajer/kasir) -- kasir memang POS yang akan memindai token;
    token tidak ke log/endpoint umum.
  - `MemberQrBadge`: kartu landscape maroon (#7a1c1c) -- pratinjau di
    modal + print window (`@page landscape`, font sistem, selalu
    terang). Badge tier (GOLD amber / SILVER slate), statistik
    Poin/Cashback/Total Belanja, footer baku: "Tunjukkan kartu ini
    saat berbelanja -- poin & cashback (uang kembali) diterapkan
    otomatis." (basa awam + istilah asli, sesuai catatan Gus).
  - Auto-generate: `qr_code` kosong â†’ PATCH `{regenerate_qr}` otomatis
    saat modal dibuka (peran admin; non-admin 403 â†’ hint amber,
    placeholder "QR belum dibuat", tombol Perbarui menampilkan pesan
    403 dari server).
  - Tombol "Perbarui QR" (bukan "Ulangi") â†’ dialog `useConfirm`
    "semua kartu lama â€¦ tidak akan berlaku lagi" SEBELUM PATCH --
    sesuai catatan syariah/data pribadi.
  - Aksi "Kartu" di daftar member (desktop antar `Riwayat|Hapus`,
    kartu mobile h-11); `onQrChanged` sinkron `qr_code` baris daftar.
- **C2 -- Jam Sibuk** (`api/reports/hourly/route.ts` baru +
  `charts.tsx` + `laporan-admin-client.tsx`):
  - `GET /api/reports/hourly?days=1..365` (default 30, clamp; NaN â†’ 30),
    tier guard `laporan` (sama persis dgn /api/reports); respons
    `{days, from, hours[24]}` tiap `{h, c, t}`; bucket jam WIB lewat
    `strftime('%H', created_at, '+7 hours')`.
  - Cache `reports:hourly:<from>` (ref-cache 60 dtk) -- TERBUANG
    otomatis oleh `invalidate('reports:')` di seluruh route tulis
    (VERIFIKASI: sales POST/DELETE, kas, konsinyasi, returns, debts,
    payables, expenses; `invalidate` = startsWith prefix,
    ref-cache.ts L51-55). TTL 60 dtk = backstop multi-instance.
  - `HourBarChart` (charts.tsx): CSS murni, TANPA dependency baru.
    24 bar min-width 480px + scroll horizontal di layar HP (dipilih
    Gus vs agregasi-2-jam -- sederhana & aksesibel); setiap bar
    `role="img"` + `aria-label` + `title` ("17.00â€“18.00 WIB Â· N
    transaksi Â· Rp X"); jam puncak disorot amber + legenda.
  - Kartu "Jam Sibuk" di tab Ringkasan (antar KPI grid & Top produk):
    label periode sinkron preset 1/7/30/365 + callout puncak
    ("Puncak: 17.00â€“18.00 WIB Â· N transaksi Â· Rp X"); silent-fail
    (`console.error` + teks "Gagal memuatâ€¦", tak merusak tab).
- **Verifikasi**: `tsc --noEmit` exit 0; `next build` EXIT 0 (52 rute;
  `/api/reports/hourly` ada di route table; /admin/member 138 kB,
  /admin/laporan 131 kB First Load JS).
- **Sisa uji manual (checklist Gus Fi, nang HP pasca-deploy)**:
  (1) cetak kartu member tanpa tier / silver / gold -- badge & layout;
  (2) member `qr_code` kosong â†’ modal â†’ auto-generate â†’ cetak â†’ token
  discan (endpoint lookup scanner = luar scope batch ini);
  (3) preset 1/7/30/365 di Jam Sibuk sinkron; (4) role kasir â†’
  `PATCH regenerate_qr` 403 (halaman /admin/member sendiri tak
  terjangkau kasir -- tier 'member' = admin+manajer);
  (5) 24 bar di HP â†’ scroll horizontal.
- **Versi HTML P3 & P4 (25 Sep, ACC Gus Fi -- "digawe ceklist html wae")**:
  `P3-TASHIH-ZAKAT.html` + `P4-PROPOSAL-KONSINYASI.html` (standalone,
  tanpa JS/dependency, mobile-friendly, print-ready, maroon
  kopontren `#7a1c1c`). P3 = checklist tashih ulama (3 soal: haul /
  harga emas 24K / modal HPP-vs-pasar + blok keputusan "Diterima /
  dgn catatan / revisi / ditolak" + kolom identitas panel & tanggal +
  lampiran teknis collapsible). P4 = proposal pengurus konsinyasi
  (ringkas skema wakalah bil ujrah + tabel skema + 3 checkbox
  persetujuan pengurus + tanda tangan + lampiran risiko/teknis).
  Isine versi basa-awam dr `.md` asline (P3/P4 md tetep sumber
  teknis; HTML = format kirim sing gampang dicentang nang HP/WA).
  Tag balance terverif (P3 div 12/12 label 16/16; P4 div 8/8
  label 7/7).
- **VERIFIKASI GUS FI (25 Sep, pasca Batch #5) -- DITERIMA (kode):**
  Status ditandai jelas "SELESAI (kode) -- nunggu uji manual HP,
  bukan produksi penuh". Cek keamanan PII yang diminta: LULUS --
  `GET/POST /api/members` guard tier 'pos' = [admin, manajer, kasir]
  (auth.ts L65): gudang/pembelian/pengurus = 403, `qr_code` tak
  bocor ke role yang tak perlu; `PATCH /api/members/[id]`
  (regenerate_qr) `isAdmin()`-only. Ceklist manual diperluas:
  (b) persistence qr_code (tutupâ†’buka modal, QR harus sama),
  (d) 403 kasir di level API (bukan hanya UI), (e) visual-check
  scroll 24 bar (aria-label sudah ada; fallback agregasi 2-jam).
  Lanjut: lapor hasil uji HP â†’ Gus mutusake Batch UX-1 (font,
  kontras, retry, `rp()`) vs nunggu validasi non-eng (P3/P4/NMID/
  monitor grosir); grosir v2 + QRIS asli tetep nunggu trigger.

### UX-7D/7E ACC + audit UX-8 (read-only) -- 27 Sep
- **7D+7E ACC user**: commit `a844b54` (5 file, +113/âˆ’5),
  dual-push master=main. tsc 0; build 54/54 (+1 route = `/api/search`
  UX-7A, expected). **Audit-note 7D (VERIFIED, wajib inget)**:
  pengurus TIDAK akses tier `kas` (guard isManager = admin+manajer)
  MAUPUN `piutang` (allowlist ['admin','manajer','kasir']) â†’ 5 CTA
  pengurus (Laporan/Zakat/Audit/Ringkasan/Dashboard) = Option C,
  SATU-SATUNYA pilihan valid. Jangan asumsikan pengurus bisa
  piutang/kas di fitur baru.
- **.gitignore**: `i[0-9]_*.txt` + `i[0-9]_*.cmd` + `.cline/` sudah
  masuk commit `572cb2e` (ikut 8 file SOP docs/ + dual-push) â†’
  request "i7_* small commit" = SELESAI via pola generik itu.
- **Hasil audit UX-8** (grep/read-only, 27 Sep):
  - **Responsive**: modifier sm:=59 / md:=18 / lg:=14 (POS sudah
    tuned: min-w-0 grid, kartu bayar 2Ã—2, 44px, bottom-nav).
    0 modifier di: command-palette, activity-feed, notification-bell,
    low-stock-client, breadcrumb, pin-pad, dsb. â†’ cek visual 360px
    utk palette + feed (Gus Fi).
  - **A11y**: Batch D sudah ada (aria-expanded Ã—3, tablist Ã—3,
    role=tab Ã—10 + aria-selected, Modal ESC+focus-trap+aria-modal,
    toast role=alert/assertive, `prefers-reduced-motion` @globals L149,
    ring focus-visible di Button ui.tsx). **GAP**: (1) keyboard-nav
    APG tablist (ArrowLeft/Right/onTabKeyDown) = **0** â†’ Batch E
    TIDAK pernah selesai; (2) command-palette (UX-7B) = 0
    onKeyDown (tanpa panah/Enter/Escape); (3) skip-link = 0;
    (4) aria-current = 5 (sidebar OK).
  - **Perf**: N+1 sudah batched (09d5f2d), ref-cache/ttl-cache +
    invalidate('members:/products:/kas:/reports:') saat mutasi,
    API no-store, statis 1th immutable, compress + no-sourcemap.
    POS lazy (pos-lazy dynamic) â†’ jsQR masuk chunk POS, BUKAN main.
    next/image Ã—6, next/font Ã—3. `loading.tsx` HANYA
    admin/dashboard (situs lain = PageSkeleton in-component,
    acceptable).
  - **Visual**: token T.* (hex mentah dilarang, enforced), rp()/
    fmtDateTime/fmtDate/fmtTime/utcToWib/todayWibStr terpusat
    (WIB + id-ID). Empty=74, useConfirm=25, TermTip=33,
    PageSkeleton=58. I-2 DONE: ToastTone 'critical' + 90 dtk +
    action undo (ui.tsx L449-496; dipakai produk-client Ã—2,
    shift-client Ã—1). **Sisa GAP: 3 "Memuatâ€¦" polos di
    laporan-admin-client: laba-rugi L472, jam-sibuk L325,
    neraca L616 (ErrorState sudah punya prop `tech` collapsible
    -- hanya loading-nya yang belum skeleton).**
  - **Golden path (VERIFIED end-to-end)**: banner shift
    pos-client L1074-1130 â†’ handleOpenShift L965 (POST /api/shifts,
    guard 409 kalau sudah ada open) â†’ F4 simpan (POST /api/sales
    tx: stokâˆ’, snapshot cost, points, cashback, margin-guard,
    cache-invalidate, notifikasi) â†’ handleCloseShift L980 (PATCH,
    hanya kasir tsb/manager; windowStats by_method + audit
    shift:close + notifyShiftClosed) â†’ modal rekap L2182.
    /api/returns: restock guarded changes===1, rollback tx.
    **Finding utk Gus**: sales TIDAK di-gate shift terbuka
    (sengaja?) -- transaksi di luar jendela shift tak masuk rekap
    shift; perlu keputusan.
  - **Financial reconciliation (KONSISTEN, tanpa takaran bug)**:
    rumus kas kanonis = /api/kas kasAgg (Î£sales + cash_in âˆ’
    purchases âˆ’ expenses âˆ’ cash_out), dipakai juga /api/neraca
    (komen eksplisit "identik dgn halaman Kas"); rumus HPP
    snapshot SAMA PERSIS /api/reports (komen keuangan.ts L144).
    V1 DOKUMENTASI (KEUANGAN_NOTES/NERACA_NOTES, bkn bug):
    retur COGS belum dibalik; piutang/hutang = kas-only (bukan
    P&L); zakat difilter paid_at; stok dinilai cost_price
    (stokâˆ’/cost 0 diabaikan); modal "setara" â‰  ekuitas formal.
- **Rencana implementasi UX-8 (NUNGGU ACC user)**:
  - **8A** (P1, ~6 baris): 3 "Memuatâ€¦" â†’ PageSkeleton/skeleton baris.
  - **8B** (P2, ~80-120 baris): keyboard-nav APG utk 4 grup tablist
    (roving focus + ArrowLeft/Right/Home/End) + command-palette
    (ArrowUp/Down + Enter + Escape + aria-activedescendant).
  - **8C** (P3, ~30 baris): skip-link "Langsung ke konten" +
    focus-restore pasca Modal close.
  - **8D** (opsional): loading.tsx utk /admin/laporan +
    /pengurus/dashboard; keputusan gating shift utk sales.
  - Est. 3 commit (8A/8B/8C) + dual-push; tiap commit: diff â†’ tsc
    0 â†’ build â†’ push master+main. Cek visual 4 viewport (360/768/
    1024/1440) = Gus Fi, non-blocking.

## W2.7 Modul ZIS LEPAS 2 Okt 2026 (`488d679`, dual-push master+main)
- W2.7 = item ke-7: modul ZIS lengkap. WAVE 2 = 7/7 LENGKAP.
- Commit `488d679` (11 file +1170/-16): (a) skema v22: tabel `zis`
  (Sek.8.2: id, kind, direction, amount, payer, occurred_at,
  posted_entry, created_by, created_at) + `idx_zis_occurred` + flip
  COA 2090/5090/4040 `pending -> open` via UPDATE eksplisit di seed
  (seed INSERT ON CONFLICT DO NOTHING tak menimpa baris v21; fresh
  install = no-op; `6030` tetap `pending` = jembatan zakat P3, W5.1);
  SCHEMA_VERSION 21->22 (lesson v16: backup db sebelum deploy).
- (b) `lib/zis.ts`: mapping OQ-1 -- masuk D1100/C2090; keluar zakat
  D5090/C1100; infak/sedekah D5100/C1100; wakaf = throw (jurnal
  manual 1120/4100/6020 = W3.5, D3); anti-campur #16: builder hanya
  menulis {1100,2090,5090,5100}, 1010/1020 tak pernah; D1: baris
  selalu tercatat, auto-jurnal hanya saat gl_enabled=1; D6: baris
  gl-off tanpa backfill; idempoten per zis.id.
- (c) API `/api/zis`: GET riwayat + `?csv=1` + total per jenis;
  POST = satu tx atomik (INSERT zis + postJournalInTx + audit); tier
  D2 = admin/manajer (pengurus baca via CALK item 7); D5: CTA
  dashboard pengurus.
- (d) UI `/admin/zis`: form masuk/keluar per jenis + kartu total +
  status GL + riwayat + export CSV (pola zakat-client).
- (e) `scripts/test-zis.ts` = suite #19 (47 assert: M1 fresh v22,
  M2 upgrade v21->v22, Z1-Z7). test-gl diperbarui D4 (open 28/
  pending 23 / nd 23).
- Gate lulus: tsc 0; test:all 19 suite green (test-zis 47/47,
  test-gl 102/102, test-laporan 174/174); 0 non-ASCII di line baru;
  public/sw.js + V1 tak tersentuh.
- Utk W3: upgrade CALK/LAK zis-per-jenis dari tabel `zis` (kolom
  `kind`) = item W3 (W2.6 masih aproksimasi akun COA).
- DEPLOY: skema v22 sudah di repo; BACKUP DB WAJIB SEBELUM DEPLOY;
  cold start menjalankan fullInit sekali (stempel v21 -> v22).
- Standing rule: W2 FULL AUDIT (bug + UX + UI, W2.1-W2.7) WAJIB
  SEBELUM mulai Wave 3.

## W2 FULL AUDIT + Standing Rule DeepSeek (2 Okt 2026)
- Audit Wave 2 (2 Okt 2026): 0 must-fix; DeepSeek independent
  audit corrected 3 findings (a11y tablist P1, rekonsiliasi P2,
  race P3; loading.tsx dropped). Ruling Gus Fi: SAFE, lanjut
  Wave 3. Temuan tercatat di TODO.md (commit `d0db0a2`).
- Standing rule (2 Okt 2026): Starting Wave 3, every Cline
  report is independently audited by DeepSeek (bug + UX + UI)
  before forwarding to Gus Fi. Requirements: honesty, evidence
  (test/diff/scan), explicit assumptions, accept corrections
  without defensiveness, ASK before coding when in doubt.

## W3.1 Skema v23 modul akad (2 Okt 2026)
- Skema v23 (commit `51b6db8`, ACC Gus Fi via DeepSeek, audit 0
  must-fix): WAVE 3 = 1/5. SKEMA SAJA (tanpa lib/UI/API).
- (a) DDL `akad` (Sek.6.1: id, type, counterparty, amount,
  terms_json, status, opened_at, settled_at, note +
  UNIQUE(type,counterparty,opened_at,amount)) + `akad_events`
  (id, akad_id, kind, amount, event_date, posted_entry,
  created_by, created_at) + `idx_akad_opened` +
  `idx_akad_events(akad_id,event_date)`. CREATE IF NOT EXISTS
  idempoten; DB v22 aman, murni additive.
- (b) Flip 9 COA 1070/1080/1090/2040/4050/4060/4070/4080/5060
  pending->open, 2 lapis (coaSeed + UPDATE eksplisit di migrate;
  pola W2.7 lesson bug M2). SCHEMA_VERSION 22->23; BACKUP DB
  WAJIB; cold start fullInit sekali (stempel v22 -> v23).
- (c) `scripts/test-akad.ts` = suite #20: M1 fresh v23 (DDL +
  seed v23 + per-kolom PRAGMA table_info + UNIQUE tolak duplikat
  + 9 flip + kontrol + stamp 23); M2 upgrade v22->v23 (do-
  nothing + flip + CREATE 2x + kontrol + stamp 22->23).
- Gate: tsc 0; test:all 20 suite green; 0 non-ASCII line baru;
  public/sw.js + V1 tak tersentuh.
- Flag W3.2/W3.3: F1 ref_id per event = 'akad#<akad_id>:evt#
  <akad_events.id>' (UNIQUE journal_entries); pesan error jelas
  utk UNIQUE akad; Q3 (ui-ux-2) + CALK item 8 = W3.3.
- terms_json: JSON bebas, 0 preset (Sek.6.5) -- validasi
  akadValidateTerms di W3.2; denda di akad TIDAK dipost (
  Sek.6.4).
- NEXT: W3.2 = lib/akad.ts (akadValidateTerms + mapping jurnal
  per tipe) + test-akad A1-A7 penuh.

## W3.2 lib/akad.ts jurnal + validasi terms (3 Okt 2026)
- W3.2 (commit `e56736f`, ACC Gus Fi via DeepSeek, audit 0
  must-fix): WAVE 3 = 2/5. LIB + TEST SAJA (tanpa UI/API).
- (a) `src/lib/akad.ts` (339 baris baru):
  `akadValidateTerms` (terms_json Sek.6.5: null/'' = {}
  (0 preset); JSON korup -> throw; nisbah integer 0-100
  (desimal ditolak, NOTE 2); margin/rate >= 0; key tak
  dikenal diabaikan) + `akadLines` (mapping Sek.6.4 per
  tipe: murabahah pencairan/angsuran D1010/K2040 (lunas
  saat pencairan -> K4060, OQ-A1 literal) + settlement
  D2040/K4060; mudharabah/musyarakah pencairan D1010/
  K1080|1090, settlement K1010, bagi_hasil = 1 entry 4 sisi
  (D inv + D5060 Pp / K4070|4080 Pc + K1010|K2040 Pp bila
  heldPp; Pc = T - Pp -> D=K persis, NOTE 3); ijarah
  D1010/K4050; wakalah = throw (bridge W3.4); denda = throw
  (F3.3 #6; event tetap tercatat, tak dipost); 1070 tak
  dipakai builder (OQ-A2, utk rekap piutang/laporan)) +
  `akadJournalFor` (ref_id F1 'akad#<akad_id>:evt#
  <akad_events.id>' per event -- pola docs ':evt#<kind>'
  tabrakan utk event berulang, dibuktikan test A6) +
  `recordAkadEventInTx` (pola recordZisInTx W2.7: INSERT
  akad_events -> auto-post hanya gl_on && bukan
  wakalah/denda -> UPDATE posted_entry; idempoten).
- (b) `scripts/test-akad.ts` +350/-13 (583 baris): A1-A7
  (77 cek): A1 murabahah golden (pencairan -> angsuran ->
  settlement + flag lunas + verifikasi DB); A2 mudharabah
  (4 sisi + heldPp + DB 1 entry 4 baris + ref_id F1); A3
  musyarakah mirror (1090/4080); A4 ijarah (pencairan +
  periodik C4050); A5 throw (wakalah x2, denda x4 tipe,
  kind di luar matrix, type tak dikenal; gl-on denda/wakalah
  = event tercatat, posted_entry NULL); A6 F1 (pola docs =
  2 post 1 entry 4 baris vs F1 = 2 event 2 entry; post
  ulang no-op); A7 edge (amount 0/negatif ditolak; 8 kasus
  terms invalid; gl-off tak post; gl-on post; rounding
  T=10.000.001 nisbah 33 -> Pp 3.300.000, Pc 6.700.001,
  D=K persis).
- Gate: tsc 0; test-akad 141 passed 0 failed (M1 34 + M2 30
  + A 77); test:all 20 suite green; 0 non-ASCII; sw.js + V1
  tak tersentuh; rev-list 0 0.
- NEXT: W3.3 = UI /admin/akad + API (CRUD akad + event +
  input terms manual + lunas/angsuran) + Q3 (ui-ux-2) +
  CALK item 8; W3.4 = bridge wakalah via konsinyasi
  (ujrah 4040 + settlement neto 2020/4010).

## W3.3 UI /admin/akad + API + Q3 pengurus read + CALK item 8 (3 Okt 2026)
- W3.3 (commit `b5a4bb9`, ACC Gus Fi via DeepSeek, audit 0
  must-fix): WAVE 3 = 3/5. UI + API + Q3 + CALK item 8.
- (a) 12 file (+1453/-6; 9 ubah + 3 baru):
  - `src/app/api/akad/route.ts` (353): GET/POST/PUT akad.
    GET tier `akad` OR `laporan` (Q3) + `?csv=1`. POST =
    akad-enggal + event + jurnal. PUT = soft status (OQ1).
    409 -> `AKAD_UNIQUE_ERROR`. 400 precheck
    (`akadKindAllowed` cegah 500; fallback `?? []`).
  - `src/app/admin/akad/page.tsx` (36): Guard `canWrite =
    canAccess('akad')`; pengurus read-only via `laporan`.
  - `src/components/admin/akad-client.tsx` (781): Form akad
    + event + sim S6.3 + totals + timeline + CSV. `canWrite`
    nyingidaken form tulis; pengurus = read-only.
  - `src/lib/akad.ts`: +3 eksport: `akadKindAllowed`,
    `AKAD_UNIQUE_ERROR`, `AKAD_STATUS`.
  - `src/lib/features.ts`: +`akad` feature.
  - `src/components/sidebar.tsx`: +prefetch, +`IconAkad`
    (inline SVG), +menu item, +Keuangan group.
  - `src/app/pengurus/dashboard/page.tsx`: +CTA `Akad`
    tier `laporan`.
  - `src/lib/laporan/calk.ts`: +`CakAkadRingkas` +
    `akad_ringkas` + `akadRingkas()` query.
  - `src/components/admin/laporan-formal-client.tsx`:
    Render item 8a `akad_ringkas`.
  - `src/app/api/laporan/formal/route.ts`: CALK_NOTES update.
  - `scripts/test-akad.ts`: +A8 (rollback, UNIQUE,
    precheck/status). A8.1: BEGIN/ROLLBACK manual; forced
    via journal_lines PK conflict; post-rollback
    akad_events=0 + journal_entries(ref_table='akad')=0.
  - `scripts/test-laporan.ts`: +akad DDL, +C5.
- Gate: tsc 0; test-akad 154 passed 0 failed (M1 34 + M2 30
  + A 90); test:all 20 suite green; 0 non-ASCII; sw.js + V1
  tak tersentuh; rev-list 0 0.
- A8.1 rollback proof: atomicity `recordAkadEventInTx`
  dibukti kanthi wrap BEGIN/ROLLBACK manual; failure dipaksa
  via journal_lines PK conflict; sasampun ROLLBACK:
  akad_events count = 0 + journal_entries(ref_table='akad')
  = 0. `logAudit` recordId = null (pola zis; akad ids TEXT,
  sanes numeric; akad_id ing value object).
- NEXT: W3.4 = bridge wakalah via konsinyasi (ujrah C4040 +
  settlement neto C2020/C4010). Extend konsinyasi route
  (existing W2.1 pattern) + extend `src/lib/akad.ts`
  (wakalah handling) + tests A9 (wakalah bridge).

## V1 /api/neraca fix -- off-balance konsinyasi + payables kolom (3 Okt 2026, commit 59d8daf)
- Audit (via DeepSeek, saderengipun commit W3.4): error "Gagal
  memuat neraca" ing tab Neraca V1 (/admin/laporan build lama).
  Akar sasanjang: queryNeraca (A3) isih nglebetaken tabel legacy
  `consignment_items` + kolom `payables.owner_name` ingkang sanes
  wonten ing skema prod (saiki `consignments` + `supplier_name`)
  -> throw -> 500. test-neraca green = false-green (harness
  ngginakaken skema A3-era). Mboten saking W3.4 (4 file) sanes
  saking flip COA W3.1 (queryNeraca sanes nglebetaken COA).
- Ruling Gus Fi: off-balance = Option (a) outstanding payable
  `agree_price * qty_sold - amount_paid WHERE settled_at IS NULL`,
  OFF-BALANCE memo (BUKAN GL 2020; sanes double-count).
- Edit: neraca.ts (query off-balance + hutang_top supplier_name +
  2 note), test-neraca.ts (harness -> skema prod + 4 edge case),
  api/neraca/route.ts (catch + console.error), rekonsiliasi.ts
  (note known-issue -> sampun di-fix).
- Gate: tsc 0; test-neraca 37/0; test-rekonsiliasi 55/0;
  test-akad 175 green (coexist); 0 non-ASCII added; sw.js + V1
  page tak tersentuh.
- CATATAN: W3.4 (akad.ts, jurnal.ts, konsinyasi/route.ts,
  test-akad.ts) MASIH UNCOMMITTED -- dipun pelepasaken ing batch
  pundi. Progres Wave 3 tetep 3/5 dumady W3.4 pelepas.



## Negative Stock -- Business Context (4 Okt 2026, ruling Gus Fi)

- Stok NEGATIF = kondisi bisnis nyata (konsinyasi/titipan supplier):
  barang sampai tanpa input stok kasir -> penjualan tetap terproses ->
  stok turun ke nilai negatif. Negatif = INDIKATOR barang titipan
  yang belum di-input, BUKAN bug. Nilai negatif DIPELIHARA saat
  import (jangan di-zero-kan).

- SISTEM SAAT INI TIDAK MEMUNGKINKAN (perlu enhancement, belum code):
  1. CSV import (lib/product-import.ts + api/migrate/products): validasi
     stock >= 0 -> baris stok negatif ditolak (RowError negative-stock).
     Path Excel clamp Math.max(0,...). 9 baris stok negatif
     (kode 49,111,113,136,140,143,148,152,234) tak akan masuk.
  2. POS + checkout: pos-client.tsx disable tombol saat stock <= 0;
     api/sales/route.ts hard-block "Stok tidak cukup" (prod.stock < qty)
     + guarded decrement (stock >= ?) -> produk stok 0/negatif tidak
     bisa dijual sampai ada restok (purchases).
  3. products/bulk opname: MAX(0, stock+delta) -> tak bisa set negatif.
     products/route.ts create: Math.max(0, ...).
  Implikasi: transaksi untuk barang konsinyasi akan ditolak sistem.

- Pembayaran supplier BERDASARKAN BARANG TERJUAL: SUDAH DIDUKUNG --
  modul konsinyasi (api/konsinyasi): payable pemilik = qty_sold x
  unitOwner(agree_price, komisi); komisi HANYA dari qty terjual;
  action pay berdasarkan unpaid; close ditahan bila masih ada
  sisa/unpaid. payables = utang supplier MANUAL (nominal tetap),
  debts = piutang pelanggan.

- Import produk upsert by BARCODE (api/migrate/products); name
  sebagai fallback hanya bila barcode kosong. Sequence upload:
  produk-2026-10-03.csv (stok=0, harga sudah di-fix) dulu, lalu
  stok-2026-10-03.csv (nilai akhir, last-wins).

- Harga final Baitina (4 Okt 2026): garam tiers per-POUCH (harga
  katalog sudah benar, tak diubah); madu ecer per-sachet 6.000,
  tiers per-box (pack) 55.000/52.500/51.000 (tak diubah); sabun
  x4 (kode 148,154,155,156) per-PACK 50.000/45.000/42.500/41.000
  (FIX x10 + UOM pcs->pack, cost 40.000/pack s.ruling Q2 4 Okt (HPP 10pcs x 4.000)); nasi jagung ecer
  10.000/pcs (katalog sudah benar, confirm-only).

- Q1 opsi (a) 4 Okt: 9 kode negatif (49,111,113,136,140,143,148,152,234) di-zero nang CSV upload stok-2026-10-03.csv (242 baris, 100% ASCII, 0 negative -- upload-ready); nilai riil -1/-16/-10/-12/-5/-17/-4/-10/-2 di-backup stok-2026-10-03.source-negatives.csv (audit trail); manual adjustment (stok opname) SABANJUNE. Harga kunci produk: sabun pack 50.000/45.000/42.500/41.000 cost 40.000 (Q2), nasi jagung 10.000/pcs cost 9.000 (149). Urutan upload: produk DULU, stok KEMUDIAN (upsert by barcode, last-wins).

## W5.2 NEG-1 Eksekusi (8 Okt 2026, GO Gus Fi via DeepSeek: 3 commits)

- C1 skema: `products.is_consignment` (INTEGER NOT NULL DEFAULT 0),
  SCHEMA_VERSION 24 -> 25, `migrate29()` async `execColumn` idempoten
  (patron `migrate28`), di-rantai `fullInit`. INV-1 test-invariants
  di-RE-SCOPE single-line: `WHERE stock < 0 AND COALESCE(is_consignment,0)=0`
  (dulu `WHERE stock < 0` mutlak).
- C2 fitur (flag-gated; titipan = is_consignment=1):
  - products POST: field `is_consignment`; stok negatif sah hanya
    bila flag=1 (non-titipan tetap floor 0).
  - products/[id] PUT: quick stock adjust negatif hanya utk baris
    titipan; toggle flag via `PUT {is_consignment}`; form full update
    persist flag (tanpa clobber klien lama).
  - bulk: aksi baru `consignment` (Jadikan/Bukan Titipan, tier
    'products'); opname massal (stock) TETAP floor 0 (JC-1/OQ7).
  - sales POST: guard `prod.stock < qty` dilewati utk titipan +
    decrement tanpa guard (`decFreeStmt`); produk biasa tetap
    diblokir oversell.
  - import: kolom CSV opsional ke-8 `is_consignment` (parseImport +
    ExcelMapping.isConsignment + persist api/migrate/products
    UPDATE/INSERT + re-validasi server-side negatif hanya utk baris
    titipan). OQ9: 6030 "TPI-01" = manual via UI admin, bukan CSV.
  - POS: kartu produk + cap qty di-gate flag; chip "Titipan".
  - produk-client: ceklis "Barang titipan (konsinyasi)" di form,
    chip baris desktop/mobile, tombol bulk titipan, setStock gate.
  - GP-08 golden (API-driven, fresh file: DB): create titipan
    (stock 1) -> jual qty 3 -> 200 -> read-back stock=-2,
    is_consignment=1; kontrol oversell produk biasa tetap ditolak.
- C3 docs: SOP-ADMIN (form note + do/don't ops), glossary
  ("Barang Titipan"), TODO (NEG-1.1/1.2/1.3 = [x] + rulings
  OQ7/OQ8/OQ9), MEMORY ini.
- Lesson: migrasi harus bump SCHEMA_VERSION (jiran v16) -- tanpa
  bump, DB existing skip fullInit dan kolom tak pernah dibuat.
- Turso snapshot manual SEBELUM deploy v25 (lesson v16).

## W5.3a Eksekusi (8 Okt 2026, GO Gus Fi via DeepSeek: C1 kode + C2 docs)

- **C1 `1961a4f` (5 file, +209/-34, dual-push master+main):**
  - **B1** `laporan-formal-client.tsx`: hook `useAsOfPeriod()` --
    state URL `?periode=` (lazy init: valid `YYYY-MM-DD` dipakai,
    selain itu fallback `todayWibStr()`); ganti tanggal = state
    lokal + `router.replace('/admin/laporan?periode=...')` (tanpa
    reload; halaman force-dynamic -> `useSearchParams` aman tanpa
    Suspense boundary). 5 panel formal (posisi/lka/lpe/lak/calk)
    `useState(todayWibStr)` -> `useAsOfPeriod()` (drop-in); kunci
    API tetap `?as_of=`; input date panel tak berubah. V1 (lazy)
    + page.tsx TIDAK disentuh.
  - **B2** `zis-client.tsx`: inflight guard modul-level
    (`createInFlightGuard()` dari `src/lib/inflight.ts` BARU) --
    `tryStart()` di awal `submit()`, `release()` di `finally`;
    klik ganda selagi POST in-flight dibuang. 12 guard pre-existing
    + form logic byte-identik (hanya re-indent dalam try).
  - `scripts/test-inflight.ts` BARU (suite ke-25 `test:all`;
    test:inflight standalone di package.json).
- **Gate bersih**: tsc exit 0; test:all 25/25 chain exit 0; gate
  (check-route-exports + next build) exit 0; 0 non-ASCII 5 file;
  `public/sw.js` + `coop.ts` + file V1 tak tersentuh; HEAD pre =
  `ca8d9b3`; rev-list master...main = 0 0 pasca-push.
- **Rulings/decision point (GO audit)**: (1) inflight guard =
  PRIMITIF TIDAK BER-TIMER; jendela proteksi = selagi POST in
  flight (setelah `finally` release, pemanggilan berurutan DILIHAT
  = perilaku benar -- di-cover test); (2) guard module-level
  singleton = aman (ZisClient single-mount); (3) Suspense
  fallback TIDAK diperlukan (build tanpa fallback OK);
  (4) `todayWibStr` di-CALL (function, bukan reference) +
  narrowing `p !== null` utk strict-TS.
- **Note proses**: terminal flaky (shell-integration tak bisa
  capture) -> seluruh langkah via `.bat` detached (VBS, path
  ter-quote karena spasi) + marker file + verifikasi via
  READ-FILE.
- **NEXT: W5.3b** (OQ13: flip COA `6030` pending -> open + OQ14:
  rekon #16 `GL_CASH`), lalu W5.4 (OFF-1 P2/P3). W5.1 PINJ-1
  tetap tashih-gated.

## W5.3b Eksekusi (10 Okt 2026)

- **OQ13 (skema v25 -> v26, `src/db.ts`):** flip COA `6030`
  "Zakat Tijarah Dibayar" `pending/1` -> `open/0` -- jembatan
  zakat P3 resmi dipakai alur P5. Upgrade path = `UPDATE`
  eksplisit (migrate26) setelah seed `ON CONFLICT DO NOTHING`
  (tak menimpa baris v25; fresh install = no-op). 7 akun
  pending lainnya tak berubah. SCHEMA_VERSION 25 -> 26
  (purely additive; DB stempel lama menjalankan ulang fullInit;
  backup Turso WAJIB sebelum deploy).
- **OQ14 (rekon #16 `GL_CASH`, `src/lib/rekonsiliasi.ts`):**
  cek ke-16 di-insert di antara `JOURNAL_BAL` (#15) & `GL_TZ`
  (renumber #17; gap penomoran lama "milik W5.2" tertutup).
  Gated `settings.gl_enabled`: '0' (default) = status `ok` +
  skip note; saat on: (a) neto kas GL (SUM debit-credit
  journal_lines akun 1010/1020/1100, tanpa saldo awal) harus =
  neto `cash_entries` (income - expense); (b) segregasi 1100:
  satu entry jurnal TIDAK BOLEH mem-post 1100 (Kas ZIS)
  berpasangan dgn 1010/1020 (kas usaha) -- anti-campur
  (mitigasi R9, flag-only). Detail drift = selisih numerik +
  top-20 entry mencampur; format id-ID (selaras konvensi file).
- **Test counts (mirror seed, 4 suite):** test-zis M1
  open 29/pending 22/nd 22 + assert 6030 flip; test-gl
  open 29/pending 22/nd 22 + 6030 = open; test-akad
  open 38/pending 13/nd 13 + ctrl 6030 open/0 (M1 & M2);
  test-coop M1 open 44/pending 7/nd 7 + M2 baseline 38/13 +
  pasca FLIP6 44/7/7.
- **test-rekonsiliasi:** 16 -> 17 cek; `settings` table
  (key/value) ditambahkan ke SCHEMA; Fase 1 + Fase 2 assert
  GL_CASH ok + skip note (db utama gl-off; korup = 16 cek
  drift, bukan 17); Fase 5 BARU: 4 fixture gl on/off
  (selaras 110.000=110.000 / kas mismatch selisih -10.000
  baris agregat expected/recorded 110000/120000 / segregasi
  1100 -> baris entry je-g3 / gl-off tetap ok + skip note).
  BUG yang ketemu: `CASE WHEN ... THEN x, 0` tanpa `END`
  (syntax error `near ","` di node:sqlite) -- fix `ELSE 0 END`.
- **Client/docs:** `rekonsiliasi-client.tsx` COLS `GL_CASH`
  (id/ref_table/ref_id/expected/recorded/selisih --expected/
  recorded/selisih sudah masuk MONEY) + label "17 kartu cek";
  `DATA-INVARIANTS.md` baris GL-3 + paragraf defer-W5.2
  diganti "delivered W5.3b".
- **Gate bersih:** tsc exit 0; test:all 25/25 chain
  ALL_EXIT=0 (0 HAS_FAILURE); gate (check-route-exports +
  next build) GATE_EXIT=0; perubahan baris = ASCII (test
  file pre-existing non-ASCII tak disentuh gaya baris baru
  kecuali pemisah "â”€" fase yang mengikuti gaya file itu).
- **Note proses:** terminal echo flaky + kill-on-foreground
  -> test:all & gate dijalankan detached via
  `_w53b_runall.vbs` (wscript, window 0) + marker
  `_w53b_all.done` / `_w53b_gate.done` + verifikasi READ-FILE.
- **NEXT: W5.4** (OFF-1 P2/P3). W5.1 PINJ-1 tetap tashih-gated.

## W5.4 Eksekusi (8 Okt 2026)

- **OFF-1 P2 (offline UX lanjutan) -- 4 file (+119/-22)**:
  - `src/components/shell.tsx` (+30): indikator offline global --
    strip tipis di header (`role=status`, copy OQ19 "OFFLINE --
    koneksi terputus. Data mungkin tidak dapat dimuat."), listener
    online/offline + `navigator.onLine` saat mount; disembunyikan
    di /kasir (banner offline POS lebih informatif: stale-data +
    antrean + tombol Sinkronisasi). Pola deteksi identik dgn
    pos-client.tsx.
  - `src/components/pos-client.tsx` (+10/-3): ekstrak
    settings-fetch `useEffect` jadi `loadSettings` (useCallback;
    isi sama: live ok -> setMemberSettings + savePosCache; gagal
    -> hydrasi cache + cacheInfo) + dipanggil di handler `onOn`
    (gap F3: bila admin mengubah pengaturan member saat offline,
    preview POS tak lagi basi). Aman paralel dgn flushQueue
    (GET read-only vs POST /api/sales).
  - `src/components/admin/member-client.tsx` (+88/-22):
    silent-failure fix -- state `loadErr`: load awal gagal
    (non-append) -> pesan galat eksplisit + tombol "Coba lagi"
    (blok desktop tabel + blok mobile; dulu "Belum ada member
    terdaftar." menyesatkan saat fetch gagal); "Muat lebih
    banyak" (append) tetap silent sesuai pola lama; auto-reload
    saat 'online' (loadRef + qDebRef, termasuk query pencarian
    aktif).
  - `src/components/laporan-client.tsx` (+13): auto-reload saat
    'online' -- refresh periode + filter status aktif (pola
    loadRef, sama dgn POS).
- **OQ18**: konten tutorial TIDAK di-ubah (tanpa edit /tutorial;
  gate = cek no-change saja). `laporan-formal-client` = defer
  Wave 6.
- **Gate**: `tsc --noEmit` exit 0; manual checklist (a-d)
  tertunda -- browser test oleh Gus Fi sebelum deploy (bukan
  blocker commit); `public/sw.js`, V1 `laporan-admin-client.tsx`,
  `src/lib/coop.ts`, API, DB, tests = tak tersentuh
  (`git status` = 4 file saja).
- **Commit**: C1 `5740004` (shell banner, +30) + C2 `888eb3f`
  (reconnect + silent-fix, 3 file +89/-22) + C3 (entry ini);
  dual-push master+main setelah tiap commit.
- **NEXT: Wave 5 close audit** + W5.1 PINJ-1 (tetap tashih-gated)
  + Wave 6 (migrasi + SOP).

## UI/UX Phase 2a Eksekusi (12 Okt 2026)

- **PHASE 2a (audit DeepSeek PASSED, GO Gus Fi) -- 4 file
  (+139/-140):**
  1. P1 #1 Flat hero (admin + pengurus dashboard):
     `.card-hero` flat `var(--accent)`; hapus shadow-lg,
     blur blob, shadow-sm tombol -- lebih cepat + rapi.
  2. P1 #2 KPI token colors (UX-4): success-600/400
     (Penjualan), attention-600/400 (Belum Direkap),
     info-600/400 (Arus Kas), accent-600/300 (Member Aktif),
     risk-600/400 (Piutang + Hutang).
  3. P1 #3 shared KpiCard: `src/components/kpi-card.tsx`
     (server component; `KpiCardDef` single source + `KpiGrid`
     default `lg:grid-cols-3`) menggantikan markup KPI
     duplikat di 2 dashboard (DRY).
  4. P1 #4 member menu icons: `IconCard` (geometri Lucide
     credit-card, inline SVG di `sidebar.tsx` -- pola rumah:
     tanpa library ikon di sidebar); menu member:
     Ringkasan=IconGauge, Kartu Saya=IconCard,
     Tutorial=IconCap, Glosarium=IconGlosarium.
- **Gate**: tsc --noEmit exit 0; test:all 29/29 ALL_PASS;
  non-ASCII 0 baru; scope 3 M + 1 new; file proteksi
  (`public/sw.js`, V1 `laporan-admin-client.tsx`,
  `src/lib/coop.ts`) tak tersentuh.
- **Commit**: C1 `0191a5e` ("ui(2a): flat hero + KPI token
  colors + shared KpiCard + member menu icons"); dual-push
  master+main; rev-list 0/0 (kedua ref =
  `0191a5e2930938a71951a135d64ea3b172e9e1e3`).
- **Filosofi desain (panduan batch 2b/2c)**: apik, keren,
  canggih, modern, komunikatif, gampang -- teknis:
  token-first, komponen bersama (DRY), flat & cepat, ikon
  inline SVG, aksesibilitas tetap dijaga.
- **BUG UX (laporan Gus Fi 12 Okt): tema gelap/terang berubah
  saat klik asal** -- audit read-only SELESAI: kandidat
  mekanisme = (a) item "Ganti tema (light/dark)" di command
  palette (baris tinggi di list + input auto-focus saat open;
  tap/Enter = jalan), (b) tanpa cookie `theme` => full reload
  ikut `prefers-color-scheme` OS (PWA HP), (c) H1 ditolak
  (`Button` ui.tsx default `type="button"`), H4 ditolak
  (listener bersih), H5 ditolak (tak ada hotkey tema;
  useHotkeys hanya ctrl+k/escape/?). **TUNGGU RULING skema
  fix + scope.**
- **NEXT**: 2b-0 (theme fix C1 GO) -> 2b-1 (nominal) -> Phase
  2b + W5.1 PINJ-1 (tetap tunggu GO terpisah).

## 2b-0 Eksekusi (12 Okt 2026) -- theme bug fix + default LIGHT

- **RULING Gus Fi (via DeepSeek, 12 Okt): DEFAULT TEMA = LIGHT**
  (bukan preferensi OS; tanpa auto-dark / deteksi HP). M2
  (audit): **DIPERBAIKI** -- skrip boot `layout.tsx`: cookie
  `theme` ada -> ikut cookie (pilihan manual menang); cookie
  tak ada -> 'light' + tulis cookie SEKALI (atribut sama dgn
  penulis shell.tsx: max-age=31536000; samesite=lax) sehingga
  load berikutnya stabil; catch -> light; fallback
  `matchMedia` (ditambahkan P2 26 Sep -- konsisten dgn onset
  bug) **DIHAPUS (call terakhir di kodebase)**. Edge:
  private browsing (tulis cookie gagal sunyi) -> default
  light tiap load, sesuai ruling.
- **M1/P3: command palette idle = nav-only** -- baris Aksi
  ("Ganti tema", "notifikasi", "backup") hanya tampil saat
  q >= 2; idle Enter/tap/backdrop tak lagi bisa menyentuh
  "Ganti tema" (mekanisme theme-acak); tetap discoverable
  via query.
- **a11y P3**: item button command-palette kini
  `type="button"` (button mentah terakhir tanpa type eksplisit).
- **C1 `cc2be46`** "fix(ui): theme default light + palette
  action exclude + a11y" (layout.tsx +10/-4;
  command-palette.tsx +8/-0). Gates: tsc 0; test:all 29/29
  ALL_PASS; tutorial unchanged; non-ASCII 0; scope 2 file.
  Catatan: 1 defect self-caught (brace M1) tertangkap gate
  tsc, diperbaiki, re-gated.
- **C2 (commit ini)**: rekam jejak MEMORY + TODO.
- **2b-1 RULING (hari yg sama)**: BUG "nominal 0 nyangkut"
  (Gus Fi: ngetik nominal ada 0 yg tak bisa dihapus) =
  H1+H4/H6 terkonfirmasi: state numerik `useState(0)` +
  `Number()` di onChange -> field kosong = 0 -> "0" nyangkut.
  35 input `type="number"` di 12 file; fix class =
  display-shim (`value={x === 0 ? '' : x}` + parse
  `Number(x) || 0` saat submit), P1 kasir. Page terkonfirmasi:
  pos-client.tsx L1564-1567 (setPrice `|| 0`). Batch 2b-1
  setelah commit 2b-0.
- **2b-1 EKSEKUSI (12 Okt, `75d6c06` + commit docs ini)**:
  display-shim **18 baris / 9 file** (deviasi +1 vs plan:
  `produk-client.tsx` L850 `t.discount_percent`, TierDraft
  numerik default 0 -- PATTERN SAMA, disetujui):
  `pos-client` (l.price), `piutang-client` (form.amount +
  payAmt), `admin/hutang-client` (form.amount + payAmt),
  `admin/kas-client` (form.amount), `admin/belanja-client`
  (p.qty + p.unit_cost + e.amount), `admin/konsinyasi-client`
  (acts[].pay + f.qty + f.agree_price), `admin/produk-client`
  (t.min_qty + t.discount_percent), `admin/zakat-client`
  (String(s.gold_price/nishab_gram/zakat_rate) -> '' saat 0),
  `retur-client` (qty). Aturan: `value={x === 0 ? '' : x}` --
  input 0 kini tampil KOSONG (bukan "0" nyangkut); onChange +
  submit TIDAK DIUBAH (parse `Number()` / `|| 0` tetap) ->
  payload API identik. Verify 2 EXCLUDED: konsinyasi L489
  (`f.commission_rate` = string-state) + product-label L140
  (`<select>` jumlah label, bukan input). Gates: tsc 0;
  test:all ALL_PASS; non-ASCII 0; file proteksi 0; scope
  9 file (18 ins / 18 del).
- **MULTI-SATUAN V1 LEPAS** (16 Okt, C1 `9406cdb`):
  Opsi A (JSON pack_units) disetujui Gus Fi. Schema v30 additive:
  products.pack_units TEXT (JSON array [{unit,qty_per_base,price}]),
  sale_items.unit_name + qty_per_base. 10 file +470/-47.
  Tashih T1-T5 applied: T1 HPP=cost*qpb*qty; T2 margin pack-aware;
  T3 zakat/neraca ZERO change; T4 decrement=qty*qpb; T5 restock
  =qty*qpb. Form produk (add/remove pack + HPP live) + POS
  (dropdown satuan + HPP display + stock cap). Test multisatuan
  17/17. Backward compat 100% (qpb=1). V1 integer-only; V2
  (fractional, multi-pack) deferred. Gates: tsc 0, non-ASCII 0,
  frozen files untouched.
- **BARCODE ID LEPAS** (W8 Item 2, 20 Okt, C1 `9e04f67`):
  Ruling R1-R5 Gus Fi (ACC via DeepSeek audit 20 Okt). Format
  deterministik KP-{id:05d} dari products.id; helper murni
  src/lib/barcode.ts (kpBarcode + isKpBarcode, zero-import,
  hermetic). (R1b) Auto-ID: POST /api/products utk produk baru
  tanpa barcode mengisi KP-{id:05d} + respons menyertakan
  barcode. (R1a/R3) POST /api/products/barcode: per-baris
  {id} (409 bila bentrok kode manual) + massal {allEmpty:true}
  (UPDATE CASE WHEN tunggal, baris bentrok di-skip + dilaporkan
  dlm toast skipped). (R4) Cek bentrok query-based, TANPA UNIQUE
  constraint -- upsert-by-barcode import CSV tetap kompatibel.
  (R5) Additive tanpa migrasi, kolom products.barcode existing.
  UI /admin/produk: Generate per-baris (hanya saat kosong,
  desktop + kartu mobile, guard double-klik) + tombol massal
  "Isi N Barcode"/"Barcode Lengkap" dgn confirm modal. 6 file
  +320/-5; suite test-barcode #38 (22 asersi). Gate: tsc 0;
  test:all 38/38; check-route-exports OK; 0 non-ASCII; frozen
  utuh; tanpa perubahan skema; fiqih: none.
- **PENDING CART LEPAS** (W8 Item 3, 20 Okt, C1 `6a05bc7`;
  ACC Gus Fi "mangga sampeyan" via DeepSeek): keranjang
  checkout-belum-jadi dipersist localStorage -- key
  `kopontren_pos_pending_cart_v1` (key BAHASA SENDIRI, terpisah
  dari `POS_QUEUE_KEY` beku W5.1 -- antrean transaksi SUDAH jadi
  tak tersentuh). `src/lib/pending-cart.ts` (231 baris, pure
  hermetis: PENDING_CART_KEY + type PendingCart +
  serializePendingCart + readPendingCart validasi per-baris +
  clampPendingCart -- drop produk basi, qty clamp pola setQty
  (floor ((stok+EPS)/qpb); titipan tak capped), harga manual
  tetap, katalog kosong = snapshot, verifikasi stok final tetap
  server + pendingCartAgeLabel satu bahasa keluarga confidence).
  `pos-client.tsx` (+184): auto-save debounce 300ms (ada
  baris/pelanggan/catatan = tulis; dikosongkan = hapus;
  hadPendingRef: tab kosong tak hapus key milik tab lain);
  clear di 2 reset jalur checkout (checkout sukses +
  resetOrder Ctrl+R); multi-tab via event `storage` (chip +
  modal di tab lain ikut); chip violet "N item menunggu"
  (hanya bila keranjang kosong) -> modal "Keranjang Menunggu"
  (Lanjutkan / Hapus; label umur; daftar baris + total;
  penjelasan anti-duplikat; tutup modal tak mengunci transaksi
  baru). mix/received/disc TIDAK dipersist (atribut momen
  bayar; nominal diulang). 4 file +598/-2;
  `scripts/test-pending-cart.ts` suite #39 (45 asersi:
  key/pemisah-key + round-trip + sanitasi + validasi + clamp +
  age). Gate: tsc 0; test:all 39/39; check-route-exports OK;
  check-theme-gate OK; next build OK (stamp SW-BUILD
  `inject-sw-version` -- reverted, sw.js untouched); 0
  non-ASCII; frozen (public/sw.js, V1 laporan-admin-client.tsx,
  src/lib/coop.ts) utuh; tanpa perubahan skema; fiqih: none.
- **CUSTOMER DISPLAY LEPAS** (W8 Item 4, 20 Okt, C1 `0d3e271`;
  ACC Gus Fi via DeepSeek audit LULUS, ruling Opasi B -- kiosk
  PUBLIK, polling 3 dtk + display 15 dtk, TANPA skema
  `display_sessions`, tanpa fiqih): layar /display (HP lama /
  monitor kedua) TANPA login (middleware exception /display,
  pola /login). GET /api/display/latest = endpoint PUBLIK
  PII-FREE: transaksi terakhir (id, total, item_count, label
  metode, jam WIB, QR QRIS dinamis) -- TANPA nama pelanggan/
  member, TANPA rincian baris (proyeksi eksplisit per-field;
  field PII di baris sales tak mungkin lolos). `src/lib/
  display-latest.ts` (murni hermetis, tanpa DB/DOM):
  buildDisplayPayload + displayPayMethods (satu sumber
  PAY_METHOD_LABEL, mixed pay_split diperluas + dedup) +
  displayQrisPayload (QR dinamis tag 54 nominal terikat; hanya
  bila pembayaran mengandung wa/QRIS + NMID & nama merchant
  terisi; lainya = null, layar jujur total saja). Kiosk
  `display-client.tsx`: polling 3 dtk (pola confidence banner --
  TIDAK SSE/WebSocket, keputusan ruling); transaksi BARU (id
  berubah) ditayangkan 15 dtk lalu auto-reset idle; polling
  pertama tak memutar-ulang transaksi lama; DB gagal = idle
  (kiosk tak hang) + log server. 7 file +405/-1
  (5 new: lib/display-latest.ts, api/display/latest/route.ts,
  display/page.tsx force-dynamic, components/display-client.tsx,
  scripts/test-display-latest.ts suite #40, 22 asersi;
  2 modif: middleware.ts +7, package.json test:all 40 suite).
  Gate: tsc 0; test:all 40/40; check-route-exports OK;
  check-theme-gate OK; next build OK; 0 non-ASCII; frozen
  (public/sw.js, V1 laporan-admin-client.tsx, coop.ts) utuh;
  TANPA perubahan skema (v31); TANPA PII di endpoint publik;
  fiqih: none.

 **RAT LEPAS** (W8 Item 5, 20 Okt, C1 `a42e35f`; ACC Gus Fi
  via DeepSeek ruling W8 COMPLETE + C2 Docs; paparan ONLY --
  tanpa fiqih anyar, tanpa skema): modul `src/lib/laporan/rat.ts`
  (hermetis: import type QueryDb + reuse buildPosisi, tanpa
  import db/UI -- bisa diuji Node in-memory SQLite).
  `buildRat(db, tahun)`: jendela `[YYYY-01-01, (YYYY+1)-01-01)`
  (tahun divalidasi -> lempar RAT_YEAR_INVALID); LKA /
  LAK-arus / SHU / ZIS = entri PERIODE, Posisi = KUMULATIF s.d.
  akhir tahun (reuse buildPosisi -- neraca = saldo), LPE pembuka
  = saldo 30xx kumulatif s.d. awal tahun. Formula identik modul
  W2.x (LKA SAK-EP Sek.5.2: neto, HPP netting 5020, beban
  5030+5040+5060+5070+5080, ZIS 5090+5100+6030, pendapatan-lain
  4050-4100 SUMMED, memo 4040/2030/3020 tak dikolek; LPE
  Sek.5.3: mutasi bucket closing (shu) + normal|coop (alokasi),
  distribusi = placeholder 0 pola lpe.ts W2.6; LAK Sek.5.4:
  pembuka = saldo kas akhir tahun lalu + arus periode
  (klasifikasi operasional/pendanaan/investasi, transfer
  antar-kas murni, seksi 1100 anti-campur, identitas footer
  konstruktif); ZIS ringkasan: diterima = sisi kredit
  (4090+4100), disalurkan = sisi debit (5090+5100+6030) --
  konsisten calk item 7; SHU = paparan agregat coop_shu (input
  admin W4.4 OQ1=A, tanpa hitung anyar); D=K kumulatif +
  flag_rekon15 (proxy rekon #15 JOURNAL_BAL, pola B4 audit
  W2.2). Route `?report=rat&tahun=YYYY` (validasi -> 400;
  default = tahun WIB kemaren) dgn RAT_NOTES (audit, 7 baris) +
  cache PER TAHUN `lapformal:rat:YYYY` (bukan as_of). UI
  `RatPanel` (tab RAT di /admin/laporan): pemilih tahun + gate
  D=K (flag_rekon15=true -> angka formal tak otoritatif) +
  tombol Cetak landscape (temporary style + afterprint, pola
  pos-client.tsx). 5 file +1632/-7 (2 new:
  src/lib/laporan/rat.ts 779 baris + scripts/test-rat.ts 287
  baris suite #41, 54 asersi -- R0 payload + R1 LKA emas + R2
  LPE (netting alokasi 30xx total 0, distribusi 0) + R3 batas
  periode + R4 posisi kumulatif + R5 SHU (rasio json, null -> 0)
  + R6 LAK (pembuka = saldo akhir tahun lalu) + R7/R7b D=K
  balanced <-> flag + R8/R8b ZIS + R9 tahun invalid; 3 modif:
  api/laporan/formal/route.ts +41, komponen
  laporan-formal-client.tsx +526/-3, package.json test:rat +
  test:all 41 suite). Gate: tsc 0; test:rat 54/54; test:all
  chain resik (0 gagal non-nol); check-route-exports OK;
  check-theme-gate OK; next build OK; 0 non-ASCII (separator
  box-drawing diganti -); frozen (public/sw.js, V1, coop.ts)
  utuh; TANPA perubahan skema (v31); Vercel a42e35f = READY
  (Production).
- **WAVE 8 COMPLETE (5/5 LEPAS)** -- record C2 Close:
  1. Audit Anomali (Q72) -- C1 `f7613ff`
  2. Barcode ID -- C1 `9e04f67`
  3. Pending Cart -- C1 `6a05bc7`
  4. Customer Display -- C1 `0d3e271`
  5. RAT Laporan Tahunan -- C1 `a42e35f`
  Vercel deploy 5 SHA kabeh READY (Production).
- **STRUK PDF LEPAS (pre-W9, 24 Okt)** -- C1 `822b02e` (dual-push
  master+main verified, 4 file, +418/-40):
  1. src/lib/struk-pdf.ts (NEW 190): generator HTML struk 58mm
     -- @page {size: 58mm auto; margin: 3mm}, monospace
     black-on-white thermal, field order item -> TOTAL -> Bayar
     -> Kembali -> Poin, XSS-escape semua field, pakai
     rp()/rpShort()/payMethodLabel() existing, tanpa
     dependency enggal.
  2. pos-client.tsx: tombol enggal 2 di footer modal receipt
     -- "Struk PDF" (window.open 58mm + document.write, pola
     ProductBarcodeLabel; dialog print: thermal 58mm ATAU
     Save as PDF) + "Share WA (PDF)" (navigator.share file
     HTML kecil tanpa gambar: mobile share sheet -> WhatsApp;
     desktop fallback unduh) + dedupe buildStrukWaArgs()
     (handleSendWaStruk & copyStrukText dulu bangun objek
     identik 2x).
  3. scripts/test-strukpdf.ts (NEW 130): 20 assert (A ASCII
     murni, B @page 58mm auto, C tanpa gambar + <8KB, D
     field order, E XSS, F format Rp/rpShort, G kondisional,
     H split bayar) + test:strukpdf masuk test:all.
  Gate: tsc 0; strukpdf 20/20; test:all ALL_PASS (17 suite);
  gate build 7.0s; 0 non-ASCII; public/sw.js + V1 + coop.ts
  utuh; TANPA perubahan skema; TANPA fiqih.
  NOTE REBASE: local base 1325ee1 keteteran 30 commit remote
  (W8 + DARURAT v31 + V2 fraksional, sampai c867ab7) -> C1
  di-rebase ke c867ab7 (konflik package.json diselesein:
  test:all remote +4 suite + strukpdf; pos-client
  auto-merge; konten commit identik +418/-40).
- **W9 DIVERGENSI SKEMA (24 Okt)**: remote wis nggoleki label
  v31 (V2 multi-satuan fraksional: migrate31 rebuild
  products.stock / sale_items.qty_per_base / purchases.qty ->
  REAL + DARURAT rewrite db.ts batch/SQLITE_BUSY +253).
  Konsekuensi: skema Wadi'ah RENUMBER v31 -> **v32**
  (migrate32: wadi_balances + wadi_ledger, purely additive;
  DB stempel v31 menjalankan fullInit sekali lagi),
  SCHEMA_VERSION = 32. Ujrah badhe **v33** (asli rencana
  v32). Wadi'ah (9 file) wis di-merge manual ke base anyar:
  db.ts (keep migrate31 V2 + add migrate32 wadi; 1 close
  brace fix), comment wadi v31->v32 di wadi.ts / test-wadi /
  api route / features.ts; features + sidebar + TODO
  auto-merge. Status: UNCOMMITTED (menunggu ACC Gus Fi).
  Gate tree merged: tsc 0, test:all 17/17 ALL_PASS,
  test:wadi 13/13, gate build 7.0s.
## STRUK MEDIA PDF/JPEG (GAYA M-BANKING 58mm) LEPAS (24 Okt 2026)
- **Latar**: paska struk PDF print-window (822b02e) + ruling E25 enggal
  (Gus Fi 'struk harus rapi bg putih logo kopontren tengah atas, TOTAL
  tegas, mirip m-banking, + unduh foto'); Cline plan (58mm=219px @96dpi,
  3x render, lib enggal, dynamic import, tanpa skema, V2 struk lampau
  menyusul) -> **ACC 24 Okt** -> **C1 commit 6d57d40 (LEPAS, dual-push,**
  **4 refs verified)** + C2 docs ini. Tanpa skema enggal, tanpa fiqih,
  tanpa backend.
- **Struk media (C1 6d57d40)**:
  - lib enggal `src/lib/struk-media.ts` (~260): `strukMbankingHtml`
    (58mm=219px, **bg putih**/teks #111/Arial/slot logo 64px kothak --
    HTML BEBAS base64), `resolveLogoUri` (public/logo.svg -> data URI,
    fallback logo.png), `generateStrukPdf`/`generateStrukJpeg` -> `File`
    (render 1x 3x canvas + composite logo SESUDAH html2canvas -- decode
    SVG native browser; jsPDF + html2canvas **DYNAMIC import**, chunk POS
    tak terbebani; deviasi enggal dr plan: logo composite di canvas,
    diterima -- lebih aman utk html2canvas).
  - `pos-client.tsx`: 2 tombol enggal di modal receipt: **'Unduh PDF'** +
    **'Unduh Foto'** (icon FileText/Image); shareOrDownload() = mobile
    share sheet (-> WA) / desktop unduh; state mediaBusy (loading).
    Pola LAMA ('Struk PDF' print thermal + 'Share WA (PDF)' + Cetak) TIDAK
    berubah.
  - `scripts/test-struk-media.ts` 29 assert hermetis (masuk test:all
    paling akhir): ASCII murni, 219px/58mm, slot logo tanpa tag img /
    base64, field order (item->TOTAL->Bayar->Diterima->Kembali->Poin),
    escaping XSS, Rp penuh/short, kondisional (Cashback/Split/Poin/
    Kembali), gaya m-banking (I1-I6, J1-J2).
  - `package.json` +deps jspdf ^4.2.1 + html2canvas ^1.4.1 (+lock),
    +script test:strukmedia, test:all +1.
  - **Gate**: tsc --noEmit 0; test:strukmedia 29/29; test:all ALL
    HAS_FAILURE 0; gate (route-exports + theme + next build) Compiled OK
    14.4s; 0 non-ASCII (5 file enggal); frozen tak tersentuh (sw.js,
    laporan-admin-client.tsx, coop.ts).
- **Next (menunggu ACC Gus Fi)**: struk lampau V2 -- section 'Lihat
  Struk Lampau' (filter hari 7/30/all + tabel + 'Kirim Struk' per baris,
  generateStrukPdf + QRCODE_SVG dari lib/qrcode + share) di bawah V1
  /admin/laporan; V1 tak tersentuh. Plan di atas.

- **WADI'AH v32 LEPAS (24 Okt)** -- C1 `9c85b02` (dual-push
  master+main verified, 9 file, +749/-4): tashih dhana +
  terpisah (W9-1a+c opsi A); migrate32 wadi_balances +
  wadi_ledger (additive); lib/wadi.ts (setor/tarik/rekon/
  riwayat); API manager-only + logAudit + tx batch; admin
  page tab Riwayat/Anggota; test hermetis 13 assert;
  test:wadi masuk test:all. Gate: tsc 0, test:all 18/18
  ALL_PASS, gate build OK, 0 non-ASCII (byte-diff), frozen
  utuh. Detail: commit message 9c85b02.
- **NEXT**: struk media (PDF/JPEG m-banking) + struk lampau (V2 /admin/laporan) -- menunggu ACC Gus Fi utk code (diff COMPLETE saderengipun commit).

### Ujrah Tashih Opsi A Final -- E25 FLIP (24 Okt 2026, commit f1ff2be, dual-push master+main)
- **Tashih fiqih Gus Fi (24 Okt 2026)**: dasar hitung ujrah V1 = HARGA PERJANJIAN
  (opsi A -- Syafi'i + DSN-MUI; tanpa gharar). Tanpa schema change (tetap v32).
- **FLIP (C1 f1ff2be)**: badge 'provisional' -> 'final' (5 baris, 2 file):
  zakat-client.tsx (modal/harga pasar proxy + tips Mode Penilaian + label
  select) & konsinyasi-client.tsx (tip Komisi/ujrah kon). Teks enggal all-ASCII.
- **MINIMAL (Q2)**: label 'provisional' di luar scope E25 (Haul/Akumulasi,
  gold 24K, R6, komentar api/zakat + lib/zakat-valuation) TIDAK dipotong --
  menunggu tashih sakderengipun (catatan TODO E25).
- **STRUK MEDIA (plan ACC)**: jspdf + html2canvas (dynamic import); lib enggal
  src/lib/struk-media.ts -- gaya m-banking 58mm (219px @96dpi): bg putih,
  teks hitam, logo Kopontren (SVG data URI, fallback PNG), TOTAL bold, footer
  Jazakumullah; generateStrukPdf/Jpeg -> File; 2 tombol enggal POS receipt
  (PDF + Foto/JPEG) via navigator.share/download. Jalur print thermal lama
  (struk-pdf.ts + test-strukpdf) TIDAK berubah.
- **STRUK LAMPAU (plan ACC)**: komponen V2 enggal
  src/components/admin/struk-lampau-client.tsx (filter 7/30/hari, tabel
  ringkas, tombol 'Kirim Struk' per baris); mount section di /admin/laporan
  (V1 laporan-admin-client.tsx FROZEN); data /api/sales?days=N (items + kasir
  + member) -- tanpa API enggal.
- **Gates C1**: tsc exit 0; test:all 0 gagal (serial); gate exit 0;
  non-ASCII 0 di diff enggal; sw.js/V1/coop.ts utuh; tanpa schema change;
  fiqih aman (ujrah tetap upah, tanpa riba).

## STRUK LAMPAU -- LEPAS (24-10-2026)

Struk Lampau V2 = seksi 'Lihat Struk Lampau' di /admin/laporan
(regenerasi struk m-banking 58mm transaksi lampau). LEPAS:

- commit C1 = b38ab48 (2 file: struk-lampau-client.tsx enggal 306
  baris + laporan/page.tsx +5/-2). Dual-push master + main (4 refs
  verified).
- C2 docs: commit ini (MEMORY.md +section STRUK LAMPAU di bawah;
  TODO.md L174 entry struk media + baris STRUK LAMPAU LEPAS).

Detail implementasi:

- Data = GET /api/sales?days=7|30&limit=50&offset (read-only;
  kasir/member/items ter-embed server-side -- tanpa fetch per baris).
  Filter 7/30/Semua + tabel (No, Tgl, Pelanggan, Metode, Total, Poin)
  + 'Muat Lebih' (limit 50/API cap).
- Per baris: 'Kirim Struk' (PDF) + 'Foto' (JPEG) via lib/struk-media
  (generateStrukPdf/generateStrukJpeg; jsPDF + html2canvas dynamic
  import -- chunk laporan tak terbebani sampai tombol ditekan).
  Mobile = navigator.share (-> WhatsApp), desktop = unduh.
- buildOpts() = map SaleRow -> StrukPdfOpts hanya field tersimpan di
  sales/sale_items (tier & saldo member tak tersimpan per transaksi
  -> dilewati; struk lampau = rekonstruksi, bukan replika persis).
- Deviasi tercatat (ACC ruling 24 Okt): (1) tanpa QRIS qrcode --
  /api/sales tak menyimpan kode QRIS (cuma nama metode);
  (2) Diterima/Kembali tampil utk metode cash saja.
- V1 (laporan-admin-client.tsx / LaporanFormalClient) TAK disentuh;
  mount = laporan/page.tsx (+5/-2).
- Gates: tsc --noEmit 0; test 43 suites ALL_PASS;
  check-route-exports + check-theme-gate OK; next build Compiled
  OK (.next/server 86 page stubs); 0 non-ASCII di file enggal;
  frozen intact (sw.js, V1, coop.ts); tanpa schema change.

## STRUK THERMAL + SPLASH PWA + HYGIENE W10 -- LEPAS (24-10-2026)
C1 a3ffb23 (W10-4 hygiene) + C1 db69724 (W10-3 struk thermal +
logo + splash); dual-push master+main verified; C2 docs:
commit ini.

### W10-4 hygiene (C1 a3ffb23)
- `test:wakaf` legacy (CLEANUP W5/W6): audit read-only 24 Okt
  = entry SUDAH TAK ADA di package.json (grep 0 match; test:all
  42 suite tak memuatnya; git history package.json tak pernah
  memuat string tsb) -> cleanup terbukti no-op; TODO ditutup.
- Doc comment stale `ui.tsx` L1045-1102 (blok header FASE D +
  Th/Td) di-refresh -- awiwe mbiyaka CSS legacy `.th`/`.td`
  sing wis dihapus. Doc-only, 0 risiko.

### W10-3 struk thermal + logo + splash (C1 db69724)
- **Font**: Arial -> `'Courier New',Consolas,monospace`
  (struk-media.ts + test-struk-media.ts) -- thermal printer
  asli monospace (E31 "bukan CSS dump").
- **Logo**: Kopontren PNG -> data-URI (48x48) embed `<img>`
  direct ing HTML (bot composite post-canvas) -> html2canvas
  deterministic.
- **Splash PWA**: `public/manifest.json` `background_color`
  #170A0E -> #FFFFFF (splash PWA ngunakakake bg saka manifest,
  bot saka `#theme-bg`; awiwe logo bot wonten ketoke ing dark
  bg).
- Gates: tsc --noEmit 0; test:all 42 suites ALL_PASS
  (test:strukmedia 29/29); gate build OK; 0 non-ASCII new
  files; frozen intact (sw.js, V1, coop.ts); tanpa schema
  change (v32).
- Residual E31: watermark = ditunda batch enggal.

### Next (menunggu ACC Gus Fi)
1. W10-2 SW.js refactor template-generate (TODO L293):
   root-cause fix in-place stamp -> template ter-track
   (`public/sw.src.js`) + `public/sw.js` generated +
   gitignored.
2. W10-1 Ujrah v33: audit read-only + tashih ruling
   (fiqih: tashih = 2/3 - 1/3).

## W10-2 SW REFACTOR TEMPLATE-GENERATE -- LEPAS (24-10-2026)
C1 c8b204a; dual-push master+main verified; C2 docs ing
commit iki.

### W10-2 (C1 c8b204a)
- `public/sw.js` -> **`public/sw.src.js`** (git rename,
  similarity 88%): TEMPLATE ter-track + marker `__STAMP__`
  (sanes stamp konkrit); logika SW BOT GESER; 8 baris
  komentar di-ASCII-sanitize (em-dash/arrow/box-drawing =
  non-ASCII pre-existing sw.js lawas; file enggal = 0
  non-ASCII).
- `public/sw.js` saiki = GENERATED + `.gitignore` (comment
  guardrail). `scripts/inject-sw-version.mjs` rewrite: read
  template -> replace `__STAMP__` -> write sw.js (generate
  mode, idempotent, error-guard).
- **Temuan asil**: `sw.js` nate dipunlindungi via flag
  `skip-worktree` (`git ls-files -v` = S) = mutasi SW-BUILD
  katutup git; bukti: HEAD = c1da7f8ceb9a nanging working
  tree = a7eb74763c2b. W10-2 ngedalaken: sw.js = generated
  + ignored (guardrail structural, sanes disiplin manual).
- `package.json` +`predev` = `inject-sw-version.mjs
  --stable`: dev stamp DETERMINISTIK (sha1 template) ->
  bebas banner "Versi anyar" palsu setawis dev start;
  build/Vercel = seed panyantunipun (BUILD_ID+Date.now /
  random) -> konten beda setawis deploy; gate (`next build`
  langsung) = bot nggenerate (churn 0).
- `_pt.py` (scratch) DHAPUS.
- Gates: tsc --noEmit 0; test:all 45 scripts (44 PASS + 1
  flake invariants = orphan `next` server nyekel temp DB;
  re-run environment resik = ALL_PASS 40/40); gate build
  7.0s; 0 non-ASCII anyar (.gitignore L33/L55 =
  pre-existing, bot wonten diff).
- **Frozen list SAIKI = `public/sw.src.js`** (sanes sw.js).

### Next (menunggu ACC Gus Fi)
1. W10-1 Ujrah v33: audit read-only + tashih ruling
   (fiqih: tashih = 2/3 - 1/3).

## STRUK MEDIA OPTION A -- LEPAS (24-10-2026)
Ruling Gus Fi (via DeepSeek audit 24 Okt): Option A GO COMMIT;
alamat "Jl. Perintis Kemerdekaan, Jurang, Temanggung" = BENAR;
settings-driven = TUNDA (static dhisik); Diterima/Kembali
TIDAK ditambahkan (Option A murni).

- C3 = e2208eb (2 file: src/lib/struk-media.ts +72/-7 &
  scripts/test-struk-media.ts +27/-1; test 38/38 ALL_PASS).
  Dual-push master + main verified (e2208eb di kedua refs).
- C4 docs: commit ini (MEMORY.md +section ini; TODO.md L174
  entry struk media + baris STRUK MEDIA OPTION A LEPAS).

Detail implementasi (src/lib/struk-media.ts):

- Header: alamat 2 baris (STRUK_ADDR static, .hd .ad).
- Judul "STRUK PEMBELIAN" (.ttl) dhuwur+ngisor garis ganda.
- Tgl + " WIB" (jalur media struk only; legacy struk-pdf.ts
  TIDAK diubah).
- Label "ITEM" (.itmh) ngarep section item.
- Footer "Terima kasih atas kunjungan Anda." + "Barokallahu
  fiikum." (sarep footer Jazakumullah existing).
- Garis ganda LINE_DBL = 30 char "=" ASCII (mengganti usulan
  box-drawing U+2550 -- gate 0 non-ASCII; precedent W10-4
  box-drawing -> '-').

Gates C3: tsc --noEmit 0; test:all 46 suite ALL_PASS
(struk-media 38/38); gate (check-route-exports + check-theme-
gate + next build) LULUS (66 pages); 0 non-ASCII di diff;
frozen intact (sw.src.js, V1, coop.ts); tanpa schema change;
fiqih: none.

Note: 1x hang "collecting page data" ~22 mnt (anomaly
environmental -- DB lokal data/kopontren.db stale 29 Sep, CPU
aktif, DB tak diwrite) -> kill + restart gate lulus wadha.
Residual: monitor VPS (orphan node + flake W10-2 precedent).

## EYE TOGGLE PASSWORD -- LEPAS (25-10-2026)
Ruling Gus Fi (via DeepSeek, 25 Okt): eye toggle GO CODE (P1);
Google/WA login = TUNDA (Wave 12, audit + tashih).

- C1 = db5e99a (1 file: src/app/login/page.tsx +23/-9):
  import Eye/EyeOff (lucide-react), state showPw, input
  type={showPw ? 'text' : 'password'} + pr-10, tombol mata
  absolute right-1.5 (aria-label + title dinamis
  "Tampilkan password" / "Sembunyikan password", inline SVG
  via lucide, token dark navy/slate). Placeholder bullet
  existing ("bullet 8") diganti ASCII "........" (gate 0
  non-ASCII di diff).
- C2 docs: commit ini (MEMORY.md +section ini; TODO.md
  +baris EYE TOGGLE LEPAS).
- Gates C1: tsc --noEmit 0; test:all ALL_PASS (34 scripts;
  runner repo asli `node` Node 24 type-stripping --
  members-phone 26 ok, wadi 13 pass, 0 fail); gate
  (check-route-exports + check-theme-gate + next build)
  LULUS; 0 non-ASCII di diff; frozen intact; tanpa skema;
  fiqih: none.
- Note lingkungan: package.json lokal sempat override `npx
  tsx` (crash esbuild "Top-level await not supported in
  cjs" di Node 24.19) -- REVERT ke committed (`node`
  runner); file tsx TIDAK ikut commit.
- Next (menunggu ACC Gus Fi): Wave 11 B1 (Sapaan + WA help
  + error page), B2 mobile card, B3 palet/glass/ambient,
  B4 empty ramah. Google/WA login = Wave 12.

## W11 B1 SAPAAN ISLAMI + WA HELP + ERROR PAGE -- LEPAS (25-10-2026)
Ruling Gus Fi (via DeepSeek, 25 Okt): B1 GO COMMIT;
B2 GO CODE; B3/B4 sasampunipun B2; Google/WA login TUNDA
(Wave 12).

- C1 = 3719f53 (7 file, +127/-14):
  - src/lib/format.ts (+13): helper anyar wibDayBand()
    (band WIB deterministik: pagi 04-10, siang 10-15,
    sore 15-18, sanes malam; UTC+7 tanpa DST).
  - src/app/page.tsx: hero kasir + hero sanes =
    "Assalamu'alaikum, {nama}" + "Selamat {band} WIB,
    semoga berkah".
  - src/app/admin/dashboard + pengurus/dashboard: h1 hero
    = greeting + subtitle "Dashboard Admin/Global -- Selamat
    {band} WIB, semoga berkah | {date} | {label}".
  - src/app/member/page.tsx: h1 = greeting (member?.name
    fallback) + subtitle kartu member.
  - src/app/login/page.tsx: footer "Butuh bantuan? [ikon
    MessageCircle] Hubungi via WhatsApp" -> helpWa() =
    shareWa (lib/rekap, pola low-stock) + nomor saking
    /api/settings store_phone, fallback share sheet
    (deep-link wa.me, tanpa API credentials).
  - src/app/error.tsx (ANYAR, 59 baris): global error
    boundary (client): "Maaf, terjadi kesalahan" + Muat
    Ulang (reset, tanpa auto-reset agar galat server
    boten loop) + Bantuan WhatsApp (shareWa); visual
    konsisten login (hero-bg + glow).
- C2 docs: commit iki.
- Gates: tsc --noEmit 0; gate (route-exports + theme +
  next build) LULUS; test:all 0 FAIL (1x libuv Windows
  close-flake nalika exit = environmental, precedent
  orphan node flake); 0 non-ASCII di diff; frozen intact;
  tanpa skema; fiqih: none.
- Next (menunggu ACC Gus Fi): B2 mobile card standard
  (7 tabel: audit, persetujuan, hutang, zis, produk,
  shift, member -- pola kas-client "card sm:hidden" +
  "hidden sm:table"), B3 palet/glass/ambient, B4 empty
  ramah.

## W11 B2 MOBILE CARD STANDARD -- LEPAS (25-10-2026)
Ruling Gus Fi (via DeepSeek, 25 Okt): B2 GO COMMIT
(audit DeepSeek: SEDAP, sedaya gate lulus).

- Temuan audit 7 file target: 6 file sampun
  ngginakaken pola standar (desk wrapper "card hidden
  overflow-x-auto sm:block" + kartu mobile "card
  sm:hidden" + baris 3-garis + hit-area 44px):
  audit-client (L222/293), persetujuan-client
  (L317/402), zis-client (3 pasangan), produk-client
  (L633/818), shift-client (L126/191), member-client
  (L330/448).
- C1 = eec03fc (satur file: src/components/admin/
  hutang-client.tsx, +3/-2): hutang boten wonten tabel
  (list card mung, mobile-friendly sagedadi) namung
  struktur mboten standar -> container "space-y-2"
  (kartu-kartu rengganing) dipun ganti container
  "card" mung siji + baris "card p-3" dipun ganti
  "border-b ... last:border-0" (pola kas-client).
  Isian baris sampun 3-garis: supplier+HP/jumlah&
  tempo | StatusBadge, tanggal | Bayar/Hapus, detail.
- C2 docs: commit iki.
- Gates: tsc --noEmit 0; gate (route-exports + theme +
  next build) LULUS; test:all 0 FAIL (18 ALL_PASS,
  tanpa flake); 0 non-ASCII di diff; frozen intact;
  tanpa skema; fiqih: none.
- Next: B3 palet+glass (GO CODE).

## W11 B3 PALET + GLASS PREMIUM -- LEPAS (25-10-2026)
Ruling Gus Fi (via DeepSeek, 25 Okt): B3 GO COMMIT
(audit DeepSeek: SEDAP, sedaya gate lulus). C1 = a9ede47.

- globals.css (+13): token `--shadow-ambient` di :root
  (light = maroon-soft 0 10px 30px -12px rgba(23,10,14,.18))
  + varian dark di html.dark (hitam pekat .55). Utility
  `.card-glass` (layer components, additive: tanpa kelas iki
  tampilan .card ora owah) = bg semi-transparan (white/70
  light, white/5 dark) + backdrop-blur-xl + border
  semi-transparan + box-shadow var(--shadow-ambient).
- kpi-card.tsx (+11/-4): tile KPI dashboard admin + pengurus
  ngegunani "card card-glass" (kesan premium; hover:shadow-md
  tetep nggandhewi shadow utility nalika hover). Emerald KPI
  positif = verifikasi (saka ngginun `text-success-600 /
  dark:text-success-400`, boten owah = tanpa regresi).
- koperasi-client.tsx (+8/-3): tab SHU -- gold badge
  (`Badge tone="gold"` = amber-400, tone wis wonten di
  ui.tsx L20) di 2 header: "Alokasi" (TermTip nglingkupi
  badge+teks) + "Riwayat SHU (n)" -> badge SHU + "Riwayat (n
  alokasi)".
- Hero boten di-glass (kepatuhan UX-5 hero FLAT; theme-gate
  lulus = verifikasi). Glass = KPI mung (target
  "dashboard hero/KPI").
- Gates: tsc --noEmit 0; check-route-exports OK;
  check-theme-gate OK; next build 0; test:all 0 FAIL (18
  ALL_PASS baseline, kados B1/B2); 0 non-ASCII di diff;
  frozen intact; tanpa skema; fiqih: none.
- Next (menunggu ACC Gus Fi): B4 empty ramah (prop tone
  Empty: default/success/warning; "Alhamdulillah! ..." +
  aksen emerald; 8-10 halaman prioritas transaksi/stok/
  laporan).


## W11 B4 EMPTY STATE RAMAH -- LEPAS (25-10-2026)
Ruling Gus Fi (via DeepSeek, 25 Okt): B4 GO COMMIT
(audit DeepSeek: SEDAP, sedaya gate lulus). C1 = 4211d28.

- ui.tsx Empty + prop `tone` (additive; tanpa tone =
  tampilan lama persis/zero-delta): 'default' (slate,
  kelas lama), 'success' (emerald: border-success-300/60
  bg-success-50 text-success-700 + dark variants; ikon
  text-success-400/500), 'warning' (amber/attention).
- 10 halaman, 2 jenis:
  * Sukses-tone (emerald, "Alhamdulillah..."): piutang
    ("tidak ada piutang terbuka"), retur ("tidak ada
    retur tercatat"), hutang ("tidak ada utang supplier
    terbuka"), low-stock ("semua stok aman (min. 10)"),
    zakat riwayat ("belum ada riwayat zakat tercatat"),
    laporan transaksi (tone kondisional: filter kosong =
    default, periode kosong = success "Alhamdulillah,
    belum ada transaksi pada periode ini.").
  * Teks ramah netral ("tercatat" / arah CTA): akad
    ("Belum ada akad tercatat. Gunakan form di atas."),
    belanja x2 ("Belum ada belanja supplier tercatat." /
    "Belum ada pengeluaran tercatat."), kas x2 ("Belum
    ada gerakan kas tercatat. Mulai lewat form di
    atas."), koperasi ("Belum ada mutasi simpanan
    tercatat." + "Belum ada pinjaman anggota (qardh)
    tercatat."), zakat log ("Belum ada log verifikasi
    harga emas tercatat.").
- Bonus: simbol non-ASCII di low-stock ("Semua stok aman
  (lebih-dari-same 10)") diganti "min." (gate 0
  non-ASCII di baris +).
- Gates: tsc --noEmit 0; test:all 0 FAIL (ALL_PASS);
  check-route-exports OK; check-theme-gate OK; next
  build 0 (66 pages); 0 non-ASCII di baris +; frozen
  intact; tanpa skema; fiqih: none.
- Next (GO CODE, menunggu ACC Gus Fi): B1 revisi
  sapaan -- ganti "Selamat sore WIB, semoga berkah |
  {date} | login sebagai {nama} ({role})" (kaku) dadi
  "Sugeng {band}, muga-muga sedaya lancar lan berkah.
  {date}"; hapus "login sebagai..." (redundant).


## W11 B1 REVISI2 SAPAAN KONSISTEN INDONESIA -- LEPAS (25-10-2026)
Ruling Gus Fi (via DeepSeek, 25 Okt): B1 revisi2 GO COMMIT
(audit: sapaan "Sugeng ... muga-muga" = campur basa Jawa
+ Indonesia, ganti ke bahasa Indonesia konsisten).
C1 = c3fece5.

- Ganti "Sugeng {band}, muga-muga sedaya lancar lan
  berkah" dadi "Selamat {band}, semoga hari Anda lancar
  dan berkah" (basa Indonesia konsisten, santun,
  komunikatif). "Assalamu'alaikum" jagi (salam Islam).
- 4 file, 5 ganti:
  * src/app/page.tsx -- kasir (L107, tanpa dateLine) +
    hero (L200, + dateLine di uwes).
  * src/app/admin/dashboard/page.tsx (L233) --
    "Dashboard Admin -- Selamat {band}, semoga hari Anda
    lancar dan berkah."
  * src/app/pengurus/dashboard/page.tsx (L211) --
    "Dashboard Global -- Selamat {band}, ..."
  * src/app/member/page.tsx (L135) -- "Selamat {band},
    semoga hari Anda lancar dan berkah. Kartu Member
    Anda -- ..."
- Gates: tsc --noEmit 0; test:all ALL_PASS (0 FAIL);
  check-route-exports OK; check-theme-gate OK; next
  build 0 (66 pages); 0 non-ASCII; frozen intact;
  tanpa skema; fiqih: none.
- Wave 11 saiki sampun COMPLETE (B1-B4 + revisi +
  revisi2 basa). Next: Wave 12 (Google/WA login).

## W12 GOOGLE OAUTH MANUAL + DOMAIN ALLOWLIST + users.allow_google -- DISUSUN 26-10-2026 (menunggu approval Gus Fi -> commit C1 + C2, dual-push)
Ruling Gus Fi (via DeepSeek): login Google = "pintu masuk"
BUKAN sumber kredensial -- keputusan: (a) alur OAuth2
Authorization Code MANUAL (zero dependency; next-auth
ditolak: bentrok session custom + PIN re-auth), (b) gate
domain allowlist fail-closed, (c) gate per-akun
users.allow_google oleh Admin (OFF default, tanpa
auto-create akun). Sesi tetap lewat createSession()
(arSITEKTUR SESI TIDAK BERUBAH: PIN idle re-auth, role
guard, session cache & middleware utuh).

- Arsitektur (8 file; TANPA dependency baru -- native
  fetch + node:crypto):
  * src/lib/oauth-google.ts -- PURE/hermetic: googleAuthUrl
    + nonce state (crypto 128-bit hex), exchangeCodeForToken,
    fetchGoogleUser, allowedDomains/emailDomainAllowed
    (fail-closed: env kosong/absen = TIDAK ADA yg lolos),
    consumeOnce (anti-replay in-memory: Map TTL 15 mnt,
    cap 500; Vercel multi-instance: replay lintas instance
    tetap gagal karena authorization code single-use).
  * src/app/api/auth/google/redirect/route.ts -- GET:
    fitur OFF (credential env belum diisi) -> 302
    /login?google_err=disabled (pesan ramah, bukan 404);
    ON -> nonce -> cookie httpOnly (kopontren_oauth_state,
    sameSite=lax, secure prod, maxAge 300 dtk) + 302 ke
    consent Google.
  * src/app/api/auth/google/callback/route.ts -- GET, gate
    berjenjang (semua gagal = throttle per-IP + redirect
    ?google_err=<code>): (a) state wajib cocok cookie
    httpOnly (anti-CSRF); (b) anti-replay: sha256("g|
    state|code") consumeOnce; throttle per-IP 10x/15 mnt
    -> kunci 15 mnt (pola api/auth/login); (c) tukar
    code -> token -> profil Google; (d) domain email wajib
    masuk allowlist; (e) username = email -- akun HARUS
    sudah dibuat Admin (tanpa auto-create) + active;
    (f) gate amanah: allow_google=1; (g) UPDATE
    users.oauth_sub (identitas Google terakhir) + bersihkan
    throttle + audit 'auth:google-login'; (h) SESI PERSIS
    jalur password (createSession + 2 cookie session +
    idle exp + redirect sesuai PIN -- belum set ->
    /login/pin/setup). maxDuration=30.
  * src/app/login/page.tsx -- tombol "Masuk dengan Google"
    (inline SVG, tanpa asset/lib baru) + divider "atau" +
    handler ?google_err (pesan ramah per kode).
  * src/components/admin/pengguna-client.tsx -- toggle
    "Google: ON/OFF" per akun (hanya Admin; self-guard:
    izin utk akun SENDIRI tidak bisa di-toggle -- PUT API
    menjaganya di sisi server).
  * src/app/api/users/route.ts -- GET: expose allow_google;
    POST: opsional saat buat akun; PUT: update allow_google
    langsung + audit + guard akses diri.
  * src/db.ts -- skema v34 (RENUMBER dari v33 -- v33
    DICADANGKAN utk modul Ujrah Konsinyasi W9-W2/W10-1
    yg belum diimplementasi; lihat catatan tumpukan di
    bawah). migrate34 additive: users.allow_google
    (INTEGER NOT NULL DEFAULT 0) + users.oauth_sub
    (TEXT NULL); execColumn idempoten; fresh DB lewat
    fullInit. DB stempel v32 fullInit sekali lagi saat
    cold start. BACKUP DB WAJIB sebelum deploy (lesson
    v16 -- skema baru).
  * scripts/test-oauth.ts -- 29 asersi pure-logic
    (googleAuthUrl, nonce, exchange, userinfo,
    allowlist fail-closed, consumeOnce). test:oauth di
    package.json; test:all kini 46 suite.
  * DEPLOY-VERCEL.txt -- item baru "4. LOGIN GOOGLE":
    3 env Vercel (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    GOOGLE_ALLOWED_DOMAINS) + registrasi Google Cloud
    Console (redirect URI PERSIS
    https://<domain>.vercel.app/api/auth/google/callback)
    + cara menyalakan izin per akun di /admin/pengguna.
- Keamanan (fail-closed): tanpa GOOGLE_ALLOWED_DOMAINS
  tidak ada email yg lolos; tanpa credential fitur OFF
  (halaman login tetap berfungsi normal); akun tak
  dikenal / inactive / allow_google=0 -> ditolak (tdk
  bocor info: kode galat sama utk unknown/inactive);
  sesi sama persis jalur password (PIN re-auth tetap
  berlaku utk login Google).
- Gates: tsc --noEmit EXIT 0; test:oauth 29/29;
  test:all 46/46 ALL PASS; check-route-exports OK;
  check-theme-gate OK; diff W12 = 0 non-ASCII baru
  (yang terdeteksi pre-existing di code lama); frozen
  utuh (public/sw.js, V1, coop.ts); tanpa fiqih.
- NEXT: (1) approval Gus Fi atas diff lengkap W12;
  (2) C1 commit `feat(auth): W12 -- Google OAuth
  (manual, allowlist)` + C2 docs (seksi menika +
  TODO W12), dual-push master/main;
  (3) DEPLOY: backup Turso dulu (skema v34), isi 3 env
  Vercel + Google Cloud Console, redeploy;
  (4) W12 = WACANA Google login -- WA login (bagian
  "Google/WA login" Wave 12) TERTUNDA, menyusul bila
  Gus Fi minta.

## Catatan tumpukan skema (26-10-2026) -- JANGAN tabrakan
v32 = Wadi'ah (LEPAS 24 Okt). v33 DICADANGKAN utk Ujrah
Konsinyasi (W9-W2/W10-1 -- audit read-only + tashih,
BELUM diimplementasi). W12 semula memakai v33 ->
RENUMBER ke **v34** (SCHEMA_VERSION=34, migrate34)
agar cadangan v33 Ujrah tetap utuh bila Gus Fi
menashih-kan. Kaidah baru: sebelum bump skema, cek
seksi menika + MEMORY "W9/W10 Ujrah" dulu.

