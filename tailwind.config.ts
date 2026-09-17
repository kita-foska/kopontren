import type { Config } from 'tailwindcss';

// "Maroon Notebook" palette:
// maroon-tinted canvas (dark) #170A0E bg / #221015 surface; maroon accents #8A1538/#C65C74/#E5A3B1;
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
        accent: {
          100: '#FBE9EC',
          200: '#F3CDD5',
          300: '#E5A3B1',
          400: '#C65C74',
          500: '#8A1538',
          600: '#70102C',
          700: '#4E0A1E',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
