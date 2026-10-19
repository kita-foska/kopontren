/**
 * W8-1 (Q72) -- Unit test src/lib/audit-anomaly.ts (modul pure deteksi
 * anomali audit_log). Suite #38. Node langsung (type-stripping),
 * konvensi sama dgn test-health.ts / test-multisatuan.ts.
 *
 * Sifat yang diuji:
 *  - wibHour (konversi UTC->WIB, edge: tengah malam, tengah hari);
 *  - A1 BULK_DELETE: >= 3 delete/60 mnt (per tabel); 2 delete = tak flag;
 *    per tabel terpisah; bulk-delete (1 baris, banyak ID) tetap 1 delete;
 *  - A2 PRICE_JUMP: 50% = flag (boundary), 40% = tak flag; before=0 = skip;
 *    parse JSON corrupt = skip; arah naik & turun;
 *  - A3 AFTER_HOURS: 20:00 WIB = flag, 05:59 = flag, 06:00 = tak flag,
 *    19:59 = tak flag (batas jam operasional 06:00-20:00);
 *  - gabungan: multiple flags; log kosong = 0 flags; non-ASCII bebas.
 */
import {
  detectAnomalies,
  wibHour,
  ANOMALY_DEFAULTS,
  DELETE_ACTIONS,
  type AuditLogRow,
} from '../src/lib/audit-anomaly.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let passes = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passes++;
    console.log('  ok   ' + name + (detail ? ' (' + detail + ')' : ''));
  } else {
    failures++;
    console.error('  FAIL ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

function row(over: Partial<AuditLogRow>): AuditLogRow {
  return {
    id: 1,
    action: 'product:update',
    table_name: 'products',
    record_id: null,
    old_value: null,
    new_value: null,
    user_name: 'admin',
    created_at: '2026-10-19T03:00:00.000Z', // 10:00 WIB
    ...over,
  };
}

function main(): void {
  console.log('audit-anomaly: ' + ANOMALY_DEFAULTS.bulkDeleteThreshold +
    ' deletes/' + ANOMALY_DEFAULTS.bulkDeleteWindowMin + ' mnt, ' +
    ANOMALY_DEFAULTS.priceJumpPercent + '% jump, ' +
    ANOMALY_DEFAULTS.afterHoursStart + ':00-' +
    ANOMALY_DEFAULTS.afterHoursEnd + ':00 WIB');

  // -- wibHour --
  ok('wibHour: 2026-10-19T03:00Z = 10:00 WIB', wibHour('2026-10-19T03:00:00.000Z') === 10);
  ok('wibHour: tengah malam UTC = 07:00 WIB', wibHour('2026-10-19T00:00:00.000Z') === 7);
  ok('wibHour: 18:00Z = 01:00 WIB (wrap)', wibHour('2026-10-19T18:00:00.000Z') === 1);

  // -- A1: BULK_DELETE --
  const del = (id: number, t: string) =>
    row({ id, action: 'product:delete', table_name: 'products', record_id: id, created_at: t });
  const t0 = '2026-10-19T03:00:00.000Z'; // 10:00 WIB
  const within = [del(1, t0), del(2, '2026-10-19T03:10:00.000Z'), del(3, '2026-10-19T03:20:00.000Z')];
  let f = detectAnomalies(within);
  ok('A1: 3 delete/20 mnt = 1 flag bulk_delete', f.length === 1 && f[0].rule === 'bulk_delete', 'n=' + f.length);
  ok('A1: count = 3', f[0].count === 3);
  ok('A1: sample_ids = [1,2,3]', f[0].sample_ids?.join(',') === '1,2,3');
  const two = [del(1, t0), del(2, '2026-10-19T03:10:00.000Z')];
  f = detectAnomalies(two);
  ok('A1: 2 delete < 3 = tak ada flag', f.length === 0, 'n=' + f.length);

  // Per tabel: 2 delete products + 2 delete members (masing-masing < 3) = tak ada flag
  const splitTables = [
    del(1, t0),
    del(2, '2026-10-19T03:10:00.000Z'),
    row({ id: 3, action: 'member:delete', table_name: 'members', record_id: 3, created_at: t0 }),
    row({ id: 4, action: 'member:delete', table_name: 'members', record_id: 4, created_at: '2026-10-19T03:10:00.000Z' }),
  ];
  f = detectAnomalies(splitTables);
  ok('A1: 2+2 tabel terpisah = 0 flag', f.length === 0, 'n=' + f.length);
  // Di luar jendela: jarak antar delete > 60 mnt (03:00 -> 04:01 = 61 mnt)
  const spread = [del(1, '2026-10-19T03:00:00.000Z'), del(2, '2026-10-19T03:59:00.000Z'), del(3, '2026-10-19T04:01:00.000Z')];
  f = detectAnomalies(spread);
  ok('A1: spread > 60 mnt = 0 flag', f.length === 0, 'n=' + f.length);
  // bulk-delete = 1 baris delete dgn banyak ID (TIDAK di-count per-ID; tetap 1 delete)
  const bulk = [row({ id: 1, action: 'products:bulk-delete', table_name: 'products', record_id: null, new_value: JSON.stringify({ ids: [1, 2, 3, 4, 5] }), created_at: t0 })];
  f = detectAnomalies(bulk);
  ok('A1: 1 bulk-delete < 3 = 0 flag', f.length === 0, 'n=' + f.length);

  // -- A2: PRICE_JUMP --
  // old_value/new_value = fieldChanges { base_price: <skala> } (pola lib/audit.ts).
  const jump = (before: number, after: number, id: number) =>
    row({
      id,
      action: 'product:update',
      table_name: 'products',
      record_id: id,
      old_value: JSON.stringify({ base_price: before }),
      new_value: JSON.stringify({ base_price: after }),
      created_at: t0,
    });
  f = detectAnomalies([jump(10000, 5000, 1)]);
  ok('A2: -50% = flag (boundary)', f.length === 1 && f[0].rule === 'price_jump', 'n=' + f.length);
  f = detectAnomalies([jump(10000, 15000, 2)]);
  ok('A2: +50% = flag (boundary)', f.length === 1 && f[0].rule === 'price_jump');
  f = detectAnomalies([jump(10000, 6000, 3)]);
  ok('A2: -40% < 50% = tak ada flag', f.length === 0, 'n=' + f.length);
  f = detectAnomalies([jump(0, 10000, 4)]);
  ok('A2: before=0 = skip (bagi nol)', f.length === 0, 'n=' + f.length);
  f = detectAnomalies([
    row({ id: 5, action: 'product:update', old_value: '{ corrupt json', new_value: '}', created_at: t0 }),
  ]);
  ok('A2: JSON corrupt = skip', f.length === 0, 'n=' + f.length);
  f = detectAnomalies([jump(2000, 3000, 6)]);
  ok('A2: +50% (angka kecil) = flag, detail 2000->3000', f.length === 1 && f[0].detail.includes('2000') && f[0].detail.includes('3000'));

  // -- A3: AFTER_HOURS --
  const inHours = row({ id: 1, action: 'product:update', created_at: '2026-10-19T03:00:00.000Z' }); // 10:00 WIB
  f = detectAnomalies([inHours]);
  ok('A3: 10:00 WIB = dalam jam = 0 flag', f.length === 0, 'n=' + f.length);
  const evening = row({ id: 2, action: 'product:update', created_at: '2026-10-19T13:00:00.000Z' }); // 20:00 WIB
  f = detectAnomalies([evening]);
  ok('A3: 20:00 WIB = luar jam = 1 flag', f.length === 1 && f[0].rule === 'after_hours');
  const early = row({ id: 3, action: 'product:update', created_at: '2026-10-19T22:59:00.000Z' }); // 05:59 WIB
  f = detectAnomalies([early]);
  ok('A3: 05:59 WIB = luar jam = 1 flag', f.length === 1 && f[0].rule === 'after_hours');
  const morning = row({ id: 4, action: 'product:update', created_at: '2026-10-19T23:00:00.000Z' }); // 06:00 WIB
  f = detectAnomalies([morning]);
  ok('A3: 06:00 WIB = dalam jam = 0 flag', f.length === 0, 'n=' + f.length);
  const noon = row({ id: 5, action: 'product:update', created_at: '2026-10-19T12:59:00.000Z' }); // 19:59 WIB
  f = detectAnomalies([noon]);
  ok('A3: 19:59 WIB = dalam jam = 0 flag', f.length === 0, 'n=' + f.length);

  // -- Gabungan --
  const mixed = [
    del(1, t0),
    del(2, '2026-10-19T03:05:00.000Z'),
    del(3, '2026-10-19T03:10:00.000Z'),
    jump(10000, 4000, 7),
    row({ id: 8, action: 'product:update', created_at: '2026-10-19T13:30:00.000Z' }), // 20:30 WIB
  ];
  f = detectAnomalies(mixed);
  const rules = new Set(f.map((x) => x.rule));
  ok('Gabungan: 3 aturan berbeda = 3 flags', rules.size === 3 && f.length === 3, JSON.stringify([...rules]));
  ok('Gabungan: after_hours severity = info', f.find((x) => x.rule === 'after_hours')?.severity === 'info');
  ok('Gabungan: bulk_delete severity = warn', f.find((x) => x.rule === 'bulk_delete')?.severity === 'warn');

  // -- Edge: log kosong --
  f = detectAnomalies([]);
  ok('Log kosong = 0 flags', f.length === 0);

  // -- DELETE_ACTIONS konsisten dgn aksi di aplikasi --
  for (const a of ['product:delete', 'member:delete', 'sales:delete', 'kas:delete_requested', 'products:bulk-delete']) {
    ok('DELETE_ACTIONS: ' + a, DELETE_ACTIONS.has(a));
  }

  // -- Beban non-ASCII: modul audit-anomaly bebas unicode --
  const src = readFileSync(join(process.cwd(), 'src/lib/audit-anomaly.ts'), 'utf8');
  let bad = 0;
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) > 0x7f) bad++;
  }
  ok('Modul audit-anomaly.ts bebas non-ASCII', bad === 0, bad + ' char');

  console.log('');
  console.log(passes + '/' + (passes + failures) + ' passed' + (failures > 0 ? ', ' + failures + ' FAILED' : ''));
  process.exitCode = failures > 0 ? 1 : 0;
}

main();

