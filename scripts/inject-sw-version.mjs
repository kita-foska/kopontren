#!/usr/bin/env node
/**
 * Stamp SW-BUILD marker di public/sw.js SEBELUM next build.
 *
 * Kenapa: service worker browser hanya di-update kalau konten /sw.js BERUBAH.
 * Kalau deploy tidak mengubah sw.js, revisi SW lama di device tetap aktif
 * selamanya (biar sebarapa sering pun revalidate — tidak ada diff). Dengan
 * men-stamp ulang marker `// SW-BUILD:<hex>` setiap build, konten sw.js
 * selalu berbeda antar-deploy → browser install SW baru (skipWaiting) dan
 * activate mem-purge cache lama (nama cache sudah di-bump di sw.js).
 *
 * Seed: pakai .next/BUILD_ID jika ada (build ulang di folder sama tetap
 * dapat stamp berbeda tiap deploy Vercel karena BUILD_ID baru), selain itu
 * fallback random hex. Idempotent: stamp sama = file tidak di-touch.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

const SW = join(process.cwd(), 'public', 'sw.js');
if (!existsSync(SW)) {
  console.error('[sw] public/sw.js tidak ditemukan, skip');
  process.exit(1);
}

const buildIdFile = join(process.cwd(), '.next', 'BUILD_ID');
const seed = existsSync(buildIdFile)
  ? readFileSync(buildIdFile, 'utf8').trim() + '-' + Date.now().toString(36)
  : randomBytes(8).toString('hex');
// Mix Date.now() agar dua build lokal di folder yang sama juga berbedah.
const stamp = createHash('sha1').update(seed).digest('hex').slice(0, 12);

const src = readFileSync(SW, 'utf8');
const next = src.replace(
  /^\/\/ SW-BUILD:[^\n\r]*$/m,
  `// SW-BUILD:${stamp}`
);
if (next !== src) {
  writeFileSync(SW, next, 'utf8');
  console.log(`[sw] SW-BUILD di-stamp: ${stamp}`);
} else {
  console.log(`[sw] SW-BUILD sudah ${stamp}, tidak perlu ubah`);
}
