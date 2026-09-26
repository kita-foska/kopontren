import type { Config } from 'tailwindcss';

// "Maroon Notebook" palette:
// maroon-tinted canvas (dark) #170A0E bg / #221015 surface; burgundy accents
// family #7A1835 (500) — remap dari #8A1538;
// amber #F59E0B/#FBBF24 = "unreported" status (calm, not red error)
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
