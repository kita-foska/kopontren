#!/usr/bin/env node
/**
 * GENERATE public/sw.js dari template public/sw.src.js SEBELUM next build.
 *
 * Kenapa: service worker browser hanya di-update kalau konten /sw.js BERUBAH.
 * Kalau deploy tidak mengubah sw.js, revisi SW lama di device tetap aktif
 * selamanya (biar sebarapa sering pun revalidate -- tidak ada diff). Dengan
 * men-stamp ulang marker `// SW-BUILD:<hex>` setiap build, konten sw.js
 * selalu berbeda antar-deploy -> browser install SW baru (skipWaiting) dan
 * activate mem-purge cache lama (nama cache sudah di-bump di SW code).
 *
 * Template-generate (W10-2): public/sw.src.js = file tracked (template,
 * disiplin FROZEN); public/sw.js = artifak GENERATED (.gitignore, JANGAN
 * di-commit). Script ini TIDAK MUTASI file tracked -- hanya MENULIS
 * public/sw.js dari template. Eliminasi root-cause mutasi in-place.
 *
 * Mode:
 * - Default (build/Vercel): seed = .next/BUILD_ID + Date.now() jika ada,
 *   selain itu random hex -> stamp BERBEDA antar-build (deploy = SW baru).
 * - --stable (dev/predev): stamp = sha1(konten template) -> stabil; sw.js
 *   hanya berubah bila template berubah (mencegah banner "Versi anyar"
 *   palsu tiap dev start).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

const TEMPLATE = join(process.cwd(), 'public', 'sw.src.js');
const OUT = join(process.cwd(), 'public', 'sw.js');
if (!existsSync(TEMPLATE)) {
  console.error('[sw] public/sw.src.js tidak ditemukan, tidak bisa generate');
  process.exit(1);
}

const stable = process.argv.includes('--stable');
let stamp;
if (stable) {
  stamp = createHash('sha1')
    .update(readFileSync(TEMPLATE, 'utf8'))
    .digest('hex')
    .slice(0, 12);
} else {
  const buildIdFile = join(process.cwd(), '.next', 'BUILD_ID');
  const seed = existsSync(buildIdFile)
    ? readFileSync(buildIdFile, 'utf8').trim() + '-' + Date.now().toString(36)
    : randomBytes(8).toString('hex');
  // Mix Date.now() agar dua build lokal di folder yang sama juga berbeda.
  stamp = createHash('sha1').update(seed).digest('hex').slice(0, 12);
}

const tpl = readFileSync(TEMPLATE, 'utf8');
const next = tpl.replace(/^\/\/ SW-BUILD:[^\n\r]*$/m, `// SW-BUILD:${stamp}`);
if (!next.includes(`// SW-BUILD:${stamp}`)) {
  console.error('[sw] marker "// SW-BUILD:" tidak ada di sw.src.js, abort');
  process.exit(1);
}
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
if (current === next) {
  console.log(`[sw] sw.js sudah sesuai (SW-BUILD: ${stamp}), tidak ditulis ulang`);
} else {
  writeFileSync(OUT, next, 'utf8');
  console.log(`[sw] sw.js di-generate dari sw.src.js (SW-BUILD: ${stamp})`);
}
