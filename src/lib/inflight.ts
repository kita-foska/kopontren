/**
 * W5.3a (B2) -- inflight guard: primitif sinkron mencegah double-POST
 * pada satu handler (klik-klik tombol submit). Modul murni, tanpa
 * DOM/React -- bisa diuji langsung di Node.
 * Pola pemakaian (sinkron, tanpa timer):
 *   const g = createInFlightGuard();
 *   if (!g.tryStart()) return;
 *   try { ...POST... } finally { g.release(); }
 */
export type InFlightGuard = {
  /** Isi slot: true bila masih kosong, false bila ada POST sedang jalan. */
  tryStart(): boolean;
  /** Lepaskan slot (selalu dipanggil di finally handler). */
  release(): void;
  /** Apakah slot sedang terisi? */
  isBusy(): boolean;
};

export function createInFlightGuard(): InFlightGuard {
  let busy = false;
  return {
    tryStart() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
    isBusy() {
      return busy;
    },
  };
}
