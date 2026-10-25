/**
 * W14-1 E-STRUK -- suite #42 (test-estruct):
 * - Token HMAC deterministik (input sama -> link sama; char URL-safe).
 * - verifyEstructToken: valid ok, digest rusak / secret salah / ID salah
 *   -> ditolak (timing-safe, tanpa DB, tanpa skema baru).
 * - buildEstructUrl + hasEstructSecret (env STRUK_LINK_SECRET; kosong
 *   -> null/hidden state, tak meruntuhkan POS).
 * - Mapper saleToEstructOpts: baris sales/sale_items -> StrukPdfOpts
 *   (no '#' + id, received/change hanya utk cash, points, member) --
 *   SATU sumber data dgn POS & halaman e-Struk.
 * Jalankan: npm run test:estruct
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  estrukToken,
  parseEstructId,
  verifyEstructToken,
  buildEstructUrl,
  hasEstructSecret,
  estrukSecret,
  saleToEstructOpts,
  type EstrukSaleRow,
  type EstrukItemRow,
} from '../src/lib/struk-link.ts';

const SECRET = 'kopontren-w14-test-secret-0001';
let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log('[test-estruct] ok: ' + label);
  } else {
    failed += 1;
    console.error('[test-estruct] GAGAL: ' + label);
  }
}

function envWithSecret(on: boolean): void {
  if (on) {
    process.env.STRUK_LINK_SECRET = SECRET;
  } else {
    delete process.env.STRUK_LINK_SECRET;
  }
}

// --- Token deterministik & format URL-safe ---
const t1 = estrukToken(101, SECRET);
check(
  'token deterministik & format id.digest16',
  t1 === estrukToken(101, SECRET) &&
    /^\d+\.[A-Za-z0-9_-]{16}$/.test(t1)
);
check('token berbeda per transaksi', estrukToken(102, SECRET) !== t1);
check('token berbeda per secret', estrukToken(101, 'secret-lain-2026-x') !== t1);

// --- parseEstructId ---
check('parse id valid', parseEstructId(t1) === 101);
check('parse tolak id<=0', parseEstructId('0.' + t1.slice(4)) === null);
check('parse tolak format rusak', parseEstructId('101') === null);
check('parse tolak digest non-url-safe', parseEstructId('101./ab+=') === null);

// --- verify: valid / rusak / salah ---
check('verify valid', verifyEstructToken(t1, SECRET));
check(
  'verify tolak digest dirusak',
  !verifyEstructToken(
    '101.' + (t1.slice(-1) === 'A' ? 'B' + t1.slice(4, -1) : 'A' + t1.slice(4, -1)),
    SECRET
  )
);
const t999 = estrukToken(999, SECRET);
check(
  'verify tolak ID salah',
  !verifyEstructToken('101.' + t999.split('.')[1], SECRET)
);
check('verify tolak secret salah', !verifyEstructToken(t1, 'secret-wrong-2026-0000'));
check('verify tolak secret kosong', !verifyEstructToken(t1, ''));
check('verify tolak token kosong', !verifyEstructToken('', SECRET));

// --- env & URL ---
envWithSecret(false);
check('hasEstructSecret=false tanpa env', hasEstructSecret() === false);
check('buildEstructUrl null tanpa env', buildEstructUrl(101, 'https://kopontren.vercel.app') === null);
check('estruSecret kosong tanpa env', estrukSecret() === '');
envWithSecret(true);
check('hasEstructSecret=true dgn env', hasEstructSecret() === true);
check(
  'buildEstructUrl valid',
  buildEstructUrl(101, 'https://kopontren.vercel.app') ===
    'https://kopontren.vercel.app/struk/' + t1
);
envWithSecret(false); // kembalikan state utk test lain

// --- Mapper -> StrukPdfOpts (satu sumber data POS) ---
const sale: EstrukSaleRow = {
  id: 101,
  customer: 'Ahmad',
  pay_method: 'cash',
  note: '',
  total: 25000,
  discount: 5000,
  member_points: 30,
  amount_paid: 30000,
  change: 0,
  created_at: '2026-10-26T09:00:00Z',
  kasir: 'Ustadz Baiti',
  member: 'Fauzan',
};
const items: EstrukItemRow[] = [
  { product_name: 'Beras', qty: 5, unit: 'kg', unit_price: 6000, subtotal: 30000 },
  { product_name: 'Gula', qty: 2, unit: 'kg', unit_price: 2000, subtotal: 4000 },
];
const o = saleToEstructOpts(sale, items, sale.kasir ?? '', '26 Okt 2026, 12:00 WIB');
check('mapper no "#" + id', o.no === '#101');
check('mapper total & discount', o.total === 25000 && o.discount === 5000);
check(
  'mapper items (qty/unit/nama/harga/subtotal)',
  o.items?.length === 2 &&
    o.items[0]?.name === 'Beras' &&
    o.items[0]?.price === 6000 &&
    o.items[1]?.total === 4000
);
check(
  'mapper points & customer & member',
  o.points === 30 && o.customer === 'Ahmad' && o.member === 'Fauzan'
);
check('mapper cash: received & change', o.received === 30000 && o.change === 0);

const ewallet: EstrukSaleRow = {
  ...sale,
  pay_method: 'ewallet',
  amount_paid: 25000,
  change: 0,
  customer: '',
  discount: 0,
  member_points: 0,
  kasir: null,
  member: null,
};
const o2 = saleToEstructOpts(ewallet, items, ewallet.kasir ?? '', '26 Okt 2026, 12:00');
check(
  'mapper non-cash: received/change dibuang, kasir fallback',
  o2.received === undefined &&
    o2.change === undefined &&
    o2.kasir === 'Kasir' &&
    o2.customer === undefined &&
    o2.member === undefined
);

// --- Guard file: tanpa BOM/emoji (file W14-1) ---
function assertClean(p: string): void {
  const raw = fs.readFileSync(p);
  const text = raw.toString('utf8');
  const badChars = [...text].filter((c) => {
    const cp = c.codePointAt(0)!;
    return (cp >= 0x2000 && cp <= 0x27bf) || cp === 0x2192 || cp === 0x25fe;
  });
  check(
    p.replace(process.cwd() + path.sep, '') + ' bersih (tanpa BOM/emoji)',
    raw.subarray(0, 1).toString('hex') !== 'efbbbf' && badChars.length === 0
  );
}
const ROOT = process.cwd();
for (const rel of [
  'src/lib/struk-link.ts',
  'src/app/struk/[token]/page.tsx',
  'src/app/api/struk-link/route.ts',
  'src/components/estruct-actions.tsx',
]) {
  assertClean(path.join(ROOT, rel));
}

// --- HINTS ---
fs.mkdirSync(path.join(ROOT, '.hints'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, '.hints', 'estruct-w14-1.json'),
  JSON.stringify(
    {
      suite: 42,
      token: t1,
      mapping: o,
      noCash: o2,
      envSecretLen: SECRET.length,
    },
    null,
    2
  )
);

console.log('\n[test-estruct] passed: ' + passed + ', failed: ' + failed);
if (failed > 0) process.exit(1);
