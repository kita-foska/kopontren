# P0-C1 · Golden Path — E2E Release Gate

A single, deterministic end-to-end test that drives the real HTTP API of the
running app against a **fresh local database** and then verifies the
money-critical invariants directly in SQLite. It is the pre-deployment gate:
nothing ships to Turso/Vercel while this is red.

## What it validates

`scripts/test-golden.ts` boots the app (`next dev` by default, `next start`
with `GOLDEN_MODE=prod`), points `DATABASE_URL` at a throwaway
`file:./data/golden-test-<stamp>.db`, and — because a brand-new DB auto-seeds
`admin`/`kopontren` + 8 demo products on the first `db()` call — exercises the
critical flows end-to-end:

| ID | Scenario | Critical business question |
|----|----------|----------------------------|
| GP-01 | Bootstrap & admin login | Fresh install self-seeds; admin can authenticate; auth wall holds |
| GP-02 | Catalog & product create | Catalog readable; a priced product can be created |
| GP-03 | Multi-role switch & acting-perm enforcement | A multi-role user can act as another role; acting-role gates apply; audit trail records it |
| GP-04 | Purchase inbound (supplier) | Buying stock raises product stock + records cost |
| GP-05 | Member & loyalty earn | A member sale credits points exactly (ledger invariant) |
| GP-06 | Zakat calc & record | Zakat calc returns a valid shape; recording writes history + audit |
| GP-07 | POS transaction integrity | A sale writes a consistent sales row + line items + decrements stock |

After the scenarios the server is stopped and the SQLite file is read back
**read-only** (via `@libsql/client`, the app's own engine) to assert the
invariants in the [SQL read-back](#sql-read-back-invariants) section.

## Prerequisites

- Node ≥ 24 (the script runs directly under Node's type-stripping — no build
  of the *test* is required; it matches the other `test:*` scripts).
- `npm install` done (`next`, `@libsql/client` present).
- For `GOLDEN_MODE=prod`: a prior `npm run build` (`.next/`).
- No remote DB needed — the harness uses a local file DB and deletes it after
  (unless `GOLDEN_KEEP=1`).

## How to run

```bash
# Default: spawns `next dev`, source-identical to prod for route behavior.
npm run test:golden

# Most faithful gate right before a real deploy (needs a prior build):
npm run build
GOLDEN_MODE=prod npm run test:golden
```

Options: `GOLDEN_PORT=3210` (pin a port), `GOLDEN_KEEP=1` (retain the temp DB
for inspection). The harness auto-picks a free port otherwise and cleans up
`data/golden-test-<stamp>.db`.

### Exit contract

The script prints `ALL_PASS` / `HAS_FAILURE` and sets `process.exitCode`
(`0` / `1`). It deliberately uses **`process.exitCode`, not `process.exit()`**
— on Node 24 / Windows a hard `process.exit()` while libuv async handles are
still open can fastfail
(`Assertion failed: !(handle->flags & UV_HANDLE_CLOSEREG)`, `0xC0000409`).
This matches every other `scripts/test-*.ts`.

### Release-gate rule

> A deploy to Turso/Vercel MUST only proceed when `npm run test:golden`
> exits `0` (`ALL_PASS`). Any `FAIL` line — in a scenario **or** in the SQL
> read-back — blocks the release. `INFO` notes are non-fatal.

## Scenario catalog

Product ids are resolved **by name** from the seed (never hard-coded), so the
suite survives catalog/schema drift. Each scenario lists the API calls, the
expected results, and the invariant it protects.

### GP-01 · Bootstrap & admin login
- **Goal:** a fresh install self-seeds; the admin can authenticate; unauthed
  access is denied.
- **Steps:**
  1. `GET /api/products` (no cookie) → **401** (auth wall).
  2. `POST /api/auth/login {username:"admin", password:"kopontren"}` → **200**
     `{ok:true, user:{role:"admin", roles:["admin"], id}}`.
  3. `POST /api/auth/login` with a wrong password → **401**.
- **Invariant:** seeded `users` row `admin` exists; login returns the seeded
  id; bad creds are rejected.

### GP-02 · Catalog & product create
- **Goal:** the catalog is readable and a priced product can be created.
- **Steps:**
  1. `GET /api/products` (admin) → **200**, `products.length ≥ 8` (seed).
  2. `POST /api/products {name:"GP-Test Emas 10g", category:"Uji",
     unit:"pcs", base_price:500000, cost_price:450000, stock:5}` → **200**
     `{ok:true, id}`.
- **Invariant:** the created product row stores `base_price=500000`,
  `cost_price=450000`, `stock=5` (integers floor to whole rupiah).

### GP-03 · Multi-role switch & acting-permission enforcement
- **Goal:** a multi-role account can act as a second role; **all** API gates
  then evaluate against the *acting* role (`canAccess` uses `user.role`, the
  session's `active_role`); the change is audited.
- **Steps:**
  1. `PUT /api/users {id:<adminId>, roles:["admin","kasir"]}` (admin) →
     **200** `{ok, role:"admin", roles:["admin","kasir"]}`; writes
     `users.roles` + fires `user:roles` audit.
  2. *(INFO, non-fatal)* `POST /api/auth/switch-role {role:"kasir"}` on the
     **pre-relogin** session → **403** — see the [session-cache note](#session-cache-and-role-switching).
  3. **Re-login** (new cookie) → **200**; the fresh session sees
     `roles` incl. `kasir`.
  4. `POST /api/auth/switch-role {role:"kasir"}` → **200** `{changed:true,
     user.role:"kasir"}`.
  5. `POST /api/sales {items:[{product_id:<Teh Hijau Premium>, qty:1}],
     pay_method:"cash", amount_paid:12000, customer:"GP03-Kasir"}` → **200**
     (`kasir` has tier `pos`).
  6. `POST /api/purchases {product_id:…, qty:1, …}` → **403** (`kasir` lacks
     tier `supplier`).
  7. `POST /api/auth/switch-role {role:"admin"}` → **200** `{changed:true}`.
- **Invariants:** `users.roles` for the admin includes `kasir`; `audit_log`
  has ≥1 `auth:switch-role` **and** ≥1 `user:roles`; a GP-03 sale row exists.

### GP-04 · Purchase inbound (supplier)
- **Goal:** buying from a supplier raises stock and records the unit cost.
- **Steps:** `POST /api/purchases {product_id:<Madu Sachet>, qty:10,
  unit_cost:5000, supplier:"GP Supplier"}` (admin) → **200**
  `{ok, stock:<base+10>}`.
- **Invariants:** a `purchases` row for `GP Supplier` exists; product stock
  rose by exactly `qty` (`base+10`); `cost_price` updated to `5000`.

### GP-05 · Member & loyalty earn
- **Goal:** a member sale credits points exactly (loyalty ledger consistency).
- **Precondition defaults** (fresh DB): `points_every=10000`,
  `member_discount=0`, `cashback=0`, no birthday date → deterministic.
- **Steps:**
  1. `POST /api/members {name, phone}` (admin) → **200** `{ok, id}`.
  2. `POST /api/sales {items:[{product_id:<Madu Box>, qty:1}], pay_method:
     "cash", amount_paid:45000, member_id:<memberId>}` → **200** with
     `sale.total=45000`, `sale.points=4` (`floor(45000/10000)`).
- **Invariants:** `members.points = 4`; `members.total_spent = 45000`;
  `Σ point_history.delta` over point reasons (`earn/redeem/void/refund`) for
  that member **equals** `members.points` (ledger == balance); product stock
  fell by 1.

### GP-06 · Zakat calc & record
- **Goal:** the zakat module computes and records.
- **Steps:**
  1. `GET /api/zakat` (admin) → **200** with a valid calculation shape
     (`total_assets` numeric, `status ∈ {wajib, belum}`, `zakat_amount`
     numeric).
  2. `POST /api/zakat {note:"GP golden-path record", payment_type:"cash"}`
     → **200** `{ok, id}` (admin-only write).
- **Invariants:** `zakat_history` has ≥1 row; `audit_log` has ≥1
  `zakat:record`.

### GP-07 · POS transaction integrity
- **Goal:** a plain sale produces a consistent, money-critical record.
- **Steps:** `POST /api/sales {items:[{product_id:<Air Mineral 600ml>,
  qty:2}], pay_method:"cash", amount_paid:6000, customer:"GP07"}` (admin) →
  **200** with `sale.total=6000`.
- **Invariants:** `sales` row has `total=6000`, `pay_method="cash"`,
  `status="unreported"`; exactly 1 `sale_items` row for it; product stock fell
  by 2; `audit_log` has ≥1 `sales:create`.

## Session cache and role switching (why GP-03 re-logs-in)

This is the crux of P0-C1's blocked item, now resolved:

- `checkSession()` keeps an **in-memory 30-second session cache** keyed by the
  hashed token. The cached object includes the user's full `roles` set,
  captured at login / last DB read.
- `PUT /api/users` (adding roles) writes `users.roles` and fires the
  `user:roles` audit, **but does not invalidate the session cache** for the
  affected user.
- The `switch-role` route gates on `me.roles.includes(target)` where `me`
  comes from that *cached* session. So immediately after a role change, the
  **same** session still carries the stale role set → `switchRole('kasir')`
  returns **403** ("Role tidak dimiliki akun ini.") for up to 30 s.
- `switchRole()` itself re-reads the DB and invalidates the cache, so once the
  cache is refreshed the new acting role is honored on the very next request.

**Deterministic resolution used by GP-03:** re-login after the role change.
`createSession` re-reads `users.roles`, so the fresh session knows the account
holds `kasir` and the switch succeeds. The stale-cache 403 is captured as a
non-fatal `INFO` note (it is timing-bound to the 30 s window; a `200` simply
means the window already lapsed — both are correct, the mandatory re-login
path is what the suite hard-asserts).

**Recommended follow-up (not part of this test):** have the users-role PUT
invalidate the affected users' session cache entries (e.g. delete the
`sessionCache` entries for the target user's tokens), so an admin granting a
role doesn't need to re-login for it to take effect on a live session. GP-03
locks in today's behavior; that enhancement would let us drop the re-login
step.

## SQL read-back invariants

Executed against the temp DB **after** the server is stopped (consistent,
no write contention), read-only through `@libsql/client` (falls back to
`node:sqlite`). Each check is a hard `ok()` unless noted.

| # | Assertion | Guarded by |
|---|-----------|------------|
| 1 | `COUNT(*) WHERE users.username='admin'` = 1 | GP-01 |
| 2 | `COUNT(*) products` ≥ 8 (seed intact) | GP-02 |
| 3 | created product row = `(500000, 450000, 5)` | GP-02 |
| 4 | admin `users.roles` includes `"kasir"` | GP-03 |
| 5 | `audit_log` has `auth:switch-role` ≥ 1 | GP-03 |
| 6 | `audit_log` has `user:roles` ≥ 1 | GP-03 |
| 7 | `purchases` has a `GP Supplier` row | GP-04 |
| 8 | `Madu Sachet` stock = base + 10 | GP-04 |
| 9 | `members.points` = 4 and `total_spent` = 45000 | GP-05 |
| 10 | `Σ point_history.delta` (point reasons) = `members.points` | GP-05 |
| 11 | `Madu Box` stock = base − 1 | GP-05 |
| 12 | `Air Mineral 600ml` stock = base − 2 | GP-07 |
| 13 | GP-07 `sales` row = `(6000, 'cash', 'unreported')` | GP-07 |
| 14 | GP-07 `sale_items` rows = 1 | GP-07 |
| 15 | `zakat_history` rows ≥ 1 | GP-06 |
| 16 | `audit_log` has `zakat:record` ≥ 1 and `sales:create` ≥ 1 | GP-06 / GP-07 |

## Reading the output

- `ok …` / `PASS: n FAIL: m ALL_PASS` — every hard check passed; exit `0`.
- `FAIL …` / `HAS_FAILURE` — at least one hard check failed; exit `1`.
- `INFO …` (under *Non-fatal notes*) — an observed-but-expected variance
  (currently only the timing-bound GP-03 stale-cache note); never fails the
  suite.

A useful diagnostic when the server won't come up: the harness throws the
last ~3 KB of the child's stdout/stderr (e.g. a `DATABASE_URL` problem or a
compile error). Run with `GOLDEN_KEEP=1` to keep the temp DB and inspect it.

## Maintenance

- **Seeded names are the contract.** If the demo-catalog names change, update
  the lookups in `gp02` (`Madu Sachet`, `Madu Box`, `Air Mineral 600ml`,
  `Teh Hijau Premium`) and the expected stock/point values above stay valid
  only while the seed prices hold (45000 → 4 pts, 3000×2 → 6000).
- **Defaults drive GP-05.** The point math assumes the default member
  settings (`points_every=10000`, no discount/cashback). If global member
  settings are changed in the DB, recompute the expected values.
- **Zakat GP-06 is shape/record based, not value based** — it does not assert
  a specific `status`, so it is robust to zakat-gold-standard settings.
- **Windows:** the harness relies on Node's type-stripping for `.ts` and
  `process.exitCode` for exit propagation; keep both (see the exit-contract
  note). Child-process teardown is best-effort (`SIGKILL` fallback); on a
  flaky host a stray `next` process may remain — check for and kill it.