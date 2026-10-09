/**
 * P2 / Q62 (ruling Gus Fi 2026-10-10) -- test state machine approval flow.
 * Node langsung (type-stripping, Node >= 23.6; .mjs + import .ts):
 * npm run test:approval. DDL mirror src/db.ts (approval_requests v29
 * + tabel terkait); src/lib/approvals.ts di-impor ASLI (modul pure);
 * reverseJournal di-mock dgn semantik lib/jurnal.reverseJournalInTx.
 *
 * Suite:
 *  M1 allow-list + label + naturalKey
 *  M2 createRequest -> pending
 *  M3 dedupe per target
 *  M4 aksi di luar allow-list -> throw
 *  M5 withdraw (owner/non-owner/terminal)
 *  M6 decide tolak -> rejected
 *  M7 decide ulang -> not-pending
 *  M8 apply user:role
 *  M9 guard: demote admin terakhir -> rejected (guard)
 *  M10 apply user:create_admin
 *  M11 apply user:active (hapus sesi)
 *  M12 apply jurnal:reverse (mock)
 *  M13 guard: jurnal sudah dibalik -> rejected (mock tidak terpanggil)
 *  M14 apply kas:delete
 *  M15 guard: kas entry hilang -> rejected
 *  M16 self-decide (dua admin) -> throw
 *  M17 bootstrap 1-admin: self-decide diperbolehkan
 *  M18 no-permission: pemberi keputusan bukan admin aktif
 *  M19 getPending/getHistory (filter + urutan)
 */
import { DatabaseSync } from 'node:sqlite';
import {
  APPROVAL_ACTIONS,
  ACTION_LABELS,
  naturalKey,
  createRequest,
  decide,
  getHistory,
  getPending,
  withdraw,
  ApprovalError,
} from '../../src/lib/approvals.ts';

let passes = 0;
let failures = 0;
const failedNames = [];
function ok(name, cond, detail = '') {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    failedNames.push(name + (detail !== '' ? ' (' + detail + ')' : ''));
    console.error('  FAIL ' + name + ((detail !== '') ? ' (' + detail + ')' : ''));
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'dapat ' + String(actual) + ', seharusnya ' + String(expected));
}

// DDL mirror src/db.ts (skema v29: approval_requests + tabel terkait).
const DDL = [
  "CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'kasir', roles TEXT NOT NULL DEFAULT '[\"kasir\"]', active INTEGER NOT NULL DEFAULT 1, salt TEXT NOT NULL, pass_hash TEXT NOT NULL, pw_default INTEGER NOT NULL DEFAULT 0, created_by INTEGER)",
  'CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, active_role TEXT)',
  "CREATE TABLE journal_entries(id TEXT PRIMARY KEY, ref_table TEXT NOT NULL, ref_id TEXT, entry_date TEXT NOT NULL, type TEXT NOT NULL, desc TEXT NOT NULL, created_by TEXT, reversed_by TEXT NOT NULL DEFAULT '')",
  "CREATE TABLE journal_lines(entry_id TEXT NOT NULL, account_code TEXT NOT NULL, debit INTEGER NOT NULL, credit INTEGER NOT NULL, balance_running INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT '', PRIMARY KEY(entry_id, account_code, source, debit, credit))",
  'CREATE TABLE cash_entries(id INTEGER PRIMARY KEY, type TEXT NOT NULL, label TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, created_by INTEGER)',
  'CREATE TABLE approval_requests(' +
    'id INTEGER PRIMARY KEY, ' +
    'action TEXT NOT NULL, ' +
    'payload TEXT NOT NULL, ' +
    "target TEXT NOT NULL DEFAULT '', " +
    "status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied','withdrawn')), " +
    'request_user_id INTEGER NOT NULL, ' +
    'request_username TEXT NOT NULL, ' +
    "reason TEXT NOT NULL DEFAULT '', " +
    'decided_by INTEGER, ' +
    "decided_username TEXT NOT NULL DEFAULT '', " +
    'decided_at TEXT, ' +
    'applied_at TEXT, ' +
    "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))" +
    ')',
  'CREATE INDEX idx_approval_status ON approval_requests(status, created_at)',
  'CREATE INDEX idx_approval_pending ON approval_requests(action, target, status)',
];

function freshDb() {
  const db = new DatabaseSync(':memory:');
  for (const s of DDL) db.exec(s);
  // Seed: 2 admin aktif (a, b), 1 kasir aktif (c), 1 admin nonaktif (d).
  const insUser = db.prepare(
    "INSERT INTO users (id, username, role, roles, active, salt, pass_hash) VALUES (?, ?, ?, ?, ?, 's', 'h')"
  );
  insUser.run(1, 'a', 'admin', '["admin"]', 1);
  insUser.run(2, 'b', 'admin', '["admin"]', 1);
  insUser.run(3, 'c', 'kasir', '["kasir"]', 1);
  insUser.run(4, 'd', 'admin', '["admin"]', 0);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('t3', 3, '2099-01-01T00:00:00Z')").run();
  // Jurnal: JE-1 (punya baris, belum dibalik) + JE-2 (sudah dibalik).
  db.prepare("INSERT INTO journal_entries (id, ref_table, entry_date, type, desc, reversed_by) VALUES ('JE-1', 'manual', '2026-10-01', 'manual', 'manual', '')").run();
  db.prepare("INSERT INTO journal_lines (entry_id, account_code, debit, credit, source) VALUES ('JE-1', '1010', 100000, 0, 'manual')").run();
  db.prepare("INSERT INTO journal_entries (id, ref_table, entry_date, type, desc, reversed_by) VALUES ('JE-2', 'manual', '2026-10-01', 'manual', 'manual', 'JE-2#rev1')").run();
  // Kas: 1 entri.
  db.prepare("INSERT INTO cash_entries (id, type, label, amount) VALUES (1, 'income', 'Setor', 50000)").run();
  return db;
}

// Pembungkus ADb (async) di atas node:sqlite (sinkron).
function adb(db) {
  return {
    prepare: (sql) => ({
      get: async (...a) => db.prepare(sql).get(...a),
      all: async (...a) => db.prepare(sql).all(...a),
      run: async (...a) => {
        const r = db.prepare(sql).run(...a);
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
    }),
  };
}

// Mock reverseJournal (semantik lib/jurnal.reverseJournalInTx).
function makeReverseJournal() {
  let calls = 0;
  const reverseJournal = async (d, entryId, reason, user) => {
    calls++;
    const orig = await d.prepare('SELECT * FROM journal_entries WHERE id = ?').get(entryId);
    if (!orig) return null;
    if (orig.reversed_by) return orig.reversed_by;
    const lines = await d
      .prepare('SELECT account_code, debit, credit, source FROM journal_lines WHERE entry_id = ?')
      .all(entryId);
    if (lines.length === 0) return null;
    const revId = entryId + '#rev1';
    await d.prepare('UPDATE journal_entries SET reversed_by = ? WHERE id = ?').run(revId, entryId);
    await d
      .prepare(
        "INSERT INTO journal_entries (id, ref_table, entry_date, type, desc, created_by, reversed_by) VALUES (?, 'manual', '2026-10-10', 'reversal', ?, ?, '')"
      )
      .run(revId, 'Reversal of ' + entryId + ' (alasan: ' + reason + ')', user);
    for (const l of lines) {
      await d
        .prepare(
          'INSERT INTO journal_lines (entry_id, account_code, debit, credit, balance_running, source) VALUES (?, ?, ?, ?, 0, ?)'
        )
        .run(revId, l.account_code, l.credit, l.debit, l.source);
    }
    return revId;
  };
  return { reverseJournal, calls: () => calls };
}

const A = { id: 1, username: 'a' };
const B = { id: 2, username: 'b' };
const C = { id: 3, username: 'c' };
const D = { id: 4, username: 'd' };

// M1: allow-list + label + naturalKey.
console.log('M1: allow-list (5 aksi)');
eq('M1.1 jumlah aksi', APPROVAL_ACTIONS.length, 5);
eq('M1.2 label create_admin', ACTION_LABELS['user:create_admin'], 'Buat akun admin');
eq('M1.3 label kas:delete', ACTION_LABELS['kas:delete'], 'Hapus jurnal kas manual');
eq('M1.4 naturalKey create', naturalKey('user:create_admin', { username: 'x' }), 'user:x');
eq('M1.5 naturalKey role', naturalKey('user:role', { user_id: 7 }), 'user:7');
eq('M1.6 naturalKey reverse', naturalKey('jurnal:reverse', { entry_id: 'JE-9' }), 'je:JE-9');

const db = freshDb();
const d = adb(db);
const ctx = makeReverseJournal();

// M2: createRequest -> pending.
console.log('M2: createRequest');
const r1 = await createRequest(d, A, 'user:active', { user_id: 3, username: 'c', active: 0 }, '');
eq('M2.1 id baris baru', r1 > 0, true);
const row1 = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(r1);
eq('M2.2 status pending', row1.status, 'pending');
eq('M2.3 request_username', row1.request_username, 'a');
eq('M2.4 target', row1.target, 'user:3');

// M3: dedupe per target.
const r2 = await createRequest(d, B, 'user:active', { user_id: 3, username: 'c', active: 1 }, '');
eq('M3.1 dedupe -> id sama', r2, r1);
const r3 = await createRequest(d, B, 'user:role', { user_id: 3, username: 'c', new_primary: 'manajer', new_roles: ['manajer'], cur_primary: 'kasir', cur_roles: ['kasir'] }, '');
eq('M3.2 aksi lain target sama -> id baru', r3 !== r1, true);

// M4: aksi di luar allow-list.
console.log('M4: allow-list enforce');
await (async () => {
  try {
    await createRequest(d, A, 'user:hack', {}, '');
    ok('M4.1 aksi tak dikenal ditolak', false, 'tidak throw');
  } catch (e) {
    ok('M4.1 aksi tak dikenal ditolak', e instanceof ApprovalError && e.code === 'unknown-action');
  }
})();

// M5: withdraw (owner/non-owner/terminal).
console.log('M5: withdraw');
const r4 = await createRequest(d, A, 'kas:delete', { entry_id: 99, snapshot: { label: 'x', amount: 1 } }, '');
await (async () => {
  try {
    await withdraw(d, B, r4);
    ok('M5.1 non-owner ditolak', false, 'tidak throw');
  } catch (e) {
    ok('M5.1 non-owner ditolak', e instanceof ApprovalError && e.code === 'not-owner');
  }
})();
await withdraw(d, A, r4);
eq('M5.2 owner ok -> withdrawn', db.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r4).status, 'withdrawn');
await (async () => {
  try {
    await withdraw(d, A, r4);
    ok('M5.3 withdrawn terminal', false, 'tidak throw');
  } catch (e) {
    ok('M5.3 withdrawn terminal', e instanceof ApprovalError && e.code === 'not-pending');
  }
})();

// M6: decide tolak -> rejected.
console.log('M6: decide tolak');
const r5 = await createRequest(d, A, 'kas:delete', { entry_id: 1, snapshot: { label: 'Setor', amount: 50000 } }, '');
const res6 = await decide(d, B, { id: r5, approve: false, reason: 'tidak perlu' }, ctx);
eq('M6.1 applied=false', res6.applied, false);
eq('M6.2 status rejected', db.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r5).status, 'rejected');
eq('M6.3 decided_username', db.prepare('SELECT decided_username FROM approval_requests WHERE id = ?').get(r5).decided_username, 'b');
eq('M6.4 kas tidak terhapus', db.prepare('SELECT COUNT(*) c FROM cash_entries').get().c, 1);

// M7: decide ulang -> not-pending.
console.log('M7: state terminal');
await (async () => {
  try {
    await decide(d, B, { id: r5, approve: true }, ctx);
    ok('M7.1 decide pada rejected', false, 'tidak throw');
  } catch (e) {
    ok('M7.1 decide pada rejected', e instanceof ApprovalError && e.code === 'not-pending');
  }
})();

// M8: apply user:role.
console.log('M8: apply user:role');
// r3 (M3) masih pending utk target user:3 (pemohon B) -> tarik dulu,
// bila tidak createRequest M8 akan dedupe ke r3 (B memutus request B
// sendiri = self-decide, benar-benar diblokir lib).
await withdraw(d, B, r3);
eq('M8.0 r3 ditarik', db.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r3).status, 'withdrawn');
const r8 = await createRequest(d, A, 'user:role', { user_id: 3, username: 'c', new_primary: 'manajer', new_roles: ['manajer', 'gudang'], cur_primary: 'kasir', cur_roles: ['kasir'] }, '');
const res8 = await decide(d, B, { id: r8, approve: true }, ctx);
eq('M8.1 applied', res8.applied, true);
const u3 = db.prepare('SELECT role, roles FROM users WHERE id = 3').get();
eq('M8.2 role update', u3.role, 'manajer');
eq('M8.3 roles JSON', u3.roles, '["manajer","gudang"]');
eq('M8.4 status applied', db.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r8).status, 'applied');

// M9: guard demote admin terakhir.
console.log('M9: guard terakhir-admin');
// Db khusus: hanya 1 admin (x) -> demote x ditolak guard.
const db9 = freshDb();
const d9 = adb(db9);
db9.prepare("DELETE FROM users WHERE id IN (2,4)").run(); // sisa: a(admin aktif), c(kasir), d(hapus)
db9.prepare("DELETE FROM users WHERE id = 4").run();
db9.prepare("DELETE FROM users WHERE id = 2").run();
// a = satu-satunya admin; a sendiri memohon demote dirinya (kasir).
const r9 = await createRequest(d9, A, 'user:role', { user_id: 1, username: 'a', new_primary: 'kasir', new_roles: ['kasir'], cur_primary: 'admin', cur_roles: ['admin'] }, '');
const res9 = await decide(d9, A, { id: r9, approve: true }, ctx); // bootstrap 1-admin
eq('M9.1 bootstrap self ok (self_bootstrap)', res9.self_bootstrap, true);
eq('M9.2 guard menolak demote admin terakhir', res9.applied, false);
eq('M9.3 alasan guard', res9.guard_reason, 'tidak boleh mendemote admin terakhir');
eq('M9.4 status rejected-guard', db9.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r9).status, 'rejected');
eq('M9.5 role tetap admin', db9.prepare('SELECT role FROM users WHERE id = 1').get().role, 'admin');

// M10: apply user:create_admin.
console.log('M10: apply user:create_admin');
const r10 = await createRequest(d, A, 'user:create_admin', {
  username: 'gus2',
  display_name: 'Gus Dua',
  salt: 's1',
  pass_hash: 'h1',
  created_by: 1,
}, '');
const res10 = await decide(d, B, { id: r10, approve: true }, ctx);
eq('M10.1 applied', res10.applied, true);
const u10 = db.prepare("SELECT * FROM users WHERE username = 'gus2'").get();
ok('M10.2 user admin baru', u10 && u10.role === 'admin' && u10.roles === '["admin"]' && u10.created_by === 1);
eq('M10.3 status applied', db.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r10).status, 'applied');
// M10.4 guard: username sudah dipakai -> rejected. ('gus2' = hasil M10;
// panjang 3+ s.d. 30 karakter agar lolos validasi bentuk -> masuk
// check duplikat, bukan tolak bentuk.)
const r10b = await createRequest(d, A, 'user:create_admin', { username: 'gus2', salt: 's', pass_hash: 'h', created_by: 1 }, '');
const res10b = await decide(d, B, { id: r10b, approve: true }, ctx);
eq('M10.4 guard username dipakai', res10b.applied, false);
eq('M10.5 alasan guard', res10b.guard_reason, 'username sudah dipakai');

// M11: apply user:active (hapus sesi).
console.log('M11: apply user:active');
const r11 = await createRequest(d, A, 'user:active', { user_id: 3, username: 'c', active: 0 }, '');
const res11 = await decide(d, B, { id: r11, approve: true }, ctx);
eq('M11.1 applied', res11.applied, true);
eq('M11.2 user nonaktif', db.prepare('SELECT active FROM users WHERE id = 3').get().active, 0);
eq('M11.3 sesi terhapus', db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = 3').get().c, 0);

// M12: apply jurnal:reverse (mock).
console.log('M12: apply jurnal:reverse');
const before12 = ctx.calls();
const r12 = await createRequest(d, A, 'jurnal:reverse', { entry_id: 'JE-1', reason: 'salah input' }, '');
const res12 = await decide(d, B, { id: r12, approve: true }, ctx);
eq('M12.1 applied', res12.applied, true);
eq('M12.2 mock terpanggil', ctx.calls(), before12 + 1);
eq('M12.3 reversed_by set', db.prepare("SELECT reversed_by FROM journal_entries WHERE id = 'JE-1'").get().reversed_by, 'JE-1#rev1');
const rev = db.prepare("SELECT * FROM journal_entries WHERE id = 'JE-1#rev1'").get();
ok('M12.4 entri reversal dibuat', rev && rev.type === 'reversal');
const revLines = db.prepare("SELECT debit, credit FROM journal_lines WHERE entry_id = 'JE-1#rev1'").all();
eq('M12.5 kaki terbalik', revLines.length === 1 && revLines[0].debit === 0 && revLines[0].credit === 100000, true);

// M13: guard jurnal sudah dibalik.
console.log('M13: guard jurnal sudah dibalik');
const before13 = ctx.calls();
const r13 = await createRequest(d, A, 'jurnal:reverse', { entry_id: 'JE-2', reason: 'x' }, '');
const res13 = await decide(d, B, { id: r13, approve: true }, ctx);
eq('M13.1 guard menolak', res13.applied, false);
eq('M13.2 alasan guard', res13.guard_reason, 'jurnal sudah dibalik');
eq('M13.3 mock tidak terpanggil (guard duluan)', ctx.calls(), before13);

// M14: apply kas:delete.
console.log('M14: apply kas:delete');
const r14 = await createRequest(d, B, 'kas:delete', { entry_id: 1, snapshot: { type: 'income', label: 'Setor', amount: 50000 } }, '');
const res14 = await decide(d, A, { id: r14, approve: true }, ctx);
eq('M14.1 applied', res14.applied, true);
eq('M14.2 entri kas terhapus', db.prepare('SELECT COUNT(*) c FROM cash_entries').get().c, 0);

// M15: guard kas entry hilang.
console.log('M15: guard kas entry hilang');
const r15 = await createRequest(d, B, 'kas:delete', { entry_id: 99, snapshot: { label: 'x', amount: 1 } }, '');
const res15 = await decide(d, A, { id: r15, approve: true }, ctx);
eq('M15.1 guard menolak', res15.applied, false);
eq('M15.2 alasan guard', res15.guard_reason, 'jurnal kas tidak ditemukan');

// M16: self-decide (dua admin aktif).
console.log('M16: aturan dua orang');
const db16 = freshDb();
const d16 = adb(db16);
const r16 = await createRequest(d16, A, 'kas:delete', { entry_id: 1, snapshot: { label: 'x', amount: 1 } }, '');
try {
  await decide(d16, A, { id: r16, approve: true }, ctx);
  ok('M16.1 self-decide ditolak (2 admin)', false, 'tidak throw');
} catch (e) {
  ok('M16.1 self-decide ditolak (2 admin)', e instanceof ApprovalError && e.code === 'self-decide');
}
eq('M16.2 status tetap pending', db16.prepare('SELECT status FROM approval_requests WHERE id = ?').get(r16).status, 'pending');

// M17: bootstrap 1-admin: self-decide create_admin diperbolehkan.
console.log('M17: bootstrap 1-admin');
const db17 = freshDb();
const d17 = adb(db17);
db17.prepare('DELETE FROM users WHERE id IN (2,4)').run();
const r17 = await createRequest(d17, A, 'user:create_admin', { username: 'gusdua', display_name: '', salt: 's2', pass_hash: 'h2', created_by: 1 }, '');
const res17 = await decide(d17, A, { id: r17, approve: true }, ctx);
eq('M17.1 self_bootstrap', res17.self_bootstrap, true);
eq('M17.2 applied', res17.applied, true);
ok('M17.3 admin ke-2 tercipta', db17.prepare("SELECT 1 x FROM users WHERE username = 'gusdua' AND role = 'admin'").get() != null);

// M18: no-permission (kasir memutus; admin nonaktif memutus).
console.log('M18: no-permission');
const db18 = freshDb();
const d18 = adb(db18);
const r18 = await createRequest(d18, B, 'kas:delete', { entry_id: 1, snapshot: { label: 'x', amount: 1 } }, '');
try {
  await decide(d18, C, { id: r18, approve: true }, ctx);
  ok('M18.1 kasir tidak bisa memutuskan', false, 'tidak throw');
} catch (e) {
  ok('M18.1 kasir tidak bisa memutuskan', e instanceof ApprovalError && e.code === 'no-permission');
}
try {
  await decide(d18, D, { id: r18, approve: true }, ctx); // d = admin nonaktif
  ok('M18.2 admin nonaktif tidak bisa memutuskan', false, 'tidak throw');
} catch (e) {
  ok('M18.2 admin nonaktif tidak bisa memutuskan', e instanceof ApprovalError && e.code === 'no-permission');
}

// M19: getPending/getHistory (filter + urutan).
console.log('M19: list per tab');
// Buat 1 request pending baru (target ce:5 belum pernah dipakai di db ini).
const r19 = await createRequest(d, B, 'kas:delete', { entry_id: 5, snapshot: { label: 'y', amount: 2 } }, '');
const pend = await getPending(d);
ok('M19.1 semua pending', pend.length > 0 && pend.every((x) => x.status === 'pending'), String(pend.length));
ok('M19.5 request baru ada di pending', pend.some((x) => x.id === r19), true);
const hist = await getHistory(d, 200);
ok('M19.2 semua closed', hist.every((x) => ['approved', 'rejected', 'applied', 'withdrawn'].includes(x.status)), String(hist.length));
eq(
  'M19.3 riwayat newest-first',
  hist.length === 0 ? 0 : hist[0].id,
  hist.length === 0 ? 0 : Math.max(...hist.map((x) => x.id))
);
ok('M19.4 pending tidak ada di riwayat', !hist.some((x) => x.status === 'pending'), true);

// Ringkasan.
console.log('\napproval-flow: ' + passes + ' lulus, ' + failures + ' gagal');
if (failures > 0) console.log('gagal: ' + failedNames.join(' | '));
process.exitCode = failures > 0 ? 1 : 0;
