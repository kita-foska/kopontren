# M1 — Multi-Role (Primary Role + Mode Switch)

- **Status:** IN PROGRESS (keputusan eksekusi ACC Gus Fi, 27 Sep 2026)
- **Urutan eksekusi:** M1 selesai → P0 Production Certification (Golden Path C1→C4)
- **Prinsip:** perubahan terkecil yang aman; **zero perubahan** di logika
  permission (`canAccess`, `isManager`, guard route) — semua otomatis
  membaca role aktif sesi.

## 1. Keputusan desain (ACC Gus Fi, 27 Sep)

| # | Keputusan | Pilihan |
|---|-----------|---------|
| 1 | Model role | **Primary + additional (mode switch)** — *active-role-only*, bukan union-all. Menu & permission selalu mengikuti 1 role aktif; audit bersih ("acting as X"). |
| 2 | Siapa yang boleh multi-role | **Semua user**, diassign oleh admin via halaman Pengguna. |
| 3 | Default role aktif saat login | **Primary role** (`users.role`). "Last used" tidak dipersist (V1). |
| 4 | Audit trail | `audit_log.user_role` (kolom existing) = snapshot **acting role** → zero perubahan di 20+ route. Event baru `auth:switch-role` merekam `{active_role: {before, after}, primary_role}` di fieldChanges/new_value. **Tidak menambah kolom baru** di `audit_log` (V1). |

## 2. Skema (Option A — JSON, migrasi V19)

- `users.roles TEXT NOT NULL DEFAULT '["kasir"]'` — JSON array of role,
  **harus memuat `users.role` (primary)**. Validasi enum via `normRole()`.
- `sessions.active_role TEXT NOT NULL` — role aktif sesi, default =
  primary user saat `createSession`.
- Backfill idempoten: `users.roles = [role]`; `sessions.active_role =
  users.role` (via JOIN). `SCHEMA_VERSION` 18 → 19.
- Alasan JSON (bukan join table `user_roles`): 1 kolom, tanpa risiko FK
  orphan, tak ada query SQL "siapa punya role X" (halaman Pengguna
  fetch semua user), jumlah role tetap ≤ 7.

## 3. Semantik runtime

- `AppUser` bertambah: `roles: Role[]`, `primary_role: Role`;
  **`AppUser.role` kini = role aktif sesi** (`sessions.active_role`,
  fallback `users.role` bila kolom kosong/legacy).
- Konsekuensi otomatis & terdokumentasi:
  - `canAccess(user, f)` / `isManager(user)` / semua guard = **active-role-only**.
  - Sidebar & deep-link server-driven tetap tak berubah (baca `user.role`).
  - `logAudit` (snapshot `user_role`) otomatis = acting role.
- Login: `createSession` menulis `active_role = users.role`.
- Re-auth PIN (`/api/auth/pin/verify`): sesi baru **menempatkan** role
  aktif terakhir (bukan reset ke primary).

## 4. Mode switch — `POST /api/auth/switch-role`

1. `currentUser()` (wajib login; 401 bila tidak).
2. Validasi: `body.role` lolos `normRole()` **dan** tercantum dalam
   `user.roles` → selain itu 403.
3. `UPDATE sessions SET active_role = ?, last_activity = ?` (baris sesi
   ini).
4. **Invalidasi `sessionCache`** token ini (cache 30 dtk) — wajib, agar
   role baru langsung berlaku di request berikutnya.
5. `logAudit(user, 'auth:switch-role', ...)`: fieldChanges
   `{active_role: {before, after}}`, new_value `{primary_role}`.
6. Respon `{ ok, role }` → UI memanggil `router.refresh()` (server
   re-render menu sesuai role baru; tanpa state menu di client).

Batasan terdokumentasi: Vercel multi-instance — instance lain bisa
menyajikan role lama s.d. 30 detik setelah switch. Aman: semua role
yang tersampel milik user yang sama (bukan eskalasi privilege).

## 5. Manajemen user (halaman Pengguna)

- Form: **primary** (radio) + **tambahan** (checkbox, ⊇ primary
  dihindari: primary selalu otomatis masuk set).
- `PUT /api/users` (admin-only, jalur baru) dengan guard:
  1. hanya admin;
  2. **tak boleh mengubah primary role milik sendiri**;
  3. **tak boleh mendemote admin terakhir** (hitung admin dari
     `role='admin' ATAU roles memuat admin`).
- `GET /api/users` menyertakan `roles[]`.

## 6. Audit & testing

- Event: `auth:switch-role` (entity `users`/`sessions`); snapshot
  `user_role` = acting role di semua event lain (tanpa perubahan kode).
- Test murni (`scripts/test-roles.ts`): parse/validasi `users.roles`
  JSON, guard switch (target ∈ roles + normRole), guard admin-terakhir,
  fallback active→primary.
- Gate per commit: diff → ACC → `tsc --noEmit` (+ build utk commit
  kode) → dual-push master+main. sw.js tidak pernah di-commit.

## 7. Commit plan

| # | Scope | Status |
|---|-------|--------|
| M1-1 | Dokumen ini + update MEMORY/TODO | ini |
| M1-2 | Skema V19: `users.roles` + `sessions.active_role` + backfill + SCHEMA_VERSION | |
| M1-3 | auth.ts (buildUser/currentUser/checkSession/findSessionUser/createSession + cache invalidation), `POST /api/auth/switch-role`, respon login/session + `roles[]/primary_role`, PIN verify preserve active | |
| M1-4 | UI switcher (hamburger + desktop), `PUT/GET /api/users` role/roles + guard, form Pengguna | |
| M1-5 | Audit `auth:switch-role` + doc README auth | |
| M1-6 | `scripts/test-roles.ts` + MEMORY/TODO + release gate | |
