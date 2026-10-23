/**
 * Runtime test struk-pdf.ts (generator HTML struk 58mm) -- modul murni
 * src/lib/struk-pdf.ts (strukPdfHtml). Menutup fitur "Struk PDF" &
 * "Share WA (PDF)" POS: output HTML harus (A) ASCII murni, (B) @page
 * 58mm auto, (C) tanpa gambar/base64 & kecil, (D) field order item ->
 * TOTAL -> Bayar -> Kembali -> Poin, (E) escaping XSS, (F) format Rp,
 * (G/H) kondisional (cashback/poin) & split bayar.
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping):
 *     npm run test:strukpdf  (== node scripts/test-strukpdf.ts)
 * Tanpa framework test -- output sederhana, exit code 1 bila ada gagal.
 */
import { strukPdfHtml, type StrukPdfOpts } from '../src/lib/struk-pdf.ts';

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
  const html = strukPdfHtml(full);

  ok(
    'A1 output ASCII murni (tanpa emoji/unicode)',
    !/[\u0080-\uffff]/.test(html),
    html.length + ' bytes'
  );
  // B. @page 58mm -- ukuran thermal asli, auto height.
  ok('B1 ada aturan @page', html.includes('@page'));
  ok('B2 size 58mm', /@page\s*\{[^}]*58mm/.test(html));
  ok('B3 auto height', /@page\s*\{[^}]*auto/.test(html));
  // C. Tanpa gambar/base64 -- file kecil, aman utk share.
  ok('C1 tanpa tag <img>', !html.includes('<img'));
  ok('C2 tanpa base64/data-uri', !html.includes('data:image'));
  ok('C3 ukuran kecil (<8KB)', html.length < 8000, html.length + ' bytes');
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
  // E. Escaping XSS -- semua field di-escape (mirip .receipt-print).
  ok(
    'E1 nama item di-escape (& < >)',
    html.includes('Kecap &amp; Sirup &lt;Sari&gt;')
  );
  ok('E2 tidak ada <script> mentah', !html.includes('<script'));
  // F. Format Rp -- rp() penuh utk TOTAL, rpShort() utk baris item.
  ok('F1 TOTAL rp penuh', html.includes('>Rp 70.000<'));
  ok('F2 baris item qty x harga = subtotal', html.includes('>2 pcs x 15.000<'));
  // G. Kondisional -- field kosong tidak muncul.
  const bare: StrukPdfOpts = {
    no: '#1',
    kasir: 'Kasir',
    tgl: 'Tgl',
    items: [{ qty: 1, unit: 'pcs', name: 'A', total: 1000 }],
    total: 1000,
    pay: 'wa',
  };
  const b = strukPdfHtml(bare);
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
  const s = strukPdfHtml(split);
  ok('H1 label campur', s.includes('>campur<'));
  ok('H2 bagian split (Tunai)', s.includes('>- Tunai<'));
  ok('H3 bagian split (QRIS / WA)', s.includes('>- QRIS / WA<'));
  ok('H4 split tanpa baris Kembali', !s.includes('>Kembali<'));

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();
