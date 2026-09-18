import fs from 'fs';
import path from 'path';

const re = /[\u2600-\u26ff\u2700-\u27bf]|[\ud83c-\ud83e][\udc00-\udfff]/;
let found = 0;
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    let s;
    try {
      s = fs.statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (re.test(l)) {
        found++;
        console.log(p + ':' + (i + 1) + ': ' + l.trim());
      }
    });
  }
}
walk('src');
console.log('TOTAL-EMOJI:', found);
