// Gate: theme regression checks (2b-4, ruling Gus Fi 12 Okt 2026).
//
// Static/grep guards for the 2b-0 theme ruling (DEFAULT TEMA = LIGHT)
// + command-palette action-rule, so they can never silently regress.
// No browser/pixel harness by design (no Playwright/Puppeteer) --
// line-based checks only, runs in milliseconds as part of `gate`.
//
//   T1 layout.tsx boot = LIGHT default:
//     - the inline boot IIFE (themeInit) reads cookie `theme`
//       (dark|light); a manual choice wins
//     - no cookie -> 'light' fallback, NEVER 'dark'
//     - cookie written once with `path=/; max-age=31536000;
//       samesite=lax` (attribute parity with the shell.tsx writer)
//     - boot script mounted in <head> via dangerouslySetInnerHTML
//
//   T2 no matchMedia fallback in theme boot code:
//     - the P2 26 Sep matchMedia fallback was REMOVED in 2b-0
//       (last call in the codebase). Any matchMedia in CODE lines of
//       src/app/layout.tsx is a regression (comment lines ignored).
//
//   T3 palette action-rule:
//     - command-palette.tsx: the Aksi section ('Pintar | Aksi':
//       "Ganti tema", notifikasi, backup) is pushed ONLY in search
//       mode (q >= 2); idle = nav-only (2b-0 M1: idle tap must not
//       reach the theme toggle). Regression = Aksi push located
//       before the `q.trim().length >= 2` guard.
//
//   T4 no pixel harness:
//     - package.json must not carry playwright / @playwright/test /
//       puppeteer / puppeteer-core deps (visual regression = static
//       gate only, per ruling)
//     - `gate` script must stay the static chain: route-exports +
//       theme-gate + next build (self-wiring drift detector).
//
// Run:  node scripts/check-theme-gate.mjs     (from repo root)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const failures = [];
function fail(check, msg) {
  failures.push({ check, msg });
}
function readLines(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/);
}

// ---- T1: layout.tsx boot = LIGHT default ----
{
  const lines = readLines('src/app/layout.tsx');
  const bootLines = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.includes('themeInit') && l.includes('document.cookie'));
  if (bootLines.length === 0) {
    fail('T1', 'no inline theme boot script found in src/app/layout.tsx (expected: themeInit IIFE reading document.cookie)');
  }
  for (const { l, i } of bootLines) {
    if (!l.includes('theme=(dark|light)'))
      fail('T1', `layout.tsx:${i + 1} boot does not parse cookie theme=(dark|light)`);
    if (!l.includes("m?m[1]:'light'"))
      fail('T1', `layout.tsx:${i + 1} no-cookie fallback is not 'light' (expected m?m[1]:'light')`);
    if (l.includes("m?m[1]:'dark'"))
      fail('T1', `layout.tsx:${i + 1} DARK default detected -- 2b-0 ruling = LIGHT default, never dark`);
    if (!/document\.cookie\s*=\s*'theme=light/.test(l))
      fail('T1', `layout.tsx:${i + 1} first cookie write is not theme=light`);
    if (!l.includes('max-age=31536000') || !l.includes('samesite=lax'))
      fail('T1', `layout.tsx:${i + 1} cookie write attrs drifted from shell.tsx (path=/; max-age=31536000; samesite=lax)`);
  }
  if (!lines.some((l) => l.includes('dangerouslySetInnerHTML') && l.includes('themeInit')))
    fail('T1', 'src/app/layout.tsx: boot script not mounted in <head> via dangerouslySetInnerHTML');
}

// ---- T2: no matchMedia in layout.tsx CODE (comment lines ignored) ----
{
  const lines = readLines('src/app/layout.tsx');
  lines.forEach((raw, i) => {
    if (!raw.includes('matchMedia')) return;
    const c = raw.indexOf('//');
    const code = c >= 0 ? raw.slice(0, c) : raw;
    if (code.includes('matchMedia'))
      fail('T2', `layout.tsx:${i + 1} matchMedia in CODE -- 2b-0 removed the last call; OS-preference fallback is banned (cookie-only, default light)`);
  });
}


// ---- T3: palette action-rule (Aksi section only when q >= 2) ----
{
  const lines = readLines('src/components/command-palette.tsx');
  const guardIdx = lines.findIndex((l) => /if\s*\(\s*q\.trim\(\)\.length\s*>=\s*2\s*\)/.test(l));
  const idleIdx = lines.findIndex((l) => /if\s*\(\s*q\.trim\(\)\.length\s*<\s*2\s*\)/.test(l));
  const aksiIdx = lines.findIndex((l) => l.includes("title: 'Pintar | Aksi'"));
  if (guardIdx < 0)
    fail('T3', 'command-palette.tsx: no `if (q.trim().length >= 2)` guard found -- Aksi section must be search-mode only');
  if (idleIdx < 0)
    fail('T3', 'command-palette.tsx: no idle nav guard `if (q.trim().length < 2)` found');
  if (aksiIdx < 0)
    fail('T3', "command-palette.tsx: Aksi section (title 'Pintar | Aksi') not found");
  if (aksiIdx >= 0 && guardIdx >= 0 && aksiIdx < guardIdx)
    fail('T3', `command-palette.tsx:${aksiIdx + 1} Aksi push is BEFORE the q>=2 guard -- idle palette can touch theme actions again (2b-0 M1 regression)`);
}

// ---- T4: no pixel harness / static gate only ----
{
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const dep of ['playwright', '@playwright/test', 'puppeteer', 'puppeteer-core']) {
    if (dep in deps)
      fail('T4', `package.json: ${dep} present -- pixel/browser harness is OUT OF SCOPE (ruling: static gate, no Playwright)`);
  }
  const gate = (pkg.scripts || {}).gate || '';
  if (!gate.includes('check-route-exports.mjs') || !gate.includes('check-theme-gate.mjs') || !gate.includes('next build'))
    fail('T4', 'package.json: `gate` script drifted from the static chain (check-route-exports + check-theme-gate + next build)');
}

if (failures.length === 0) {
  console.log('[check-theme-gate] OK: light-default boot + no matchMedia + palette action-rule + no pixel harness');
  process.exit(0);
}
console.error('[check-theme-gate] VIOLATION(S) found:');
for (const f of failures) console.error(`  ${f.check}: ${f.msg}`);
console.error(
  `\n${failures.length} violation(s). Theme ruling (2b-0, 12 Okt 2026): DEFAULT TEMA LIGHT, cookie-only boot, palette idle = nav-only. See MEMORY.md "2b-0 Eksekusi".`
);
process.exit(1);
