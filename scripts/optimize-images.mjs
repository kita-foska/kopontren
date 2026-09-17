// One-off asset optimizer — re-encode public/ images with sharp.
// Re-runnable; original files are backed up to ../kopontren-assets-backup/ first.
// Usage: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
const BACKUP = path.join(ROOT, '..', 'kopontren-assets-backup');

const jobs = [
  // The vertical 1587x2494 logo is displayed at most ~64px in the UI and
  // optimized on-the-fly by next/image: 512px source is plenty for retina.
  // Plain PNG re-encode (palettize makes complex-color logos LARGER).
  { file: 'logo-kopontren.png', width: 512, raw: true },
  { file: 'icon-180.png' },
  { file: 'icon-192.png' },
  { file: 'icon-512.png' },
];

await mkdir(BACKUP, { recursive: true });
for (const j of jobs) {
  const p = path.join(PUB, j.file);
  const before = (await stat(p)).size;
  // only back up the FIRST version we see (keeps the true originals intact)
  const dest = path.join(BACKUP, j.file);
  const hasBackup = await stat(dest).then(
    () => true,
    () => false
  );
  if (!hasBackup) await cp(p, dest, { force: true });
  let pipe = sharp(p);
  if (j.width) pipe = pipe.resize(j.width, null, { fit: 'inside' });
  const opts = j.raw
    ? { compressionLevel: 9 }
    : { compressionLevel: 9, adaptive: true, palettize: true };
  // render to Buffer, then overwrite the file: sidesteps sharp's
  // "same file for input and output" restriction entirely.
  const buf = await pipe.png(opts).toBuffer();
  await writeFile(p, buf);
  const after = (await stat(p)).size;
  console.log(`${j.file}: ${(before / 1024).toFixed(1)} KB -> ${(after / 1024).toFixed(1)} KB`);
}
console.log('originals kept in:', BACKUP);
