# P0-C4 · Production Release Gate

Capstone of **P0 Production Certification** (checkpoints C1 → C4).
This document defines the release gate that must be green before
anything ships to production (Turso/Vercel), records the P0 findings,
and lists the P1/P2 items that remain open after certification.

Companions:

- `GOLDEN-PATH.md` (P0-C1) — E2E API gate (`test:golden`)
- `DATA-INVARIANTS.md` (P0-C2) — data integrity + restore drill
  (`test:invariants`)
- `src/lib/rekonsiliasi.ts` + `scripts/test-rekonsiliasi.ts` (P0-C3) —
  13-check read-only reconciliation (`test:rekon`, `/admin/rekonsiliasi`)

## The rule

> **Nothing ships to production while the gate below is red.**

## 1. Automated gates (all must be green / EXIT 0)

| # | Gate | Command | What it proves |
| - | ---- | ------- | -------------- |
| 1 | Golden path (prod mode) | `npm run build` then `GOLDEN_MODE=prod npm run test:golden` | 7 E2E scenarios over real HTTP on a fresh DB + money invariants read back from SQLite |
| 2 | Invariants + restore drill | `INVAR_MODE=prod npm run test:invariants` | Money/points invariants hold; catastrophic-loss restore recovers cleanly |
| 3 | Reconciliation | `npm run test:rekon` | 13 checks all-ok on guard-consistent seed; drift detection precise per corrupted scenario |
| 4 | Multi-role | `npm run test:roles` | Role set, normalization, parse + release-gate assertions |
| 5 | Regression battery | `test:phone`, `test:margin`, `test:split`, `test:zakat`, `test:points`, `test:neraca`, `test:rekap`, `test:konsinyasi`, `test:wholesale`, `test:qris`, `test:clientip`, `test:fetch` | Protected logic unchanged |
| 6 | Type check | `npx tsc --noEmit` | — |
| 7 | Build | `npm run build` | All routes compile, including `/admin/rekonsiliasi` + `/api/reconciliation` |

## 2. Deploy & verify (Vercel, from `main`)

- [ ] Dual-push `master` + `main`, in sync; Vercel deploys from `main`.
- [ ] Deployment reaches **Ready + Production**.
- [ ] SW-BUILD stamp changed vs the previous build (fingerprint check).
- [ ] The stamped `public/sw.js` is **never committed** (stamp is
      injected at build time by `scripts/inject-sw-version.mjs`).
- [ ] Smoke: `/admin/produk` loads (P0-C1 bug site — was a 500 before
      the trailing-comma fix).
- [ ] Run `/admin/rekonsiliasi` once on live data: expected
      `drift_total = 0` on healthy data; any drift is flag-only and
      triaged by hand — **the gate never auto-fixes data**.

## 3. P0 checkpoint status

| Ckpt | Scope | Status |
| ---- | ----- | ------ |
| C1 | Golden Path E2E release gate | ✅ commit `662b654` |
| C2 | Data invariants + restore drill + backup fix | ✅ commit `7f09341` |
| C3 | Reconciliation module (13 checks, read-only, admin UI) | ✅ commit `206350f` |
| C4 | This gate doc + `MEMORY.md`/`TODO.md` + scratch cleanup | ✅ this commit |

## P0 findings — 4 production bugs

| # | Bug | Found in | Impact if unfixed | Fix commit |
| - | --- | -------- | ----------------- | ---------- |
| 1 | `GET /api/products` SQL with a trailing comma (`…, FROM products`) — introduced by `37d0a34` (grosir) | C1 | 500 on **every** authenticated product listing (catalog unreadable at `/admin/produk`) | `662b654` |
| 2 | `point_history` missing from backup export, import, DELETE list and audit | C2 | Restore → member point ledger lost, or stale/orphan rows on old DBs | `7f09341` |
| 3 | Reconciliation check read `payables.owner_name`; the real column is `supplier_name` | C3 | Runtime 500 "no such column" on the new route | `206350f` |
| 4 | KONSIN check missed the overpay sub-condition (`amount_paid > tagihan`); settled sub-condition refined to `> 0` | C3 | Overpayments undetected; settled ≠ lunas invariant incomplete | `206350f` |

All four were found by the P0 test gates themselves — the validation
that the certification approach catches real production bugs.

## What this certification does NOT cover

- **Syariah**: P3 zakat and P4 konsinyasi figures remain
  **provisional** until tashih by pengasuh/ulama
  (`P3-TASHIH-ZAKAT.md`, `P4-PROPOSAL-KONSINYASI.md`). No fiqih
  decision is made by this app; see the "jangan dilakukan dulu" list
  in `PROGRESS-2026-09.md` (Bagian 35).
- **Documented V1 limitations** (KEUANGAN_NOTES / NERACA_NOTES):
  retur COGS not yet reversed; piutang/hutang are cash-only (not P&L);
  zakat filtered by `paid_at`; stock valued at `cost_price`;
  "modal setara" ≠ formal equity. These are known, documented, and
  scheduled (V2-2 below).
- **Operational verification**: real-device pixel checks (Gus Fi),
  HP/PWA manual flows, grosir live monitoring, NMID for QRIS —
  ongoing, non-blocking.

## P1/P2 — open items after certification (non-blocking)

### Residual UX-audit P1/P2 (FASE 2 audit, 23 Sep — TODO.md § FASE 2)

- Batches A–D closed the P1 functional bugs + most P2 UX items
  (`9ef700e`, `cb792aa`, `ec9d9c9`, `e9ebfdb`).
- Known open P2 residuals:
  - Laporan pagination loop — if one mid-stream request fails, the
    list is truncated without an indicator.
  - `/retur` transaction dropdown capped at the last 100 (30 days).

### V2 — deferred until after certification

- **V2-1 · I-7 void reason (structural)**: voiding a transaction
  should require a reason from a governed list. The list of valid
  reasons + business-flow risk needs an **pengurus decision**
  (phase UX-6.5 after ACC).
- **V2-2 · COGS/HPP reversal**: today (V1 doc-note) the COGS of a
  returned item is not reversed, so laba/HPP are not fully accurate
  after returs. Implement the reversal and align the invariants +
  reconciliation checks with it.

### Professional tier (TODO.md § Kelompok P, P1–P15)

Zero-thinking UX · role-based experience · attention system · smart
defaults · no-typing forms · undo-first · immutable audit trail ·
"Explain this number" · number source drill-down · period context ·
freeze/close period · backup rasa aman · health center · offline
confidence · confidence language — post-certification backlog.

### Roadmap after P0

1. **V2** — V2-1 (I-7) → V2-2 (COGS reversal).
2. **Fase 3 — Akuntansi Terbaru**: audit akuntansi (SAK EP,
   SAK Syariah, PAP) → proposal desain → tashih → implementasi.
3. **Roadmap bakpao.id** (7 fitur).

## Standing release rules

- Write/commit target: `D:\Ngudi Susilo\kopontren-app` only;
  `kp-zip3` is reference-only (routine resync, non-git).
- Dual-push discipline: `master` + `main` always in sync.
- Never commit the stamped `public/sw.js`.
- ASCII-safe commit subjects.
- Reconciliation and all P0 gates are **flag-only / read-only** —
  no auto-fix of production data, ever.
