/**
 * 2b-5 -- P1 #5: SATU sumber baris laporan global (export CSV + XLSX) utk
 * pengurus dashboard. Modul HERMETIK / zero-import: TIDAK mengimpor apa
 * pun (tanpa alias @/ maupun path relatif), sehingga test Node
 * type-stripping (scripts/test-report-rows.ts) bisa menjalankan file ini
 * langsung (pola sama dgn src/lib/admin/export-download.ts).
 *
 * Pola:
 *  - buildReportRows(data, env) membangun 5 section (ringkasan, metode
 *    bayar, top produk, harian, cabang) + title + periode. `env`
 *    (payMethodLabel + fmtDate) DI-INJEKSI pemanggil (lib/pay-methods.ts
 *    + lib/format.ts), jadi modul tetap tanpa dependensi.
 *  - flattenCsvRows(rows) -> array baris datar dgn layout CSV (label
 *    section + baris kosong pemisah). Pemanggil join dengan csvCell +
 *    ',' + '\n' (BOM tetap di sisi pemanggil / komponen).
 *  - xlsxSheets(rows) -> 3 sheet (Ringkasan / Harian / Cabang) + !cols;
 *    pemanggil hanya aoa_to_sheet + book_append_sheet.
 *
 * csvCell dipindah dari pengurus-dashboard-client.tsx (satu sumber
 * quoting utk export CSV).
 *
 * Tanpa emoji / unicode (ASCII murni).
 */

/** Payload laporan global (GET /api/reports?days=..&from=..). */
export type ReportPayload = {
  from: string;
  days: number;
  sales_count: number;
  sales_total: number;
  profit: number;
  cogs: number;
  purchases_total: number;
  expenses_total: number;
  cash_in: number;
  cash_out: number;
  cash_net: number;
  by_method: Record<string, number>;
  top: { name: string; qty: number; revenue: number }[];
  daily: { day: string; c: number; t: number }[];
  stores: { id: number; name: string; address: string }[];
};

/**
 * Environment di-injeksi pemanggil (modul zero-import, jadi fungsi label
 * + format TIDAK diimpor modul ini).
 */
export type ReportRowEnv = {
  /** Label metode bayar (satu sumber: lib/pay-methods.ts). */
  payMethodLabel: (m: string) => string;
  /** Format tanggal periode (lib/format.ts, WIB + id-ID). */
  fmtDate: (v: string) => string;
};

/** Section laporan (label + baris data). */
export type ReportSection = {
  label: string;
  rows: (string | number)[][];
};

/** Section laporan dgn header kolom (label + header + baris data). */
export type ReportSectionHeader = {
  label: string;
  header: (string | number)[];
  rows: (string | number)[][];
};

/** Satu sumber baris laporan (dipakai export CSV + XLSX). */
export type ReportRows = {
  title: (string | number)[];
  periode: (string | number)[];
  ringkasan: ReportSection;
  metode: ReportSection;
  top: ReportSectionHeader;
  harian: ReportSectionHeader;
  cabang: ReportSectionHeader;
};

/** Satu sheet XLSX (nama + aoa + lebar kolom !cols). */
export type XlsxSheetSpec = {
  name: string;
  aoa: (string | number)[][];
  cols: { wch: number }[];
};

/**
 * Quoting sel CSV (satu sumber; dipindah dari
 * pengurus-dashboard-client.tsx). Sel berisi , " ; atau newline ->
 * dipetiki; petik di dalam digandakan. Angka/string polos apa adanya.
 */
export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Bangun 5 section laporan dari payload. Deterministik: urutan
 * Object.entries(by_method) + array (top/daily/stores) ikut urutan input.
 */
export function buildReportRows(data: ReportPayload, env: ReportRowEnv): ReportRows {
  return {
    title: ['LAPORAN GLOBAL KOPONTREN'],
    periode: ['Periode', data.days + ' hari (sejak ' + env.fmtDate(data.from) + ')'],
    ringkasan: {
      label: 'RINGKASAN',
      rows: [
        ['Penjualan (Rp)', data.sales_total],
        ['Jumlah transaksi', data.sales_count],
        ['Laba kotor (Rp)', data.profit],
        ['Belanja supplier (Rp)', data.purchases_total],
        ['Pengeluaran lain (Rp)', data.expenses_total],
        ['Arus kas bersih (Rp)', data.cash_net],
      ],
    },
    metode: {
      label: 'METODE BAYAR',
      rows: Object.entries(data.by_method).map(([m, v]) => [env.payMethodLabel(m), v]),
    },
    top: {
      label: 'TOP PRODUK',
      header: ['Produk', 'Qty', 'Omzet'],
      rows: data.top.map((t) => [t.name, t.qty, t.revenue]),
    },
    harian: {
      label: 'HARIAN',
      header: ['Tanggal', 'Transaksi', 'Penjualan (Rp)'],
      rows: data.daily.map((d) => [d.day, d.c, d.t]),
    },
    cabang: {
      label: 'CABANG',
      header: ['Cabang', 'Alamat'],
      rows: data.stores.map((s) => [s.name, s.address || '-']),
    },
  };
}

/**
 * Array baris datar utk export CSV -- layout IDENTIK sebelum refactor
 * (regression guard di scripts/test-report-rows.ts). Urutan:
 *   title, periode, [], RINGKASAN, ringkasan(6), [], METODE BAYAR,
 *   metode, [], TOP PRODUK, top.header, top, [], HARIAN, harian.header,
 *   harian
 * Section `cabang` TIDAK masuk CSV (hanya sheet 3 XLSX).
 */
export function flattenCsvRows(rows: ReportRows): (string | number)[][] {
  return [
    rows.title,
    rows.periode,
    [],
    [rows.ringkasan.label],
    ...rows.ringkasan.rows,
    [],
    [rows.metode.label],
    ...rows.metode.rows,
    [],
    [rows.top.label],
    rows.top.header,
    ...rows.top.rows,
    [],
    [rows.harian.label],
    rows.harian.header,
    ...rows.harian.rows,
  ];
}

/**
 * 3 sheet utk export XLSX -- layout TIDAK berubah. Sheet 1 = title +
 * periode + ringkasan + metode + top (tanpa label RINGKASAN/HARIAN,
 * sesuai sheet lama); sheet 2 = Harian; sheet 3 = Cabang.
 */
export function xlsxSheets(rows: ReportRows): XlsxSheetSpec[] {
  return [
    {
      name: 'Ringkasan',
      cols: [{ wch: 28 }, { wch: 18 }],
      aoa: [
        rows.title,
        rows.periode,
        [],
        ...rows.ringkasan.rows,
        [],
        [rows.metode.label],
        ...rows.metode.rows,
        [],
        [rows.top.label],
        rows.top.header,
        ...rows.top.rows,
      ],
    },
    {
      name: 'Harian',
      cols: [{ wch: 12 }, { wch: 12 }, { wch: 16 }],
      aoa: [rows.harian.header, ...rows.harian.rows],
    },
    {
      name: 'Cabang',
      cols: [{ wch: 26 }, { wch: 44 }],
      aoa: [rows.cabang.header, ...rows.cabang.rows],
    },
  ];
}
