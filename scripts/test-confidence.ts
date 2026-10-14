/**
 * P15-A CONFIDENCE LANGUAGE (2026-10-13) -- Unit test src/lib/confidence.ts
 * (sumber tunggal label freshness / kelengkapan / sinkron / klaim data).
 * Suite 34 (test:all = 34). Node langsung (type-stripping), konvensi
 * sama dgn test-health.ts: modul hermetis diuji langsung, nowIso diinjeksi.
 *     npm run test:confidence   (== node scripts/test-confidence.ts)
 *
 * Sifat yang diuji:
 *  - ageDays: null / hari ini / 1 hari / 35 hari / masa depan (clamp) /
 *    string tak valid;
 *  - ageLabel: null -> "Belum ada catatan", 0 -> "Hari ini",
 *    1 -> "1 hari lalu", N -> "N hari lalu";
 *  - freshnessStamp: "Terakhir diperbarui {umur}" utk semua edge;
 *  - COMPLETE_LABEL / emptyLabel (default "data" + kustom);
 *  - syncLabel: 0 -> "Tersinkron", 1 -> "Menunggu sinkronisasi",
 *    n -> "n menunggu sinkronisasi" (negatif ikut "Tersinkron");
 *  - wibTime / wibTimeSec: zona Asia/Jakarta (UTC+7), null & tak valid;
 *  - dataPerLabel: "Data per {HH:MM} WIB" / null -> "Belum ada data";
 *  - health.ts: ageDays/ageLabel DELEGASI (referensi fungsi sama --
 *    satu sumber umur utk seluruh aplikasi, P15-A);
 *  - hermetis: confidence.ts bebas karakter non-ASCII & tanpa import
 *    @/db / next/.
 */
import {
  ageDays,
  ageLabel,
  COMPLETE_LABEL,
  dataPerLabel,
  emptyLabel,
  freshnessStamp,
  syncLabel,
  wibTime,
  wibTimeSec,
} from '../src/lib/confidence.ts';
import { ageDays as healthAgeDays, ageLabel as healthAgeLabel } from '../src/lib/health.ts';
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

const NOW = '2026-10-13T00:00:00.000Z'; // 07.00 WIB
function main() {
  console.log('# confidence (P15-A Confidence Language, suite 34)\n');

  // -- ageDays --
  ok('ageDays: null -> null', ageDays(null, NOW) === null);
  ok('ageDays: hari ini -> 0', ageDays('2026-10-13T00:00:00.000Z', NOW) === 0);
  ok('ageDays: 1 hari -> 1', ageDays('2026-10-12T00:00:00.000Z', NOW) === 1);
  ok('ageDays: 35 hari -> 35', ageDays('2026-09-08T00:00:00.000Z', NOW) === 35);
  ok('ageDays: masa depan -> 0 (clamp)', ageDays('2026-11-01T00:00:00.000Z', NOW) === 0);
  ok('ageDays: string tak valid -> null', ageDays('bukan-waktu', NOW) === null);

  // -- ageLabel --
  ok('ageLabel: null -> Belum ada catatan', ageLabel(null) === 'Belum ada catatan');
  ok('ageLabel: 0 -> Hari ini', ageLabel(0) === 'Hari ini');
  ok('ageLabel: 1 -> 1 hari lalu', ageLabel(1) === '1 hari lalu');
  ok('ageLabel: 35 -> 35 hari lalu', ageLabel(35) === '35 hari lalu');

  // -- freshnessStamp (keluarga FRESHNESS) --
  ok(
    'freshnessStamp: hari ini',
    freshnessStamp('2026-10-13T00:00:00.000Z', NOW) === 'Terakhir diperbarui Hari ini'
  );
  ok(
    'freshnessStamp: 5 hari',
    freshnessStamp('2026-10-08T00:00:00.000Z', NOW) === 'Terakhir diperbarui 5 hari lalu'
  );
  ok(
    'freshnessStamp: belum pernah',
    freshnessStamp(null, NOW) === 'Terakhir diperbarui Belum ada catatan'
  );

  // -- kelengkapan --
  ok('COMPLETE_LABEL: Data lengkap', COMPLETE_LABEL === 'Data lengkap');
  ok('emptyLabel: default data', emptyLabel() === 'Belum ada data');
  ok('emptyLabel: kustom', emptyLabel('transaksi') === 'Belum ada transaksi');

  // -- syncLabel (keluarga SINKRON) --
  ok('syncLabel: 0 -> Tersinkron', syncLabel(0) === 'Tersinkron');
  ok('syncLabel: 1 -> Menunggu sinkronisasi', syncLabel(1) === 'Menunggu sinkronisasi');
  ok(
    'syncLabel: 5 -> 5 menunggu sinkronisasi',
    syncLabel(5) === '5 menunggu sinkronisasi'
  );
  ok('syncLabel: negatif -> Tersinkron (clamp)', syncLabel(-3) === 'Tersinkron');

  // -- wibTime / wibTimeSec (zona WIB = UTC+7; NOW = 07.00 WIB) --
  ok('wibTime: NOW -> 07.00', wibTime(NOW) === '07.00');
  ok('wibTime: bergeser tanggal WIB (23.30 UTC -> 06.30 WIB)', wibTime('2026-10-12T23:30:00.000Z') === '06.30');
  ok('wibTime: null -> null', wibTime(null) === null);
  ok('wibTime: tak valid -> null', wibTime('bukan-waktu') === null);
  ok('wibTimeSec: detik -> 07.00.30', wibTimeSec('2026-10-13T00:00:30.000Z') === '07.00.30');
  ok('wibTimeSec: null -> null', wibTimeSec(null) === null);

  // -- dataPerLabel (keluarga KLAIM DATA) --
  ok('dataPerLabel: 07.00 -> Data per 07.00 WIB', dataPerLabel('07.00') === 'Data per 07.00 WIB');
  ok('dataPerLabel: null -> Belum ada data', dataPerLabel(null) === 'Belum ada data');
  ok(
    'dataPerLabel: komposisi wibTime',
    dataPerLabel(wibTime(NOW)) === 'Data per 07.00 WIB'
  );

  // -- delegasi health.ts: referensi fungsi sama (satu sumber umur) --
  ok('health.ageDays === confidence.ageDays (delegasi)', healthAgeDays === ageDays);
  ok('health.ageLabel === confidence.ageLabel (delegasi)', healthAgeLabel === ageLabel);
  ok(
    'paritas keluaran ageDays/ageLabel',
    healthAgeDays('2026-10-12T00:00:00.000Z', NOW) === 1 &&
      healthAgeLabel(1) === '1 hari lalu'
  );

  // -- Hermetis: modul bebas string non-ASCII & tanpa dependensi server --
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'confidence.ts'), 'utf8');
  ok('modul confidence.ts: 0 karakter non-ASCII', !/[^\x00-\x7F]/.test(src));
  ok(
    'modul confidence.ts: tanpa import @/db / next/',
    !src
      .split('\n')
      .filter((l) => /import|require/.test(l))
      .some((l) => /@\/db|next\//.test(l))
  );

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}
main();