/**
 * Shared product-import logic (used by the /admin/migrate page in the browser
 * and by the /api/migrate/products route on the server). No Node-only
 * imports here, so it is safe to bundle client-side.
 */

export type ImportRow = {
  line: number; // 1-based position in the file (header excluded)
  name: string;
  category: string;
  unit: string;
  base_price: number;
  cost_price: number;
  stock: number;
  barcode: string;
};

export type RowError = { line: number; code: string; message: string };

export const EXPECTED_COLUMNS = [
  'name',
  'category',
  'unit',
  'base_price',
  'cost_price',
  'stock',
  'barcode',
] as const;

/** Minimal CSV parser with quote support ("..."), CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  }
  return rows;
}

function toNum(v: unknown): number {
  const s = String(v ?? '').trim();
  if (s === '') return 0;
  // Plain decimal numbers only. "1,234" parses to NaN (the row is reported,
  // never silently mangled). NOTE: values must be raw numbers in the source
  // CSV (e.g. 5000, not 5.000); the preview table in the UI shows the parsed
  // numbers so mismatches are visible before import.
  return Number(s);
}

/** Parse + validate into ImportRow[]. Throws with a human message on fatal problems. */
export function parseImport(text: string): {
  rows: ImportRow[];
  errors: RowError[];
  hadHeader: boolean;
} {
  const raw = parseCsv(text);
  if (raw.length === 0) throw new Error('File kosong / tidak ada baris yang terbaca.');
  let start = 0;
  let hadHeader = false;
  const first = raw[0].map((c) => String(c).trim().toLowerCase());
  if (first[0] === 'name' && first.includes('base_price')) {
    start = 1;
    hadHeader = true;
  }
  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  const seenBarcode = new Map<string, number>();
  for (let i = start; i < raw.length; i++) {
    const cells = raw[i];
    const line = i + 1; // 1-based file line incl. header
    const [cName, cCat, cUnit, cBase, cCost, cStock, cBarcode] = cells;
    const name = String(cName ?? '').trim();
    const barcode = String(cBarcode ?? '').trim();
    const base = toNum(cBase);
    const cost = toNum(cCost);
    const stock = toNum(cStock);

    if (!name) {
      errors.push({ line, code: 'name-required', message: `Baris ${line}: kolom "name" kosong.` });
      continue;
    }
    let bad = false;
    for (const [label, v] of [
      ['base_price', base],
      ['cost_price', cost],
      ['stock', stock],
    ] as const) {
      if (Number.isNaN(v)) {
        errors.push({ line, code: `invalid-${label}`, message: `Baris ${line} (${name}): "${label}" bukan angka.` });
        bad = true;
      } else if (v < 0) {
        errors.push({ line, code: `negative-${label}`, message: `Baris ${line} (${name}): "${label}" negatif (${v}).` });
        bad = true;
      }
    }
    if (bad) continue;

    if (barcode && seenBarcode.has(barcode)) {
      errors.push({
        line,
        code: 'duplicate-barcode',
        message: `Baris ${line} (${name}): barcode "${barcode}" duplikat dengan baris ${seenBarcode.get(barcode)}.`,
      });
      continue;
    }
    if (barcode) seenBarcode.set(barcode, line);

    rows.push({
      line,
      name,
      category: String(cCat ?? '').trim(),
      unit: String(cUnit ?? '').trim() || 'pcs',
      base_price: Math.round(Number(base)),
      cost_price: Math.round(Number(cost)),
      stock: Math.round(Number(stock)),
      barcode,
    });
  }
  return { rows, errors, hadHeader };
}

/** Import-row level stats used for the pre-import preview & post-import warnings. */
export function importWarnings(rows: ImportRow[]) {
  const costZero = rows.filter((r) => r.cost_price === 0);
  const lowMargin = rows.filter((r) => {
    if (r.base_price <= 0 || r.cost_price <= 0) return false;
    const m = (r.base_price - r.cost_price) / r.base_price;
    return m < 0.05;
  });
  return {
    costZero: costZero.map((r) => `${r.name} (barcode ${r.barcode || '-'})`),
    lowMargin: lowMargin.map((r) => ({
      name: r.name,
      base_price: r.base_price,
      cost_price: r.cost_price,
      margin_pct: Math.round(((r.base_price - r.cost_price) / r.base_price) * 1000) / 10,
    })),
  };
}

/** Map an Excel row (loose object) into the ImportRow shape. */
export type ExcelMapping = {
  code: string | number;
  name: string;
  uom: string;
  cost: number | null;
  unitPrice: number | null;
  stock?: number | null;
  category?: string;
};

export function excelToRow(line: number, e: ExcelMapping): ImportRow | RowError {
  const name = String(e.name ?? '').trim();
  if (!name) {
    return { line, code: 'name-required', message: `Baris ${line}: kolom "name" kosong.` };
  }
  const cost = Number(e.cost ?? 0);
  const base = Number(e.unitPrice ?? 0);
  const stock = Number(e.stock ?? 0) || 0;
  if (Number.isNaN(cost) || Number.isNaN(base) || Number.isNaN(stock)) {
    return {
      line,
      code: 'invalid-numeric',
      message: `Baris ${line} (${name}): angka harga/stok tidak valid.`,
    };
  }
  return {
    line,
    name,
    category: String(e.category ?? '').trim(),
    unit: String(e.uom ?? '').trim() || 'pcs',
    base_price: Math.max(0, Math.round(base)),
    cost_price: Math.max(0, Math.round(cost)),
    stock: Math.max(0, Math.round(stock)),
    barcode: String(e.code ?? '').trim(),
  };
}
