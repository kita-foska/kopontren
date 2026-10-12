/**
 * P3c -- Unit test src/lib/member/ekspor-csv.ts (builder CSV unduhan
 * sisi pengguna, self-scope). Suite 31 (test:all = 31).
 * Node langsung (type-stripping, Node >= 23.6), konvensi sama dgn
 * test-admin-export.ts / test-coop-pinjaman.ts: modul hermetis diuji
 * langsung + node:sqlite in-memory utk scope (user A TAK PERNAH lihat
 * data user B).
 *     npm run test:member-export   (== node scripts/test-member-export.ts)
 *
 * Sifat yang diuji:
 *  - csvEscape: kutip/dobel-ganda/koma/baris-baru; null -> ''.
 *  - EKSPOR_JENIS: 3 jenis.
 *  - Query self-scope: poin/transaksi WHERE member_id = ?; koperasi
 *    hanya atas id anggota koperasi hasil cocok-nama (lower(trim(name))).
 *  - Build: BOM di depan; header Indonesia; data kosong -> header saja;
 *    per jenis (tanggal WIB, label reason/metode bayar, catatan NULL -> '');
 *    nama file member-ekspor-{jenis}-{YYYY-MM-DD}.csv.
 *  - ASCII: isi CSV bebas karakter non-ASCII.
 */
import { DatabaseSync } from 'node:sqlite';
import {
  CSV_BOM,
  EKSPOR_JENIS,
  buildKoperasiCsv,
  buildPoinCsv,
  buildTransaksiCsv,
  coopMemberIdsQuery,
  csvEscape,
  eksporFilename,
  koperasiQuery,
  poinQuery,
  transaksiQuery,
  type EksporKoperasiRow,
  type EksporPoinRow,
  type EksporTransaksiRow,
} from '../src/lib/member/ekspor-csv.ts';

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

// DDL minimal mirror skema produksi (kolom yang dipakai query modul).
function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE point_history(
      id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL, delta INTEGER NOT NULL,
      reason TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0,
      sale_id INTEGER, created_at TEXT NOT NULL);
    CREATE TABLE sales(
      id INTEGER PRIMARY KEY, member_id INTEGER, total INTEGER NOT NULL,
      pay_method TEXT NOT NULL, status TEXT NOT NULL,
      member_points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE coop_members(id TEXT PRIMARY KEY, name TEXT NOT NULL, UNIQUE(name));
    CREATE TABLE coop_pinjaman(
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, akad TEXT NOT NULL DEFAULT 'qardh',
      pokok INTEGER NOT NULL, sisa INTEGER NOT NULL, tanggal_mulai TEXT NOT NULL,
      tanggal_jatuh_tempo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif',
      catatan TEXT, created_at TEXT NOT NULL);
  `);
  // Dua member + dua anggota koperasi ("user B" = member 2 / cm-2).
  db.exec(`
    INSERT INTO point_history (id, member_id, delta, reason, amount, sale_id, created_at) VALUES
      (1, 1, 50, 'earn', 100000, 11, '2026-10-01T18:00:00.000Z'),
      (2, 1, -5000, 'cashback_use', 0, 11, '2026-10-02T02:30:00.000Z'),
      (3, 2, 30, 'earn', 60000, 21, '2026-10-01T19:00:00.000Z');
    INSERT INTO sales (id, member_id, total, pay_method, status, member_points, created_at) VALUES
      (11, 1, 100000, 'tf', 'selesai', 50, '2026-10-01T18:00:00.000Z'),
      (21, 2, 60000, 'cash', 'selesai', 30, '2026-10-01T19:00:00.000Z');
    INSERT INTO coop_members (id, name) VALUES ('cm-1', 'Ahmad'), ('cm-2', 'Badu');
    INSERT INTO coop_pinjaman (id, member_id, pokok, sisa, tanggal_mulai, tanggal_jatuh_tempo, status, catatan, created_at) VALUES
      ('LP-1', 'cm-1', 200000, 150000, '2026-09-01', '2026-12-01', 'aktif', 'bayar 3x', '2026-09-01T00:00:00.000Z'),
      ('LP-2', 'cm-2', 500000, 0, '2026-08-01', '2026-08-15', 'lunas', NULL, '2026-08-01T00:00:00.000Z');
  `);
  return db;
}

function main(): void {
  const db = makeDb();

  // -- csvEscape --
  ok('escape: tanpa karakter khusus = apa adanya', csvEscape('Ahmad') === 'Ahmad');
  ok('escape: kutip digandakan', csvEscape('a"b') === '"a""b"');
  ok('escape: koma -> kutip', csvEscape('a,b') === '"a,b"');
  ok('escape: baris-baru -> kutip', csvEscape('a\nb') === '"a\nb"');
  ok('escape: null -> string kosong', csvEscape(null) === '');
  ok('escape: angka', csvEscape(1000) === '1000');

  // -- EKSPOR_JENIS --
  ok(
    'jenis: tepat 3 (poin/transaksi/koperasi)',
    EKSPOR_JENIS.length === 3 &&
      JSON.stringify(EKSPOR_JENIS) === JSON.stringify(['poin', 'transaksi', 'koperasi']),
  );

  // -- scope poin (SQL level: user A tidak melihat data user B) --
  {
    const q = poinQuery(1);
    const rows = db.prepare(q.sql).all(...q.args) as unknown as { member_id: number }[];
    ok('scope poin: hanya member 1 (2 baris)', rows.length === 2 && rows.every((r) => r.member_id === 1));
    const q2 = poinQuery(2);
    const rows2 = db.prepare(q2.sql).all(...q2.args) as unknown as { member_id: number }[];
    ok('scope poin: hanya member 2 (1 baris)', rows2.length === 1 && rows2[0].member_id === 2);
  }

  // -- scope transaksi --
  {
    const q = transaksiQuery(1);
    const rows = db.prepare(q.sql).all(...q.args) as unknown as { id: number; member_id: number }[];
    ok('scope transaksi: hanya member 1', rows.length === 1 && rows[0].id === 11 && rows[0].member_id === 1);
  }

  // -- scope koperasi (cocok-nama P1c, tanpa bias huruf besar/kecil) --
  {
    const q = coopMemberIdsQuery('ahmad');
    const ids = (db.prepare(q.sql).all(...q.args) as unknown as { id: string }[]).map((r) => r.id);
    ok('scope koperasi: nama tak bias huruf (ahmad -> cm-1)', JSON.stringify(ids) === '["cm-1"]', JSON.stringify(ids));
    const q2 = koperasiQuery(ids);
    const loans = db.prepare(q2.sql).all(...q2.args) as unknown as { id: string; member_id: string }[];
    ok(
      'scope koperasi: pinjaman cm-1 saja (LP-2 tak bocor)',
      loans.length === 1 && loans[0].id === 'LP-1' && loans[0].member_id === 'cm-1',
    );
  }

  // -- build: BOM + header + baris (poin) --
  {
    const rows: EksporPoinRow[] = [
      { member_id: 1, delta: 50, reason: 'earn', amount: 100000, sale_id: 11, created_at: '2026-10-01T18:00:00.000Z' },
      { member_id: 1, delta: -5000, reason: 'cashback_use', amount: 0, sale_id: null, created_at: '2026-10-02T02:30:00.000Z' },
    ];
    const r = buildPoinCsv(rows, '2026-10-12');
    ok('poin: BOM di depan', r.csv.startsWith(CSV_BOM));
    const body = r.csv.slice(CSV_BOM.length).split('\n');
    ok(
      'poin: header Indonesia',
      body[0] === 'Tanggal (WIB),Peristiwa,Delta,Unit,Jumlah (Rupiah),No. Transaksi',
      body[0],
    );
    ok('poin: 2 baris data', body.length === 3);
    // 2026-10-01 18:00 UTC = 2026-10-02 01:00 WIB.
    ok('poin: tanggal WIB (UTC+7)', body[1].startsWith('2026-10-02 01:00:00,'), body[1]);
    ok('poin: label reason + unit poin', body[1].includes('Poin Masuk,50,poin,100000,11'), body[1]);
    // 2026-10-02 02:30 UTC = 09:30 WIB; sale_id null -> kolom kosong.
    ok('poin: cashback rupiah + transaksi kosong', body[2] === '2026-10-02 09:30:00,Reward Terpakai,-5000,rupiah,0,', body[2]);
    ok('poin: nama file', r.filename === 'member-ekspor-poin-2026-10-12.csv', r.filename);
  }

  // -- build: transaksi --
  {
    const rows: EksporTransaksiRow[] = [
      { id: 11, member_id: 1, total: 100000, pay_method: 'tf', status: 'selesai', member_points: 50, created_at: '2026-10-01T18:00:00.000Z' },
    ];
    const r = buildTransaksiCsv(rows, '2026-10-12');
    const body = r.csv.slice(CSV_BOM.length).split('\n');
    ok('transaksi: header Indonesia', body[0] === 'No.,Tanggal (WIB),Total (Rupiah),Metode Bayar,Status,Poin', body[0]);
    ok('transaksi: baris (label Transfer, WIB)', body[1] === '11,2026-10-02 01:00:00,100000,Transfer,selesai,50', body[1]);
    ok('transaksi: nama file', r.filename === 'member-ekspor-transaksi-2026-10-12.csv', r.filename);
  }

  // -- build: koperasi (catatan koma -> kutip; NULL -> kosong) --
  {
    const rows: EksporKoperasiRow[] = [
      { id: 'LP-1', member_id: 'cm-1', akad: 'qardh', pokok: 200000, sisa: 150000, tanggal_mulai: '2026-09-01', tanggal_jatuh_tempo: '2026-12-01', status: 'aktif', catatan: 'bayar, 3x' },
    ];
    const r = buildKoperasiCsv(rows, '2026-10-12');
    const body = r.csv.slice(CSV_BOM.length).split('\n');
    ok('koperasi: header Indonesia', body[0] === 'No.,Akad,Pokok (Rupiah),Sisa (Rupiah),Tgl Mulai,Tgl Jatuh Tempo,Status,Catatan', body[0]);
    ok('koperasi: catatan ber-koma -> kutip', body[1] === 'LP-1,qardh,200000,150000,2026-09-01,2026-12-01,aktif,"bayar, 3x"', body[1]);
    ok('koperasi: nama file', r.filename === 'member-ekspor-koperasi-2026-10-12.csv', r.filename);
    const r2 = buildKoperasiCsv(
      [
        {
          id: 'LP-2',
          member_id: 'cm-2',
          akad: 'qardh',
          pokok: 500000,
          sisa: 0,
          tanggal_mulai: '2026-08-01',
          tanggal_jatuh_tempo: '2026-08-15',
          status: 'lunas',
          catatan: null,
        },
      ],
      '2026-10-12',
    );
    ok('koperasi: catatan NULL -> kolom kosong', r2.csv.endsWith('lunas,'), r2.csv);
  }

  // -- data kosong: header saja (tetap valid utk Excel) --
  ok('kosong: poin header saja', buildPoinCsv([], '2026-10-12').csv === CSV_BOM + 'Tanggal (WIB),Peristiwa,Delta,Unit,Jumlah (Rupiah),No. Transaksi');
  ok('kosong: transaksi header saja', buildTransaksiCsv([], '2026-10-12').csv === CSV_BOM + 'No.,Tanggal (WIB),Total (Rupiah),Metode Bayar,Status,Poin');
  ok('kosong: koperasi header saja', buildKoperasiCsv([], '2026-10-12').csv === CSV_BOM + 'No.,Akad,Pokok (Rupiah),Sisa (Rupiah),Tgl Mulai,Tgl Jatuh Tempo,Status,Catatan');

  // -- helper nama file --
  ok(
    'nama file: per jenis',
    eksporFilename('poin', '2026-10-12') === 'member-ekspor-poin-2026-10-12.csv' &&
      eksporFilename('koperasi', '2026-10-12') === 'member-ekspor-koperasi-2026-10-12.csv',
  );

  // -- ASCII: isi CSV bebas karakter non-ASCII --
  {
    const sample =
      buildPoinCsv([], '2026-10-12').csv +
      buildTransaksiCsv([], '2026-10-12').csv +
      buildKoperasiCsv([], '2026-10-12').csv;
    const nonAscii = [...sample].filter((ch) => ch.charCodeAt(0) > 127 && ch !== '\uFEFF');
    ok('ascii: teks CSV bebas non-ASCII', nonAscii.length === 0, nonAscii.slice(0, 5).join(''));
  }

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();

