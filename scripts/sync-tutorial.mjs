// Sync dokumentasi HTML: docs/*.html -> public/tutorial/*.html (sumber iframe /tutorial).
// docs/ adalah source of truth; public/tutorial/ hasil salin — JANGAN edit manual.
// Konvensi: setiap ada perubahan docs/SOP-*.html (atau DOKUMENTASI-APLIKASI.html),
// jalankan `npm run sync:tutorial` lalu commit docs + public/tutorial BERSAMA.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const docsDir = path.join(root, 'docs');
const outDir = path.join(root, 'public', 'tutorial');

// [file sumber di docs/, file tujuan di public/tutorial/ (slug lowercase)]
// Nama tujuan = slug yang dipakai src/lib/tutorial-data.ts (route /tutorial/[slug]).
const MAP = [
  ['DOKUMENTASI-APLIKASI.html', 'dokumentasi-aplikasi.html'],
  ['SOP-ADMIN.html', 'sop-admin.html'],
  ['SOP-GUDANG.html', 'sop-gudang.html'],
  ['SOP-KASIR.html', 'sop-kasir.html'],
  ['SOP-MANAJER.html', 'sop-manajer.html'],
  ['SOP-MEMBER.html', 'sop-member.html'],
  ['SOP-PEMBELIAN.html', 'sop-pembelian.html'],
  ['SOP-PENGURUS.html', 'sop-pengurus.html'],
  ['AKUNTANSI-PROPOSAL.html', 'akuntansi-proposal.html'],
];

mkdirSync(outDir, { recursive: true });

// Bersihkan file *.html lama di public/tutorial yang sudah tidak ada di MAP
const valid = new Set(MAP.map(([, dest]) => dest));
for (const f of readdirSync(outDir).filter((f) => f.endsWith('.html'))) {
  if (!valid.has(f)) {
    rmSync(path.join(outDir, f));
    console.log(`hapus stale: ${f}`);
  }
}

let ok = true;
for (const [src, dest] of MAP) {
  const srcPath = path.join(docsDir, src);
  if (!existsSync(srcPath)) {
    console.error(`GAGAL: sumber tidak ada -> docs/${src}`);
    ok = false;
    continue;
  }
  const text = readFileSync(srcPath, 'utf8');
  if (/<script[\s>]/i.test(text)) {
    console.error(`GAGAL: ${src} mengandung <script> — viewer sandbox allow-same-origin (tanpa allow-scripts), sumber harus tetap 0 script tag`);
    ok = false;
    continue;
  }
  copyFileSync(srcPath, path.join(outDir, dest));
  const a = statSync(srcPath).size;
  const b = statSync(path.join(outDir, dest)).size;
  if (a !== b) {
    console.error(`GAGAL: ukuran beda -> ${src} (${a}B) vs ${dest} (${b}B)`);
    ok = false;
    continue;
  }
  console.log(`salin: ${src} -> ${dest} (${(a / 1024).toFixed(1)} KB)`);
}

if (!ok) {
  console.error('SYNC-TUTORIAL-FAIL');
  process.exit(1);
}
console.log(`SYNC-TUTORIAL-OK (${MAP.length} file)`);
