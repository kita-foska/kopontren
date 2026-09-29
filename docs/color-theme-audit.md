# Audit Warna Aplikasi + Rencana Theme (29 Sep 2026)

Fitur: kustomisasi warna aplikasi secara global (Option A — 5 preset
brand, setting global, kontrol admin). ACC Gus Fi 29 Sep 2026.
Dokumen ini = T1 dari 4 commit (lihat §10). Audit read-only,
angka diverifikasi ulang `git grep` 29 Sep (bukan dari audit
awal).

## 1. Sistem warna saat ini (3 lapis token)

| Lapis | Lokasi | Isi |
| ----- | ------ | --- |
| Tailwind config | `tailwind.config.ts` | `navy` 50–900 (netral gelap tint maroon), `accent` 100–700 (burgundy, 500 = `#7A1835` token utama), alias role `risk/success/attention/info/gold`, `wine` `#7A1C1C` (cetak kartu member) |
| CSS `:root` | `src/app/globals.css` | var light/dark (`--nbg/--nsurface/...`), `--accent` (hero/charts/canvas via `.hero-bg`, `.card-hero`), `--color-*` role utk chart |
| Token JS | `src/lib/tokens.ts` | `T.*` — sumber nilai SAJA utk konteks tak bisa kelas Tailwind (QR, canvas, `document.write` cetak, `style={}`); ATURAN UX-4: 0 hex mentah di komponen |

Kelas `accent-*` **terkompilasi statis** saat build (hex inline di
CSS utilitas) — jadi ganti tema TIDAK bisa via ganti kelas
komponen; butuh lapisan override (lihat §4).

## 2. Sensus pemakaian (verifikasi 29 Sep)

- **190** kemunculan `accent-N` di `src/` (kelas utilitas +
  `@apply` di globals.css).
- **5 tone terpakai**: `300, 400, 500, 600, 700` (skala config
  100–700, tapi 100/200 tak terpakai di source).
- Kombinasi utilitas+token base: **21** (termasuk varian alpha
  `bg-accent-500/5..15`, `border-accent-500/30..60`,
  `ring-accent-500/20..30`, `shadow-accent-500/20`,
  `bg-accent-400/20`, `border-accent-600/40`).
- Kombinasi ber-prefix varian: **9** (`dark:text-accent-300`,
  `dark:bg-accent-400`, `hover:bg-accent-500/10`, `hover:bg-
  accent-600`, `hover:border-accent-400`, `hover:border-accent-500`,
  `hover:text-accent-300`, `hover:text-accent-500`,
  `focus:bg-accent-500`).
- `@apply` di `globals.css` (kelas `.input`): `focus:border-
  accent-500` + `focus:ring-accent-500/30` — terkompilasi ke
  layer `components`; override perlu aturan khusus (§4.4).
- Lapisan override total ≈ **30 aturan CSS kecil** (30 = 21 + 9,
  semua di luar `@layer` => menang cascade vs utilitas Tailwind).

## 3. Situs hex mentah (5 tempat) + PWA

| # | Lokasi | Nilai | Status |
| - | ------ | ----- | ------ |
| 1 | `components/admin/pengguna-client.tsx` — `accent-[#7A1835]` | brand (form control `accent-color`) | **MIGRASI** T3 → `accent-[var(--ac500)]` (arbitrary `var()` valid TW v3) |
| 2 | `components/command-palette.tsx` — `bg-[#101216]` | netral (panel gelap) | OUT OF SCOPE (bukan brand) |
| 3 | `components/command-palette.tsx` — `text-[#e8eaf1]` | netral | OUT OF SCOPE |
| 4 | `lib/tokens.ts` — `T.accent500` | brand via JS (`viewport.themeColor` di layout.tsx, QR/canvas) | Tetap maroon (SSR build-time); meta `theme-color` di-update runtime oleh hook T3 (§8) |
| 5 | `lib/tokens.ts` — `T.accent400` | brand via JS (cetak/canvas) | Tetap; nilai `wine` & netral tak berubah |
| PWA | `manifest.json` `theme_color: #7A1835` + ikon | statis | **CONSTRAINT** — tidak ikut retheme (stabilitas PWA) |

Konvensi `docs/*.html` (SOP/tutorial iframe) memakai CSS
tersendiri (inline) — tak terpengaruh theme app (konten
dokumentasi, bukan UI app).


## 4. Mekanisme: lapisan override CSS-variable

1. **Var brand** di `:root` (nilai maroon saat ini, T2):
   ```css
   :root {
     --ac300: #e19db6; --ac400: #c45a7e; --ac500: #7a1835;
     --ac600: #64142b; --ac700: #4a0d20;
     --accent: var(--ac500); /* hero/charts ikut brand */
   }
   html[data-brand="green"] { /* ...5 var */ }
   /* 4 blok data-brand lainnya */
   ```
   Fallback: `data-brand` tak dikenal / absen = maroon via
   `:root` — 0 perubahan visual.
2. **Override utilitas** — aturan di LUAR `@layer` (unlayered
   menang cascade vs `@layer utilities`):
   ```css
   html[data-brand] .bg-accent-500 { background-color: var(--ac500); }
   html[data-brand] .text-accent-300 { color: var(--ac300); }
   html[data-brand] .ring-accent-500\/30 {
     --tw-ring-color: color-mix(in srgb, var(--ac500) 30%, transparent);
   }
   ```
   - base: 21 aturan (bg/border/ring/shadow/text × tone × alpha).
   - varian: 9 aturan (`html[data-brand] .dark .dark\:text-accent-300`,
     `html[data-brand] .hover\:bg-accent-500\/10:hover`, dst —
     selector varian Tailwind dipetakan ulang).
   - alpha selalu `color-mix(in srgb, var(--acN) P%, transparent)`
     (bukan `rgba`) — satu sumber warna, konsistensi tone.
3. **`.input` (layer components, @apply)**:
   ```css
   html[data-brand] .input:focus {
     border-color: var(--ac500);
     --tw-ring-color: color-mix(in srgb, var(--ac500) 30%, transparent);
   }
   ```
4. **Aplikator brand** (T3): hook client di `Shell.tsx` —
   `GET /api/settings` → `document.documentElement.dataset.brand =
   theme` (validasi allow-list; tak dikenal → `maroon`) + update
   `meta[name=theme-color]`. Satu titik perubahan, CSS-only
   (tanpa hard refresh).

## 5. Preset (5) — tabel nilai

Aturan desain: `500` = token utama (hero/CTA), `600/700` =
hover/pressed, `300/400` = teks aksen di dark. `maroon` = nilai
SAAT INI (default; 0 perubahan visual). Nilai 4 preset lainnya =
PROPOSAL audit ini — bisa diatur ulang (visual check Gus Fi)
sebelum commit T2.

| tone | maroon (default) | green | blue | dark-maroon | slate |
| ---- | ---------------- | ----- | ---- | ----------- | ----- |
| 300 | #E19DB6 | #94D8B2 | #97BCED | #C4819C | #CBD5E1 |
| 400 | #C45A7E | #57B988 | #5B94DC | #A54E6C | #94A3B8 |
| 500 | #7A1835 | #16774B | #1D4F91 | #5C1224 | #475569 |
| 600 | #64142B | #0F5C3B | #153D71 | #470C1B | #334155 |
| 700 | #4A0D20 | #0A3F2A | #0E284D | #300712 | #1E293B |

## 6. Storage + API (tanpa migration)

## 7. UI admin

`/admin/pengguna` (halaman pengaturan tersebar — TIDAK ada
`/admin/pengaturan`; preseden: halaman ini sudah handle
`session_timeout` via `PUT /api/settings`) — kartu baru
**"Tema Warna"**: dropdown 5 preset + swatch kecil (live-preview
via CSS var sebelum simpan) + tombol Simpan
(`PUT /api/settings {theme}`).

## 8. Dark mode & PWA (orthogonal / constraint)

- Dark mode = class-based (`html.dark`, cookie `theme`
  light/dark + fallback OS di `themeInit` layout.tsx) — TIDAK
  berubah oleh brand theme. Setiap preset dipakai pada light
  DAN dark (tone 300/400 = teks di dark, 600/700 = hover, §5).
- PWA `manifest.json` `theme_color` + ikon = statis maroon
  (constraint stabilitas install). Hook T3 meng-update
  `meta[name=theme-color]` (browser chrome mobile) — manifest
  tetap maroon; batasan ini didokumentasikan di T4.

## 9. CONSTRAINT (TIDAK di-retheme)

- `navy` (netral gelap maroon-tint: kanvas dark mode, surface,
  border) — retheme navy = merombak seluruh skema dark; di luar
  scope V1.
- `wine` `#7A1C1C` (kontrak cetak kartu member).
- Role colors `risk/success/attention/info/gold` (semantik
  status, bukan brand).
- `manifest.json` + ikon PWA.
- CSS print (`#fff`/`#000` netral, 58mm thermal).
- Hex netral command-palette (`#101216`/`#e8eaf1`).

## 10. Rencana commit (4, urutan T1→T4)

| # | Isi | Cakupan |
| - | --- | ------- |
| T1 | Dokumen ini (`docs/color-theme-audit.md`) | docs-only, 0 kode |
| T2 | `globals.css`: var brand 5 preset + override layer + `--accent: var(--ac500)` + aturan `.input` — **pure CSS, 0 perubahan visual (maroon = nilai saat ini); aman standalone** | 1 file |
| T3 | `db.ts` + `theme: 'maroon'`; `api/settings` GET+PUT validasi; `Shell.tsx` hook (data-brand + meta); kartu UI `/admin/pengguna`; migrasi `accent-[#7A1835]` → `accent-[var(--ac500)]` | 5 file |
| T4 | docs: MEMORY + TODO (log fitur) | docs-only |

Verifikasi per commit: `tsc --noEmit` + `next build` (sw.js
TIDAK pernah di-commit), diff ditunjukkan sebelum commit,
dual-push master+main. T3 = titik perubahan visual pertama
(hanya saat admin memilih preset selain maroon; maroon tetap
pixel-identik). Visual check 5 preset = Gus Fi (non-blocking).

## 11. Catatan risiko

- `color-mix()` — dukungan: Chrome 111+, Firefox 113+, Safari
  16.2+ (2023). Target PWA (HP modern) aman. Browser lawas:
  alpha variants jatuh ke nilai Tailwind statis (maroon) —
  degradasi, bukan error.
- Flash maroon saat load awal utk theme non-maroon (hook Shell
  jalan setelah render pertama; `data-brand` belum ada →
  fallback maroon sesaat). V1 diterima; mitigasi follow-up
  (opsional): script inline layout.tsx membaca theme via RSC
  (layout server sudah bisa `getSettings()`).
- Cascade: aturan override UNLAYERED vs `@layer utilities`
  Tailwind — unlayered selalu menang (independen specificity),
  aman terhadap ordering build.


- Tabel `settings` key-value yang sudah ada; key baru
  `theme` (nilai: `maroon|green|blue|dark-maroon|slate`).
- `SHOP_SETTING_DEFAULTS` (`src/db.ts:605`) + `theme: 'maroon'`
  → default maroon, 0 baris DB baru.
- `PUT /api/settings` (admin-only, sudah ada) + validasi
  allow-list `theme` (bukan string bebas; di luar 5 nilai = 400);
  `saveSettings` sudah auto-log audit (pola `session_timeout`).
- `GET /api/settings` (login-only) + field `theme`.
