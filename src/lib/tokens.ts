// ===== UX-4 (fase A): token warna untuk konteks JS =====
// Sumber nilai SAJA untuk tempat yang tidak bisa memakai kelas Tailwind:
// konfig library (QRCode), CSS cetak di window baru (document.write),
// SVG inline, dan style={{}...}.
// Nilai disinkronkan dengan:
//   - tailwind.config.ts (skala navy/accent + alias role)
//   - :root di src/app/globals.css (variabel CSS)
// ATURAN (UX-4): JANGAN menulis hex mentah di komponen — selalu lewat T.
// (tailwind.config.ts + globals.css memang boleh memuat hex = sumber token.)

export const T = {
  // brand — skala Tailwind navy / accent
  navy900: '#170a0e',
  navy800: '#221015',
  navy700: '#3a1d24',
  accent500: '#7a1835',
  accent400: '#c45a7e',
  // wine — warna cetak kartu member (unik, tak ada di skala standar)
  wine700: '#7a1c1c',
  // slate — skala Tailwind standar
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  // amber — attention + gold (aksen)
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber950: '#451a03',
  // rose — komplementer utk kartu (bukan error)
  rose200: '#fecaca',
  // cetak / netral
  black: '#000',
  white: '#fff',
};
