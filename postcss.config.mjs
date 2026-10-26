// PostCSS pipeline: Tailwind v3 + autoprefixer.
// W16-B (26 Okt): postcss-purgecss PRODUCTION-ONLY (next build,
// NODE_ENV=production). next dev TIDAK purge -- class dynamic
// (dark:, group-hover:) tetap tersedia saat development.
//
// SAEFELIST KETAT (hasil recon, bukan salin sample blindly):
//  - /^_/ : hashed class next/font (.__className_* / .__variable_*) --
//    nama hash TIDAK ada di source (dibangun build-time). Tanpa
//    safelist ini, CSS font-nya di-purge -> FONT PATAH.
//  - dark  : darkMode 'class' -- token 'dark' di-set runtime
//    (document.documentElement.classList), plus semua variant dark:*.
//  - Custom class globals.css (W15 P2b / W13 G3 / W16-A):
//    btn-ripple, cart-pop, receipt-print, chart-bar.
//    (Catatan: class 'lsp' TIDAK ADA di codebase -- list sample
//    tidak disalin buta; recon 26 Okt, grep case-sensitive 0 hit.)
//  - Variant prefix: group-, peer-, hover-, focus-, active-, data-,
//    aria- -- sebagian class variant dibangun dinamis di component.
//
// EXTRACTOR: regex lebar (over-extract = over-retain, aman) --
// tangkap static utility, variant (dark:bg-x, group-hover:opacity-50),
// dan arbitrary value (text-[14px], w-[calc(100%-2rem)]).
// PurgeCSS v8 API: `defaultExtractor` = function (content) => string[].
// (Bukan object `extractors` seperti PurgeCSS v5/v6 -- di v8 itu crash/
// diabaikan. Verifikasi: node_modules/purgecss/lib/purgecss.d.ts L99-101,
// L170-171, L451-454.)
//
// Regex LEWAP (over-extract = over-retain, aman): tangkap static utility,
// variant (dark:bg-x, group-hover:opacity-50), dan arbitrary value
// (text-[14px], w-[calc(100%-2rem)]). Token tak dikenal tanpa CSS = no-op.
// Token `--font-jakarta` (CSS var, bukan class) = no-op.
const isProd = process.env.NODE_ENV === 'production';

// EXTRACTOR (FIX 26 Okt -- hasil diff audit): "maximal run". Token = run
// karakter yang BUKAN delimeter (whitespace / ' / " / ` / { } / ;).
// Over-extract = over-retain = AMAN (token sampah tanpa CSS = no-op).
// Ini memastikan kelas Tailwind UTUH tertangkap, termasuk:
//   ! (important: !py-1.5)   # (hex: accent-[#7A1835])
//   , (rgba/calc/minmax)      & (arbitrary variant: [&>x], [&_thead])
//   [ ] ( ) . / : _ - huruf angka
//   DELIMITER tambahan: < > (agar <thead> di JSX menghasilkan token tag
//   polos `thead` -- purgecss butuh hasTag() utk selector compound
//   [&_thead]:* yang compile jadi `.class thead { ... }`). Aman karena
//   source TIDAK memakai arbitrary variant child [&>x] (grep 26 Okt: 0 hit).
// (Regex lama -?[a-zA-Z0-9_:/[\]().-]+ KURANG: tak tangkap ! # , & >,
//  sehingga purgecss salah-hapus class yang masih dipakai = regression.)
const tailwindExtractor = (content) =>
  content.match(/[^'"`{}<>\s;]+/g) ?? [];

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    ...(isProd
      ? {
          '@fullhuman/postcss-purgecss': {
            content: ['./src/**/*.{ts,tsx,js,jsx}'],
            defaultExtractor: tailwindExtractor,
            // fontFace/keyframes/variables TETAP default (false) --
            // jaga @font-face next/font, keyframes kustom, CSS var.
            safelist: {
              standard: [
                'dark',
                'group',
                'peer',
                'btn-ripple',
                'cart-pop',
                'receipt-print',
                'chart-bar',
              ],
              deep: [
                /^_/, // next/font hashed class
                /^dark/, // dark:bg-* (darkMode: class)
                /^group/, // group-hover:*, group-focus:*
                /^peer/, // peer-checked:*, peer-*
                /^hover/, // hover:* (variant dinamis)
                /^focus/,
                /^active/,
                /^data-/, // data-open:*
                /^aria-/, // aria-checked:*
                /^btn-/, // btn-ripple
                /^cart-/, // cart-pop
                /^receipt/, // receipt-print
                /^chart/, // chart-bar
              ],
            },
          },
        }
      : {}),
  },
};
