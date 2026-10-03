// Gate B (pre-build): catch Next.js App Router route-module value-export
// violations FAST, before the slow `next build`.
//
// ROOT CAUSE this guards against:
//   A route file (src/app/api/**/route.ts) may ONLY export
//     - HTTP handlers: GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD
//     - route config keys: dynamic / revalidate / fetchCache / dynamicParams /
//       generateStaticParams / generateMetadata / generateViewportMeta /
//       generateImageMetadata / config
//   Any other top-level VALUE export (e.g. `export const GL_NOTES = [...]`)
//   makes the type Next.js generates into .next/types/ expect `never` for that
//   property -> `next build` fails at "Checking validity of types".
//   This error is NOT caught by `tsc --noEmit` (it does not check the
//   generated .next/types), so it only surfaces on `next build` / Vercel.
//   (Historic offenders: GL_NOTES in /api/gl [W1.4], FORMAL_NOTES in
//    /api/laporan/formal [W2.2].)
//
// This is a line-based static check (no full TS parse): it flags disallowed
// top-level exports and exits 1 so a `gate`/CI step fails fast.
//
// Run:  node scripts/check-route-exports.mjs     (from repo root)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'src', 'app', 'api');

// Allowed: HTTP verb handlers + segment-config export functions/keys.
const ALLOWED_FUNCS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
  'generateStaticParams', 'generateMetadata',
  'generateViewportMeta', 'generateImageMetadata',
]);
// Allowed route-config constant keys (export const dynamic = ... etc).
const ALLOWED_CONFIG = new Set([
  'dynamic', 'revalidate', 'fetchCache', 'dynamicParams',
  'generateStaticParams', 'generateMetadata',
  'generateViewportMeta', 'generateImageMetadata', 'config',
]);

function* walkRoutes(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walkRoutes(p);
    else if (entry === 'route.ts' || entry === 'route.tsx') yield p;
  }
}

const violations = [];
if (existsSync(API_DIR)) {
  for (const file of walkRoutes(API_DIR)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const m = raw.match(/^export\s+(.*)$/); // top-level (col 0) export only
      if (!m) return;
      const rest = m[1].trim();

      // Type-only exports are erased at compile time -> always allowed.
      if (/^(type|interface)(\s|$)/.test(rest)) return;

      let reason = null;
      const fnm = rest.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
      if (fnm) {
        if (!ALLOWED_FUNCS.has(fnm[1]))
          reason = `non-handler function export '${fnm[1]}'`;
      } else {
        const cm = rest.match(/^const\s+([A-Za-z_$][\w$]*)/);
        if (cm) {
          if (!ALLOWED_CONFIG.has(cm[1]))
            reason = `value const export '${cm[1]}' (allowed config keys: ${[...ALLOWED_CONFIG].join(', ')})`;
        } else if (/^(let|var|class|enum)\b/.test(rest)) {
          const name = rest.split(/\s/)[1] ?? rest.split('=')[0].trim();
          reason = `value export '${name}'`;
        } else if (/^default\b/.test(rest)) {
          reason = 'default export (route modules use named HTTP handlers only)';
        } else if (/^\*/.test(rest)) {
          reason = 'barrel re-export';
        } else if (/^\{/.test(rest)) {
          reason = "named re-export '{...}'";
        } else {
          reason = `unrecognized top-level export '${rest.slice(0, 40)}'`;
        }
      }
      if (reason)
        violations.push({
          file: path.relative(ROOT, file).split(path.sep).join('/'),
          line: i + 1,
          reason,
          text: raw.trim(),
        });
    });
  }
}

if (violations.length === 0) {
  console.log('[check-route-exports] OK: no disallowed value exports in src/app/api/**/route.ts');
  process.exit(0);
}

console.error(
  '[check-route-exports] VIOLATION(S) found. Next.js App Router route modules may ONLY export\n' +
    '  HTTP handlers (GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD) + route config keys\n' +
    '  (dynamic, revalidate, fetchCache, dynamicParams, generateStaticParams, config, ...).\n' +
    '  Any other value export fails `next build` at .next/types type-check (Vercel deploy error).\n' +
    '  Fix: remove the `export` keyword (make it module-local) or move it to src/lib/... and import it.'
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ->  ${v.reason}`);
  console.error(`      ${v.text}`);
}
console.error(`\n${violations.length} violation(s).`);
process.exit(1);
