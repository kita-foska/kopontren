import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { SwRegister } from '@/components/sw-register';

// Font utama aplikasi (P1 audit UI): sebelum 26 Sep, 'Plus Jakarta Sans'
// dideklarasikan di tailwind.config/globals.css tapi TIDAK pernah di-load
// → render jadi fallback system font. Kini self-hosted via next/font
// (CSS variable --font-jakarta; tanpa request runtime).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kopontren AL ITTIHAD — Kasir & Pembukuan',
  description:
    'Kasir & pembukuan Kopontren AL ITTIHAD: POS, stok, belanja, kas, laporan, rekap WhatsApp.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kopontren',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-180.png?v=2',
  },
};

export const viewport: Viewport = {
  themeColor: '#7A1835',
  width: 'device-width',
  initialScale: 1,
};

// P2 (audit UI 26 Sep): default tema kini ikut preferensi OS bila user
// belum pernah memilih eksplisit (dulu: selalu paksa 'dark'). Pilihan
// eksplisit (cookie `theme`) tetap menang; fallback catch = dark.
const themeInit = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=(dark|light)/);var t=m?m[1]:(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={jakarta.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}<SwRegister /></body>
    </html>
  );
}
