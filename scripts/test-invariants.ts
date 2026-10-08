/**
 * P0-C2 — DATA INVARIANTS + RESTORE DRILL (E2E release gate).
 *
 * Companion to `test-golden.ts` (P0-C1). It drives the real HTTP API against a
 * FRESH local database, seeds money-critical data, then:
 *
 *   1. asserts money-critical DATA INVARIANTS (read-only SQL read-back);
 *   2. runs a TOTAL-LOSS RESTORE DRILL: export a full backup (GET /api/backup)
 *      -> delete the DB file (simulate catastrophic loss) -> restart the app
 *      (fresh auto-seed) -> restore from the backup (POST /api/backup) ->
 *      verify the data came back AND the invariants still hold.
 *
 * The drill caught a real bug (P0-C2): the backup payload omitted the
 * `point_history` table, so a total-loss restore re-inserted `members.points`
 * but lost the supporting point-ledger rows -> the point-ledger invariant
 * broke. Fixed by adding `point_history` to the backup (export + delete +
 * import + audit). See docs/qa/DATA-INVARIANTS.md.
 *
 * Run (Node >= 24, type-stripping — no build of THIS script required):
 *     npm run test:invariants          (== node scripts/test-invariants.ts)
 *
 * `next dev` by default; set INVAR_MODE=prod to run `next start` (requires a
 * prior `next build`) — the most faithful gate right before a real deploy:
 *     INVAR_MODE=prod npm run test:invariants
 *
 * Overrides:
 *     INVAR_PORT=3210 npm run test:invariants   (pin a port; default auto-free)
 *     INVAR_KEEP=1    npm run test:invariants   (don't delete the temp DB)
 *
 * Exit contract (matches the other test:* scripts): prints ALL_PASS /
 * HAS_FAILURE and sets process.exitCode (0/1). exitCode — NOT
 * process.exit() — because on Node 24 / Windows a hard process.exit() while
 * libuv async handles are still open can fastfail (0xC0000409).
 *
 * RELEASE GATE: a deploy MUST only proceed when both `test:golden` (P0-C1)
 * and `test:invariants` (P0-C2) exit 0 (ALL_PASS).
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── tiny assertion harness (same shape as the other test:* scripts) ────────
let passes = 0;
let failures = 0;
/** informational: reported, never fails the suite. */
const notes: string[] = [];

function ok(name: string, cond: boolean, detail = ''): boolean {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
  return cond;
}
function note(name: string, detail: string): void {
  console.log('  INFO ' + name + ' (' + detail + ')  [non-fatal]');
  notes.push(name + ' (' + detail + ')');
}
function section(title: string): void {
  console.log('\n' + title + '\n' + '='.repeat(title.length));
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── HTTP + manual cookie jar (forward the httpOnly session cookie ourselves) ─
type Jar = Map<string, string>;
function cookieHeader(jar: Jar | undefined): string | undefined {
  if (!jar || jar.size === 0) return undefined;
  return [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
}
/** Absorb Set-Cookie into the jar (create/update; empty value = delete). */
function absorbCookies(res: Response, jar: Jar | undefined): void {
  const gsc = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const all: string[] = typeof gsc === 'function' ? gsc.call(res.headers) : [];
  for (const raw of all) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!jar || !name) continue;
    if (val === '') jar.delete(name);
    else jar.set(name, val);
  }
}

type CallOpts = {
  jar?: Jar;
  body?: unknown;
  /** retries on 5xx / network errors (absorbs `next dev` cold-compile). */
  tries?: number;
};
type Resp = { status: number; json: Record<string, unknown> | null; text: string };
/** One request. 4xx/2xx are final results (never re-applied); 5xx/network
 *  are retried. Returns the last Resp; throws if every attempt was network. */
async function call(base: string, method: string, p: string, o: CallOpts): Promise<Resp> {
  const tries = o.tries ?? 1;
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    const headers: Record<string, string> = {};
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    const ck = cookieHeader(o.jar);
    if (ck) headers['cookie'] = ck;
    let res: Response;
    try {
      res = await fetch(base + p, {
        method,
        headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      });
    } catch (e) {
      lastErr = String(e);
      await sleep(1500);
      continue;
    }
    absorbCookies(res, o.jar);
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    if (text) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* non-JSON (e.g. an HTML error page) — keep json null */
      }
    }
    if (res.status >= 500 && i < tries - 1) {
      await sleep(1000);
      continue;
    }
    return { status: res.status, json, text };
  }
  throw new Error('request failed after ' + tries + ' tries: ' + method + ' ' + p + ' (' + lastErr + ')');
}

// ── server lifecycle ─────────────────────────────────────────────────────────
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (a && typeof a === 'object' && a.port ? resolve(a.port) : reject(new Error('no port'))));
    });
    s.on('error', reject);
  });
}

type ServerHandle = { child: ChildProcess; base: string; tail: string[] };

/** Boot the app on a free port against a FRESH file DB; wait until it answers. */
async function startServer(mode: string, dbRel: string): Promise<ServerHandle> {
  const port = process.env.INVAR_PORT ? Number(process.env.INVAR_PORT) : await freePort();
  const base = 'http://127.0.0.1:' + port;
  const bin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const args =
    mode === 'prod'
      ? ['start', '-p', String(port), '-H', '127.0.0.1']
      : ['dev', '-p', String(port), '-H', '127.0.0.1'];
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: ROOT,
    detached: true, // own process group -> the whole tree can be killed
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: dbRel, // fresh local file DB -> auto-seed on first db() call
      DATABASE_AUTH_TOKEN: '', // local file needs no remote token
      NODE_ENV: mode === 'prod' ? 'production' : 'development',
    },
  });
  const tail: string[] = [];
  const keep = (d: string): void => {
    tail.push(d);
    if (tail.length > 120) tail.splice(0, tail.length - 120);
  };
  child.stdout?.on('data', (b: string) => keep(b));
  child.stderr?.on('data', (b: string) => keep(b));

  const deadline = Date.now() + 240_000; // `next dev` cold compile can be slow
  let up = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('server exited early (code ' + child.exitCode + '):\n' + tail.join('').slice(-3000));
    }
    try {
      const r = await fetch(base + '/', { method: 'GET' }); // any HTTP status = up
      void r.status;
      up = true;
      break;
    } catch {
      await sleep(1500);
    }
  }
  if (!up) {
    child.kill();
    throw new Error('server did not become ready in time:\n' + tail.join('').slice(-3000));
  }
  return { child, base, tail };
}

async function stopServer(handle: ServerHandle): Promise<void> {
  const { child } = handle;
  if (child.pid !== undefined && child.exitCode === null) {
    if (process.platform === 'win32') {
      // Kill the ENTIRE process tree: `next dev`/`next start` spawns a
      // grandchild dev-server that holds the SQLite file handle. A single
      // taskkill can lag under load, so re-issue it until the root PID is gone.
      for (let i = 0; i < 10; i++) {
        try {
          execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' });
        } catch {
          break; // taskkill failed -> root PID already gone
        }
        await sleep(1000);
        try {
          process.kill(child.pid, 0); // no-throw probe: still alive -> kill again
        } catch {
          break; // gone
        }
      }
    } else {
      child.kill('SIGTERM');
      await sleep(1000);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  // Wait for the process to actually exit so it releases the DB file handle.
  if (child.exitCode === null) {
    await new Promise<void>((res) => {
      const t = setTimeout(() => res(), 5000);
      child.once('exit', () => {
        clearTimeout(t);
        res();
      });
    });
  }
}

/**
 * Best-effort file removal with retries.
 * On Windows, SQLite (libsql) handles can linger for seconds after the server
 * tree is killed, so an immediate `rmSync` can fail. Retry up to `maxMs` and
 * report whether every file is gone.
 */
async function removeWithRetry(files: string[], maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  for (;;) {
    for (const f of files) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* locked by a lingering process — retry */
      }
    }
    if (files.every((f) => !fs.existsSync(f))) return true;
    if (Date.now() >= deadline) break;
    await sleep(500);
  }
  return files.every((f) => !fs.existsSync(f));
}

// ── SQLite read-back (read-only; prefer the app's own engine, WAL-safe) ─────
type DbReader = {
  one: (sql: string, args?: unknown[]) => Promise<Record<string, unknown> | null>;
  count: (sql: string, args?: unknown[]) => Promise<number>;
  close: () => void;
};
async function openDbReadonly(dbRel: string): Promise<DbReader> {
  // Primary: @libsql/client (the exact engine the app writes with).
  try {
    const mod = await import('@libsql/client');
    const client = mod.createClient({ url: dbRel, authToken: undefined });
    return {
      one: async (sql, args = []) => {
        const rs = await client.execute({ sql, args: args as never });
        return (rs.rows[0] as Record<string, unknown>) ?? null;
      },
      count: async (sql, args = []) => {
        const rs = await client.execute({ sql, args: args as never });
        return Number((rs.rows[0] as { c?: number } | undefined)?.c ?? 0);
      },
      close: () => {
        try {
          client.close();
        } catch {
          /* already closed */
        }
      },
    };
  } catch {
    // Fallback: Node's bundled SQLite (standard file format, read-only).
    const sqlite = await import('node:sqlite');
    const abs = path.join(ROOT, dbRel.replace(/^file:.\//, 'data/'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = new sqlite.DatabaseSync(abs, { readOnly: true });
    return {
      one: async (sql, args = []) =>
        (c.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined) ?? null,
      count: async (sql, args = []) =>
        Number((c.prepare(sql).get(...(args as never[])) as { c?: number } | undefined)?.c ?? 0),
      close: () => {
        try {
          c.close();
        } catch {
          /* already closed */
        }
      },
    };
  }
}

// ── P0-C2 scenarios ───────────────────────────────────────────────────────────
type Refs = {
  purchaseProductId: number;
  memberId: number;
  memberSaleId: number;
  posSaleId: number;
};

/** Seed a minimal money dataset (product ids by NAME from the auto-seed). */
async function seedMoney(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('SEED — money data (purchase + member + 2 sales)');
  const list = await call(base, 'GET', '/api/products', { jar: adminJar, tries: 4 });
  ok('GET /api/products -> 200', list.status === 200, 'got ' + list.status);
  const products = (list.json?.products as { id: number; name: string; stock: number }[] | undefined) ?? [];
  ok('seeded catalog present (>= 8 products)', products.length >= 8, String(products.length));
  const byName = (n: string) => products.find((p) => p.name === n);

  const sachet = byName('Madu Sachet');
  if (!sachet) {
    ok('seeded "Madu Sachet" available', false, 'missing from catalog');
    return;
  }
  refs.purchaseProductId = sachet.id;
  const purch = await call(base, 'POST', '/api/purchases', {
    jar: adminJar,
    body: { product_id: sachet.id, qty: 10, unit_cost: 5000, supplier: 'INV Supplier' },
    tries: 3,
  });
  ok('POST /api/purchases -> 200 ok', purch.status === 200 && purch.json?.ok === true, 'got ' + purch.status);

  const mem = await call(base, 'POST', '/api/members', {
    jar: adminJar,
    body: { name: 'INV Member ' + Date.now(), phone: '082' + String(Date.now()).slice(-9) },
    tries: 3,
  });
  ok('POST /api/members -> 200 ok', mem.status === 200 && mem.json?.ok === true, 'got ' + mem.status);
  refs.memberId = Number(mem.json?.id ?? 0);
  ok('member id captured', refs.memberId > 0, 'id ' + refs.memberId);

  const box = byName('Madu Box');
  if (!box) {
    ok('seeded "Madu Box" available', false, 'missing from catalog');
    return;
  }
  // Defaults: points_every=10000 -> total 45000, floor(45000/10000)=4 points.
  const mSale = await call(base, 'POST', '/api/sales', {
    jar: adminJar,
    body: { items: [{ product_id: box.id, qty: 1 }], pay_method: 'cash', amount_paid: 45000, member_id: refs.memberId, customer: '' },
    tries: 3,
  });
  ok('member sale -> 200 ok', mSale.status === 200 && mSale.json?.ok === true, 'got ' + mSale.status);
  refs.memberSaleId = Number((mSale.json?.sale as { id?: number } | undefined)?.id ?? 0);
  ok('member sale id captured', refs.memberSaleId > 0, 'id ' + refs.memberSaleId);

  const water = byName('Air Mineral 600ml');
  if (!water) {
    ok('seeded "Air Mineral 600ml" available', false, 'missing from catalog');
    return;
  }
  const pSale = await call(base, 'POST', '/api/sales', {
    jar: adminJar,
    body: { items: [{ product_id: water.id, qty: 2 }], pay_method: 'cash', amount_paid: 6000, customer: 'INV-POS' },
    tries: 3,
  });
  ok('POS sale -> 200 ok', pSale.status === 200 && pSale.json?.ok === true, 'got ' + pSale.status);
  refs.posSaleId = Number((pSale.json?.sale as { id?: number } | undefined)?.id ?? 0);
  ok('POS sale id captured', refs.posSaleId > 0, 'id ' + refs.posSaleId);
}

/** Money-critical DATA INVARIANTS, asserted read-only against the DB file. */
async function checkInvariants(db: DbReader, label: string): Promise<void> {
  section(label + ' — data invariants (read-only SQL)');
  ok(
    'INV-1 no negative stock (non-consignment; W5.2 NEG-1: titipan boleh negatif)',
    (await db.count('SELECT COUNT(*) c FROM products WHERE stock < 0 AND COALESCE(is_consignment, 0) = 0')) === 0
  );
  ok(
    'INV-2 no orphan sale_items',
    (await db.count('SELECT COUNT(*) c FROM sale_items si LEFT JOIN sales s ON s.id = si.sale_id WHERE s.id IS NULL')) === 0
  );
  ok(
    'INV-3 no orphan returns',
    (await db.count('SELECT COUNT(*) c FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE s.id IS NULL')) === 0
  );
  ok(
    'INV-4 point ledger == members.points',
    (await db.count(
      "SELECT COUNT(*) c FROM members m WHERE m.points <> COALESCE((SELECT SUM(p.delta) FROM point_history p WHERE p.member_id = m.id AND p.reason IN ('earn','redeem','void','refund')), 0)"
    )) === 0
  );
  ok(
    'INV-5 debts arithmetic (remaining = amount - paid)',
    (await db.count('SELECT COUNT(*) c FROM debts WHERE remaining <> amount - paid')) === 0
  );
  ok(
    'INV-6 payables arithmetic (remaining = amount - paid)',
    (await db.count('SELECT COUNT(*) c FROM payables WHERE remaining <> amount - paid')) === 0
  );
  ok('INV-7 sales totals non-negative', (await db.count('SELECT COUNT(*) c FROM sales WHERE total < 0 OR amount_paid < 0')) === 0);
}

async function main(): Promise<void> {
  const stamp = Date.now();
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const dbRel = 'file:./data/invariants-test-' + stamp + '.db';
  const dbAbs = path.join(ROOT, 'data', 'invariants-test-' + stamp + '.db');
  const mode = process.env.INVAR_MODE === 'prod' ? 'prod' : 'dev';

  console.log('P0-C2 Data Invariants + Restore Drill');
  console.log('  mode: ' + mode + '   db: ' + dbRel + '   node: ' + process.version);

  const refs: Refs = { purchaseProductId: 0, memberId: 0, memberSaleId: 0, posSaleId: 0 };

  // ── Phase 1: healthy DB — seed money data, run invariants, export a backup ─
  let handle = await startServer(mode, dbRel);
  console.log('  [phase 1] server up at ' + handle.base);
  const adminJar = new Map<string, string>();
  const prime = await call(handle.base, 'POST', '/api/auth/login', {
    jar: adminJar,
    body: { username: 'admin', password: 'kopontren' },
    tries: 4,
  });
  ok('admin session jar primed (login -> 200)', prime.status === 200 && prime.json?.ok === true, 'status ' + prime.status);
  await seedMoney(handle.base, refs, adminJar);

  // Pre-loss invariants on the healthy DB (these MUST hold before any loss).
  {
    const db = await openDbReadonly(dbRel);
    try {
      await checkInvariants(db, 'PRE-LOSS');
      ok("audit: sales:create fired", (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'sales:create'")) >= 1);
      ok("audit: purchases recorded", (await db.count("SELECT COUNT(*) c FROM audit_log WHERE table_name = 'purchases'")) >= 1);
    } finally {
      db.close();
    }
  }

  // Export a FULL backup snapshot of the healthy state.
  const snap = await call(handle.base, 'GET', '/api/backup', { jar: adminJar, tries: 4 });
  ok('GET /api/backup -> 200 (version 4)', snap.status === 200 && snap.json?.version === 4, 'got ' + snap.status);
  const payload = snap.json as Record<string, unknown> | null;
  const len = (k: string): number => {
    const v = payload?.[k];
    return Array.isArray(v) ? v.length : -1;
  };
  const snapCounts = {
    products: len('products'),
    sales: len('sales'),
    sale_items: len('sale_items'),
    purchases: len('purchases'),
    members: len('members'),
    point_history: len('point_history'),
  };
  ok(
    'snapshot non-empty (products>=8, sales>=2, purchases>=1, members>=1, point_history>=1)',
    snapCounts.products >= 8 &&
      snapCounts.sales >= 2 &&
      snapCounts.purchases >= 1 &&
      snapCounts.members >= 1 &&
      snapCounts.point_history >= 1,
    JSON.stringify(snapCounts)
  );
  {
    const db = await openDbReadonly(dbRel);
    try {
      ok("audit: backup:export fired", (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'backup:export'")) >= 1);
    } finally {
      db.close();
    }
  }
  await stopServer(handle);

  // ── Phase 2: simulate TOTAL LOSS — delete the DB file ──────────────────────
  // On Windows, libsql handles may be released seconds (or longer under load)
  // after the server tree is killed, so retry the removal (up to 90 s) — a
  // genuine total-loss simulation needs the file gone.
  const lossFiles = [dbAbs, dbAbs + '-wal', dbAbs + '-shm'];
  const lossRemoved = await removeWithRetry(lossFiles, 90_000);
  ok(
    'DB file removed (simulated total loss)',
    lossRemoved,
    lossRemoved
      ? ''
      : lossFiles.filter((f) => fs.existsSync(f)).join(', ') + ' still present after 90 s — a process is holding the DB'
  );

  // ── Phase 3: recover — restart (fresh auto-seed), restore from the backup ──
  handle = await startServer(mode, dbRel);
  console.log('  [phase 3] server back up at ' + handle.base);
  const adminJar2 = new Map<string, string>();
  const prime2 = await call(handle.base, 'POST', '/api/auth/login', {
    jar: adminJar2,
    body: { username: 'admin', password: 'kopontren' },
    tries: 4,
  });
  ok('admin re-login after restart -> 200', prime2.status === 200 && prime2.json?.ok === true, 'got ' + prime2.status);

  const imp = await call(handle.base, 'POST', '/api/backup', { jar: adminJar2, body: payload, tries: 3 });
  ok('POST /api/backup (restore) -> 200 ok', imp.status === 200 && imp.json?.ok === true, 'got ' + imp.status);

  // ── Phase 4: verify recovery + post-DR invariants ──────────────────────────
  {
    const db = await openDbReadonly(dbRel);
    try {
      const restored = {
        products: await db.count('SELECT COUNT(*) c FROM products'),
        sales: await db.count('SELECT COUNT(*) c FROM sales'),
        sale_items: await db.count('SELECT COUNT(*) c FROM sale_items'),
        purchases: await db.count('SELECT COUNT(*) c FROM purchases'),
        members: await db.count('SELECT COUNT(*) c FROM members'),
        point_history: await db.count('SELECT COUNT(*) c FROM point_history'),
      };
      ok('restored: products count == snapshot', restored.products === snapCounts.products, restored.products + ' / ' + snapCounts.products);
      ok('restored: sales count == snapshot', restored.sales === snapCounts.sales, restored.sales + ' / ' + snapCounts.sales);
      ok('restored: sale_items count == snapshot', restored.sale_items === snapCounts.sale_items, restored.sale_items + ' / ' + snapCounts.sale_items);
      ok('restored: purchases count == snapshot', restored.purchases === snapCounts.purchases, restored.purchases + ' / ' + snapCounts.purchases);
      ok('restored: members count == snapshot', restored.members === snapCounts.members, restored.members + ' / ' + snapCounts.members);
      ok('restored: point_history count == snapshot', restored.point_history === snapCounts.point_history, restored.point_history + ' / ' + snapCounts.point_history);
      await checkInvariants(db, 'POST-RESTORE');
      ok("audit: backup:import fired", (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'backup:import'")) >= 1);
    } finally {
      db.close();
    }
  }

  // The app must be able to SERVE the restored data, not just hold it.
  const prod = await call(handle.base, 'GET', '/api/products', { jar: adminJar2, tries: 4 });
  ok(
    'GET /api/products -> 200 (catalog readable post-restore)',
    prod.status === 200 && ((prod.json?.products as unknown[] | undefined)?.length ?? 0) === snapCounts.products,
    'got ' + prod.status + ' n=' + ((prod.json?.products as unknown[] | undefined)?.length ?? 0)
  );

  await stopServer(handle);

  // ── summary + cleanup ───────────────────────────────────────────────────────
  console.log('\n---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures + (notes.length ? '  INFO: ' + notes.length : ''));
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  if (notes.length) {
    console.log('Non-fatal notes:');
    for (const n of notes) console.log('  ' + n);
  }

  if (process.env.INVAR_KEEP !== '1') {
    const cleaned = await removeWithRetry([dbAbs, dbAbs + '-wal', dbAbs + '-shm'], 30_000);
    if (!cleaned) {
      note(
        'could not delete temp DB (lingering server?)',
        [dbAbs, dbAbs + '-wal', dbAbs + '-shm'].filter((f) => fs.existsSync(f)).join(', ')
      );
    }
  } else {
    console.log('INVAR_KEEP=1 — kept temp DB at ' + dbAbs);
  }

  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('INARIANTS RUNNER ERROR:', e);
  process.exitCode = 1;
});