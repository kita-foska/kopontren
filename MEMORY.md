# MEMORY

## 2026-09-27
### UX-6 (FASE I): audit sistem komunikasi + rencana commit — I-1 & I-3 SELESAI 27 Sep
- **Perintah (ACC Gus Fi, 27 Sep)**: audit read-only UX-6
  (Attention System) + rencana implementasi. Eksekusi
  **I-1, I-3, I-4, I-5, I-2, I-6, I-8**; **I-7 (void alasan
  struktural) = DITUNDA** (butuh penentuan pengurus: daftar
  alasan sah + risiko alur bisnis → fase UX-6.5 setelah ACC).
  Prioritas: I-3→I-4→I-5→I-2→I-6→I-8. Aturan sesi: per commit
  diff → ACC → `tsc --noEmit` (+ build utk commit kode) →
  dual-push master+main; sw.js TIDAK PERNAH di-commit; D:
  target tulis, `kp-zip3` = read-only.
- **Koreksi konteks penting (audit)**: file `ui/toasts.tsx` /
  `ui/confirm.tsx` / `ui/index.ts` **TIDAK PERNAH ada** (disk +
  `git log --all -- src/components/ui/` kosong) — target edit
  UX-6 = **`src/components/ui.tsx` monolit (1.112 baris)**:
  Toast `L449+`, `useConfirm` `L525+`, `Empty`/`PageSkeleton`/
  Table. Commit H5 `a0b9f79` real = 7 file (bukan 4 + ui/*).
- **Hasil audit 8 kategori** (verified read-only 27 Sep; detail
  commit-per-commit di TODO.md § FASE I):
  - A Attention: 20 jenis notif / 3 prioritas (`notify.ts`
    L41-68); bell 30 dtk + badge 99+ + deep-link SPA (H5) +
    view pengurus read-only; **gap: tone `critical` (toast
    hanya info/success/error/warning), digest 0, DND 0**.
  - B Empty: 20 situs (16 file): **15 CTA, 5 tanpa CTA** → I-4:
    `low-stock` L84, `notification-list` L141, `zakat` L637+L652,
    member dashboard L153 ("Belum ada transaksi").
  - C Loading: `PageSkeleton` standar; **3 situs "Memuat…"
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
    ada di client (hanya `SalesBarChart`) — anomali bukan
    fitur, jangan di-klaim.
- **Refinements ACC (implementasi commit kode)**: I-2 = critical
  auto-dismiss 90 dtk + manual-close, **sound = SKIP (V1)**,
  undo = `showToast(msg, tone, action?)` (4 titik contoh
  dikonfirmasi saat implementasi); I-3 = delta server-side
  (admin: hari ini vs kemarin; pengurus: 30h vs 30h-sebelumnya)
  + TermTip pakan delta, 4–5 kartu; I-4 CTA: low-stock →
  `/admin/produk`, notification-list → settings (**admin-only**;
  pengurus = tanpa CTA, pola kondisional H3), zakat x2 → form
  zakat, member dashboard → POS (kondisional); I-5 = primitive
  `ErrorState` (pesan + "Muat ulang" + `<details>` teknis) di
  2 blok `laporan-admin` + seragamkan pola konsinyasi; I-6 =
  `useConfirm` + `risk:1..5` (L1-2 tombol biasa, L3-4 merah +
  ringkasan dampak, L5 + input nama entitas) — 3 contoh:
  hapus transaksi L3, purge audit L4, resetAll data L5; I-8 =
  kartu 2–3 baris di 2 dashboard (5 `/api/audit` terakhir +
  KPI mover, CTA → Audit).
- **Out of scope FASE I** (jangan balik tanpa keputusan baru):
  DND global · digest harian (dicukupi report P2/P3 harian/
  mingguan/bulanan) · Help Center central · multi-role M1
  (tetap backlog UX-5.5/UX-6, trigger = kebutuhan nyata).
- **I-1 (commit ini)**: dokumen audit + rencana (MEMORY +
  TODO § FASE I, termasuk status DITUNDA I-7). 0 kode.
  Langkah berikutnya = **I-3** (diff → ACC → tsc + build →
  dual-push).
- **I-3 (DONE `e484cbb`, dual-push master+main, 27 Sep)**:
  `kpiDelta(cur, prev, label)` di `lib/format.ts` + delta
  server-side 2 dashboard (admin: 2 kartu "Penjualan Hari Ini"
  vs kemarin + "Arus Kas 7 Hari" vs 7d-sebelumnya; pengurus:
  3 kartu 30h vs 30h-sebelumnya + "Member Aktif" absolut
  "▲ N baru"). Tone emerald/rose/slate; TermTip pakan delta.
  tsc + build EXIT 0.
  **Pixel-check Gus (halaman tak bisa dirender di env ini):**
  - `/admin/dashboard` light/dark/mobile — baris delta 2 kartu;
    TermTip via ikon `?` (hover/tap).
  - `/pengurus/dashboard` light/dark/mobile — sama, 3 kartu.
  - Edge case: periode sebelumnya kosong → "▲ baru"; tak
    berubah (<0.5%) → "≈ stabil"; 0 vs 0 → baris delta tidak
    render.
- **Koreksi audit I-4 (27 Sep, saat re-audit pre-edit)**:
  target I-4 di path aktual — `notification-list-client.tsx`
  (`src/components/admin/`, dipakai 1 rute `/admin/notifications`
  view admin+pengurus); zakat ×2 = `zakat-client.tsx` di
  `/admin/zakat` (empty log verifikasi emas + empty riwayat,
  **bukan** form "Belum diisi" — form hanya state "Memuat…"
  saat load); member dashboard "Transaksi Saya" =
  `personal-dashboard-client.tsx` (sudah ada pola CTA
  kondisional `showPosCta` di "Riwayat Poin & Reward").
  Guard target diverifikasi: `/admin/produk` = `canAccess('stock')`
  (admin/manajer/gudang; pengurus & kasir tak termasuk → CTA
  low-stock dibuat KONDISIONAL, pola H3) ·
  `/admin/notifications/settings` = `isAdmin` (admin saja →
  CTA notif list juga kondisional, prop `canManageNotif`).
- **I-4 (DONE `6222bc70`, dual-push master+main, 27 Sep)**:
  6 file src + MEMORY + TODO (+123/−15): CTA kondisional di 5
  empty — low-stock → `/admin/produk` (prop `canManageStock` =
  `canAccess(user,'stock')`, di-pass dari admin/dashboard/page.tsx);
  notification-list → `/admin/notifications/settings` (prop
  `canManageNotif` = `isAdmin`, dari admin/notifications/page.tsx);
  zakat ×2 → CTA in-page `ctaOnClick` scroll ke anchor baru
  `#zakat-aksi` / `#zakat-gold` (tanpa rute anyar); "Transaksi
  Saya" member → CTA POS kondisional (pola `showPosCta`, match
  "Riwayat Poin & Reward"). 0 endpoint anyar, 0 fetch anyar.
  tsc + build EXIT 0 (53/53 rute).
  **Catatan commit**: commit pertama `38538af` punya subject korup
  (BOM + `++` di depan, akibat `Out-File -Encoding utf8` PS) →
  di-amend pre-push → `6222bc70` (verified: byte subject
  `f,e,a,t,(`; master = main = `6222bc70`). Pelajaran wajib:
  file commit message ditulis `[IO.File]::WriteAllLines(path,
  $lines, [Text.UTF8Encoding]::new($false))` + byte-verify
  subject (`git cat-file commit HEAD`) sebelum push.
  **Pixel-check Gus (4 item)**: `/admin/dashboard` low-stock
  empty — kasir (widget, tanpa CTA) vs admin (CTA "Kelola
  Produk"); `/admin/notifications` empty — admin +CTA "Ubah
  Pengaturan Notifikasi" vs pengurus tanpa; `/admin/zakat` — 2
  empty state scroll halus ke form (bukan navigate); `/member`
  "Transaksi Saya" empty — admin preview = CTA POS, member murni
  = tanpa CTA.
- **I-5 (DONE, 27 Sep — commit I-5 = 5 file (3 src + MEMORY +
  TODO); hash I-5 = `99c973c`, di-backfill saat commit I-2)**:
  `ErrorState` primitive baru di ui.tsx (insert setelah `Empty`):
  `{text, onRetry?, tech?}` — kartu rose + tombol "Muat ulang"
  (ghost) + `<details>` "Detail teknis" berisi `<pre>`
  `text-1xs` (perbaikan ACC: `text-[11px]` → `text-1xs`,
  token F1). Dipakai di 3 blok: laporan-admin LaporanTab
  (`GET /api/keuangan`) + NeracaTab (`GET /api/neraca`; tombol
  header "Muat ulang" A3 TETAP, tidak disentuh) + konsinyasi
  `loadErr` (pola manual "Coba lagi" diseragamkan;
  `onRetry={load}` sah karena `load()` sudah clear err di
  awal; import `Button` tetap — 12 use di file).
  0 endpoint/fetch anyar. tsc + build EXIT 0.
  **Pixel-check Gus (3 item)**: paksa gagal load (putus
  network / API error) → `/admin/laporan` tab Laba-Rugi:
  kartu rose + "Muat ulang" + collapsible "Detail teknis"
  (isi `GET /api/keuangan — <err>`); tab Neraca: `GET
  /api/neraca — <err>`; `/admin/konsinyasi`: `GET
  /api/konsinyasi — <err>` (tombol "Coba lagi" ad-hoc hilang
  → ErrorState seragam).
- **I-2 (DONE, 27 Sep — commit I-2 = 6 file (4 src + MEMORY +
  TODO); backfill: hash I-5 = `99c973c`)**: tone `critical`
  ditambahkan ke `ToastTone` (ui.tsx): bg-rose-500, role=alert +
  assertive; auto-dismiss critical & warning = 90 dtk (error tetap
  6 dtk, tone lain 4 dtk). Slot `ToastAction {label, run}` =
  tombol di dalam toast (klik = run() lalu tutup). `useToast` kini
  5-tuple — backward-compat: destructure 2–4 elemen lama tetap
  valid, jadi host lain tak perlu diubah; hanya host produk/shift/
  zakat yang += prop `action`. 4 titik contoh: (1) produk-client
  delete ber-riwayat = soft-archive → critical + "Urungkan"
  (PUT `active=1`); (2) bulk delete → critical + "Urungkan" —
  refinement ACC: `ids` di-capture sebagai snapshot SEBELUM sukses
  clear `selected`; `bulk()` kini terima `extra.ids` + union
  action += `'active'` (endpoint sama, tier akses sama); (3)
  shift-client tutup shift → critical tanpa undo ("rekap
  terkunci"); (4) zakat logGold `apply=true` → warning 90 dtk +
  pesan bahasa-plain "koreksi dengan entri baru, log lama tidak
  dihapus" (deviasi kecil dari draft "(OOS undo)" — jargon,
  diganti bahasa manusia). OOS tercatat: undo zakat (log
  append-only → keputusan pengurus) + sound toast (SKIP V1).
  tsc + build EXIT 0.
  **Pixel-check Gus (4 item)**: hapus produk ber-riwayat →
  toast rose + tombol "Urungkan" (klik = reaktifkan, tabel
  refresh); bulk hapus 2+ → "Urungkan" (semua diaktifkan lagi);
  tutup shift → toast rose 90 dtk tanpa tombol; verifikasi harga
  emas dengan "Sinkronkan ke Pengaturan" → toast amber 90 dtk.

### UX-5 H4: Breadcrumb visual (nested /admin/* /pengurus/*) — SELESAI 27 Sep
- Implementasi (commit H4, 27 Sep, dual-push master+main):
  komponen pure `src/components/breadcrumb.tsx` + 3 hunk di
  `src/components/shell.tsx` (import + flag `showBreadcrumb` +
  render di top `<main>`). **0 edit halaman** — rute nested =
  18 `/admin/*` + 1 `/pengurus/dashboard` ikut otomatis.
- Desain visual-only (tanpa logika): "Kopontren" = link tunggal
  ke `/`; item tengah inert (tanpa href — /admin/ & /pengurus/
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

### UX-5 H5: Notif deep-link SPA + bell pengurus (view admin|pengurus) — SELESAI 27 Sep
- Implementasi (commit `a0b9f79`, 27 Sep, dual-push master+main;
  7 file): `auth.ts` +`isNotifViewer` (admin|pengurus);
  `shell.tsx` L93 bell admin|pengurus; `notification-bell.tsx`
  `onItem` = `router.push` (SPA, tanpa reload) + link eksternal
  `window.open('_blank')`; guard `/api/notifications` (list/count/
  read) + halaman `/admin/notifications` saka `isAdmin` →
  `isNotifViewer`, guard-fail = `roleHome(user.role)` (pola H2);
  copy hero "(admin & pengurus)".
- **Keputusan Q3 = opsi (a)**: VIEW = admin + pengurus
  (read-only); PENERIMA notifikasi tetep **admin-only**
  (`notify.ts` `getAdminUserIds` unchanged) → bell pengurus =
  count 0. Follow-up "pengurus sebagai penerima" (prefensi +
  opt-in push) = backlog UX-6+. Settings + send + cron tetep
  admin-only.
- Pixel-check (Gus Fi, 6 item): (1) login **pengurus** → bell
  keliatan (count 0); (2) `/admin/notifications` bukak
  (read-only); (3) settings tetep guarded; (4) login **kasir** →
  `/admin/notifications` = redirect `roleHome`; (5) link internal
  = SPA (ora reload); (6) link eksternal = new tab (bila ana).
- `tsc --noEmit` EXIT 0. **Pixel-check Gus Fi (BELUM)**:
  1 hal. `/admin/*` (mis. `/admin/produk`) di light + dark +
  mobile (wrap): breadcrumb tampil "Kopontren / Admin /
  Produk"; link "Kopontren" kerja; item terakhir bold.

### MULTI-ROLE: ditunda ke UX-5.5/UX-6 (keputusan Gus Fi, 27 Sep)
- **Pertanyaan Gus Fi (27 Sep)**: account multi-role (siji akun duwe
  role langkung saka siji, mis. admin + member + kasir + pengurus).
  **Keputusan: ora diimplementasi saiki** — model saat ini
  single-role (`users.role`); multi-role = backlog **M1** (TODO.md
  Kelompok M), target fase **UX-5.5 utawa UX-6**, tanpa kode saksaiki.
- **Alasan**: scope gedhe (DB `users.roles` array + migrasi skema
  v18; pemilihan role ing login; menu adaptif; audit "acting as
  which role"); model single-role saiki aman lan kasil; durung ana
  user sing ngbutuhke.
- **Rancangan M1 (besik diimplementasi)**: **primary role + access
  tambahan** — primary role mrenteki menu utama; access tambahan liwat
  "mode switch"/dedicated link; audit log ngemot "acting as primary
  role"; session nggolongi role context. **Langkung aman ketimbang
  "union sagedhah role"** (menu campur + audit bingung). Estimasi
  ~4–5 commit: (1) skema v18 `users.roles` + migrasi idempoten;
  (2) auth/session role context; (3) pilih role login + menu adaptif;
  (4) audit "acting as"; (5) docs + resync kp-zip3.
  **Trigger**: nalika Gus Fi ngramesake kabutuhan nyata (contone
  siji wong sing sekaligus pengurus + member).
- **Pandhuan interim**: wong sing butuh peran pirang-pirang = akun
  pirang-pirang (HP/email beda); **jangan share akun** (audit trail
  per-akun tetep resik); admin bisa ndeleng card member dhewe ing
  `/member` (H3) menawa dipasangke.
- **H2 scope final (27 Sep)**: redirect role-aware **tanpa redirect anyar
  saka `/`** (ngguyu Q2: home `/` tetep kanggo kabeh role, dashboard =
  drill-down): post-login + reauth PIN + setup PIN -> `roleHome(role)`
  (member -> `/member`; role internal -> `/`); guard-fail 10 sub-halaman
  (`kasir/laporan/piutang/retur/admin/{audit,dashboard,hutang,
  pengaturan-member,shift,zakat}`) `redirect('/')` ->
  `redirect(roleHome(user.role))` (ngguyu I-5); root `/` tanpa
  redirect (draft awal ngemu redirect member ing root — kabale,
  ora selaras catetan plan). Peta terpusat: `HOME_BY_ROLE` +
  `roleHome()` ing `src/lib/features.ts` (re-export `@/lib/auth`).


### UX-5 FASE H: Information Architecture — AUDIT SELESAI 27 Sep (H0 docs; ACC Q1-Q4; plan H0-H6)
- **Audit read-only (27 Sep, sesusih FASE G)** — scope: sidebar,
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
- **10 temuan (I-1..I-10)**: I-1 menu manajer "Keuntungan Member" →
  `/admin/pengaturan-member` admin-only = dead-end; I-2 filter
  group-level kasar (group "Sistem" ngusir item legal `/admin/laporan`
  dr manajer); I-3 hierarchy route adhoc (top-level `/` `/kasir`
  `/laporan` `/piutang` `/retur` vs nested `/admin/*` `/pengurus/*`);
  I-4 member ndeleng ringkasan toko purno (matriks: member =
  dashboard pribadi read-only); I-5 ora ana role-home (redirect
  unauthorized selalune → `/`); I-6 alur shift kasir sakabèh 3 layar
  (ora ana shift-day screen); I-7 ora ana onboarding wizard first-run
  (mung banner `pw_default` ing `/` L80-97); I-8 breadcrumb = 0 situs;
  I-9 notif deep-link statik per jenis + full reload + bell mung
  admin; I-10 copy stale `/` L286-290 "baris atas di desktop"
  (ora ana top-row — navigasi = hamburger drawer + bottom nav).
- **ACC Gus Fi Q1-Q4 (27 Sep)**: Q1 Loyalty **fold → OPERASIONAL**
  (4 group: UTAMA/OPERASIONAL/KEUANGAN/SISTEM); Q2 home `/`
  tetep kanggo kabeh role (ora redirect role home; dashboard =
  drill-down, ora home); Q3 bell **+ pengurus read-only**
  (ORA kasir — shift alerts wis ana ing POS UI); Q4 shift-day
  screen (I-6) + onboarding wizard (I-7) **defer → UX-6+** (backlog).
- **H1 — mapping item→level (verifikasi 27 Sep)**: saben item menu
  entuk level `Feature | 'ops' | 'admin'`: `Feature` → `canAccess`;
  `'ops'` → `isManager` (mirror guard Konsinyasi/Kas/QRIS — ora ana
  Feature key 'ops' ing FEATURE_MATRIX, sengaja: menu level mung
  display, guard tetep isManager); `'admin'` → mirror guard
  admin-only (pengaturan-member, notifications, pengguna, data,
  migrate). Mapping: UTAMA = Dashboard(laporan), Dashboard
  Global(laporan), Ringkasan(personal); OPERASIONAL = Kasir(pos),
  Produk(stock), Belanja(supplier), Konsinyasi(ops), Shift(shift),
  Retur(pos), Member(member), Keuntungan Member(admin);
  KEUANGAN = Kas(ops), QRIS(ops), Piutang(piutang), Hutang(supplier),
  Zakat(zakat), Laporan & Rekap(laporan); SISTEM = Laporan
  Pengurus(laporan), Notifikasi(admin→H5), Audit(audit),
  Pengguna(admin), Data & Backup(admin), Import CSV(admin).
  Dampak: I-1/I-2 sirna (filter item-level, sumber siji = guard);
  label role-specific ("Produk & Stok (Opname)", "Hutang Supplier")
  → label global siji (nuansa UX = tau Gus Fi).
- **H5 — verifikasi 27 Sep**: `/admin/produk` **ORA** support
  `?focus=` (produk-client: search client-side `q`, ora ngguyu
  searchParams) + tabel `notifications` ora ana kolom
  entity-id/meta (schema: user_id,type,title,message,link,read,
  created_at) → **V1 = link statik + navigasi SPA** (router,
  ganti `location.href`); entity-focus `?focus=<id>` = backlog
  follow-up (butuh schema + produk-client). Side-requirement Q3:
  bell pengurus **wajib** ngemong guard `/api/notifications`
  (GET/count) + `/admin/notifications` saka `isAdmin` →
  admin|pengurus (view read-only).
- **H5 — SELESAI 27 Sep @ `a0b9f79`** (Q3 opsi (a)): viewer =
  admin + pengurus (read-only); penerima notifikasi tetep
  admin-only (`getAdminUserIds` unchanged → bell pengurus = 0);
  detail + pixel-check 6 item = § UX-5 H5; follow-up "pengurus
  sebagai penerima" (prefensi + opt-in push) = backlog UX-6+.
- **Plan commit (ACC'd)**: H0 docs (iki) → H1 regroup +
  item-level filter + fix I-10 → H3 member personal dashboard
  (filtered: poin/status/QR + transaksi saya; read-only; CTA QR
  badge) → H2 role-aware redirect (ora ana redirect anyar saka `/`)
  → H4 breadcrumb (mung nested `/admin/*` `/pengurus/*`, visual
  only) → H5 deep-link SPA + bell pengurus (+ guard notif) →
  H6 docs + resync `kp-zip3` + pixel-check list. Total 6 commit
  + H0. Oka scope: I-3 route hierarchy, I-6, I-7, G2-full
  ternary `pos-client:714/892/901`, entity-focus = mangkase UX-6+.

### UX-4 FASE G: Modal size + Toast tones - G1+G2 SELESAI 27 Sep
- **G1 @ `99a3b20` (dual-push master+main, 3 file)**: `Modal`
  entuk prop `size?: 'sm'|'md'|'lg'` (default `'md'` = kelas
  lawas persis → zero-delta). Token `MODAL_WIDTH`: sm=`max-w-xs`
  (320), md=`max-w-lg` (512, default), lg=`max-w-2xl` (672).
  Migrasi 2 dialog manual: `member-qr-badge` (default `md` —
  layar QR + meta) + `product-label` (`sm` — 1 kolom label).
  tsc EXIT 0, build EXIT 0 (53/53).
- **G2 @ `0ffb072` (dual-push, 23 file +156/−108)**: toast
  semantik. `ToastTone = 'info'|'success'|'error'|'warning'`
  (ui.tsx) + `TOAST_TONE_CLASS` (info = kelas lawas persis
  zero-delta; success emerald-600, error rose-600 +
  `role="alert"` + `aria-live="assertive"` + auto-close 6s,
  warning amber-500). `Toast` entuk prop `tone` (default `'info'`).
  `useToast` saiki return 4-tuple `[msg, showToast, clearToast,
  tone]` — backward-compatible (destructure 2/3 elemen lawas
  tetep valid). 22 file consumer ketambah `tone={toastTone}` +
  54 call ketag: **53 'error'** (mangga 22 file; LEFT=0) +
  **1 'warning'** (member-qr-badge: popup diblokir browser).
  Verifikasi: tsc EXIT 0 + build EXIT 0 (53/53) +
  `git status` = 23 M persis (sw.js untracked/gitignored —
  ora ngrusak git).
- **PITFALL KANGGO SESSION KENGSI (kritis)**: `member-qr-badge`
  duwe `useEffect` deps `[member, onQrChanged, showToast]` —
  elemen #2 lawas = `setMsg` (identitas stabil). Implentasi
  `showToast`/`clearToast` anyar WAJIB **`useCallback`** (deps
  kosong) sanalika efek ora re-run saben render (risk infinite
  fetch loop). Identitas stabil dipunyatakne kaya lawas.
- **Backlog G2-full (disingkirne, ora dipikuli G2-min)**:
  `pos-client:714/892/901` = ternary campuran
  success/error (`r.ok ? d.message : 'Transaksi gagal'` etc.)
  — ditinggal `'info'`; butuh keputusan per kasus (mangkase
  ngrusak UX-5).
- **G3 (commit iki, dual-push)**: docs (MEMORY + TODO) + resync
  `kp-zip3` (kp ← D: full-mirror `src/` + `README.md`;
  `TODO.md`/`MEMORY.md` out-of-scope konvensi — kp snapshot
  tanpa docs; `belanja-db.ts`/`backup.ts` = ora ana nang 2
  sisi = konsisten).
  **Pitfall resync**: `Copy-Item -Recurse src` = 7 file ing
  folder `api/**/[id]/` ora kecopy (kurung siku = wildcard
  regex PS, gagal diam-diam) — bener: `Copy-Item -LiteralPath`
  per folder `[id]`. MD5 final: 0 differ.
- **G4 = pixel-check Gus Fi (5 item)**:
  1-3. 3 modals: **Panduan Kasir** (UX-2, ora owah G1/G2 —
     kontrol), **QR member** (`md` default), **label produk**
     (`sm`).
  4. Toast `'error'` (contone: kas save gagal →
     `bg-rose-600`, auto-close 6s).
  5. Toast default `'info'` (kelas lawas persis →
     zero-delta visual; kontrol positif).
- **Aturane git (pencatetan FASE G)**: repo = **1 remote
  tunggal `origin`** (github.com/kita-foska/kopontren,
  dikonfirmasi 27 Sep) — dual-push = `git push origin master`
  + `git push origin master:main`. `public/sw.js` =
  untracked/gitignored (stempel build lokal; JANGAN
  di-commit — sesuai aturan § Cleanup).

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
    mekanis (10px→2xs, 11px→1xs); Opsi B (retire →
    text-xs) ditolak.
  - Q2: include `ui.tsx:33 Badge`→`text-xs` (F2 = 10
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
  delta ≤1px nang titik kenceng (badge h-5, receipt
  preview `pos-client:1833/1876`, bottom-nav `:88` +
  `leading-none`) - bagean pixel-check (item 1/2/6/7/8).
- **F0 SELESAI @ `d1f7574`**: catat audit + ACC (MEMORY +
  TODO) + bersihke scratch lokal `_fasef-*.txt`
  (`D:\Ngudi Susilo\`, di luar repo, konvensi
  git-ignored lokal). Dual-push.
- **F1 SELESAI @ `2ff5091`**: token map 61 owah 17 file
  (`text-[10px]`→`text-2xs`, `text-[11px]`→`text-1xs`;
  mekanis - weight/tracking/leading/werna saka situs
  tetep padha; blok receipt inline + print OUT-OF-
  SCOPE). 62 situs audit − 1 (sidebar:172 Q4 as-is) = 61.
  Verify: residual `text-[10px]` = 1 (mung sidebar:172),
  `text-[11px]` = 0; tsc EXIT 0 + build EXIT 0 (sw.js
  revert) + dual-push master+main.
- **F2 SELESAI @ `ce7e0cd`**: `.card-label` (`@apply
  text-xs font-bold uppercase tracking-wide text-slate-
  500 dark:text-slate-400` nang `@layer components`,
  globals.css:93) + unifikasi 10 situs (Q2): pengurus-
  dashboard:316/324, pos-client:2267/2296/2319,
  notification-bell:203, notification-list:157,
  Badge ui.tsx:33 `text-1xs`→`text-xs`. 6 file +13/−8.
  Delta visual (ACC'd): KPI label 11px→12px + dark
  variant; pos h3 tracking-wider→wide; bell/list meta
  10px semibold→12px bold. Residual `tracking-wider` =
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
     emerald/amber 10px→2xs) + modal Panduan Kasir h3
     `.card-label` 12px (delta F2).
  3. `/home` + dashboard pengurus - label kartu KPI
     `.card-label` 12px bold (delta F2: 11px→12px +
     dark variant) + sub-line nilai (1xs).
  4. `/laporan` - label KPI + sub-line "Periode
     terpilih".
  5. `/admin/notifikasi` - label meta panel bell/list
     `.card-label` 12px bold (delta F2: 10px semibold
     →12px).
  6. Cetak kartu member / QR / label - konfirmasi
     muat 58mm (blok print durung disentuh).
  7. `/admin/produk` - chip sku mono (2xs) + garis
     hint (1xs).
  8. Bottom nav - label (2xs + `leading-none`).
- **Catatan operasional**: local branch `main` isih
  stale (behind 34; mung artifact lokal — remote main =
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

### UX-4 FASE D: tabel primitives + cleanup CSS legacy — SELESAI 27 Sep (4 commit, dual-push master+main)
- **D0 `4dd28c2`**: chore(css) — hapus 5 rules `.btn` yatim
  (`.btn`/`.btn-primary`/`.btn-ghost`/`.btn-danger`/`.btn-amber`)
  dr `globals.css` (debt B.4: laporan sebelumnya menyebut sudah
  terhapus, padahal belum) + 2 komentar stale di `ui.tsx`.
- **D1 `0637ee7`**: feat(ui) — tambah primitive `Table`/`Th`/`Td`/
  `Trow`/`TEmpty` + 3 konstanta kelas (TH_CLS, TD_CLS, TROW_BORDER)
  di akhir `ui.tsx` (add-only; kelas legacy `.th`/`.td`/`.table-row`
  dibake sebagai Tailwind supaya `globals.css` bisa dibersihkan
  pasca-migrasi). `Table`: w-full + `minW` + `stickyHead`; `Trow`:
  hover + border none/top/bottom + spread atribut tr mentah;
  `TEmpty`: baris colSpan penuh + teks tengah.
- **D2a `9a20a1b`**: refactor(admin) — migrasikan 7 tabel legacy ke
  primitives (dual-push).
- **D2b `5ac6080`**: refactor(tables) — migrasikan 4 tabel admin
  terakhir: `kas-client` (4 kol + TEmpty colSpan 4 + CTA
  scroll-to-form), `pengguna-client` (5 kol + TEmpty colSpan 5),
  `migrate-client` (3 tabel: T1 stickyHead + T2/T3 rose panel,
  `Trow border="none"` + pemisah border-t rose), `zakat-client`
  (2 tabel: T4 `border="bottom"` + highlight emerald kondisional +
  last:border-0; T5 log history). 5 file, +126/−141; rules
  `.th`/`.td`/`.table-row` dihapus dr `globals.css` (−9 baris).
  `kas`+`pengguna` = 2 file terakhir yg pakai CSS legacy (scan
  repo-wide); `migrate`+`zakat` manual Tailwind → dimigrasi utk
  konsistensi, bukan cleanup CSS.
- **Delta approved (keputusan 27 Sep, Opsi A — 6+2)**:
  (1) header `px-3 py-2`→`px-3 py-2.5` + bold uppercase slate-500;
  (2) sel `py-1.5`/`py-2`→`py-2.5` (8→10px); (3) rose panel
  (migrate T2/T3) teks 12→14px; (4) `w-full`→`min-w-[32rem]`;
  (5) weight/werna header dibake nang primitive; (6) zakat
  `w-full`→`min-w-[32rem]` + sel 10px; (7) kas+pengguna: dividers
  & hover `.table-row` ilang → selaras bahasa app-wide D2a (ora
  dividers, ora hover; konsistensi nggantosi keunikan per-file;
  manawa dikepengke, siji baris `Trow className` per file);
  (8) kolom pungkasan `px-3` simetris (zakat T4/T5 + migrate
  T2/T3 kolom "Alasan": padding 12px kiwa-tengen).
- Verifikasi: `tsc --noEmit` EXIT 0; `npm run build` EXIT 0
  (53/53 rute); grep `className="th"`/`className="td"`/`table-row`
  nang `src/**` = 0 referensi fungsional (sisa = 2 doc comment
  `ui.tsx` L833/L906 — follow-up opsional, ana item TODO);
  `public/sw.js` clean (stamping build tak ngrusak file tracked).
- **Exception disengka (tinggal)**: 79 raw `<button>` Phase B
  (chip sub-sm "Maks" `pos-client`, toggle status `px-2.5 py-0.5`
  `produk-client`, tombol fill emerald "Riwayat" `member-client` —
  liwat keputusan FASE B2/C2/C3 di ndhuwur; revisit manawa 5+
  chip sub-sm).
- **Pixel-check real device: GUS FI pasca-push** — 4 halaman durung
  visual diverifikasi: `/admin/audit`, `/admin/member`,
  `/admin/produk`, `/admin/data` (+ tabel FASE D liyane manawa
  durung ketoke). Breakage → follow-up commit.

### UX-4 FASE C: migrasi Button + hapus CSS legacy — SELESAI 27 Sep (commit 3a59c9a, dual-push master+main)
- 30 file (+561/−583): ~120 tombol raw `.btn/*` digantikan komponen
  `<Button>` (FASE B.1 @ `592b230`: 5 varian primary/outline/ghost/
  danger/link × 3 ukuran sm 36 / md 44 / lg 52 px + link override
  teks via `className` aman). Aturan legacy dihapus dr `globals.css`:
  `.btn`, `.btn-primary/-secondary/-ghost/-danger/-success/-sm`,
  `.btn-xs`, `.field`, `.card-field`, `.card-field-error`. Error state
  diseragamkan `text-red` → `text-rose` (token `risk`=rose; 22 file).
- Exception disengka (keputusan FASE B2/C2/C3 di atas): chip sub-sm
  ("Maks" `pos-client`, toggle `px-2.5 py-0.5` tabel `produk-client`)
  + tombol fill emerald "Riwayat" kartu mobile `member-client` TETAP
  raw button — override `bg-*` kalah deterministik (slate/rose menang)
  + override min-height via `className` rapuh (Tailwind CSS order).
- Verifikasi: `tsc --noEmit` EXIT 0; grep `btn-*`/`.field`/`.card-field`
  = 0 referensi fungsional (karena aturan CSS-nya sendiri sudah
  dihapus, jadi tak bisa hidup diam-diam); `next build` EXIT 0;
  `public/sw.js` skip-worktree tak terganggu.
- **Pixel-check real device: GUS FI pasca-push** — tombol kini global
  min-height 44px + werna varian; bila ada breakage → follow-up commit.

### UX-4 FASE B2 (C2): keputusan chip sub-sm — "Maks" (27 Sep)
- Chip sub-sm (mis. "Maks" di `pos-client`, toggle status `px-2.5 py-0.5`
  di tabel `produk-client`) **disengaja dipertahankan sebagai raw
  button** — tak di-`<Button>`-kan. Alasan: terlalu kecil untuk size
  Button saiki (sm 36 / md 44 / lg 52 px) + override min-height via
  `className` rapuh (Tailwind CSS order). **Revisit manawa mudhun
  5+ chip sub-sm** → tambah size `xs` ing wiwitan.
- Link variant: override werna teks via `className` aman & deterministik
  (slate/rose/emerald mudhun accent ing CSS generated — alphabetik),
  nalika override werna fill (bg-*) LORA bisa (slate/rose menang) →
  tombol fill emerald (mis. "Riwayat" kartu mobile `member-client`)
  tetep raw button, dilaporaké minangka exception.

## 2026-09-26
### UX-4 FASE A: Design Tokens — SELESAI 26 Sep (commit 5698b74, dual-push master+main)
- Acuan: goal document UX (95 usulan, 8 fase; roadmap E1-E40/P1-P15/Q41-Q95).
  Re-implementasi dari versi kp (D: primary mulai 26 Sep). 9 file, +143/−47:
  (1) `tailwind.config.ts`: role alias `risk`=rose, `success`=emerald,
  `attention`=amber, `info`=blue, `gold`=amber, `wine`=#7A1C1C; fontSize
  2xs/1xs; radius card/field; shadow card; zIndex nav/overlay/modal/toast/pop.
  (2) `globals.css`: var semantik `:root`; `.card`/`.input`/`.btn`/`.hero-bg` → token.
  (3) `src/lib/tokens.ts` BARU: objek `T` (25 key) utk JS/SVG/inline/print.
  (4) `layout.tsx`: themeColor `T.accent500`.
  (5)–(9) `member-qr-badge` (13 edit), `migrate-client` (8), `audit-client` (2),
  `product-label` (7), `pos-client` (8): red→rose, sky→blue,
  hex mentah → `T.*` / `bg-wine-700`.
- Aturan ke depan: hex mentah di komponen larangan; wajib `T.*` /
  kelas Tailwind. (Hex sisa hanya di file token + 1 komentar doc
  `ui.tsx:17`, bukan style — accepted.)
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
  UX-8).** UX-2 = R2 (EmptyState CTA) + R4 (PanduanKasir) — SELESAI
  hari ini, 2 commit, dual-push master+main tiap commit.
- **R2 — EmptyState CTA** (commit `32d0538`, 12 file, +225/−51):
  `EmptyState` menerima `ctaVariant="primary"` — hanya dashboard +
  laporan yang pakai primary; CTA scroll-to-form (6 ID target
  terverifikasi) + import `canAccess` di laporan; upgrade banner
  shift di POS. Verifikasi: tsc 0, `next build` EXIT 0 (53 rute —
  +1 `/api/zakat/gold-standards` dari `ebe2e8a`, expected), smoke
  10/10 route (307→login utk guarded), dual-push @ `32d0538`.
- **R4 — PanduanKasir** (commit `e7130c3`, 1 file `pos-client.tsx`,
  +90/−19): tombol ghost "Panduan kasir" (ikon `BookOpen`) di banner
  shift + modal "Panduan Kasir" 3 seksi: (1) **Cara transaksi** —
  5 langkah: 1 pilih produk (F1/scan), 2 pilih pembeli
  **(opsional)**: F2 nama bebas / F8 member terdaftar (poin
  loyalitas otomatis), 3 bayar: 1 tunai · 2 QRIS · 3 transfer ·
  4 campur (F6) + F3 uang diterima, 4 simpan (F4), 5 struk
  (F5 / Ctrl+P) + bagikan WA; (2) **Pintasan** — CHEAT_ROWS +
  catatan (panah/+/-/Del di luar kolom ketik; Ctrl+H bisa ditahan
  Chrome → via menu Laporan); (3) **Jika ada masalah** — 4 bullet
  aksi konkret: internet mati (lanjutkan saja, antre offline
  sinkron otomatis), item salah (↑↓ / +− / Del / Ctrl+R), sudah
  tersimpan tapi keliru (buka Laporan & Rekap Ctrl+H; retur via
  halaman Retur), lupa pintasan (tekan ?). Opsionalnya pembeli
  terverifikasi di `checkout()`: payload `customer`/`member_id`
  boleh kosong. Verifikasi: tsc 0, build EXIT 0, dual-push @
  `e7130c3`. **Pixel-check real device: Gus Fi pasca-push** —
  bila ada breakage → follow-up commit.
- **SW.js guard — KOREKSI 26 Sep (verifikasi `git ls-files` +
  `check-ignore` + `ls-files -v` + `git log --all`)**: `public/sw.js`
  **TER-TRACK** ing index; **bukan** gitignored (`check-ignore`
  kosong, ora ana pattern sw ing `.gitignore`). `git ls-files -v` =
  `S public/sw.js` → skip-worktree AKTIF, file katon werni ing
  `git status`. `git log --all -- public/sw.js` katon stempel
  SW-BUILD sawetara commit kepungkur (`3b38685`, `d3e99f5`, etc.) —
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
    (elemen di separuh kanan layar → tooltip ke kiri). ESC + klik luar
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
  - **Rename `.grad-hero` → `.hero-bg`**: definisi di `globals.css`
    + 7 file tsx (login, pin, pin/setup, admin/dashboard,
    admin/notifications, admin/notifications/settings, page.tsx,
    pengurus/dashboard). Alasan: nama lama "grad" menipu karena
    background-nya solid flat, bukan gradient.
  - Verifikasi: `tsc --noEmit` exit 0 (0 error).

### Konsolidasi revisi progres + rencana depan UX (26 Sep, sesi AI)
- **Revisi user (10 poin) diterapkan di dokumen** (tidak mengubah kode):
  "SIAP PRODUKSI" → **Engineering: Production Candidate;
  Operational/Syariah: Pending Verification/Tashih**; klaim "0
  engineering WIP" dihapus (UX-2 masih berjalan, UX-3 belum mulai);
  **zakat 24K diturunkan ke PROVISIONAL/configurable** (MUI Komisi
  Fatwa 2026 masih mengkaji karat utk zakat penghasilan; std 14K
  BAZNAS 2026 = zakat pendapatan/jasa — jangan digeneralisasi ke
  perdagangan; riwayat std di `zakat_gold_standards` append-only);
  akumulasi harian = mekanisme implementasi (bukan fiqih final);
  ta'jil = provisional, tidak menggeser haul; **P4 "default 20%" =
  preset operasional, bukan ketentuan syariah**; mapping akuntansi
  (supplier goods ≠ revenue; ujrah → revenue; hak pemilik →
  settlement payable) = **provisional nunggu tashih P4**.
- **BARU `PROGRESS-2026-09.md`**: laporan 36 bagian (periode
  18–26 Sep) versi revisi + rujukan (MUI, BAZNAS zakat perdagangan,
  DSN-MUI 113/2017, BAZNAS zakat penghasilan 2026). HEAD git aktual
  saat konsolidasi = `10c8e87` (komit UX-1a P1–P4), clean.
- **TODO.md**: seksi baru "RENCANA KEDEPAN — UX MASTER PLAN & BACKLOG
  (usulan, nunggu ACC)" — roadmap fase UX-2..UX-8 (UX-4 = Design
  System, UX-5 = IA/role-based, UX-6 = Attention + Explain This
  Number, UX-7 = Power User/Ctrl+K, UX-8 = Operational Safety),
  10 prioritas utama, gate kualitas "5 rasa / 6 kata", backlog
  **E1–E40 (Experience Layer) + P1–P15 + Q41–Q95** (95 item,
  BELUM kode — tunggu ACC), aturan "jangan dulu" Bagian-35, +
  checklist HP **"TermTip mobile viewport edge check"** (masuk
  daftar Gus setelah UX-3).
- **SYARIAH-CHECKLIST.md**: 4 edit target nyelarke revisi (Seksi F
  nisab/karat provisional; tabel baris 10; P3-b; P4) — klaim lama
  24K-final dipertahan sebagai histori 24 Sep, di-overwrite
  in-line "Koreksi 26 Sep".
- Commit lokal master; **belum push** (nunggu Gus).

### ZAKAT v17: payment_type di zakat_history (26 Sep)
- **Permintaan user**: catat media pembayaran zakat di riwayat zakat
  (UI + API). 4 nilai: `cash` (tunai) / `transfer` (transfer bank) /
  `qris` / `other` (lainnya); nilai tak dikenal atau kosong
  dinormalisasi ke `cash` (konservatif, selaras default baris lama).
- **Skema v16→17** (`src/db.ts`): kolom additive
  `zakat_history.payment_type TEXT NOT NULL DEFAULT 'cash'`; DB
  existing dapat kolom lewat `execColumn` idempoten (guard
  `PRAGMA table_info`) saat cold start — tanpa rewrite baris lama.
  `CREATE TABLE` fullInit ikut kolom + `SCHEMA_VERSION = 17`.
- **Modul murni anyar `src/lib/zakat-payment.ts`** (pola
  `zakat-period.ts`, tanpa dependensi Next): `ZAKAT_PAYMENT_TYPES`
  (readonly const) + `ZakatPaymentType` + `normalizePaymentType(v)`.
  Catatan: Next.js melarang *value export* selain HTTP handler di
  `route.ts` (type-check `OmitWithNull` gagal) → helper TIDAK boleh
  diekspor dari `src/app/api/zakat/route.ts`, dipindah ke lib.
- **POST `/api/zakat`**: field opsional `payment_type` di body →
  `normalizePaymentType` → INSERT `zakat_history`; `logAudit`
  `zakat:record` after-JSON memuat payment_type.
- **GET `/api/zakat/history`**: SELECT + tipe baris + ekspor CSV
  kol. `payment_type` (setelah `note`); baris lama tampil 'cash'
  (default DB).
- **UI `/admin/zakat`** (`zakat-client.tsx`): select "Media
  Pembayaran" di form catat zakat (default 'cash'), kolom "Media"
  di tabel riwayat; `ZakatHistoryRow.payment_type: string`.
- **Verifikasi**: `npm run test:zakat` 18/18 ALL_PASS; `next build`
  EXIT 0. (Env lokal: `@next/swc` & 35 paket lainnya sempat rusak —
  `npm install` memperbaiki; bukan issue kode.)

### ZAKAT — FASE 2: status provisional (26 Sep)
- **STATUS PROVISIONAL**: Provisional — implemented based on strongest
  available fiqh position. Pending tashih by pengasuh. Subject to
  correction. (Formula periodik konservatif per P3: haul 1 tahun
  tetap, laba terakumulasi sejak `last_zakat_date`, modal @ HPP,
  harga emas manual 24K; + pencatatan media pembayaran v17.)
  FASE 2: Step 1 (implementasi posisi terkuat) SELESAI — menunggu
  tashih pengasuh (`P3-TASHIH-ZAKAT.md`). (Step 2 provisional
  terapkan di entry di bawah: "ZAKAT — FASE 2 Step 2".)
- **Catatan audit (waktu itu) — formula yang live masih FORMULA
  LAMA**: `modal + laba + piutang − hutang` + HPP, harga emas
  manual 24K (v17 hanya menambah pencatatan media pembayaran,
  TANPA mengubah formula). Status provisional = keputusan untuk
  MENJAGANYA secara sementara, BUKAN formula baru. (Koreksi
  trancribes lama: kutipan "modal + laba − hutang − piutang" salah;
  code asli `src/app/api/zakat/route.ts` = `modal + laba +
  piutang − hutang`.)

### ZAKAT — FASE 2 Step 2: logika P3 provisional (26 Sep)
- **Lakukan Step 2 SEBELUM hasil tashih** (keputusan user): logika
  P3 diimplementasikan sebagai posisi provisional; revisi hasil
  tashih pengasuh = komit terpisah (Step 3 = P4 dokumen hanya).
- **Modul murni anyar `src/lib/zakat-valuation.ts`** (pola
  `zakat-period.ts`, tanpa dependensi Next): `computeValuation`
  (mode market/hpp; market default, V1 proxy = harga jual produk),
  `computeAccrual` (proporsional hari haul sejak anchor),
  `computeHaulAnchor` (fallback: `haul_start_date` →
  `last_zakat_date` → awal bulan WIB; clamp ≤1 thn utk anomali
  + 29 Feb), `computeBalance`.
- **Haul anchor**: `last_zakat_date` TIDAK lagi me-reset siklus
  akumulasi — pembayaran zakat = ta'jil, hanya audit trail +
  fallback bila `haul_start_date` kosong.
- **Skema v17→18** (`src/db.ts`, add-ops `execAdditive`):
  `zakat_gold_standards` (append-only: karat, price, source,
  price_date, created_by; index `price_date` DESC) +
  `ZAKAT_SETTING_DEFAULTS.valuation_mode = 'market'`.
- **Route `/api/zakat`**: GET+POST memuat `valuation_mode`,
  `haul_anchor`, `accrued`, `days_in_haul`; GET juga
  `gold_standard` (log terbaru) → harga efektif; cache
  `zakat:calc` TTL 15 mtk.
- **Route anyar `/api/zakat/gold-standards`**: GET (tier
  `laporan`+) 100 baris terbaru; POST admin-only (insert).
- **UI `/admin/zakat`** (`zakat-client.tsx`): label status
  provisional + banner amber, select `valuation_mode` +
  form/tabel log standar emas (TANPA hapus — append-only),
  stat card Haul & Akumulasi, detail kalkulasi memuat
  anchor/hari/accrual/standar emas (setting vs log).
- **Test `scripts/test-zakat.ts`**: +9 kasus (total 37) — mode
  penilaian (market/hpp), accrued proporsional + edge (anchor
  masa depan = 0), settlement balance, fallback anchor. SEMUA PASS.
- **Verifikasi**: `npm run test:zakat` 37/37 ALL_PASS;
  `npx tsc --noEmit` EXIT 0; `next build` EXIT 0.
- **Koreksi sitasi P3 (riset 26 Sep)**: "DSN-MUI Fatwa No.
  8/2008" keliru (No. 08/DSN-MUI/IV/2000 = musyarakah, bukan
  zakat; DSN-MUI berdomain muamalah) → "MUI Fatwa No. 78/2023
  [judul: menunggu pengasuh]" (nomor dari tim, BELUM TERVERIFIKASI
  — placeholder sampai pengasuh verifikasi). Tersimpan di
  `P3-TASHIH-ZAKAT.md` §D (md+html), SYARIAH-CHECKLIST §F, TODO.
- **Catatan**: skema v18 add-ops — DB turunan (Vercel Turso)
  butuh migration/PRAGMA saat cold start; jangan rewrite data.

### FASE 2 Step 3: dokumen P4 only — SELESAI (26 Sep, commit 3, dual-push master+main)
- **Perintah user (26 Sep, pasca-verify commit 2 `ebe2e8a`)**:
  lanjutkan Step 3 = P4 dokumen only — TANPA perubahan kode,
  TANPA migrasi baru; tunjukkan diff sebelum commit; tunggu review.
- **Mapping akuntansi P4** (posisi fiqh terkuat, PROVISIONAL)
  ditambahkan ke `SYARIAH-CHECKLIST.md` (item P4) +
  `P4-PROPOSAL-KONSINYASI.html`: (a) barang supplier (pemilik
  titipan) ≠ revenue Kopontren; (b) ujrah Kopontren = revenue —
  V1 off-P&L (memo baris "Ujrah Konsinyasi"), dipindahkan ke
  pendapatan setelah tashih pengasuh; (c) hak supplier =
  settlement payable (tagihan neto komisi). Label: "Provisional —
  implemented based on strongest available fiqh position. Pending
  tashih by pengasuh. Subject to correction."
- **TODO.md**: item A1.1 (koreksi keuangan pascataashih P4)
  ditambahkan; item Step 3 di-update ke status DRAFT.
- **Status: SELESAI — Commit 3 (26 Sep, dual-push origin master +
  master:main; 5 file: SYARIAH-CHECKLIST + P4 html/md + TODO +
  MEMORY).** Klarifikasi user 26 Sep: `P4-PROPOSAL-KONSINYASI.md`
  (sumber md) KINI ikut di-update agar md ≡ html (divergence =
  risiko audit).

### UI/UX audit high-priority: perbaikan P1–P4 (26 Sep)
- **P1 font**: 'Plus Jakarta Sans' dideklarasikan di
  `tailwind.config.ts`/`globals.css` tapi TIDAK PERNAH di-load
  (tanpa @import/fontsource) → app render pakai system font.
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
- **P3 kontras WCAG AA**: `text-amber-600` → `text-amber-700` di
  20 tempat/11 file (dashboard, banner POS, badge, kartu
  hutang/piutang, migrate, zakat, laporan, `admin/data`,
  member-qr; tone Badge `amber` di `ui.tsx` ikut); pair
  `text-slate-500 dark:text-slate-500` → `text-slate-600
  dark:text-slate-400` di 26 tempat/9 file; label sumbu/legenda
  chart & 'Memuat data…' PageSkeleton (ui.tsx) diperkuat serupa.
- **P4 input & keseragaman**: keyboard numerik fisik di
  `pin-pad.tsx` (angka 0–9 = digit, Backspace = hapus, Escape =
  clear; guard: abaikan bila fokus di input/textarea/select; handler
  via ref agar listener satu-kali tetap fresh); target sentuh 44px —
  hamburger sidebar mobile & notification bell `h-9 w-9`→`h-10 w-10`;
  `tabular-nums` pada nilai kartu dashboard, blok totals/mix/
  close-shift POS, rata-rata chart; `role="alert"` pada paragraf
  error login + PIN auth + PIN setup; `prefers-reduced-motion` kini
  mematikan juga utilitas Tailwind (pulse/ping/bounce/spin);
  `manifest.json` `background_color` → `#170A0E` (brand, bukan
  putih).
- **Verifikasi**: `next build` OK (52/52 static pages, type check
  lulus). Sisa audit yang TIDAK dikerjakan hari ini (prioritas
  lanjutan di TODO): rekap kasir `GET /` tanpa data (P1 fungsional)
  & label total belanja menipu di `belanja-client` — masih open.

### UX-6 FASE I: I-6 useConfirm risk levels L1–L5 (27 Sep, commit I-6)
- `useConfirm` ui.tsx kini menerima param `risk` (default 2):
  L1 = tanpa modal (proceed langsung) · L2 = confirm biasa (15 situs
  lama tak berubah, backward-compat) · L3 = tombol merah + box
  "Dampak" (`impact[]`) · L4 = L3 + textarea alasan wajib (tombol
  disabled sampai teks non-kosong setelah `trim()`; alasan
  diteruskan ke `proceed(info?.reason)` — **V1: BELUM dikirim ke
  server; wire V2 = tambah param `reason` di DELETE `/api/audit`
  + rekam ke audit log**) · L5 = L3 + kolom `typeToConfirm`
  (ketik frasa persis, case-sensitive).
- Heuristic lama `variant={confirmLabel==='Hapus'?'danger':'primary'}`
  **PENSION** → `variant={risk>=3?'danger':'primary'}` (label
  'Hapus' lama di produk L224/L452 = soft-archive → primary aman).
- 3 situs: `/admin/kas` `removeEntry` (L3 + impact[2]),
  `/admin/audit` `purge` (L4 + alasan), `/admin/data` `resetAll`
  (L5 + ketik `RESET SEMUA DATA`). OOS: migrasi L1 utk aksi
  non-destruktif; `importJson` tetap L2.
- Backfill hash: I-2 = `8d585f4` · I-5 = `99c973c` · I-6 = `4de83fd`
  (report di seksi ini; backfill dilakukan di seksi I-8).
- Pixel-check Gus (3 item): (1) kas → box rose "Dampak" + tombol
  merah; (2) audit → textarea alasan, tombol disabled sampai diisi;
  (3) data → harus ketik `RESET SEMUA DATA` persis.
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
  `wholesale_min`/`wholesale_discount`)** — paling menguntungkan
  pembeli; dasar hitung **base_price** (deterministik); harga **manual
  kasir menang** (ora di-restore). 100% tanpa dependensi proyek.
- **Admin UI `/admin/produk`**: seksi "Harga grosir (opsional)" di
  modal form — baris tier (min_qty, discount%) + preview Rp + tombol
  tambah/hapus; simpan = `POST /api/products/[id]/prices`
  (replace-all, hanya bila seksi tier tersentuh; produk baru simpan
  produk dulu baru tier).
- **API anyar `GET/POST /api/products/[id]/prices`** (Turbo/`db.ts`):
  GET = login (POS & admin baca); POST = admin/manajer (gate
  `canAccess(user,'products')`), semantik REPLACE dalam `tx()`
  (Turso atomic batch, lokal sekuensial), validasi (min_qty int ≥ 1
  ≤ 100000, discount 0–99, duplikat min_qty → diskon terbesar,
  maks 20 tier), audit `product:wholesale` (before/after JSON),
  `invalidate('products:')`.
- **`/api/products` (GET)**: kolom anyar `wholesale` (subquery
  `json_group_array(json_object('min_qty',...,'discount_percent',...))`
  per produk, COALESCE '[]', urut min_qty ASC) — 1 round-trip, tanpa
  N+1; additive (konsumen lama tak terpengaruh). Index anyar
  `idx_product_prices_product (product_id, min_qty)` di `db.ts`.
- **POS (`pos-client.tsx`)**: `autoPrice(product, qty)` dari modul
  (tier produk + global); harga otomatis di `add`/`setQty`
  (naik/kurang qty → recompute kecuali baris manual); `setPrice`
  (input "Ubah harga") set flag `manual` — harga tidak di-restore;
  baris dihapus/ditambah lagi → balik auto; effect recompute saat
  `memberSettings` tiba (setting global bisa lambat dari produk).
  Badge: kartu grid "Grosir" (produk punya tier) + baris keranjang
  "Grosir −X%" (harga otomatis) / "Harga manual" (kasir set).
  Checkout payload `unit_price` tak berubah → struk & server tetap benar.
- **Verifikasi**: `tsc --noEmit` 0 error; `next build` 0 (route
  `/api/products/[id]/prices` terdaftar); `npm run test:wholesale`
  (anyar) 38/38; regresi semua suite PASS (margin, split, phone,
  clientip, konsinyasi, neraca, points).
- Item TODO GROSIR (`wholesale_min`/`wholesale_discount` global +
  `product_prices`) kini TERGUNAKAI — global + per-produk sudah ikut
  perhitungan POS (setting global sebelumnya memang sudah ada di
  `/admin/pengaturan-member` tapi belum terpakai).

 ### QrisClient: encoder QRIS + admin UI + monitor grosir v1 (25 Sep)
 - **QRIS (PLACEHOLDER pralayar, disetujui user):** NMID provider belum
   turun → fitur dibangun offline-first. `src/lib/qris.ts` = modul MURNI
   (TLV + CRC16-CCITT, tanpa DB/DOM/Node API; deterministik):
   `buildQris/buildQrisStatic/buildQrisDynamic/crc16Ccitt/parseQrisTlv`.
   Standar QRIS-BI: PFI 0111 statis / 0112 dinamis (+tag 54), tag
   29 'ID' + 30 NMID + 31 NMID2?, 52 MCC?, 53 '360', 58 'ID', 59 nama,
   60 kota?, 62 '1', 63 CRC (CCITT-FALSE 0xFFFF; check value publik
   "123456789"→29B1). UI `/admin/qris` (isManager, sidebar item "QRIS"
   antaraman "Kas" & "Shift & Kasir"): form NMID/NMID2/MCC/kota +
   preview QR statis 1024px (`qrcode` `toDataURL` client-side) +
   download PNG + copy payload + state "QRIS OFFLINE" bila NMID kosong;
   nama merchant = `store_name` (bukan key tersendiri). Settings key
   `qris_nmid/qris_nmid2/qris_mcc/qris_city` (default kosong di
   `SHOP_SETTING_DEFAULTS`; saveSettings hanya menulis key yang ada di
   defaults → WAJIB ada di situ; audit otomatis via `saveSettings`).
   PUT `/api/settings` validasi: nmid/nmid2 ≤32, mcc 4 digit|'', kota
   ≤30. POS mock barcode (`pos-client.tsx` L2086-2121) TIDAK disentuh
   (batch #5 scope). Test `npm run test:qris` 28/28.
 - **Monitor grosir v1 `scripts/zz-grosir-monitor.mjs`** (ops, disetujui):
   READ-ONLY. Dua mode koneksi: Turso **raw HTTP** (pola
   `backup-turso-http.mjs`, tanpa driver native) utk produksi;
   `node:sqlite` bawaan (readOnly) bila `DATABASE_URL` `file:` (dev
   lokal). Cek: row grosir 7 hari via `effectiveWholesalePrice`
   DIIMPORT dari `src/lib/wholesale.ts` (satu sumber rumus; harga
   manual kasir diflag INFO sesuai aturan 3), margin per baris
   (omzet−HPP−komisi konsinyasi), konsinyasi via
   `sales.konsinyasi/konsinyasi_commission`, audit log 7d, probe
   HTTP 5xx `APP_URL` (default
   `https://kopontren-hijrah.vercel.app`, `APP_URL=off` utk skip;
   200/401/403 = sehat). Exit 1 bila 5xx / baris rugi / DB tak
   terjangkau. Fallback skema lama (tanpa kolom P4) otomatis.
   Uji live 25 Sep: 5 route produksi bebas 5xx ✅, 0 baris rugi.

### KONSINYASI: fix 2 bug + UX perjelas form (25 Sep) — DUAL-PUSH dbc5d45
- **Bug 2 (kritis) — tombol "Terima Konsinyasi" → error "Aksi tidak dikenal"**
  (regresi P4-B `0e34c45`): `create()` di `konsinyasi-client.tsx` tidak pernah
  mengirim field `action` ke `POST /api/konsinyasi`, sedangkan server P4-B
  switch-case pada `b.action` → default = 400. Skenario nyata = klien PWA
  ber-cache LAMA (pre-P4-B) bertemu server P4-B. Fix commit `e027596`:
  client kirim `action: 'create'` eksplisit (+ validasi harga), dan server
  toleran `if (!b.action) b.action = 'create'` (defense-in-depth; semua
  aksi selain create TETAP wajib mengirim `action`).
- **Bug 1 — kolom "Rp / unit (harga perjanjian)" 0 nyangkut**: default
  `agree_price: 0` (number) → klik/ketik tak mengilangkan 0. Fix `e027596`:
  default `'' as string | number` + `placeholder="0"` + onChange raw-string
  + konversi `Number()` saat submit (kosong = 0 = valid).
- **UX Perjelas (`dbc5d45`, 1 file +208/−115):** card panduan "Cara Kerja
  Konsinyasi" (4 langkah + contoh Rp 100.000 komisi 20% = toko Rp 20.000 /
  pemilik Rp 80.000); form re-layout step 1·Pemilik / 2·Barang / 3·Harga &
  Komisi + hint sederhana tiap field; kotak "Perhitungan otomatis (per unit)"
  LIVE via `splitConsignment` (rumus PERSIS server: floor komisi, pemilik =
  harga − komisi; + baris total qty); card "Rate per-pemilik" → "Komisi
  Khusus Pemilik" (label "Komisi tersimpan:"); istilah teknis dihapus dari UI
  ("Pre-fill", "Rate", "Ujrah" → "Komisi otomatis terisi", "Komisi",
  "Pendapatan toko"); paragrah syariah disederhanakan tanpa membuang inti
  (disepakati saat titipan, tercatat otomatis saat terjual, tidak di muka,
  titipan berjalan tak bisa diubah sepihak).
- Verifikasi: `tsc --noEmit` exit 0; 7 suite semua 0 gagal (margin 57,
  phone 26, clientip 16, split 15, konsinyasi 47, neraca, points);
  `next build` exit 0. Dual-push `master`+`main` = `dbc5d45` — catatan:
  push `main` pertama REJECTED (local `main` masih `13945f4`/v16,
  origin/main = `d461ef5`; di-fix via `git branch -f main origin/main`
  + `git push origin master:main`).
- MANUAL QA tunggun user (HP): klik kolom harga → 0 hilang (placeholder),
  langsung ketik; "Terima Konsinyasi" → toast "Konsinyasi diterima &
  tercatat"; kolom komisi auto-terisi saat nama pemilik cocok.

### PWA: notifikasi update — banner "Versi anyar tersedia" (25 Sep)
- **Audit awal:** `public/sw.js` sudah `skipWaiting()` (install) +
  `clients.claim()` (activate) + marker SW-BUILD per build ✅; yang
  KURANG: tidak ada listener `message` SKIP_WAITING, dan
  `sw-register.tsx` tidak mendeteksi `updatefound` → user tak pernah
  tahu ada versi baru (SW baru aktif di navigasi berikutnya saja).
- **Implementasi (2 file):**
  1. `sw.js`: `self.addEventListener('message', …)` →
     `SKIP_WAITING` → `skipWaiting()` (eksplisit, untuk tombol Perbarui).
  2. `sw-register.tsx`: state `updateAvailable` — listener
     `updatefound` → `reg.installing` `statechange` → bila `installed`
     DAN halaman masih punya `controller` → banner; + race-check
     (`reg.installing !== reg.active` saat register). Banner kuning
     bawah layar (fixed, z-50, 44px, print:hidden):
     - **"Perbarui"** → postMessage SKIP_WAITING → tunggu
       `controllerchange` → `location.reload()`; fallback `setTimeout`
       2 detik bila event tak fire; guard double-reload.
     - **"Nanti"** → `sessionStorage['kopontren_sw_update_dismissed']`
       → banner lenyap utk sesi tab ini; muncul lagi saat aplikasi
       ditutup & dibuka ulang (load baru).
  Desain: TIDAK ada auto-reload (kasir boleh tetap mengetik; SW baru
  otomatis ambil alih di navigasi berikutnya via claim-on-activate).
- Verifikasi: `node --check sw.js` OK; `tsc --noEmit` exit 0;
  `next build` EXIT 0 (51/51 halaman); regresi 6 suite 0 gagal
  (margin 57, split 15, phone 26, konsinyasi 47, neraca 33, points 27).
- Manual QA tunggun user di HP: deploy → tutup paksa PWA → buka lagi →
  banner "🆕 Versi anyar tersedia" → tap "Perbarui" → reload versi baru;
  atau "Nanti" → lenyap; tutup PWA → buka → banner muncul lagi.

### KEPUTUSAN FINAL P3+P4 → GUS FI · A3 LIVE · v16 MENUNGGU DEPLOY VERCEL
- **P3 (tashih zakat) + P4 (proposal konsinyasi)**: keputusan user/Gus Fi (25 Sep) —
  dikirimkan sendiri oleh Gus Fi (P3 → ke ulama, P4 → ke pengurus); Cline standby
  sampai ada hasilnya. Cline tidak perlu action apa pun.
- **A3 (Neraca) KONFIRMASI LIVE di Vercel:**
  - `/api/neraca` (produksi) → 401 "Belum login" = endpoint ADA (build pr-A3 = 404);
    middleware sengaja lewati `/api/*` → 401 datang dari handler route sendiri.
  - Marker sw.js produksi kini `3f017aa7ef77` — ubah dari `4c31dc0c5819`
    (ikon fix `7e6cb37`) → build ter-deploy memuat A3 `15266cd`.
  - Konfirmasi visual tab "Neraca" di PWA = bagian user-test ② (HP).
- **v16 `13945f4` (SCHEMA_VERSION 15→16 + retry UI konsinyasi) BELUM live di Vercel**:
  push dual-branch terverifikasi (`main` = `master` = `13945f4`; git lokal bersih,
  hanya 3 CSV user untracked = material item ④), tapi marker sw.js produksi masih
  `3f017aa7ef77` (build A3) → build Vercel utk `13945f4` belum sampai production.
  CATATAN TEKNIS: marker Vercel di-stamp acak per build (`inject-sw-version.mjs`
  fallback randomBytes di env fresh — seed BUILD_ID baru dibuat `next build`
  setelah inject) → canary-nya "marker ≠ `3f017aa7ef77`", BUKAN hex tertentu.
  Tak ada Vercel CLI/token lokal → user cek dashboard (project kopontren →
  Deployments: cari `13945f4`; status Build failed/queued → baca log).
- **KABAR (25 Sep, screenshot user): v16 `13945f4` WIS LIVE di Vercel**
  (deployments: Ready + Production, branch `main` & `master`). Form konsinyasi
  nang HP: kolom Komisi Toko (%) muncul (P4-B live); statistik 0/0/0 render
  normal → `/api/konsinyasi` produksi OK → migrasi Turso v16 wis keeksekusi
  (kolom `commission_rate` kedherek; menawi gagal kudu 500 "no such column"
  + tombol "Coba lagi").
- **Anomali sw.js (pentang kanggo canary):** probe langsung produksi
  `/sw.js` (curl, 25 Sep) → header `age: 37220` (≈10,3 jam, pr-v16) +
  `cache-control: public, max-age=0, must-revalidate` → edge Vercel isih
  nyebar sw.js basi (marker isih `3f017aa7ef77`). Marker git v16 =
  `67561e9c440e` (owah saka `05c129e243ec` commit 13945f4); nilai riil
  build Vercel = stamp random anyar (inject-sw-version). Dadi canary
  "marker ≠ `3f017aa7ef77`" kudu ditindak sawise edge re-validate /
  deploy sabanjane — PWA HP entuk SW anyar nalika muat maneh. Mboten
  blocker; kode app v16 wis live (runtime serverless tiasa stale-cache).

- **Checklist pasca-deploy v16 (user)**:
  1. Reload PWA di HP (SW update — marker baru)
  2. Buka /admin/konsinyasi → request AUTH pisanan memicu migrasi Turso v16
     sekali jalan (cold start ±15–20 s; request anonim ora njampuh DB)
  3. Error transien → tombol "Coba lagi" (retry UI v16)
- **Roadmap final (25 Sep):**
  - Engineering WIP = 0. "A4 (Jam Sibuk)" TIDAK ada di roadmap — "A4" = Top
    produk (✅ sudah bangun); bagian "Jam Sibuk" tak pernah dipplanning (0 hit
    kode/docs; dikonfirmasi 24 Sep).
  - TUNDA (keputusan user): QRIS asli (NMID) · grosir · `point_history`
    (redemsi poin).
  - `[r]` risiko rendah diterima: throttle XFF per-instance · PII GET
    `/api/audit` · `cash_low` monitoring · validasi `pay_split` import backup
    (TER-KUNCI 25 Sep: `normalizeSaleImport` + test:split) · ZAKAT known
    issues ±7 jam UTC (boundary laba + CSV riwayat DIFIX 25 Sep; sisa
    `reports/csv` timestamp kosmetik).
  - P5 (denda) = di luar cakupan (tak pernah diimplementasi; tak perlu dibangun).
  - Sisa non-engineering: ② uji manual HP · ③ checklist /admin/zakat ·
    ④ upload CSV ke Turso · P3/P4 (Gus Fi).
  - ① test ikon PWA Edge sudah LULUS 24 Sep.

## 2026-09-25
### Batch integrity #1 + #3 (25 Sep, ACC Gus Fi)
- **#1 validasi pay_split import backup** — audit nembokake logika wis
  ana (Batch F, inline `backup/route.ts`); diekstrak dadi helper murni
  `normalizeSaleImport` (`src/lib/pay-methods.ts`, semantik identik:
  JSON well-formed + whitelist `cash/tf/wa` + Σ===total → simpan;
  mung → null legacy; `amount_paid` ≥ total; `change` cash mung).
  Lock: `test:split` **22 checks** (7 anyar).
- **#3 zakat WIB (±7 jam)** — bug: `created_at >= 'YYYY-MM-DD'` (tgl
  WIB) vs ISO-UTC → periode miwiti 07:00 WIB. FIX: modul murni
  `src/lib/zakat-period.ts` (`wibDayStartUtc`, `currentWibMonthDate`,
  `wibToday`, `isoToWib`); `/api/zakat` query laba+COGS pake
  `wibDayStartUtc(period_start)`; CSV riwayat kolom `paid_at (WIB)` +
  nama file `wibToday()`. Lock: `test:zakat` **18 checks** (anyar).
- TSC exit 0 · build OK · `npm run test:split` + `test:zakat` ALL_PASS.
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
  menulis `8cedb6b` — hasil git log/ls-remote = `9dbc22c`).
- **Sinkronisasi main (temuan saat konfirmasi):** `origin/main`
  masih `0e34c45` (tertinggal), `origin/master` = `9dbc22c` →
  dual-push `git push origin master:main` → kini `origin/main` =
  `origin/master` = `9dbc22c`. Vercel (build saka `main`) kini
  deploy seluruh seri 24 Sep (P4-A/B + P3 + terminologi + 24K +
  dokumen).
- Keputusan Gus Fi: P3 → kirim ulama (tashih zakat); P4 → kirim
  pengurus (keputusan konsinyasi); update setelah keputusan.
- Sisa item tersusun: tashih P3 (3 pertanyaan: haul, verifikasi
  harga emas 24K, modal HPP vs pasar) · keputusan P4 pengurus +
  tashih ulama basis ujrah V1 · user-test ② uji manual pasca-deploy
  nang HP · ③ checklist /admin/zakat 10 item (TODO L259–268; item 9
  = sub-test "Bug #1 (A1–A5)") · ④ upload CSV ke Turso sendiri ·
  [r] risiko rendah diterima (termasuk `cash_low` monitoring) ·
  TUNDA: QRIS (NMID) · grosir · point_history.
### KONFIRMASI FINAL GUS FI + CHECK A2/A3/A4 (24 Sep, pasca P4-B)
- P4-B `0e34c45` KONFIRMASI OK: 8 file +360/−36; tsc 0, build 0,
  `test:konsinyasi` 47/47, regresi `test:margin` 57/57 +
  `test:split` ALL_PASS. Chain lengkap: P4-A `4f12818` → P4-B
  `0e34c45` → P3 `9dbc22c` → docs `d1c0c7e`/`6c6ab64` (main=master).
- **Check "sisa A2/A3/A4?" — JAWABAN BUKTI KODE:**
  - A2 (Arus Kas) = **SUDAH BANGUN**: `/admin/kas` (jurnal + auto),
    dashboard admin "Arus Kas 7 Hari", WA push pengurus "Arus Kas
    30 Hari", kartu "Arus kas neto" di laporan, `keuangan.ts`
    (scope eksplisit fase A2; piutang/hutang sengaja keluar —
    itu cakupan zakat, bukan kas).
  - A4 (Top Produk) = **SUDAH BANGUN**: seksi "Top produk"
    `laporan-admin-client.tsx`.
  - A3 (Neraca) + A4 bagian "Jam Sibuk" = **TAK PERNAH
    DIPLANNING** (0 hit di TODO/MEMORY/SYARIAH-CHECKLIST + kode)
    → bukan sisa WIP; hanya request baru kalo Gus Fi mau.
  - A1 (P&L Laba-Rugi) = SELESAI `0564e71` (MEMORY L1159).
- **① Test ikon PWA Edge = LULUS 24 Sep** (TODO L603) → sisa
  user-test tinggal ② HP + ③ checklist zakat + ④ upload CSV.
- **0 WIP engineering**: working tree bersih utk kode/docs; sisa
  hanya ` M public/sw.js` (artefak lokal — JANGAN commit, policy
  PWA; Vercel stamp sendiri) + 3 CSV user untracked
  (`_products_update.csv`, `stok-export-20260923.csv`,
  `stok-import-admin-20260923.csv`) = material item ④.
### P4 Konsinyasi + komisi store / akad WAKALAH BIL UJRAH (24 Sep, FASE P4)
- Keputusan pengurus: komisi toko 20% dr harga jual. Akad
  **wakalah bil ujrah** (koreksi 24 Sep dsr riset Syafi'i + Bahtsul
  Masail; ref. Fatwa DSN-MUI No. 113/DSN-MUI/IX/2017): toko = wakil
  pemilik, upah TIDAK di muka, hanya terhitung saat barang terjual;
  barang dikembalikan (ora payu) tanpa komisi; pemilik dapat 80%.
  (Awalnya tertulis "ju'alah" — dsr Syafi'i, bentuk "laku = beli,
  tidak laku = kembali" = gharar → BUKAN ju'alah; mekanik tidak
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
  Titipan aktif TIDAK bisa diubah rate-nya oleh app (snapshot —
  tanpa perubahan sepihak; utk ubah: tutup → titip ulang, musyawarah).
  Helper `resolveCommissionRate`/`parseOwnerRates` (lib/konsinyasi.ts,
  tanpa dependensi); audit create + `commission_source`.
- `src/lib/konsinyasi.ts` (helper murni): `clampRate` + `splitConsignment`
  (komisi floor per unit; pemilik + komisi = harga persis, tanpa pecahan).
- `/api/konsinyasi`: tagihan pemilik NETO komisi; action `sell` mencatat
  OTOMATIS kas masuk `Ujrah Kon. <pemilik> - <barang>` = qty × komisi
  unit (hanya jika >0) + invalidate kas/reports.
- Laporan: memo P&L V1 baris baru `Ujrah Konsinyasi` (keuangan.ts,
  UI P&L, WA rekap, CSV). Catatan V1 baru: JANGAN catat manual —
  otomatis, anti dobel hitung.
- Backup: kolom `commission_rate` ikut export/restore (backup lama
  tanpa key → 20).
- UI konsinyasi: badge "Komisi toko X% · Ujrah Rp …", "Tagihan pemilik",
  hint akad wakalah bil ujrah dr `commission_rate_default`.
- Verifikasi: `tsc --noEmit` exit 0; `test:konsinyasi` 47/47
  (P4-B: parseOwnerRates + resolveCommissionRate); `test:margin`
  57/57; `test:split` ALL_PASS; `test:clientip` 26 ok; `next build`
  sukses.
- Dokumen `P4-PROPOSAL-KONSINYASI.md` (24 Sep): proposal pengurus —
  tabel opsi deliberasi + permohonan keputusan + risiko/penahan.
  Status: menunggu approval pengurus; tashih sisa → ulama.
- TASHIH tersisa utk ulama (BASIS UJRAH — hasil riset 24 Sep): V1 =
  % harga PERJANJIAN (ma'lum → SESUAI Syafi'i); harga jual aktual =
  gharar dlm Syafi'i klasik (DSN-MUI No. 112/DSN-MUI/IX/2017
  membolehkan persentase asal disepakati & diketahui; alternatif:
  ujrah mitsli). V1: komisi dr harga perjanjian — konsisten, harga
  jual tidak direkam terpisah; off-sales.
### P4-Tashih + P3 Zakat (riset Syafi'i & Bahtsul Masail, 24 Sep 2026)
- **Koreksi akad konsinyasi: ju'alah → WAKALAH BIL UJRAH** — dsr
  madzhab Syafi'i, bentuk "barang laku = dibeli, tidak laku =
  kembali" = gharar (Ibnu Qudamah al-Mughni; Syekh Ibnu Utsaimin)
  → akad yang tepat: pemilik (muwakkil) memberi kuasa ke toko
  (wakil) utk menjual + upah (ujrah). Ref. Fatwa DSN-MUI No.
  113/DSN-MUI/IX/2017. Mekanik & data TIDAK berubah; hanya
  terminologi UI/dokumen/komentar kode yang disetel.
- **Komisi 20% = sah** — komisi persenan = ujrah ma'lum (mayoritas
  Bahtsul Masail HIPJAS VI 2023, Hasyiyah al-Jamal; sejalan
  DSN-MUI No. 112/DSN-MUI/IX/2017: persentase boleh asal jelas &
  disepakati kedua pihak).
- **Zakat: harga emas = 24 KARAT MURNI** — Muktamar NU ke-35:
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
  cache-first nang SW v11 + Windows icon-cache → .ico taskbar PWA
  kothakan putih, stuck (PWA terinstall di periode rusak).
- **`608074d` (master+main):** regen `public/icon-180.png`
  (11,493 B = logo ✓ pixel-inspected sharp) + `?v=2` cache-busting
  (`manifest.json` + `apple-touch-icon` di `layout.tsx`) + aturan
  cache ikon/logo/logo → `max-age=86400` (ora immutable global).
- **`7e6cb37` (master+main):** aturan ikon/logo `next.config.mjs`
  diganti source EXACT (`/icon-180.png`, `/icon-192.png`,
  `/icon-512.png`, `/logo-kopontren.svg`, `/favicon.ico`,
  `/manifest.json`) — pengganti wildcard `/(icon|logo)-:path*`
  sing curiga bikin build Vercel stall/queue stuck.
- **Verifikasi lokal:** `tsc --noEmit` exit 0 + `npm run build`
  EXIT 0 (48 page) ngemuhi config anyar (Register-ScheduledTask +
  `.build-out4.txt` = `BUILD_EXIT=0`). stamp sw.js lokál
  `c0aac38143af` = artefak build, JANGAN commit.
- **Cutover Vercel LIVE (~14:30 24 Sep):** sw.js
  `SW-BUILD 4c31dc0c5819`; `icon-180.png` live = 11,493 B ✓;
  `manifest.json` live `?v=2` ✓; ikon/logo/favicon CC =
  `public, max-age=86400` ✓; `/sw.js` = `max-age=0,
  must-revalidate`; `/_next/static/*` tetep `immutable` ✓.
- **Test user "Nuclear Reset" LULUS (24 Sep):** uninstall PWA +
  hapus folder Edge (`Chrome (PWA)`/`Default\Service Worker`/
  `Cache`/`Code Cache`) + `iconcache*.db`/`thumbcache*.db` →
  `ie4uinit.exe -show` → reboot → clear browsing "All time" →
  install maneh → **logo taskbar KATON ✓ + Start menu KATON ✓ +
  PWA fungsional ✓**. Item PWA/Favicon TUTUP — 0 engineering.
- **Prosedur "nuclear reset" kanggo user (UDH LULUS — saka
  reference bilangan kali balik gagal):**
  ① Uninstall PWA (klik kanan shortcut taskbar/Start → Uninstall)
  ② Tutup Edge total → hapus `%LOCALAPPDATA%\Microsoft\Edge\User
     Data\Chrome (PWA)` + `Default\Service Worker` + `Default\Cache`
     + `Default\Code Cache` + `%LOCALAPPDATA%\Microsoft\Windows\
     Explorer\iconcache*.db` & `thumbcache*.db` → `ie4uinit.exe
     -show` → reboot
  ③ Edge → Clear browsing data "All time" (cached images + site
     data/service workers)
  ④ Install PWA maneh → ikon taskbar/Start menu = logo (detail
     kelèk: TODO.md seksi "PWA / Favicon").
### Cleanup file scratch root (24 Sep, commit `ba5f272`)
- 113 file scratch dihapus nang root (SEMUA untracked/gitignored —
  aman, tak anatracked yg kena): `.audit-*.txt` (17),
  `.build-*.txt`+`.tsc-*.txt` (7), `_*.txt`/`_*.log`/`_*.json`
  (88), `*.log` top-level (6: swc, build_utf8, build-check,
  build-payables, rebuild_bs, server2.err). Root: 119 → 24 file.
- 6 `.mjs` DIPINDAH ke `desktop-archive/` (gitignored, tetep
  available — ora dihapus): `_txlib.mjs` + `_probe4.mjs`
  (bukti bug `tx()` — sesuai komentar .gitignore "Bukti yg
  di-retain") + 4 tool sesi (`_extract-pdf.mjs`, `_pdf2csv.mjs`,
  `_fetch-products.mjs`, `_gen-stok-csv.mjs`).
- `.gitignore` +3 pattern (`.audit-*.txt`, `.build-*.txt`,
  `.tsc-*.txt`) biyara sesi mangkase tak numpuk untracked maneh.
- JANGAN HAPUS (udh dijaga): CSV data user (`stok-*.csv`,
  `_products_update.csv`), `src/`, `public/sw.js` (artefak build —
  JANGAN commit; Vercel nglewati dhewe), `public/icon-*.png`,
  script user (`build.ps1`, `smoke.ps1`, `server.ps1`,
  `rebuild.bat`), `state.txt` + `DEPLOY-VERCEL.txt` (TRACKED —
  hapus bakal ngrusak git history). `scripts/zz-*` = kosong.
- Verifikasi pasca-cleanup: `tsc --noEmit` EXIT 0 + `next build`
  EXIT 0 (48/48 page). Catatan: `npx` PS kena ExecutionPolicy —
  pakai `node node_modules\typescript\bin\tsc` /
  `node node_modules\next\dist\bin\next build` langsung.
### Batch F: integrity `1a07ed1` + tz WIB `c392237` (perbaikan audit)
- **integrity (commit `1a07ed1`)**: `amount_paid`/`change` tak lagi
  dipercaya dari klien. POST /api/sales: `amount_paid = max(total,
  paid)` (partial paid tak mungkin lagi) + `change` di-recompute
  server (cash = paid−total; tf/wa/split = 0). POST /api/backup
  (import) dinormalkan identik (`paidNorm`/`changeNorm`) agar
  restore tak memvalidasikan kembali inkonsistensi. Alur
  offline-queue tak berubah — clamp hanya di sisi penerima.
- **tz WIB (commit `c392237`)**: boundary periode kini WIB (UTC+7),
  bukan tengah malam UTC: cutoff overdue `payables/route.ts`,
  `piutang-client` + `hutang-client` (baca timezone device),
  `laporan-client`, `reports/csv` (`startOfDayJakarta` →
  `T00:00:00+07:00`). Akar bug periode lama: regex server menolak
  tanggal ISO-UTC penuh, sehingga parameter periode terabaikan
  diam-diam & semua query tercap 365 hari.
- **F-1 (audit Batch F): ditandai STALE — tanpa perubahan kode.**
  Re-verify menunjukkan temuan tak lagi berlaku; hanya tercatat di
  MEMORY.md + TODO.md.
- Verifikasi: `tsc --noEmit` EXIT 0 + `npm run build` EXIT 0
  (kedua commit). Dual-push `master` + `main` (keduanya kini
  `c392237`). `public/sw.js` TIDAK ikut commit (aturan: Vercel
  stamp sendiri). Test PWA Edge taskbar masih **PENDING hasil**
  (lihat TODO seksi "PWA / Favicon").
- **Catatan lingkungan dev (verified 24 Sep 2026, diuji 4×):**
  - Proses panjang (mis. `npm run build`, `tsc`) **kudu** dijalankan via
    **`Register-ScheduledTask`** (trigger *Once* di now+2 detik,
    RunLevel Limited, `-ExecutionPolicy Bypass` di dalam action
    `cmd.exe /c`). Satu-satunya mekanisme yg survive close terminal
    di environment Cline chat ini.
  - **Jangan andalkan `Start-Process`, anak proses, atau
    `schtasks /create /on`** — mereka mati setiap terminal session
    ditutup (build-nya tidak jalan, hanya script pembuatnya yg
    sempat jalan).
  - Jebakan: `Unregister-ScheduledTask -TaskName X` memunculkan
    prompt interaktif konfirmasi `[U/Y/A/C]` (tanpa `-Force`) —
    pakai `-Force` / jawab `Y`.
  - Pola task: action = `cmd.exe /c "cd /d <repo> & tsc --noEmit
    > .o.txt 2>&1 & npm run build >> .o.txt 2>&1 & exit /b 0 >
    .done.txt"`; verifikasi lewat file output, karena command
    foreground akan timeout sebelum build selesai.
- **FINAL (24 Sep 2026) — konfirmasi 4 commit, engineering TUTUP 0 sisa.**
  Head `8ba2885` (`origin/master` = `origin/main`): `1a07ed1`
  (integrity) · `c392237` (tz WIB) · `f6ccfbc` (docs Batch F) ·
  `8ba2885` (docs lingkungan). FASE 2+3, Batch B–F: semua live.
- **Sisa `[r]` risiko rendah (diterima, BUKAN bug — TODO.md L98–232):**
  1. throttle login keyed `X-Forwarded-For` (per-instance, bisa
     dirotasi) — accepted; mitigasi PIN 3× salah → sesi dimusnahkan
     + lock 5 mnt.
  2. GET `/api/audit` menampilkan `old_value/new_value` (termasuk
     PII member) ke tier pengurus — sesuai desain role internal;
     tinjau bila perlu.
  3. `cash_low`: pemicu `notifyCashBalance()` hanya monitoring,
     tanpa aksi otomatis — diterima.
  4. Validasi `pay_split` saat IMPORT backup (🟠 review) —
     opsional; POST /api/sales kini sudah dinormalisasi (`1a07ed1`),
     import backup punya guard dasar.
  5. ZAKAT known issues (TODO L113): export CSV riwayat + boundary
     periode laba masih basis UTC (`created_at >= date-only`
     leksikografis) → meleset ±7 jam; **`c392237` TIDAK menutup
     ini** (6 file: payables/reports-csv/2-client/laporan-client/
     format.ts saja). Sisa tracked [r].
- **TUNDA (keputusan user, 3 fitur):** QRIS resmi (NMID belum
  siap) · grosir/perks member · `point_history` (loyalty).
- **User-test PENDING hasil (4):** (1) test ikon taskbar PWA di
  Edge — user handle 24 Sep: uninstall → clear site data → restart
  Explorer → install ulang → cek logo; jika gagal → debug sesuai
  TODO L333–343 (`chrome://serviceworker-internals`,
  `chrome://components`, flag `edge-automatic-https-encryption-
  disabled`). (2) uji manual pasca-deploy nang HP (22 Sep).
  (3) checklist `/admin/zakat` 10 item (TODO L259–268).
  (4) upload CSV ke Turso sendiri.

## 2026-09-23
### Batch E: keyboard-nav tablist (APG) + sync audit a11y
- `4545e4d` (master) — helper `useTablistNav` di `ui.tsx` (ArrowRight/Left
  wrap + Home/End, aktivasi otomatis focus+click+setKey, import type
  alias `ReactKeyboardEvent` agar tak shadow DOM KeyboardEvent Modal);
  4 grup: admin/belanja-client (in/out L107), admin/data-client
  (backup/audit L160), admin/konsinyasi-client (active/done L333),
  POS kategori (tablist L1154 + pill `role="tab"`/`aria-selected`,
  getKey i→i===0?'':categories[i-1]). tsc EXIT 0, next build EXIT 0
  (compile 4.8 s, Overall passed, route /admin/* ter-build).
- TODO L204: item audit a11y UI lama (Modal ✕/ESC/focus-trap,
  skeleton kontras, panel hotkey, Toast aria-live) ditandai [x] —
  sudah live @ `c364b2c` (+ batch 5 hotkey POS F6–F9 & cheatsheet `?`),
  diverifikasi 23 Sep: grep 0 sisa + `git merge-base --is-ancestor`.
- ⚠️ TRAP KETEMU: working copy pagi ini sempat berisi modifikasi
  BELUM ter-commit (belanja-client 2-tablist inTab/outTab ~550 baris
  vs HEAD 266 baris single-tab; imports ui.tsx beda). Semua kerja
  di atas berbasis HEAD `46708a1`. Jika ada perubahan lokal yg
  belum di-commit di mesin lain, itu belum masuk repo.
- Vercel: live production @ `46708a1` terkonfirmasi (HTTP 307→/login,
  buildId baru `UOsfn6k55w3NuzxN8AV64`, bukan pre-21 Sep
  `GCE-OvNduy2JlV5shvyiS`). Dashboard "Ready @ 46708a1" = cek user.

## 2026-09-21 — Kopontren Al Ittihad (kasir & pembukuan)

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
  `settings:member`, `audit:tables`, `notif:list:<…>`, `reports:hourly:<from>` (Batch #5, jam sibuk)), jadi
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
- **Guardrail sw.js (26 Sep — keputusan user, commit docs
  `2bd27a1`/`10c8e87` telah ikut memuat stamp — HARMLESS):**
  `public/sw.js` = **source file with build stamp**, BUKAN pure
  artifact (di-stamp in-place tiap `npm run build`). Keputusan:
  **tetap tracked (Option A) + guardrail `skip-worktree`**.
  Nilai stamp ter-commit **tidak memengaruhi production** —
  Vercel selalu re-stamp di cloud build. Disiplin:
  1. **JANGAN commit `public/sw.js` versi ter-stamp**; sebelum
     commit: `git checkout -- public/sw.js`.
  2. Clone `D` memakai `skip-worktree`
     (`git update-index --skip-worktree public/sw.js`) agar
     mutasi stamp lokal tak men-`pollute` status.
     **KHUSUS clone `D` — JANGAN terapkan di clone `kp`.**
     (Perintah bersifat per-clone; cek dengan `git ls-files -v |
     Select-String '^S'`.)
  3. Follow-up (BELUM, terpisah): refactor template-generate —
     `public/sw.src.js` sebagai template ter-track;
     `inject-sw-version.mjs` MEN-GENERATE `public/sw.js`
     (template+stamp); `public/sw.js` masuk `.gitignore`. Lihat
     item di TODO.md.

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
- **Known issues:**
  - ✅ (25 Sep, batch #1+#3) Batas periode LABA zakat TIDAK LAGI
    perbandingan UTC mentah: 00:00 WIB dikonversi 17:00 UTC hari
    sebelumnya via `wibDayStartUtc` (`src/lib/zakat-period.ts`); export
    CSV riwayat zakat memformat `paid_at` WIB (header `paid_at (WIB)`);
    nama file pakai `wibToday()`. Test: `npm run test:zakat` (18 checks).
  - ⏳ `reports/csv` export: timestamp masih ditulis **UTC mentah**,
    UI tampil WIB (beda ±7 jam) — kosmetik, di luar batch 25 Sep
    (belum difix).
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

## ⚠️ ATURAN POKOK — SYARIAH FIQH MUAMALAH (24 Sep 2026)

> **Prinsip: "Syariah nomer 1, fitur nomer 2."** Semua fitur BERSifat AMANAH + SYAR'I.
> Setiap fitur BARU wajib: (1) tentukan akad, (2) cek bebas riba, (3) cek bebas gharar,
> (4) cek bebas maysir, (5) cek bebas dzalim, (6) ridha/tanpa paksaan, (7) tashih ulama
> bila ada syubhat. Checklist lengkap: **`SYARIAH-CHECKLIST.md`** (root repo).

### Hasil Audit Syariah (24 Sep 2026, 6 fase, seluruh kodebase)
- **Riba: ✅ TIDAK ADA** — grep seluruh src: tidak ada bunga, denda keterlambatan, biaya
  admin tersembunyi. Piutang (debts) & hutang (payables) = qardh/utang dagang tanpa
  tambahan; pembayaran capped di sisa (overpay mustahil); due_date hanya pengingat ("Tunggak" = badge, bukan biaya).
- **Gharar: ✅** — semua akad ma'lum: harga (base_price/cost_price per produk), qty stok,
  agree_price konsinyasi, due_date, dan preview perk (diskon+redeem+cashback) dihitung
  client SEBELUM submit (rumus satu sumber: `src/lib/perks.ts`).
- **Maysir: ✅ TIDAK ADA** — tidak ada undian/lotre/giveaway.
- **Dzalim: ✅ umumnya** — penjaga marjin (perks cap = margin kotor, trim urut
  cashback→redeem→diskon) melindungi store dari penjualan rugi; manual diskon > margin
  hanya "soft-flag" (catatan minor operasional).

### Klasifikasi fiqh per fitur
| Fitur | Akad | Status |
|-------|------|--------|
| POS jual-beli | Bai' | ✅ |
| Piutang | Qardh tijari (tanpa bunga) | ✅ |
| Hutang supplier | Dayn tijari | ✅ |
| Konsinyasi | Salam al-bi' / wakalah — 100% hasil ke pemilik (agree_price), BELUM ada komisi store | ✅ (jika kelak ada komisi → ju'alah, % disepakati di muka) |
| Poin loyalty | Tawadhi'/hibah (gratis, jadi potongan, tak bisa ditarik tunai) | ✅ |
| Cashback | Ta'diyah/pengecualian utang (store-credit, tebus = potongan, tak tunai) | ✅ label "Saldo Reward" terpasang (f1, commit f4479b3) |
| Tier | Status kumulatif (badge, ambang jelas) | ✅ |
| Diskon member/grosir/ultah | Hibah (ultah = tawadhi') | ✅ |
| Retur | Khiyar 'aib/syarat | ✅ DITRIM (f2): retur 100% membatalkan poin & saldo reward transaksi tsb (ledger 'return'/'return_cash', plafon MAX(…−?,0) anti-negatif) |
| Zakat tijarah | Kewajiban | ❓ formula periodik (laba sejak last_zakat_date; modal @ HPP; harga emas manual) → perlu tashih ulama |

### Keputusan terikat (WAJIB, sampai tashih ulama)
1. **JANGAN** implementasi denda keterlambatan sebagai pendapatan store (haram).
   Jika butuh insentif ketepatan waktu → uang ke kas amal/pondok (ta'zir sosial).
2. **JANGAN** tambah undian/lotre/giveaway maysir.
3. **JANGAN** bikin penarikan tunai cashback/poin (tetap store-credit).
4. UI: label "Cashback" → **"Saldo Reward"**, "Poin" tetap. ✅ SELESAI (f1, 24 Sep 2026, commit f4479b3).
5. Fix minor: balikkan poin/reward saat retur penuh ✅ SELESAI (f2, 24 Sep 2026, commit f4479b3).
   Detail: `returns/route.ts` cek "notFull" (semua item sudah diretur penuh), lalu ambil
   SUM delta `point_history` scope sale_id untuk reason 'earn' (poin) & 'cashback' (rupiah)
   → tolak pakai `MAX(points−?,0)` / `MAX(cashback_balance−?,0)` + jejak 'return'/'return_cash'.
   `sales/route.ts` tak perlu diubah (sudah menulis 'earn' & 'cashback' per sale_id).
   Bonus: sign error void di `sales/[id]/route.ts` (cashback_balance + bukan −) ikut dibetulkan.
6. Tashih ulama: (P3) formula zakat — haul 1 tahun tetap, laba konservatif, harga emas;
   (P4) skema komisi konsinyasi bila store mau margin.

### Status FASE A1 (P&L UI) — SELESAI & COMMITTED (0564e71, 24 Sep 2026)
- `laporan-admin-client.tsx`: import + tipe (LabaRugi, PlPreset, PlRow, plPresetRange,
  plPeriodLabel) + shell tab "Ringkasan|Laba-Rugi" ✅. **LabaRugiTab body SELESAI** (blok 24 Sep 2026):
  tab menampilkan: preset 1/7/30/bulan/tahun + rentang custom, statement bruto→bersih→HPP→laba kotor→
  beban (accordion byCategory)→laba bersih, blok Memo di luar laba, kotak Catatan V1, tombol Bagikan WA.
- Backend A1 juga sudah ada: `src/app/api/keuangan/` + `src/lib/keuangan.ts`
  (queryKeuangan + KEUANGAN_NOTES), `rekap.ts` (+ buildLabaRugiWa, label 'Saldo Reward').
- tsc --noEmit ✅ & next build ✅ (24 Sep 2026). Kode commit `0564e71` (4 file) —
  approval user (tes manual P2 rollback + tab Laba-Rugi: preset, rentang custom, bagikan WA).
- Lanjut (non-eng, ditanam user 24 Sep 2026): P3 tashih ulama (zakat) — user siapin dokumen tashih · P4 keputusan pengurus (konsinyasi/ju'alah) — user siapin proposal · P5 ✅ (denda tak pernah diimplementasi) · ②③④ tes manual.
- Follow-up (24 Sep 2026, commit 552c8e2): label sisa P1 — `perks.ts` soft-flag,
  `rekap.ts` baris WA rekap ("Saldo Reward"), SYARIAH-CHECKLIST P1/P2 ✅.
  Label CSV P&L (`api/keuangan/csv/route.ts`) ter-commit di A1 `0564e71`.

## Fix "Kesalahan Jaringan" Neraca + Fitur Riwayat Poin (24–25 Sep 2026)

### Fix Kesalahan Jaringan (tab Neraca) — SELESAI & DUAL-PUSH
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

### Fitur: Riwayat Poin & Reward per member (point_history) — TERVERIFIKASI LOKAL
- Ledger `point_history` (tertulis POST /api/sales + DELETE /api/sales/[id],
  sejak fitur redemsi 23 Sep) kini punya LAYER TAYANGAN.
- Endpoint baru `GET /api/members/[id]/points?limit=&offset=` (tier 'member':
  admin/manajer; limit default 20 maks 50; tanpa cache; JSON 500 on error —
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

## ⚠️ ATURAN BAKU NGUDI SUSILO (24 Sep 2026, WIS DIBACA)

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
   nol rancangan lama (baca dulu, kerja di atasnya); file baru → folder lembaga yang sesuai.
3. **RAMBU FIQIH (PALING UTAMA)**: **JANGAN menyimpulkan hukum fiqih sendiri** — bukan
   wewenang AI. Sebut kitab + bab bila merujuk; bila tak yakin, KATAKAN TIDAK YAKIN.
   Membantu berpikir, bukan menetapkan hukum. Gono-gini = bahan musyawarah, bukan fatwa qath'i.
4. **JANGAN mengarang angka** — data tak diketahui → bilang tidak tahu, periksa ke sumber.
5. **Data pribadi = amanah** (nama santri, no. HP wali, identitas anggota, mustahik, anak
   asuh) — jangan ditempelkan ke luar.
6. **Sistem produksi via Mas Eko** (pengguna meminta; AI merumuskan permintaan dengan jelas).
7. **Keputusan koperasi (akad, SHU, harga) ada forumnya** — Pengurus & RAT; AI hanya
   menghitung & menyiapkan usulan.
8. **Bila ragu, bertanya.** Kekeliran sendiri → koreksi terus terang.

### Prinsip utama (PRINSIP JANGKAR, semua lembaga)
- Usaha = **jalan ngaji** (dunia + akhirat).
- **Halal & thoyyib bagi semua pihak**, bukan cuma lembaga.
- **Meringankan, bukan menekan** — barokah di atas hitungan.
- Adab pesantren jadi bingkai, termasuk urusan teknologi.
- **Aspek syar'i & muamalah WAJIB tashih ulama.**
- Setiap orang yang terlibat unit muamalah (pengurus, anggota, nasabah) **wajib mengaji/
  memahami muamalahnya lebih dulu** (dhawuh Gus Fi 23 Ags 2026) → aplikasi unit usaha
  perlu komponen edukasi/literasi muamalah, bukan cuma fitur transaksi.

### Konfirmasi
Setiap perintah yang menyalahi aturan baku KUDU dikonfirmasi ulang ke user sebelum
dieksekusi. Cek terakhir (24 Sep 2026): audit syariah + file `SYARIAH-CHECKLIST.md`
sesuai aturan (tashih ulama tetap jalur pemutus; AI tidak menetapkan hukum). ✅

### Ringkasan
- Folder: `D:\Ngudi Susilo\` (root proyek; repo kita = `D:\Ngudi Susilo\kopontren-app\`)
- File aturan: `CLAUDE.md` (dasar, auto-read), `README.md` (peta induk ekosistem),
  tiap lembaga punya `CLAUDE.md` sendiri. Operasi: `PASANG-DI-LAPTOP-GUS-FI.md`,
  `SUDAH-PINDAH.md`, `DAFTAR-GARAPAN.md`.
- Prinsip: halal-thoyyib · meringankan · adab pesantren · tashih ulama wajib · muamalah
  didahului literasi.
- Ekosistem: YPI Ngudi Susilo (induk) → PP Al Ittihad, Sekolah Formal, Madin & TPQ, Panti
  Asuhan | Kopontren, BMT, Berkah Tour, Agribisnis (unit usaha) | PT Sewangi Hati N. (F&B).
  **Aturan baca: pondok SEJAJAR unit usaha, tidak menaungi.**

### Siap
Cline siap konfirmasi ulang kalau ada perintah menyalahi aturan baku. ✅
## Sesi 25 Sep 2026 — Batch #4 UX polish + reports/csv WIB (ACC Gus Fi)

- **Konteks**: setelah Batch #1 (pay_split import, `0dbecf4`) + #3 (zakat WIB,
  `54b22e6`) terverifikasi LIVE, Gus Fi ACC #4 = Phase 2 UX + fix
  low-priority `reports/csv` UTC. #2 `stock_opname` dikonfirmasi selesai
  (drop 24 Sep, `c46f4fa`).
- **Hasil**:
  - P3 teks "Menu pengurus … navigasi atas" (`src/app/page.tsx` L279) →
    diupdate: "menu navigasi — baris atas di desktop, tombol hamburger di
    layar kecil".
  - P3 dropdown filter user `/admin/audit` (sebelumnya hanya user dari 50
    log pertama) → **fix server-side**: `GET /api/audit` kini kembalikan
    `users` dari tabel `users WHERE active=1` (cache 60 dtk `audit:users`);
    `audit-client.tsx` pakai `data.users` + fallback turunan log (kompat
    respons lama).
  - P3 hint `pin/setup` → **TERVERIFIKASI SUDAH ADA** sejak Batch C
    (banner amber "Tak bisa cek sesi — lanjutkan saja…",
    `src/app/login/pin/setup/page.tsx` L147-152). Tak ada kerja.
  - Keyboard-nav tablist (APG, 4 grup) → **TERVERIFIKASI 4/4 terwired**
    (belanja in/out L41, data backup/audit L36, konsinyasi L62, POS
    kategori L227; hook `useTablistNav` di `src/components/ui.tsx`).
  - `reports/csv` timestamp UTC mentah → helper baru `utcToWib()` di
    `lib/format.ts` (pure UTC+7, deterministik, tak tergantung TZ mesin);
    kolom CSV kini `created_at_wib` ('YYYY-MM-DD HH:MM').
- **Commit + push**: `61dadd4` polish(ux) + `74f704d` fix(reports/csv) +
  `349ffa0` docs, dual-push `master` + `main` → Vercel auto-deploy.
- **Verifikasi**: `tsc --noEmit` exit 0; `test:split` 22 + `test:zakat`
  18 + `test:wholesale` PASS; `next build` EXIT 0 (SW-BUILD
  `a228a8be2623`).
- **Catatan gotcha**: `npm`/`npx` PowerShell kena execution policy →
  `npm.cmd`/`npx.cmd`; `git push 2>&1` muncul NativeCommandError (kosmetik)
  tapi push sukses; `src/components/ui` itu FILE `ui.tsx`, bukan dir —
  grep dir kosong menipu.
- **Dikonfirmasi LIVE 25 Sep (ACC Gus Fi)**: uji manual 3 item lolos
  (dropdown user audit, kolom `created_at_wib`, teks dashboard mobile).
  Batch #4 resmi ditutup.
## Sesi 25 Sep 2026 — Batch #5: Kartu Membership + Jam Sibuk (ACC Gus Fi)

- **Konteks**: audit infrastruktur QR (kolom `members.qr_code` ada tapi
  tak terpakai di UI; `PATCH /api/members/[id]` `{regenerate_qr}`
  admin-only sudah ada; `lib/qr.ts` generateQrToken + keunikan token) +
  kesiapan data kartu (tier, cashback_balance, total_spent) & grafik
  (timestamp sales). Gus Fi ACC rencana 2 commit additive — tanpa
  migration DB, tanpa ubah shape API (hanya +`qr_code` di SELECT).
- **C1 — Kartu Membership** (`member-qr-badge.tsx` ditulis ulang +
  `member-client.tsx` + `api/members/route.ts`):
  - `GET /api/members` SELECT + `qr_code` (additive). Guard tier `pos`
    (admin/manajer/kasir) — kasir memang POS yang akan memindai token;
    token tidak ke log/endpoint umum.
  - `MemberQrBadge`: kartu landscape maroon (#7a1c1c) — pratinjau di
    modal + print window (`@page landscape`, font sistem, selalu
    terang). Badge tier (GOLD amber / SILVER slate), statistik
    Poin/Cashback/Total Belanja, footer baku: "Tunjukkan kartu ini
    saat berbelanja — poin & cashback (uang kembali) diterapkan
    otomatis." (basa awam + istilah asli, sesuai catatan Gus).
  - Auto-generate: `qr_code` kosong → PATCH `{regenerate_qr}` otomatis
    saat modal dibuka (peran admin; non-admin 403 → hint amber,
    placeholder "QR belum dibuat", tombol Perbarui menampilkan pesan
    403 dari server).
  - Tombol "Perbarui QR" (bukan "Ulangi") → dialog `useConfirm`
    "semua kartu lama … tidak akan berlaku lagi" SEBELUM PATCH —
    sesuai catatan syariah/data pribadi.
  - Aksi "Kartu" di daftar member (desktop antar `Riwayat|Hapus`,
    kartu mobile h-11); `onQrChanged` sinkron `qr_code` baris daftar.
- **C2 — Jam Sibuk** (`api/reports/hourly/route.ts` baru +
  `charts.tsx` + `laporan-admin-client.tsx`):
  - `GET /api/reports/hourly?days=1..365` (default 30, clamp; NaN → 30),
    tier guard `laporan` (sama persis dgn /api/reports); respons
    `{days, from, hours[24]}` tiap `{h, c, t}`; bucket jam WIB lewat
    `strftime('%H', created_at, '+7 hours')`.
  - Cache `reports:hourly:<from>` (ref-cache 60 dtk) — TERBUANG
    otomatis oleh `invalidate('reports:')` di seluruh route tulis
    (VERIFIKASI: sales POST/DELETE, kas, konsinyasi, returns, debts,
    payables, expenses; `invalidate` = startsWith prefix,
    ref-cache.ts L51-55). TTL 60 dtk = backstop multi-instance.
  - `HourBarChart` (charts.tsx): CSS murni, TANPA dependency baru.
    24 bar min-width 480px + scroll horizontal di layar HP (dipilih
    Gus vs agregasi-2-jam — sederhana & aksesibel); setiap bar
    `role="img"` + `aria-label` + `title` ("17.00–18.00 WIB · N
    transaksi · Rp X"); jam puncak disorot amber + legenda.
  - Kartu "Jam Sibuk" di tab Ringkasan (antar KPI grid & Top produk):
    label periode sinkron preset 1/7/30/365 + callout puncak
    ("Puncak: 17.00–18.00 WIB · N transaksi · Rp X"); silent-fail
    (`console.error` + teks "Gagal memuat…", tak merusak tab).
- **Verifikasi**: `tsc --noEmit` exit 0; `next build` EXIT 0 (52 rute;
  `/api/reports/hourly` ada di route table; /admin/member 138 kB,
  /admin/laporan 131 kB First Load JS).
- **Sisa uji manual (checklist Gus Fi, nang HP pasca-deploy)**:
  (1) cetak kartu member tanpa tier / silver / gold — badge & layout;
  (2) member `qr_code` kosong → modal → auto-generate → cetak → token
  discan (endpoint lookup scanner = luar scope batch ini);
  (3) preset 1/7/30/365 di Jam Sibuk sinkron; (4) role kasir →
  `PATCH regenerate_qr` 403 (halaman /admin/member sendiri tak
  terjangkau kasir — tier 'member' = admin+manajer);
  (5) 24 bar di HP → scroll horizontal.
- **Versi HTML P3 & P4 (25 Sep, ACC Gus Fi — "digawe ceklist html wae")**:
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
- **VERIFIKASI GUS FI (25 Sep, pasca Batch #5) — DITERIMA (kode):**
  Status ditandai jelas "SELESAI (kode) — nunggu uji manual HP,
  bukan produksi penuh". Cek keamanan PII yang diminta: LULUS —
  `GET/POST /api/members` guard tier 'pos' = [admin, manajer, kasir]
  (auth.ts L65): gudang/pembelian/pengurus = 403, `qr_code` tak
  bocor ke role yang tak perlu; `PATCH /api/members/[id]`
  (regenerate_qr) `isAdmin()`-only. Ceklist manual diperluas:
  (b) persistence qr_code (tutup→buka modal, QR harus sama),
  (d) 403 kasir di level API (bukan hanya UI), (e) visual-check
  scroll 24 bar (aria-label sudah ada; fallback agregasi 2-jam).
  Lanjut: lapor hasil uji HP → Gus mutusake Batch UX-1 (font,
  kontras, retry, `rp()`) vs nunggu validasi non-eng (P3/P4/NMID/
  monitor grosir); grosir v2 + QRIS asli tetep nunggu trigger.

### UX-7D/7E ACC + audit UX-8 (read-only) — 27 Sep
- **7D+7E ACC user**: commit `a844b54` (5 file, +113/−5),
  dual-push master=main. tsc 0; build 54/54 (+1 route = `/api/search`
  UX-7A, expected). **Audit-note 7D (VERIFIED, wajib inget)**:
  pengurus TIDAK akses tier `kas` (guard isManager = admin+manajer)
  MAUPUN `piutang` (allowlist ['admin','manajer','kasir']) → 5 CTA
  pengurus (Laporan/Zakat/Audit/Ringkasan/Dashboard) = Option C,
  SATU-SATUNYA pilihan valid. Jangan asumsikan pengurus bisa
  piutang/kas di fitur baru.
- **.gitignore**: `i[0-9]_*.txt` + `i[0-9]_*.cmd` + `.cline/` sudah
  masuk commit `572cb2e` (ikut 8 file SOP docs/ + dual-push) →
  request "i7_* small commit" = SELESAI via pola generik itu.
- **Hasil audit UX-8** (grep/read-only, 27 Sep):
  - **Responsive**: modifier sm:=59 / md:=18 / lg:=14 (POS sudah
    tuned: min-w-0 grid, kartu bayar 2×2, 44px, bottom-nav).
    0 modifier di: command-palette, activity-feed, notification-bell,
    low-stock-client, breadcrumb, pin-pad, dsb. → cek visual 360px
    utk palette + feed (Gus Fi).
  - **A11y**: Batch D sudah ada (aria-expanded ×3, tablist ×3,
    role=tab ×10 + aria-selected, Modal ESC+focus-trap+aria-modal,
    toast role=alert/assertive, `prefers-reduced-motion` @globals L149,
    ring focus-visible di Button ui.tsx). **GAP**: (1) keyboard-nav
    APG tablist (ArrowLeft/Right/onTabKeyDown) = **0** → Batch E
    TIDAK pernah selesai; (2) command-palette (UX-7B) = 0
    onKeyDown (tanpa panah/Enter/Escape); (3) skip-link = 0;
    (4) aria-current = 5 (sidebar OK).
  - **Perf**: N+1 sudah batched (09d5f2d), ref-cache/ttl-cache +
    invalidate('members:/products:/kas:/reports:') saat mutasi,
    API no-store, statis 1th immutable, compress + no-sourcemap.
    POS lazy (pos-lazy dynamic) → jsQR masuk chunk POS, BUKAN main.
    next/image ×6, next/font ×3. `loading.tsx` HANYA
    admin/dashboard (situs lain = PageSkeleton in-component,
    acceptable).
  - **Visual**: token T.* (hex mentah dilarang, enforced), rp()/
    fmtDateTime/fmtDate/fmtTime/utcToWib/todayWibStr terpusat
    (WIB + id-ID). Empty=74, useConfirm=25, TermTip=33,
    PageSkeleton=58. I-2 DONE: ToastTone 'critical' + 90 dtk +
    action undo (ui.tsx L449-496; dipakai produk-client ×2,
    shift-client ×1). **Sisa GAP: 3 "Memuat…" polos di
    laporan-admin-client: laba-rugi L472, jam-sibuk L325,
    neraca L616 (ErrorState sudah punya prop `tech` collapsible
    — hanya loading-nya yang belum skeleton).**
  - **Golden path (VERIFIED end-to-end)**: banner shift
    pos-client L1074-1130 → handleOpenShift L965 (POST /api/shifts,
    guard 409 kalau sudah ada open) → F4 simpan (POST /api/sales
    tx: stok−, snapshot cost, points, cashback, margin-guard,
    cache-invalidate, notifikasi) → handleCloseShift L980 (PATCH,
    hanya kasir tsb/manager; windowStats by_method + audit
    shift:close + notifyShiftClosed) → modal rekap L2182.
    /api/returns: restock guarded changes===1, rollback tx.
    **Finding utk Gus**: sales TIDAK di-gate shift terbuka
    (sengaja?) — transaksi di luar jendela shift tak masuk rekap
    shift; perlu keputusan.
  - **Financial reconciliation (KONSISTEN, tanpa takaran bug)**:
    rumus kas kanonis = /api/kas kasAgg (Σsales + cash_in −
    purchases − expenses − cash_out), dipakai juga /api/neraca
    (komen eksplisit "identik dgn halaman Kas"); rumus HPP
    snapshot SAMA PERSIS /api/reports (komen keuangan.ts L144).
    V1 DOKUMENTASI (KEUANGAN_NOTES/NERACA_NOTES, bkn bug):
    retur COGS belum dibalik; piutang/hutang = kas-only (bukan
    P&L); zakat difilter paid_at; stok dinilai cost_price
    (stok−/cost 0 diabaikan); modal "setara" ≠ ekuitas formal.
- **Rencana implementasi UX-8 (NUNGGU ACC user)**:
  - **8A** (P1, ~6 baris): 3 "Memuat…" → PageSkeleton/skeleton baris.
  - **8B** (P2, ~80-120 baris): keyboard-nav APG utk 4 grup tablist
    (roving focus + ArrowLeft/Right/Home/End) + command-palette
    (ArrowUp/Down + Enter + Escape + aria-activedescendant).
  - **8C** (P3, ~30 baris): skip-link "Langsung ke konten" +
    focus-restore pasca Modal close.
  - **8D** (opsional): loading.tsx utk /admin/laporan +
    /pengurus/dashboard; keputusan gating shift utk sales.
  - Est. 3 commit (8A/8B/8C) + dual-push; tiap commit: diff → tsc
    0 → build → push master+main. Cek visual 4 viewport (360/768/
    1024/1440) = Gus Fi, non-blocking.




