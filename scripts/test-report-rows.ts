/**
 * 2b-5 -- Unit test src/lib/admin/report-rows.ts (satu sumber baris
 * laporan global, export CSV + XLSX pengurus dashboard).
 * Node langsung (type-stripping, Node >= 23.6), konvensi sama dgn
 * test-admin-export.ts: modul hermetis diimpor langsung via path relatif
 * (.ts), tanpa jaringan.
 *     npm run test:report-rows   (== node scripts/test-report-rows.ts)
 *
 * Sifat yang diuji:
 *  - csvCell: polos tanpa petik; dipetiki bila ada , " ; atau newline;
 *    petik di dalam digandakan.
 *  - buildReportRows: jumlah baris per section (ringkasan 6, metode N,
 *    top N, harian N, cabang N) + label + header + label metode via env.
 *  - flattenCsvRows: jumlah total + urutan label section + baris kosong
 *    pemisah + quoting (regression guard byte-identik export CSV).
 *  - xlsxSheets: 3 sheet (nama + jumlah baris + !cols) layout tak berubah
 *    (regression guard export XLSX).
 */
import {
  buildReportRows,
  csvCell,
  flattenCsvRows,
  xlsxSheets,
  type ReportPayload,
} from '../src/lib/admin/report-rows.ts';

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

/** Stub env deterministik (tanpa Intl): tanda D(...) utk assert periode. */
const PAY: Record<string, string> = { cash: 'Tunai', tf: 'Transfer', wa: 'QRIS / WA' };
const ENV = {
  payMethodLabel: (m: string): string => PAY[m] || m.toUpperCase(),
  fmtDate: (v: string): string => 'D(' + v + ')',
};

/** Fixture ReportPayload: 2 metode, 3 top, 2 hari, 2 cabang. */
function fixture(): ReportPayload {
  return {
    from: '2025-09-01T00:00:00.000Z',
    days: 30,
    sales_count: 12,
    sales_total: 1500000,
    profit: 450000,
    cogs: 1050000,
    purchases_total: 600000,
    expenses_total: 75000,
    cash_in: 1500000,
    cash_out: 675000,
    cash_net: 825000,
    by_method: { cash: 1000000, wa: 500000 },
    top: [
      { name: 'Teh Poci', qty: 40, revenue: 400000 },
      { name: 'Kopi', qty: 30, revenue: 390000 },
      { name: 'Gula",Sakit', qty: 5, revenue: 100000 },
    ],
    daily: [
      { day: '2025-09-30', c: 6, t: 750000 },
      { day: '2025-09-29', c: 6, t: 750000 },
    ],
    stores: [
      { id: 1, name: 'Al Ittihad', address: 'Jl. A' },
      { id: 2, name: 'Cabang 2', address: '' },
    ],
  };
}

function main(): void {
  // -- csvCell --
  ok('cell: angka polos tanpa petik', csvCell(42) === '42');
  ok('cell: string polos tanpa petik', csvCell('Teh Poci') === 'Teh Poci');
  ok('cell: koma -> dipetiki', csvCell('a,b') === '"a,b"');
  ok('cell: titik-koma -> dipetiki', csvCell('a;b') === '"a;b"');
  ok('cell: newline -> dipetiki', csvCell('a\nb') === '"a\nb"');
  ok('cell: petik digandakan + petik luar', csvCell('Gula",Sakit') === '"Gula"",Sakit"');

  // -- buildReportRows: jumlah baris per section --
  const rows = buildReportRows(fixture(), ENV);
  ok('section: title', rows.title.length === 1 && rows.title[0] === 'LAPORAN GLOBAL KOPONTREN');
  ok('section: periode pakai env.fmtDate', rows.periode[0] === 'Periode' && String(rows.periode[1]).includes('30 hari (sejak D('));
  ok('section: ringkasan = 6 baris', rows.ringkasan.rows.length === 6, String(rows.ringkasan.rows.length));
  ok('section: metode = 2 baris (by_method)', rows.metode.rows.length === 2, String(rows.metode.rows.length));
  ok('section: label metode via env.payMethodLabel', rows.metode.rows[0][0] === 'Tunai' && rows.metode.rows[1][0] === 'QRIS / WA');
  ok('section: top = 3 baris + header 3 kolom', rows.top.rows.length === 3 && rows.top.header.length === 3);
  ok('section: harian = 2 baris + header 3 kolom', rows.harian.rows.length === 2 && rows.harian.header.length === 3);
  ok('section: cabang = 2 baris, address kosong -> "-"', rows.cabang.rows.length === 2 && rows.cabang.rows[1][1] === '-');

  // -- flattenCsvRows: total + urutan + pemisah + quoting --
  const flat = flattenCsvRows(rows);
  // 1 title + 1 periode + 1 kosong + 1 RINGKASAN + 6 ringkasan + 1 kosong
  // + 1 METODE BAYAR + 2 metode + 1 kosong + 1 TOP PRODUK + 1 header
  // + 3 top + 1 kosong + 1 HARIAN + 1 header + 2 harian = 25
  ok('csv: total 25 baris', flat.length === 25, String(flat.length));
  ok('csv: baris kosong pemisah (idx 2,10,14,20)', flat[2].length === 0 && flat[10].length === 0 && flat[14].length === 0 && flat[20].length === 0);
  ok('csv: label RINGKASAN di idx 3', flat[3].length === 1 && flat[3][0] === 'RINGKASAN');
  ok('csv: label METODE BAYAR di idx 11', flat[11].length === 1 && flat[11][0] === 'METODE BAYAR');
  ok('csv: label TOP PRODUK + header kolom', flat[15][0] === 'TOP PRODUK' && flat[16].length === 3 && flat[16][0] === 'Produk');
  ok('csv: label HARIAN + header kolom', flat[21][0] === 'HARIAN' && flat[22].length === 3 && flat[22][0] === 'Tanggal');
  const text = flat.map((r) => r.map(csvCell).join(',')).join('\n');
  ok('csv: sel ber-masalah ter-quote', text.includes('"Gula"",Sakit"'));
  ok('csv: sel polos TIDAK ter-quote', text.includes('Teh Poci,40,400000'));
  ok('csv: section CABANG tidak masuk', !text.includes('Jl. A'));

  // -- xlsxSheets: 3 sheet, layout tak berubah --
  const sheets = xlsxSheets(rows);
  ok('sheets: 3 sheet', sheets.length === 3, String(sheets.length));
  ok(
    'sheets: nama Ringkasan/Harian/Cabang',
    sheets[0].name === 'Ringkasan' && sheets[1].name === 'Harian' && sheets[2].name === 'Cabang',
  );
  // Sheet 1: 1 title + 1 periode + 1 kosong + 6 ringkasan + 1 kosong
  // + 1 METODE BAYAR + 2 metode + 1 kosong + 1 TOP PRODUK + 1 header
  // + 3 top = 19
  ok('sheets: Ringkasan aoa = 19 baris', sheets[0].aoa.length === 19, String(sheets[0].aoa.length));
  ok('sheets: Ringkasan TIDAK ada label RINGKASAN/HARIAN', !sheets[0].aoa.some((r) => r.length === 1 && (r[0] === 'RINGKASAN' || r[0] === 'HARIAN')));
  ok('sheets: Harian aoa = header + 2 = 3 baris', sheets[1].aoa.length === 3, String(sheets[1].aoa.length));
  ok('sheets: Harian tanpa label section', sheets[1].aoa[0].length === 3 && sheets[1].aoa[0][0] === 'Tanggal');
  ok('sheets: Cabang aoa = header + 2 = 3 baris, address kosong -> "-"', sheets[2].aoa.length === 3 && sheets[2].aoa[2][1] === '-');
  ok(
    'sheets: !cols (28/18, 12/12/16, 26/44)',
    JSON.stringify(sheets[0].cols) === '[{"wch":28},{"wch":18}]' &&
      JSON.stringify(sheets[1].cols) === '[{"wch":12},{"wch":12},{"wch":16}]' &&
      JSON.stringify(sheets[2].cols) === '[{"wch":26},{"wch":44}]',
  );

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();
