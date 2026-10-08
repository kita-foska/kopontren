/**
 * P0-C1 GOLDEN PATH — E2E release gate.
 *
 * Validates the critical business flows end-to-end against a FRESH local
 * database: the app is booted with a brand-new `file:` DB (so `db()` auto-
 * seeds admin/kopontren + demo products), the scenarios drive the real HTTP
 * API, and finally the SQLite file is read back read-only to verify business
 * invariants (integrity of the money-critical data).
 *
 * Run (Node >= 24, type-stripping — no build of THIS script required):
 *     npm run test:golden            (== node scripts/test-golden.ts)
 *
 * By default the harness spawns `next dev` (no prior build needed, source-
 * identical to prod for route behavior). Set GOLDEN_MODE=prod to instead run
 * `next start` (requires a prior `next build`), which is the most faithful
 * gate right before a real deploy:
 *     GOLDEN_MODE=prod npm run test:golden
 *
 * Overrides:
 *     GOLDEN_PORT=3210 npm run test:golden   (pin a port; default auto-free)
 *     GOLDEN_KEEP=1 npm run test:golden      (don't delete the temp DB)
 *
 * Exit contract (matches the other test:* scripts): prints ALL_PASS /
 * HAS_FAILURE and sets process.exitCode (0/1). exitCode — NOT process.exit()
 * — because on Node 24 / Windows a hard process.exit() while libuv async
 * handles are still open can fastfail ("Assertion failed:
 * !(handle->flags & UV_HANDLE_CLOSEREG)", 0xC0000409).
 *
 * RELEASE GATE: a deploy to Turso/Vercel MUST only proceed when this script
 * exits 0 (ALL_PASS). See docs/qa/GOLDEN-PATH.md for the scenario catalog
 * and the session-cache note behind GP-03's mandatory re-login.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
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

// ── HTTP + manual cookie jar (the server supplies real Next request context;
//    we just forward the httpOnly session cookie ourselves) ─────────────────
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
// ── server lifecycle ────────────────────────────────────────────────────────
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
  const port = process.env.GOLDEN_PORT ? Number(process.env.GOLDEN_PORT) : await freePort();
  const base = 'http://127.0.0.1:' + port;
  const bin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const args =
    mode === 'prod'
      ? ['start', '-p', String(port), '-H', '127.0.0.1']
      : ['dev', '-p', String(port), '-H', '127.0.0.1'];
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: ROOT,
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
  if (child.exitCode === null) {
    child.kill(); // SIGTERM-ish; on Windows this terminates the node process
    await sleep(1000);
    if (child.exitCode === null) child.kill('SIGKILL');
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
    const abs = path.join(ROOT, dbRel.replace(/^file:\.\//, 'data/'));
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
// ── the golden-path scenarios ───────────────────────────────────────────────
/** Shared, deterministic references. Product ids are looked up by NAME (never
 *  hard-coded) from the auto-seed so they stay stable across schema changes. */
type Refs = {
  adminId: number;
  createdProductId: number;
  memberId: number;
  product: Record<string, { id: number; stock: number }>;
  purchaseProductId: number;
  posProductId: number;
  loyaltyProductId: number;
  gp03UserId: number;
  gp07SaleId: number;
  gp07SaleTotal: number;
  gp08ConsignmentId: number;
  gp08SaleId: number;
  gp08SaleTotal: number;
};

async function gp01(base: string, refs: Refs): Promise<void> {
  section('GP-01 · Bootstrap & admin login (critical path start)');
  const anon = await call(base, 'GET', '/api/products', { tries: 3 });
  ok('anon GET /api/products -> 401 (auth wall holds)', anon.status === 401, 'got ' + anon.status);

  const login = await call(base, 'POST', '/api/auth/login', {
    body: { username: 'admin', password: 'kopontren' },
    tries: 4,
  });
  ok('admin login -> 200 ok', login.status === 200 && login.json?.ok === true, 'status ' + login.status);
  const u = (login.json?.user ?? {}) as Record<string, unknown>;
  ok('login returns admin role', String(u.role) === 'admin', String(u.role));
  refs.adminId = Number(u.id ?? 0);
  ok('seeded admin id captured', refs.adminId > 0, 'id ' + refs.adminId);

  const bad = await call(base, 'POST', '/api/auth/login', {
    body: { username: 'admin', password: 'wrong-password' },
    tries: 2,
  });
  ok('wrong password -> 401', bad.status === 401, 'got ' + bad.status);
}

async function gp02(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-02 · Product catalog & product create (inventory baseline)');
  const list = await call(base, 'GET', '/api/products', { jar: adminJar, tries: 4 });
  ok('GET /api/products -> 200', list.status === 200, 'got ' + list.status);
  const products = (list.json?.products as { id: number; name: string; stock: number }[] | undefined) ?? [];
  ok('seeded catalog present (>= 8 products)', products.length >= 8, String(products.length));
  for (const p of products) refs.product[p.name] = { id: p.id, stock: Number(p.stock) };

  const created = await call(base, 'POST', '/api/products', {
    jar: adminJar,
    body: { name: 'GP-Test Emas 10g', category: 'Uji', unit: 'pcs', base_price: 500000, cost_price: 450000, stock: 5 },
    tries: 3,
  });
  ok('POST /api/products -> 200 ok', created.status === 200 && created.json?.ok === true, 'got ' + created.status);
  refs.createdProductId = Number(created.json?.id ?? 0);
  ok('created product id returned', refs.createdProductId > 0, 'id ' + refs.createdProductId);
}

/**
 * GP-03 encodes the session-cache resolution on a DEDICATED multi-role
 * account (created via `POST /api/users`), NOT the seeded admin. Flow:
 * create user (role `kasir`) -> login -> admin extends roles to
 * `[kasir, pembelian]` -> the SAME session is still gated out of the
 * just-added role because `PUT /api/users` writes users.roles + fires the
 * `user:roles` audit but does NOT invalidate the 30 s session cache ->
 * MANDATORY re-login (createSession re-reads users.roles) -> switch-role now
 * succeeds. Acting-role gates apply on the very next request (switch-role
 * re-reads the role set). The stale pre-relogin 403 is logged as a
 * non-fatal, timing-bound observation.
 */
async function gp03(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-03 · Multi-role switch & acting-permission enforcement');

  // Create a DEDICATED user so the test never mutates the seeded admin.
  // POST /api/users returns only { ok:true } (no id/role), so the new id +
  // role set are read back from the login that immediately follows.
  const create = await call(base, 'POST', '/api/users', {
    jar: adminJar,
    body: { username: 'gp03-kasir', password: 'gp03-kasir-pw', display_name: 'GP03 Kasir', role: 'kasir' },
    tries: 3,
  });
  ok('POST /api/users (create gp03-kasir) -> 200 ok', create.status === 200 && create.json?.ok === true, 'got ' + create.status);

  // Login as the dedicated user (fresh session); read back id + role set.
  const jar = new Map<string, string>();
  const login = await call(base, 'POST', '/api/auth/login', {
    jar,
    body: { username: 'gp03-kasir', password: 'gp03-kasir-pw' },
    tries: 4,
  });
  ok('login as gp03-kasir -> 200', login.status === 200, 'got ' + login.status);
  const loginUser = login.json?.user as { id?: number; role?: string; roles?: string[] } | undefined;
  refs.gp03UserId = Number(loginUser?.id ?? 0);
  ok('created user id captured (via login)', refs.gp03UserId > 0, 'id ' + refs.gp03UserId);
  ok('created user primary role = kasir', String(loginUser?.role) === 'kasir', String(loginUser?.role));
  const loginRoles = loginUser?.roles ?? [];
  ok('login session sees [kasir]', loginRoles.includes('kasir'), JSON.stringify(loginRoles));

  // Warm the 30 s session cache with the pre-extend role set ([kasir]) so the
  // stale-cache probe below is deterministic. (kasir CAN read sales: pos tier.)
  const warm = await call(base, 'GET', '/api/sales', { jar, tries: 2 });
  ok('warm cache: kasir CAN read sales (pos tier) -> 200', warm.status === 200, 'got ' + warm.status);

  // Admin extends the dedicated user to multi-role [kasir, pembelian].
  const put = await call(base, 'PUT', '/api/users', {
    jar: adminJar,
    body: { id: refs.gp03UserId, roles: ['kasir', 'pembelian'] },
    tries: 3,
  });
  ok('PUT /api/users (add pembelian) -> 200 ok', put.status === 200 && put.json?.ok === true, 'got ' + put.status);
  const putRoles = (put.json?.roles as string[] | undefined) ?? [];
  ok('updated role set = [kasir, pembelian]', JSON.stringify(putRoles.sort()) === '["kasir","pembelian"]', JSON.stringify(putRoles));

  // Non-fatal, timing-bound to the 30s cache window: the pre-relogin session
  // still carries the stale role set ([kasir]), so switching to the just-added
  // role 403s (the PUT did NOT invalidate the session cache).
  const stale = await call(base, 'POST', '/api/auth/switch-role', {
    jar,
    body: { role: 'pembelian' },
    tries: 2,
  });
  if (stale.status === 403) note('stale session switch-role = 403', 'as expected within the 30s cache window');
  else note('stale session switch-role = ' + stale.status, 'cache already expired (200) — harmless');

  // MANDATORY re-login (fresh session) so createSession re-reads users.roles.
  const jar2 = new Map<string, string>();
  const re = await call(base, 'POST', '/api/auth/login', {
    jar: jar2,
    body: { username: 'gp03-kasir', password: 'gp03-kasir-pw' },
    tries: 4,
  });
  ok('MANDATORY re-login (fresh session) -> 200', re.status === 200, 'got ' + re.status);
  const reRoles = ((re.json?.user as { roles?: string[] } | undefined)?.roles ?? []);
  ok('fresh session sees [kasir, pembelian]', reRoles.includes('kasir') && reRoles.includes('pembelian'), JSON.stringify(reRoles));

  // Switch to pembelian (acting role = pembelian) — succeeds post-relogin.
  const sw = await call(base, 'POST', '/api/auth/switch-role', { jar: jar2, body: { role: 'pembelian' }, tries: 3 });
  ok('switch-role -> pembelian (200, changed)', sw.status === 200 && sw.json?.changed === true, 'got ' + sw.status);
  const swUser = sw.json?.user as { role?: string } | undefined;
  ok('acting role is now pembelian', String(swUser?.role) === 'pembelian', String(swUser?.role));

  // Acting-permission enforcement: pembelian IS in the supplier tier -> a
  // purchase is allowed; kasir is NOT -> denied. Dedicated supplier so the
  // DB read-back invariant is self-contained.
  const pId = refs.product['Teh Hijau Premium']?.id ?? refs.createdProductId;
  const purchOk = await call(base, 'POST', '/api/purchases', {
    jar: jar2,
    body: { product_id: pId, qty: 1, unit_cost: 1000, supplier: 'GP03 Purch' },
    tries: 2,
  });
  ok('pembelian CAN purchase/supplier -> 200 ok', purchOk.status === 200 && purchOk.json?.ok === true, 'got ' + purchOk.status);

  const backKasir = await call(base, 'POST', '/api/auth/switch-role', { jar: jar2, body: { role: 'kasir' }, tries: 3 });
  ok('switch-role back -> kasir (changed)', backKasir.status === 200 && backKasir.json?.changed === true, 'got ' + backKasir.status);
  const purchDenied = await call(base, 'POST', '/api/purchases', {
    jar: jar2,
    body: { product_id: pId, qty: 1, unit_cost: 1000, supplier: 'GP03 Purch' },
    tries: 2,
  });
  ok('kasir CANNOT purchase/supplier -> 403', purchDenied.status === 403, 'got ' + purchDenied.status);
}
async function gp04(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-04 · Purchase inbound (supplier) raises stock & cost');
  const p = refs.product['Madu Sachet'];
  if (!p) {
    ok('seeded "Madu Sachet" available', false, 'missing from catalog');
    return;
  }
  refs.purchaseProductId = p.id;
  const pre = p.stock;
  const res = await call(base, 'POST', '/api/purchases', {
    jar: adminJar,
    body: { product_id: p.id, qty: 10, unit_cost: 5000, supplier: 'GP Supplier' },
    tries: 3,
  });
  ok('POST /api/purchases -> 200 ok', res.status === 200 && res.json?.ok === true, 'got ' + res.status);
  ok('purchases response reports stock +10', res.json?.stock === pre + 10, 'got ' + String(res.json?.stock) + ', expected ' + (pre + 10));
}

async function gp05(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-05 · Member & loyalty earn (points invariant)');
  const uniquePhone = '081' + String(Date.now()).slice(-9);
  const mem = await call(base, 'POST', '/api/members', {
    jar: adminJar,
    body: { name: 'GP Member ' + Date.now(), phone: uniquePhone },
    tries: 3,
  });
  ok('POST /api/members -> 200 ok', mem.status === 200 && mem.json?.ok === true, 'got ' + mem.status);
  refs.memberId = Number(mem.json?.id ?? 0);
  ok('member id captured', refs.memberId > 0, 'id ' + refs.memberId);

  const box = refs.product['Madu Box'];
  if (!box) {
    ok('seeded "Madu Box" available', false, 'missing from catalog');
    return;
  }
  refs.loyaltyProductId = box.id;
  // Defaults: points_every=10000, member_discount=0, cashback=0, no birthday
  // date -> total 45000, floor(45000/10000)=4 points, total_spent 45000.
  const sale = await call(base, 'POST', '/api/sales', {
    jar: adminJar,
    body: { items: [{ product_id: box.id, qty: 1 }], pay_method: 'cash', amount_paid: 45000, member_id: refs.memberId, customer: '' },
    tries: 3,
  });
  ok('member sale -> 200 ok', sale.status === 200 && sale.json?.ok === true, 'got ' + sale.status);
  const s = sale.json?.sale as Record<string, unknown> | undefined;
  ok('sale total = 45000', s?.total === 45000, 'got ' + String(s?.total));
  ok('loyalty points earned = 4 (45000 / 10000)', s?.points === 4, 'got ' + String(s?.points));
}

async function gp06(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-06 · Zakat calc & record (history + audit)');
  const calc = await call(base, 'GET', '/api/zakat', { jar: adminJar, tries: 3 });
  ok('GET /api/zakat -> 200', calc.status === 200, 'got ' + calc.status);
  const c = calc.json;
  const shapeOk =
    !!c &&
    typeof c.total_assets === 'number' &&
    (c.status === 'wajib' || c.status === 'belum') &&
    typeof c.zakat_amount === 'number';
  ok('zakat calc has expected shape', shapeOk, 'status ' + String(c?.status));

  const rec = await call(base, 'POST', '/api/zakat', {
    jar: adminJar,
    body: { note: 'GP golden-path record', payment_type: 'cash' },
    tries: 3,
  });
  ok('POST /api/zakat (record) -> 200 ok', rec.status === 200 && rec.json?.ok === true, 'got ' + rec.status);
  ok('record id returned', Number(rec.json?.id ?? 0) > 0, 'id ' + String(rec.json?.id));
}

async function gp07(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-07 · POS transaction integrity (money-critical)');
  const water = refs.product['Air Mineral 600ml'];
  if (!water) {
    ok('seeded "Air Mineral 600ml" available', false, 'missing from catalog');
    return;
  }
  refs.posProductId = water.id;
  const qty = 2;
  const total = 3000 * qty; // base_price 3000 x 2, no member, no discount
  refs.gp07SaleTotal = total;
  const sale = await call(base, 'POST', '/api/sales', {
    jar: adminJar,
    body: { items: [{ product_id: water.id, qty }], pay_method: 'cash', amount_paid: total, customer: 'GP07' },
    tries: 3,
  });
  ok('POST /api/sales -> 200 ok', sale.status === 200 && sale.json?.ok === true, 'got ' + sale.status);
  const s = sale.json?.sale as Record<string, unknown> | undefined;
  ok('sale total = ' + total, s?.total === total, 'got ' + String(s?.total));
  refs.gp07SaleId = Number(s?.id ?? 0);
  ok('sale id returned', refs.gp07SaleId > 0, 'id ' + refs.gp07SaleId);
}

/**
 * GP-08 (W5.2 NEG-1): flag-gated negative stock for consignment items
 * ("barang titipan"). All steps go through the PUBLIC HTTP API on a fresh
 * local file DB (no direct DB writes):
 *  1. POST /api/products { is_consignment: 1, stock: 1 } -> 200;
 *  2. POST /api/sales qty 3 (> stock 1) -> 200 (allowed ONLY via the flag;
 *     the guarded decrement is bypassed for titipan rows);
 *  3. control: the same oversell on a regular seeded product must still be
 *     rejected (guard intact for non-consignment rows).
 * Read-back (in verifyDb): product row stock = -2, is_consignment = 1.
 */
async function gp08(base: string, refs: Refs, adminJar: Jar): Promise<void> {
  section('GP-08 · NEG-1 consignment (flag-gated negative stock)');
  const cons = await call(base, 'POST', '/api/products', {
    jar: adminJar,
    body: { name: 'GP-Titipan 6030', category: 'Uji', unit: 'pcs', base_price: 1000, cost_price: 0, stock: 1, is_consignment: 1 },
    tries: 3,
  });
  ok('POST /api/products (is_consignment=1, stock 1) -> 200 ok', cons.status === 200 && cons.json?.ok === true, 'got ' + cons.status);
  refs.gp08ConsignmentId = Number(cons.json?.id ?? 0);
  ok('consignment product id returned', refs.gp08ConsignmentId > 0, 'id ' + String(refs.gp08ConsignmentId));

  const qty = 3; // more than stock (1) -- allowed ONLY because is_consignment
  const total = 1000 * qty;
  refs.gp08SaleTotal = total;
  const sale = await call(base, 'POST', '/api/sales', {
    jar: adminJar,
    body: { items: [{ product_id: refs.gp08ConsignmentId, qty }], pay_method: 'cash', amount_paid: total, customer: 'GP08' },
    tries: 3,
  });
  ok('oversell consignment item -> 200 (flag-gated, NEG-1)', sale.status === 200 && sale.json?.ok === true, 'got ' + sale.status);
  refs.gp08SaleId = Number((sale.json?.sale as Record<string, unknown> | undefined)?.id ?? 0);
  ok('gp08 sale id returned', refs.gp08SaleId > 0, 'id ' + String(refs.gp08SaleId));

  const water = refs.product['Air Mineral 600ml'];
  if (water) {
    // Control: same oversell on a REGULAR (non-consignment) product must
    // still be rejected -- the oversell guard is intact outside the flag.
    const blockedQty = water.stock + 50;
    const blocked = await call(base, 'POST', '/api/sales', {
      jar: adminJar,
      body: { items: [{ product_id: water.id, qty: blockedQty }], pay_method: 'cash', amount_paid: 3000 * blockedQty, customer: 'GP08-C' },
      tries: 3,
    });
    ok('oversell regular item still blocked (guard intact)', blocked.status !== 200, 'got ' + blocked.status);
  }
}
// ── read-back invariants (executed AFTER the server is stopped) ────────────
async function verifyDb(refs: Refs, dbRel: string): Promise<void> {
  section('SQL read-back · business invariants (read-only)');
  const db = await openDbReadonly(dbRel);
  try {
    ok('seeded admin row present', (await db.count('SELECT COUNT(*) c FROM users WHERE username = ?', ['admin'])) === 1);
    ok('seeded products >= 8', (await db.count('SELECT COUNT(*) c FROM products')) >= 8);

    const created = await db.one('SELECT base_price, cost_price, stock FROM products WHERE id = ?', [refs.createdProductId]);
    ok(
      'created product row (500000 / 450000 / 5)',
      created?.base_price === 500000 && created?.cost_price === 450000 && created?.stock === 5,
      JSON.stringify(created)
    );

    const gp03RolesRow = await db.one('SELECT roles FROM users WHERE id = ?', [refs.gp03UserId]);
    const gp03RolesJson = String(gp03RolesRow?.roles ?? '');
    ok('gp03 user roles persisted [kasir, pembelian]', gp03RolesJson.includes('"kasir"') && gp03RolesJson.includes('"pembelian"'), gp03RolesJson);

    ok('audit: auth:switch-role fired', (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'auth:switch-role'")) >= 1);
    ok('audit: user:roles fired', (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'user:roles'")) >= 1);
    ok('audit: user:create fired', (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'user:create'")) >= 1);
    ok('purchase row recorded (GP Supplier)', (await db.count("SELECT COUNT(*) c FROM purchases WHERE supplier = 'GP Supplier'")) >= 1);
    ok('gp03 purchase row recorded (GP03 Purch)', (await db.count("SELECT COUNT(*) c FROM purchases WHERE supplier = 'GP03 Purch'")) >= 1);

    const maduSachet = refs.product['Madu Sachet'];
    if (maduSachet) {
      const st = await db.one('SELECT stock FROM products WHERE id = ?', [maduSachet.id]);
      ok('Madu Sachet stock +10 (purchase)', st?.stock === maduSachet.stock + 10, 'got ' + String(st?.stock) + ', base ' + maduSachet.stock);
    }

    const memRow = await db.one('SELECT points, total_spent FROM members WHERE id = ?', [refs.memberId]);
    ok('member.points = 4', memRow?.points === 4, 'got ' + String(memRow?.points));
    ok('member.total_spent = 45000', memRow?.total_spent === 45000, 'got ' + String(memRow?.total_spent));
    const ledger = await db.count(
      "SELECT COALESCE(SUM(delta),0) c FROM point_history WHERE member_id = ? AND reason IN ('earn','redeem','void','refund')",
      [refs.memberId]
    );
    ok(
      'SUM(point ledger, point reasons) = members.points',
      ledger === Number(memRow?.points ?? -1),
      'ledger ' + ledger + ' vs points ' + String(memRow?.points)
    );

    const box = refs.product['Madu Box'];
    if (box) {
      const st = await db.one('SELECT stock FROM products WHERE id = ?', [box.id]);
      ok('Madu Box stock -1 (member sale)', st?.stock === box.stock - 1, 'got ' + String(st?.stock) + ', base ' + box.stock);
    }
    const water = refs.product['Air Mineral 600ml'];
    if (water) {
      const st = await db.one('SELECT stock FROM products WHERE id = ?', [water.id]);
      ok('Air Mineral stock -2 (POS sale)', st?.stock === water.stock - 2, 'got ' + String(st?.stock) + ', base ' + water.stock);
    }

    const saleRow = await db.one('SELECT total, pay_method, status FROM sales WHERE id = ?', [refs.gp07SaleId]);
    ok(
      'GP-07 sale row (total 6000 / cash / unreported)',
      saleRow?.total === refs.gp07SaleTotal && saleRow?.pay_method === 'cash' && saleRow?.status === 'unreported',
      JSON.stringify(saleRow)
    );
    ok('GP-07 sale_items rows = 1', (await db.count('SELECT COUNT(*) c FROM sale_items WHERE sale_id = ?', [refs.gp07SaleId])) === 1);

    // GP-08 (W5.2 NEG-1): flag-gated negative stock, verified read-only.
    const gp08Row = await db.one('SELECT stock, is_consignment FROM products WHERE id = ?', [refs.gp08ConsignmentId]);
    ok('GP-08 consignment product stock = -2 (negative allowed, flag-gated)', gp08Row?.stock === -2, 'got ' + String(gp08Row?.stock));
    ok('GP-08 is_consignment persisted = 1', gp08Row?.is_consignment === 1, 'got ' + String(gp08Row?.is_consignment));
    const gp08SaleRow = await db.one('SELECT total, status FROM sales WHERE id = ?', [refs.gp08SaleId]);
    ok(
      'GP-08 sale row (total 3000 / unreported)',
      gp08SaleRow?.total === refs.gp08SaleTotal && gp08SaleRow?.status === 'unreported',
      JSON.stringify(gp08SaleRow)
    );

    ok('zakat_history row recorded', (await db.count('SELECT COUNT(*) c FROM zakat_history')) >= 1);
    ok('audit: zakat:record fired', (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'zakat:record'")) >= 1);
    ok('audit: sales:create fired', (await db.count("SELECT COUNT(*) c FROM audit_log WHERE action = 'sales:create'")) >= 1);
  } finally {
    db.close();
  }
}
async function main(): Promise<void> {
  const stamp = Date.now();
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const dbRel = 'file:./data/golden-test-' + stamp + '.db'; // mirrors .env.example local form
  const dbAbs = path.join(ROOT, 'data', 'golden-test-' + stamp + '.db');
  const mode = process.env.GOLDEN_MODE === 'prod' ? 'prod' : 'dev';

  console.log('P0-C1 Golden Path E2E');
  console.log('  mode: ' + mode + '   db: ' + dbRel + '   node: ' + process.version);

  const refs: Refs = {
    adminId: 0,
    createdProductId: 0,
    memberId: 0,
    product: {},
    purchaseProductId: 0,
    posProductId: 0,
    loyaltyProductId: 0,
    gp03UserId: 0,
    gp07SaleId: 0,
    gp07SaleTotal: 0,
    gp08ConsignmentId: 0,
    gp08SaleId: 0,
    gp08SaleTotal: 0,
  };

  let handle: ServerHandle | null = null;
  let ran = false;
  try {
    handle = await startServer(mode, dbRel);
    console.log('  server up at ' + handle.base);
    const adminJar = new Map<string, string>();
    await gp01(handle.base, refs);
    // gp01 only proves admin login works; it does NOT retain the session
    // cookie. Prime a live admin session into adminJar so every admin-gated
    // scenario (gp02..gp07) is authenticated. Without this the jar is empty
    // and all of those requests 401 ("Belum login").
    const adminPrime = await call(handle.base, 'POST', '/api/auth/login', {
      jar: adminJar,
      body: { username: 'admin', password: 'kopontren' },
      tries: 4,
    });
    ok('admin session jar primed (login -> 200)', adminPrime.status === 200 && adminPrime.json?.ok === true, 'status ' + adminPrime.status);
    await gp02(handle.base, refs, adminJar);
    await gp03(handle.base, refs, adminJar);
    await gp04(handle.base, refs, adminJar);
    await gp05(handle.base, refs, adminJar);
    await gp06(handle.base, refs, adminJar);
    await gp07(handle.base, refs, adminJar);
    await gp08(handle.base, refs, adminJar);
    ran = true;
  } finally {
    if (handle) await stopServer(handle);
  }

  // Read back the DB the app just wrote (writer stopped -> consistent view).
  if (ran) await verifyDb(refs, dbRel);

  console.log('\n---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures + (notes.length ? '  INFO: ' + notes.length : ''));
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  if (notes.length) {
    console.log('Non-fatal notes:');
    for (const n of notes) console.log('  ' + n);
  }

  if (process.env.GOLDEN_KEEP !== '1') {
    for (const f of [dbAbs, dbAbs + '-wal', dbAbs + '-shm']) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* not present */
      }
    }
  } else {
    console.log('GOLDEN_KEEP=1 — kept temp DB at ' + dbAbs);
  }

  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('GOLDEN PATH RUNNER ERROR:', e);
  process.exitCode = 1;
});