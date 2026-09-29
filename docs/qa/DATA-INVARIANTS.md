# P0-C2 · Data Invariants + Restore Drill — E2E Release Gate

Companion to `GOLDEN-PATH.md` (P0-C1). `scripts/test-invariants.ts`
(`npm run test:invariants`) is a deterministic end-to-end gate that proves two
things on a **fresh local database**:

1. **Data invariants hold** — money-critical consistency rules are true at the
   SQLite level (read-only SQL read-back).
2. **A total-loss restore drill recovers cleanly** — a full backup is exported,
   the database file is deleted (catastrophic loss), the app is restarted, the
   backup is imported, and both the data and the invariants come back intact.

It is the pre-deployment gate for **data integrity + disaster recovery**:
nothing ships to Turso/Vercel while this is red.

## Run

```bash
# Default: spawns `next dev` (no prior build needed).
npm run test:invariants

# Most faithful gate right before a real deploy (needs a prior build):
npm run build
INVAR_MODE=prod npm run test:invariants
```

Options: `INVAR_PORT=3210` (pin a port), `INVAR_KEEP=1` (retain the temp DB
for inspection). The harness auto-picks a free port and cleans up
`data/invariants-test-<stamp>.db` afterwards.

### Exit contract

Prints `ALL_PASS` / `HAS_FAILURE` and sets `process.exitCode` (`0` / `1`).
Uses **`process.exitCode`, not `process.exit()`** (Node 24 / Windows fastfail
guard) — same as every other `scripts/test-*.ts`.

### Release-gate rule

> A deploy MUST only proceed when **both** `npm run test:golden` (P0-C1) and
> `npm run test:invariants` (P0-C2) exit `0`. Any `FAIL` blocks the release.

## Flow

| Phase | Action | Why |
|-------|--------|-----|
| 1 | Boot app on a fresh `file:` DB (auto-seeds `admin`/`kopontren` + 8 demo products), seed a minimal money set (1 purchase, 1 member, 1 member sale, 1 POS sale) | healthy baseline |
| 1b | Run **pre-loss** invariants + audit checks | invariants must hold on the healthy DB |
| 1c | `GET /api/backup` → full snapshot; record per-table row counts | the artifact we will restore from |
| 2 | Delete the DB file (`-wal`/`-shm` too) | simulate **total loss** |
| 3 | Restart the app (fresh auto-seed), `POST /api/backup` with the snapshot | restore |
| 4 | Verify per-table counts == snapshot, **post-restore** invariants, `backup:import` audit, and that `GET /api/products` serves the restored catalog | proof of recovery |

## Data invariants (read-only SQL)

| # | Assertion | What it guards |
|---|-----------|----------------|
| INV-1 | `COUNT(*) products WHERE stock < 0` = 0 | no negative inventory |
| INV-2 | `sale_items` with no parent `sales` row = 0 | referential integrity |
| INV-3 | `returns` with no parent `sales` row = 0 | referential integrity |
| INV-4 | per member: `members.points` = `Σ point_history.delta` (point reasons) | loyalty ledger integrity |
| INV-5 | `debts.remaining` = `debts.amount - debts.paid` | receivables arithmetic |
| INV-6 | `payables.remaining` = `payables.amount - payables.paid` | payables arithmetic |
| INV-7 | `sales.total` / `sales.amount_paid` non-negative | money sanity |

Checked both **pre-loss** and **post-restore**.

## Bug found by the drill (P0-C2)

The original backup (`GET`/`POST /api/backup`) omitted the **`point_history`**
table. After a total-loss restore, `members.points` was re-inserted but the
supporting ledger rows were lost, so **INV-4 broke** (e.g. `points = 4` with
`Σ point_history = 0`). The fix adds `point_history` to the backup payload:
export (`SELECT *`), FK-safe `DELETE` (before `members`), import (`INSERT`
after `members`), and the `backup:import` audit count. The drill now passes.

## Maintenance

- **Seeded names are the contract.** The seed uses `Madu Sachet`, `Madu Box`,
  and `Air Mineral 600ml`; if the demo catalog names change, update the lookups
  in `seedMoney()`.
- **Point math assumes defaults** (`points_every=10000`, no discount/cashback).
  INV-4 is a *relative* ledger check (points vs ledger), so it is robust to the
  exact point value, but keep the seed's member sale in place to populate
  `point_history`.
- **Windows:** relies on Node's type-stripping for `.ts` and
  `process.exitCode` for exit propagation; keep both. Child-process teardown is
  best-effort; on a flaky host a stray `next` process may remain — check and kill.
- **Removal retries:** the total-loss step (phase 2) retries `rmSync` up to
  90 s and the final cleanup up to 30 s, because Windows releases SQLite
  handles seconds (or longer under load) after the `next dev` tree is killed.
  `stopServer` re-issues `taskkill /T /F` until the root PID is gone. If
  "DB file removed" still fails after retries, a process is holding the DB —
  kill the stray `next` process and rerun.