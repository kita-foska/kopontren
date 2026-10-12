/**
 * Phase 2c -- Guard SYNC POINT aksen brand (P2-hex).
 * SATU sumber BRAND_ACCENTS (src/lib/tokens.ts) kini dipakai shell.tsx
 * (meta theme-color) + pengguna-client.tsx (swatch kartu tema). Uji
 * nilai tsb masih = layer CSS T2 (globals.css ac500 per preset), dan
 * kedua komponen tak lagi men-desankan peta hex sendiri.
 * Node langsung (type-stripping, konvensi sama dgn test-report-rows.ts).
 *     npm run test:brandsync   (== node scripts/test-brand-sync.ts)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_ACCENTS } from '../src/lib/tokens.ts';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok  ' + name);
  } else {
    failures++;
    console.log('FAIL  ' + name + (detail ? ' -- ' + detail : ''));
  }
}
function main(): void {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const css = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
  const shells = readFileSync(resolve(root, 'src/components/shell.tsx'), 'utf8');
  const users = readFileSync(resolve(root, 'src/components/admin/pengguna-client.tsx'), 'utf8');

  // 5 preset = kunci tunggal (maroon = default, tak ada [data-brand]).
  const keys = Object.keys(BRAND_ACCENTS).sort();
  ok(
    '5 preset: maroon/green/blue/dark-maroon/slate',
    JSON.stringify(keys) === JSON.stringify(['blue', 'dark-maroon', 'green', 'maroon', 'slate']),
    JSON.stringify(keys),
  );

  // ac500 maroon = nilai :root (fallback, data-brand absen).
  // (Bila ada beberapa blok :root, pilih yg memuat --ac500.)
  const rootBlocks = [...css.matchAll(/:root\s*\{[^}]*\}/g)].map((m) => m[0]);
  const rootBlock = rootBlocks.find((b) => /--ac500:/.test(b));
  const rootAc500 = rootBlock ? rootBlock.match(/--ac500:\s*(#[0-9a-f]{6})/i)?.[1] : undefined;
  ok('CSS :root --ac500 ditemukan', Boolean(rootAc500));
  ok(
    'maroon = CSS :root --ac500',
    rootAc500 !== undefined && BRAND_ACCENTS.maroon.toLowerCase() === rootAc500.toLowerCase(),
    BRAND_ACCENTS.maroon + ' vs ' + rootAc500,
  );

  // 4 preset non-default: ac500 per blok html[data-brand="X"].
  for (const preset of ['green', 'blue', 'dark-maroon', 'slate'] as const) {
    const block = css.match(new RegExp('html\\[data-brand="' + preset + '"\\]\\s*\\{[^}]*\\}'))?.[0];
    const ac500 = block ? block.match(/--ac500:\s*(#[0-9a-f]{6})/i)?.[1] : undefined;
    ok(
      preset + ' = CSS [data-brand] --ac500',
      ac500 !== undefined && BRAND_ACCENTS[preset].toLowerCase() === ac500.toLowerCase(),
      BRAND_ACCENTS[preset] + ' vs ' + ac500,
    );
  }

  // Komponen memakai SATU sumber, tak lagi men-desankan peta hex sendiri.
  // (Pola hex-ikuti-kutipan: hanya nilai literal; tak menyentuh komentar
  //  dokumentatif seperti `accent-[#7A1835] ->` di pengguna-client.)
  const hexMap = /#(7a1835|16774b|1d4f91|5c1224|475569)'/i;
  ok('shell.tsx mengimpor BRAND_ACCENTS', shells.includes("from '@/lib/tokens'"));
  ok('shell.tsx tak lagi men-desankan META hex', !hexMap.test(shells));
  ok('pengguna-client.tsx mengimpor BRAND_ACCENTS', users.includes("from '@/lib/tokens'"));
  ok('pengguna-client.tsx tak lagi men-desankan SWATCH hex', !hexMap.test(users));

  // Label metode bayar (P2-copy): cheatsheet selaras dgn label tunggal
  // pay-methods.ts ('QRIS / WA' utk key `wa`).
  const cheatsheet = readFileSync(resolve(root, 'src/components/key-cheatsheet.tsx'), 'utf8');
  ok(
    'cheatsheet hotkey 2 = QRIS/WA (selaras payMethodLabel)',
    /2 QRIS\/WA/.test(cheatsheet),
  );

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();