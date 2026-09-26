import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

// "Maroon Notebook" palette:
// maroon-tinted canvas (dark) #170A0E bg / #221015 surface; burgundy accents
// family #7A1835 (500) — remap dari #8A1538;
// amber #F59E0B/#FBBF24 = "unreported" status (calm, not red error)
// ===== UX-4 (fase A, ACC 26 Sep): token semantik =====
// Role warna disepakati: risk = rose (retire red-*), info = blue (retire
// sky-*), success = emerald ("green family"), attention = amber-500/600,
// gold = aksen premium (amber-200..400). Alias di bawah membuat kelas
// berbasis role (bg-risk-600, text-info-500, bg-gold-400) tersedia;
// skala lama (rose/emerald/amber/blue) tetap valid.
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#FAF5F6',
          100: '#F4E9EB',
          200: '#E6D1D5',
          300: '#CFAAB1',
          400: '#A97E88',
          500: '#7E5560',
          600: '#55323B',
          700: '#3A1D24',
          800: '#221015',
          900: '#170A0E',
        },
        // Burgundy #7A1835 family (remap dari #8A1538): 500 = token utama,
        // 600/700 = hover/pressed, 300-400 = teks aksen di dark mode.
        accent: {
          100: '#F9E3EA',
          200: '#F1C7D6',
          300: '#E19DB6',
          400: '#C45A7E',
          500: '#7A1835',
          600: '#64142B',
          700: '#4A0D20',
        },
        // UX-4: ROLE semantik — alias ke skala standar Tailwind.
        risk: colors.rose, // danger/error/hapus (pengganti red-*)
        success: colors.emerald, // sukses/positif ("green family")
        attention: colors.amber, // warning/stok menipis/pending
        info: colors.blue, // informasi netral (pengganti sky-*)
        // gold = highlight premium (tier member, badge khusus).
        // Pakai aksen terang (gold-200..400); attention tetap 500/600.
        gold: colors.amber,
        // wine = warna cetak kartu member (unik, tak ada di skala standar)
        wine: { 700: '#7A1C1C' },
      },
      fontSize: {
        // UX-4: micro type ramp (target migrasi text-[10px]/text-[11px]
        // di fase F): 2xs = 10px, 1xs = 11px.
        '2xs': ['0.625rem', { lineHeight: '0.9375rem' }],
        '1xs': ['0.6875rem', { lineHeight: '0.9375rem' }],
      },
      borderRadius: {
        // UX-4: radius standar — card = 16px (sama dgn rounded-2xl lama),
        // field = 8px (sama dgn rounded-lg lama).
        card: '1rem',
        field: '0.5rem',
      },
      boxShadow: {
        // UX-4: shadow standar card (= shadow-sm; drift shadow-md/dll
        // ditiadakan di fase E).
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      zIndex: {
        // UX-4: lapisan UI — nav < overlay < modal < toast < pop.
        nav: '10',
        overlay: '30',
        modal: '40',
        toast: '50',
        pop: '60',
      },
      fontFamily: {
        // P1 audit: pakai var(--font-jakarta) (di-set next/font di
        // layout.tsx) agar utilitas font-sans ikut font yang sama;
        // fallback chain tetap bila var tak tersedia.
        sans: ['var(--font-jakarta)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
