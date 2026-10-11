import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { SwRegister } from '@/components/sw-register';
import { T } from '@/lib/tokens';

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
  themeColor: T.accent500,
  width: 'device-width',
  initialScale: 1,
};

// 2b-0 (12 Okt 2026, ruling Gus Fi): DEFAULT TEMA = LIGHT (terang),
// bukan preferensi OS -- tak ada auto-dark / deteksi HP. Urutan boot:
// (1) cookie `theme` ada -> ikut cookie (pilihan manual menang);
// (2) cookie tak ada -> 'light' + tulis cookie SEKALI (atribut sama
//     dgn shell.tsx toggleTheme) agar preferensi terkunci & load
//     berikutnya stabil; (3) catch = light.
// Catatan: fallback preferensi OS (matchMedia, sejak P2 26 Sep)
// DIHAPUS ruling ini; edge private browsing (tulis cookie gagal
// sunyi) -> default light diulang tiap load, sesuai ruling.
const themeInit = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=(dark|light)/);var t=m?m[1]:'light';if(!m){document.cookie='theme=light; path=/; max-age=31536000; samesite=lax';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.remove('dark');}})();`;

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
