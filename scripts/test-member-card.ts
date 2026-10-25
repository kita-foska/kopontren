/**
 * W14-2 Member Glass Card -- suite #43 (test-member-card):
 * - glassTiltDeg: matematika tilt 3D (pusat=0; tepi=+/-maks; clamp;
 *   guard ukuran 0; pembulatan 1 desimal).
 * - glassTiltTransform: 0/0 -> "none"; selain itu perspective+deg.
 * - glassTierBadge: gold/silver (case-insensitif); kosong/tak dikenal
 *   -> null (graceful, tanpa crash).
 * - glassCardCopyValue: "Salin Nomor" = token QR bila ada, selain itu
 *   nomor member (id).
 * - Guard file: tanpa BOM/emoji; tilt statis utk mobile; reuse lib
 *   qrcode (bukan dependensi baru); print @page portrait; kartu
 *   ter-mount di dashboard.
 * Jalankan: npm run test:membercard
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  glassTiltDeg,
  glassTiltTransform,
  glassTierBadge,
  glassCardCopyValue,
} from '../src/lib/member-card.ts';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log('[test-member-card] ok: ' + label);
  } else {
    failed += 1;
    console.error('[test-member-card] GAGAL: ' + label);
  }
}

const CARD = { w: 300, h: 100, maxDeg: 6 };

// --- Tilt 3D (pure) ---
check(
  'tilt pusat kartu = 0/0 (tidak miring)',
  JSON.stringify(glassTiltDeg({ x: 150, y: 50, w: CARD.w, h: CARD.h, maxDeg: CARD.maxDeg })) ===
    JSON.stringify({ rx: 0, ry: 0 })
);
check(
  'tilt tepi kanan = rotateY +maks',
  glassTiltDeg({ x: 300, y: 50, w: CARD.w, h: CARD.h, maxDeg: CARD.maxDeg }).ry === CARD.maxDeg
);
check(
  'tilt tepi atas = +maks, tepi bawah = -maks (simetris)',
  glassTiltDeg({ x: 150, y: 0, w: CARD.w, h: CARD.h, maxDeg: CARD.maxDeg }).rx === CARD.maxDeg &&
    glassTiltDeg({ x: 150, y: 100, w: CARD.w, h: CARD.h, maxDeg: CARD.maxDeg }).rx ===
      -CARD.maxDeg
);
{
  const d = glassTiltDeg({ x: 5000, y: -5000, w: CARD.w, h: CARD.h, maxDeg: CARD.maxDeg });
  check('tilt di-clamp (koordinat di luar area tak melebihi maks)', d.rx === 6 && d.ry === 6);
}
{
  const d = glassTiltDeg({ x: 10, y: 10, w: 0, h: 0, maxDeg: CARD.maxDeg });
  check('tilt guard: ukuran 0 -> 0/0 (tanpa NaN)', d.rx === 0 && d.ry === 0);
}
{
  const d = glassTiltDeg({ x: 165, y: 55, w: CARD.w, h: CARD.h, maxDeg: CARD.maxDeg });
  // px = (165-150)/150 = 0.1 -> ry 0.6 ; py = (55-50)/50 = 0.1 -> rx -0.6
  check('tilt nilai fraksional dibulatkan 1 desimal', d.ry === 0.6 && d.rx === -0.6);
}

// --- Transform CSS ---
check('transform: 0/0 = "none" (rendering murah)', glassTiltTransform(0, 0) === 'none');
{
  const t = glassTiltTransform(2.5, -1.2);
  check(
    'transform: rotasi = perspective + deg',
    t.includes('perspective(700px)') &&
      t.includes('rotateX(2.5deg)') &&
      t.includes('rotateY(-1.2deg)')
  );
}

// --- Badge tier ---
{
  const g = glassTierBadge('gold');
  check(
    'badge tier: gold -> GOLD (amber)',
    g !== null && g.label === 'GOLD' && g.cls.includes('amber')
  );
}
{
  const s = glassTierBadge('Silver');
  check(
    'badge tier: silver -> SILVER (slate), case-insensitif',
    s !== null && s.label === 'SILVER' && s.cls.includes('slate')
  );
}
check(
  'badge tier: kosong / tak dikenal -> null (tanpa badge, tak crash)',
  glassTierBadge('') === null &&
    glassTierBadge(undefined as unknown as string) === null &&
    glassTierBadge('platinum') === null
);

// --- Salin nomor ---
check(
  'salin: ada token QR -> token (yang dipindai kasir)',
  glassCardCopyValue({ id: 42, qr_code: 'AB-123' }) === 'AB-123'
);
check(
  'salin: token kosong -> nomor member (id)',
  glassCardCopyValue({ id: 42, qr_code: '' }) === '42' && glassCardCopyValue({ id: 42 }) === '42'
);



// --- Guard file: tanpa BOM/emoji + sifat komponen ---
const ROOT = process.cwd();
function assertClean(p: string): void {
  const raw = fs.readFileSync(p);
  const text = raw.toString('utf8');
  const badChars = [...text].filter((c) => {
    const cp = c.codePointAt(0)!;
    return (cp >= 0x2000 && cp <= 0x27bf) || cp === 0x2192 || cp === 0x25fe;
  });
  check(
    p.replace(ROOT + path.sep, '') + ' bersih (tanpa BOM/emoji)',
    raw.subarray(0, 1).toString('hex') !== 'efbbbf' && badChars.length === 0
  );
}
assertClean(path.join(ROOT, 'src/lib/member-card.ts'));
assertClean(path.join(ROOT, 'src/components/member-glass-card.tsx'));
assertClean(path.join(ROOT, 'scripts/test-member-card.ts'));

{
  const src = fs.readFileSync(path.join(ROOT, 'src/components/member-glass-card.tsx'), 'utf8');
  check(
    'komponen: tilt statis utk mobile (hanya pointer mouse) + hormati reduced-motion',
    src.includes("e.pointerType !== 'mouse'") && src.includes('prefers-reduced-motion')
  );
  check(
    'komponen: reuse dependency qrcode (QRCode.toDataURL, tanpa pustaka lain)',
    src.includes('QRCode.toDataURL') && !src.includes('qrcode.react')
  );
  check('komponen: print @page portrait ada', src.includes('@page { size: A4 portrait'));
  check(
    'komponen: kartu glass wine 700/800/900 + badge tier',
    src.includes('from-wine-700 via-wine-800 to-wine-900') && src.includes('glassTierBadge')
  );
}
{
  const src = fs.readFileSync(
    path.join(ROOT, 'src/components/member/personal-dashboard-client.tsx'),
    'utf8'
  );
  check(
    'dashboard: kartu glass ter-mount di atas ringkasan + CTA buka modal existing',
    src.includes('<MemberGlassCard') && src.includes('onDetail={() => setQrOpen(true)}')
  );
}
{
  const src = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8');
  check(
    'tailwind: token wine 800/900 tersedia utk gradasi kartu',
    src.includes("800: '#5E1414'") && src.includes("900: '#420E0E'")
  );
}

// --- HINTS ---
fs.mkdirSync(path.join(ROOT, '.hints'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, '.hints', 'member-card-w14-2.json'),
  JSON.stringify(
    {
      suite: 43,
      centerTilt: glassTiltTransform(0, 0),
      edgeTilt: glassTiltTransform(CARD.maxDeg, CARD.maxDeg),
      goldBadge: glassTierBadge('gold'),
      copyToken: glassCardCopyValue({ id: 42, qr_code: 'AB-123' }),
      copyNoQr: glassCardCopyValue({ id: 42 }),
    },
    null,
    2
  )
);

console.log('\n[test-member-card] passed: ' + passed + ', failed: ' + failed);
if (failed > 0) process.exit(1);

