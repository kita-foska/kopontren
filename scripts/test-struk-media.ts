/**
 * Runtime test struk-media.ts (generator HTML struk m-banking 58mm) --
 * modul murni src/lib/struk-media.ts (strukMbankingHtml + konstanta).
 * Menutup fitur "Unduh PDF" & "Unduh Foto" POS: output HTML harus
 * (A) ASCII murni, (B) lebar 219px + konstanta 58mm, (C) slot logo
 * (mb-logo) TANPA <img>/base64 di HTML (logo dicomposite ke canvas
 * terpisah), (D) field order item -> TOTAL -> Bayar -> Kembali ->
 * Poin, (E) escaping XSS, (F) format Rp, (G) kondisional, (H) gaya
 * m-banking (bg putih, sans-serif).
 *
 * generateStrukPdf/Jpeg & resolveLogoUri butuh DOM/canvas + library
 * dynamic import -- TIDAK dites hermetis (hanya jalan di browser);
 * yang diuji = struktur HTML (sumber semua output).
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping):
 *     npm run test:strukmedia  (== node scripts/test-struk-media.ts)
 */
import {
  strukMbankingHtml,
  STRUK_W_MM,
  STRUK_W_PX,
  LOGO_SLOT_PX,
} from '../src/lib/struk-media.ts';
import { type StrukPdfOpts } from '../src/lib/struk-pdf.ts';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function main(): void {
  // A. ASCII murni -- tanpa emoji/unicode (gate repo 0 non-ASCII).
  const full: StrukPdfOpts = {
    no: '#42',
    kasir: 'Ust. Ahmad',
    tgl: '23 Okt 2026, 10:30',
    items: [
      {
        qty: 2,
        unit: 'pcs',
        name: 'Kecap & Sirup <Sari>',
        price: 15000,
        total: 30000,
      },
      { qty: 1, unit: 'botol', name: 'Susu 1L', price: 45000, total: 45000 },
    ],
    customer: 'Ahmad Subekti',
    member: 'MEMBER-001',
    discount: 5000,
    cashback: 1000,
    tier: 'gold',
    points: 12,
    total: 70000,
    pay: 'cash',
    received: 100000,
    change: 30000,
  };
  const html = strukMbankingHtml(full);

  ok(
    'A1 output ASCII murni (tanpa emoji/unicode)',
    !/[\u0080-\uffff]/.test(html),
    html.length + ' bytes'
  );
  // B. Dimensi 58mm = 219px + konstanta.
  ok('B1 STRUK_W_MM = 58', STRUK_W_MM === 58, String(STRUK_W_MM));
  ok('B2 STRUK_W_PX = 219', STRUK_W_PX === 219, String(STRUK_W_PX));
  ok('B3 lebar 219px di HTML', html.includes('width:' + STRUK_W_PX + 'px'));
  ok('B4 slot logo tinggi 64px', html.includes('height:' + LOGO_SLOT_PX + 'px'));
  // C. Slot logo -- TANPA <img>/base64 di HTML (gate field teks).
  ok('C1 ada slot .mb-logo', html.includes('mb-logo'));
  ok('C2 tanpa tag <img>', !html.includes('<img'));
  ok('C3 tanpa base64/data-uri', !html.includes('data:image'));
  // D. Field order: item -> TOTAL -> Bayar -> Diterima -> Kembali -> Poin.
  const iItem = html.indexOf('Kecap');
  const iTotal = html.indexOf('>TOTAL<');
  const iBayar = html.indexOf('>Bayar<');
  const iDiterima = html.indexOf('>Diterima<');
  const iKembali = html.indexOf('>Kembali<');
  const iPoin = html.indexOf('>Poin Didapat<');
  ok(
    'D1 field order benar',
    iItem > -1 &&
      iTotal > iItem &&
      iBayar > iTotal &&
      iDiterima > iBayar &&
      iKembali > iDiterima &&
      iPoin > iKembali,
    [iItem, iTotal, iBayar, iDiterima, iKembali, iPoin].join(' ')
  );
  // E. Escaping XSS -- semua field di-escape.
  ok(
    'E1 nama item di-escape (& < >)',
    html.includes('Kecap &amp; Sirup &lt;Sari&gt;')
  );
  ok('E2 tidak ada <script> mentah', !html.includes('<script'));
  // F. Format Rp -- rp() penuh utk TOTAL, rpShort() utk baris item.
  ok('F1 TOTAL rp penuh', html.includes('Rp 70.000'));
  ok('F2 baris item qty x harga = subtotal', html.includes('2 pcs x 15.000'));
  // G. Kondisional -- field kosong tidak muncul.
  const bare: StrukPdfOpts = {
    no: '#1',
    kasir: 'Kasir',
    tgl: 'Tgl',
    items: [{ qty: 1, unit: 'pcs', name: 'A', total: 1000 }],
    total: 1000,
    pay: 'wa',
  };
  const b = strukMbankingHtml(bare);
  ok('G1 tanpa Saldo Reward bila 0', !b.includes('>Saldo Reward<'));
  ok('G2 tanpa Poin Didapat bila tak ada', !b.includes('>Poin Didapat<'));
  ok('G3 tanpa Kembali utk non-cash', !b.includes('>Kembali<'));
  ok('G4 label metode (QRIS / WA)', b.includes('>QRIS / WA<'));
  // H. Split penuh -- campur per bagian, tanpa Kembali.
  const split: StrukPdfOpts = {
    ...bare,
    pay: 'split',
    paySplit: [
      { m: 'cash', a: 500 },
      { m: 'wa', a: 500 },
    ],
  };
  const s = strukMbankingHtml(split);
  ok('H1 label campur', s.includes('>campur<'));
  ok('H2 bagian split (Tunai)', s.includes('>- Tunai<'));
  ok('H3 bagian split (QRIS / WA)', s.includes('>- QRIS / WA<'));
  ok('H4 split tanpa baris Kembali', !s.includes('>Kembali<'));
  // I. Gaya m-banking -- bg putih, teks hitam, sans-serif, TOTAL tegas.
  ok('I1 background putih', html.includes('.mb{background:#fff'));
  ok('I2 teks gelap (#111)', html.includes('color:#111'));
  ok('I3 sans-serif (Arial)', html.includes('font-family:Arial'));
  ok('I4 TOTAL font besar (.tot 14px)', /\.tot\{[^}]*14px/.test(html));
  ok('I5 nama toko', html.includes('KOPONTREN AL ITTIHAD'));
  ok('I6 footer Jazakumullah', html.includes('Jazakumullah Khairan Katsiran'));
  // J. TOTAL lebih besar dari baris item -- baris .tot ada, item .it ada.
  ok('J1 ada baris item .it', html.includes('class="it"'));
  ok('J2 ada baris TOTAL .tot', html.includes('class="tot"'));

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();
