/**
 * W5.3a (B2) -- unit test src/lib/inflight.ts (createInFlightGuard).
 * Modul murni -- jalan LANGSUNG oleh Node (type-stripping), konvensi
 * sama dengan test-fetch-util.ts: ok() + PASS/ALL_PASS + process.exit.
 *     npm run test:inflight  (== node scripts/test-inflight.ts)
 * Cakupan:
 *  - dua ledakan sinkron -> tepat 1 eksekusi (tryStart kedua = false).
 *  - re-entry diblokir selagi slot terisi (isBusy = true).
 *  - re-arm setelah release (tryStart kembali true).
 *  - dua guard independen terisolasi; release saat idle = no-op.
 */
import { createInFlightGuard } from '../src/lib/inflight.ts';

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

async function main(): Promise<void> {
  // -- guard baru --
  {
    const g = createInFlightGuard();
    ok('fresh: isBusy=false', g.isBusy() === false);
    ok('fresh: tryStart=true', g.tryStart() === true);
    ok('terisi setelah tryStart', g.isBusy() === true);
    g.release();
    ok('release saat idle: isBusy=false (no-op)', g.isBusy() === false);
  }

  // -- dua ledakan sinkron -> hanya 1 eksekusi --
  {
    const g = createInFlightGuard();
    let runs = 0;
    const fire = (): void => {
      if (g.tryStart()) runs++; // simulasi isi submit()
    };
    fire();
    fire();
    ok('double-fire: runs==1 (ledakan ke-2 diblokir)', runs === 1, 'runs=' + runs);
    ok('re-entry diblokir selagi busy (tryStart=false)', g.tryStart() === false);
    g.release();
    ok('re-arm setelah release (tryStart=true)', g.tryStart() === true);
    g.release();
  }

  // -- pola zis-client: tryStart -> kerja -> release di finally --
  // Jendela proteksi = selagi POST in-flight (ada await). Double-click
  // nyata ke-2 masuk jendela ini -> tryStart=false -> dibuang.
  // Pemanggilan BERURUTAN yang selesai sinkron = TIDAK diblokir
  // (finally sudah release; itu perilaku primitif yang benar).
  {
    const g = createInFlightGuard();
    let posts = 0;
    let pending: Promise<void> | null = null;
    const submitSim = (): Promise<void> | null => {
      if (!g.tryStart()) return null; // klik ke-2: dibuang
      pending = (async () => {
        try {
          await new Promise((res) => setTimeout(res, 20)); // POST in-flight
          posts++;
        } finally {
          g.release();
        }
      })();
      return pending;
    };
    const first = submitSim(); // klik ke-1: mulai
    ok('klik ke-2 selagi in-flight: dibuang', submitSim() === null);
    ok('klik ke-3 selagi in-flight: dibuang', submitSim() === null);
    await first; // tunggu POST in-flight selesai + release di finally
    ok('setelah selesai: re-arm (tryStart=true) & posts==1', g.tryStart() === true && posts === 1, 'posts=' + posts);
    g.release();
  }

  // -- dua guard independen --
  {
    const g1 = createInFlightGuard();
    const g2 = createInFlightGuard();
    g1.tryStart();
    ok('independen: g2 bebas walau g1 busy', g2.tryStart() === true);
    g1.release();
    g2.release();
  }

  console.log('---');
  console.log('PASS: ' + passes + '  FAIL: ' + failures);
  console.log(failures === 0 ? 'ALL_PASS' : 'HAS_FAILURE');
  process.exit(failures === 0 ? 0 : 1);
}

main();
