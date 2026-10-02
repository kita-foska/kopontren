/**
 * F3.4+ W2.5 -- Laporan Arus Kas (LAK) formal.
 *
 * Modul baca TIDAK punya kode runtime selain SQL + `import type QueryDb`
 * (dihapus saat compile), pola sama dgn lib/laporan/posisi.ts, lka.ts,
 * lpe.ts -- supaya bisa diuji Node (type-stripping + SQLite in-memory)
 * lewat scripts/test-laporan.ts.
 *
 * Struktur per docs/akuntansi-proposal.md Sek.5.4:
 *   Kas usaha  = 1010 (Kas Toko) + 1020 (Kas Bank)
 *   Kas sosial = 1100 (ZIS) -- SEKSI TERPISAH, dilarang dicampur ke kas
 *                usaha (invariant rekon #16 GL_CASH: 1010+1020 = kas V1;
 *                1100 terpisah -- cek #16 sendiri diimplementasi W5.2).
 *
 * Arus kas = pergerakan kaki kas (1010/1020/1100) jurnal s.d. `at`
 * (entry_date < at, kumulatif), diklasifikasikan PER ENTRI sesuai akun
 * lawan (counterpart, kaki non-kas):
 *   INVESTASI    = lawan ada di {1050,1070,1080,1090}
 *                  (aset tetap; pencairan/penerimaan akad 1070-1090)
 *   PENDANAAN    = lawan ada di {3010,3060,2050,2060,2070}
 *                  (modal; distribusi SHU 3060; simpanan anggota)
 *   OPERASIONAL  = sisanya (kas penjualan 4010, kas retur 4030, ujrah 4040,
 *                  belanja 5xxx & ZIS-biaya, pembayaran dagang 2010,
 *                  penerimaan piutang 1030, stok 1040, cashback 2030, dst).
 *
 * Transfer antar-kas (entry tanpa kaki non-kas, kaki cuma 1010/1020/1100)
 * BUKAN arus aktivitas:
 *   - 1010<->1020: tercatat per akun (transfer), neto nol di footer;
 *   - 1010/1020<->1100: tercatat di transfer kedua sisi + footer
 *     `pergeseran_kas_sosial` (mengubah total kas usaha; sisi 1100 di
 *     kas_sosial.transfer) agar identitas footer tetap terpenuhi.
 *
 * Identitas footer (konstruktif, diverifikasi test):
 *   saldo_awal (pembuka 1010+1020) + neto_aktivitas (oper+invest+pend)
 *   + pergeseran_kas_sosial = saldo_akhir (penutup 1010+1020).
 * Per akun kas: penutup = pembuka + masuk - keluar + transfer.
 *
 * Pembuka (pembuka) = kaki `type='opening'` s.d. `at` (bukan arus).
 * Jurnal pembalik (type='reversal') ikut normal: kaki terbalik =
 * keluar/masuk yang meng-ofset arus aslinya.
 *
 * D=K (rekon #15 JOURNAL_BAL, proxy): flag_rekon15=true bila SUM(debit)
 * tak sama SUM(credit) s.d. `at` -- klien menolak render angka formal
 * (pola sama lka.ts/lpe.ts). `at` = batas eksklusif akhir hari as_of
 * (entry_date < at), dari route (nextDay). Modul ini murni: hanya
 * QueryDb + angka.
 */

import type { QueryDb } from '../keuangan.ts';

/** Kas usaha per akun (Sek.5.4; nama dikandung modul selayaknya LPE_COLUMNS). */
export type LakKasRow = {
  code: string;
  name: string;
  /** Saldo dari jurnal pembuka (type='opening') s.d. `at` (debit - kredit). */
  pembuka: number;
  /** Kas masuk per aktivitas (akun lawan non-kas) s.d. `at`. */
  masuk: number;
  /** Kas keluar per aktivitas s.d. `at`. */
  keluar: number;
  /** Transfer antar-kas (1010<->1020 / <->1100) neto -- BUKAN aktivitas. */
  transfer: number;
  /** masuk - keluar + transfer (arus non-pembuka). */
  neto: number;
  /** Saldo kas total s.d. `at` = pembuka + neto (identitas, konstruktif). */
  penutup: number;
};

/** Satu aktivitas: arus masuk/keluar s.d. `at` + kode lawan utk info. */
export type LakActivity = {
  masuk: number;
  keluar: number;
  /** masuk - keluar. */
  neto: number;
  /**
   * Kode akun lawan (counterpart) non-kas yang menyentuh kas -- info
   * (tanpa nilai): entry multi-kaki (sales + kaki HPP) tidak bisa
   * diatribusikan per kode dgn eksak, jadi angka total per aktivitas
   * yang otoritatif, kode hanya ringkasan.
   */
  codes: string[];
};

/** Baris rincian kas sosial per akun lawan ZIS (atribusi eksak utk 2-kaki). */
export type LakSosialRow = {
  /** Kode COA, atau '(lain)' bila lawan bukan akun ZIS dikenal. */
  code: string;
  label: string;
  masuk: number;
  keluar: number;
};

/** Kas sosial 1100 -- seksi terpisah (anti-campur, Sek.5.4). */
export type LakKasSosial = {
  code: string;
  name: string;
  pembuka: number;
  masuk: number;
  keluar: number;
  transfer: number;
  /** masuk - keluar + transfer. */
  neto: number;
  penutup: number;
  rincian: LakSosialRow[];
};

/** Hasil `buildLak` -- dikirim /api/laporan/formal?report=lak. */
export type LakPayload = {
  /** Batas periode (entry_date < as_of); ISO WIB atau 'YYYY-MM-DD'. */
  as_of: string;
  /** Kas usaha 1010/1020 per akun. */
  kas: LakKasRow[];
  /** Arus per aktivitas (Sek.5.4: operasional / investasi / pendanaan). */
  aktivitas: {
    operasional: LakActivity;
    investasi: LakActivity;
    pendanaan: LakActivity;
  };
  /** Kas sosial (1100 ZIS) -- TIDAK dijumlahkan ke kas usaha. */
  kas_sosial: LakKasSosial;
  /**
   * Footer (Sek.5.4): saldo_awal -> arus per aktivitas -> saldo_akhir.
   * Identitas konstruktif: saldo_akhir = saldo_awal + neto_aktivitas
   * + pergeseran_kas_sosial (transfer internal 1010<->1020 neto nol).
   */
  footer: {
    /** Pembuka kas usaha (1010 + 1020). */
    saldo_awal: number;
    /** netto operasional + investasi + pendanaan. */
    neto_aktivitas: number;
    /** Pergeseran kas usaha <-> kas sosial (1010/1020 <-> 1100), bukan aktivitas. */
    pergeseran_kas_sosial: number;
    /** Penutup kas usaha (1010 + 1020). */
    saldo_akhir: number;
  };
  /** D=K (proxy rekon #15 JOURNAL_BAL, s.d. `at`). */
  d_k: {
    total_debit: number;
    total_credit: number;
    balanced: boolean;
    /** total_debit - total_credit (0 saat seimbang). */
    gap: number;
  };
  /** true bila D=K gagal (flag rekon #15 JOURNAL_BAL). */
  flag_rekon15: boolean;
};

// Akun kas (COA, docs/akuntansi-proposal.md Sek.2/Sek.5.4).
const KAS_USAHA: { code: string; name: string }[] = [
  { code: '1010', name: 'Kas Toko' },
  { code: '1020', name: 'Kas Bank' },
];
const KAS_SOSIAL_ACCT = '1100';
// Nama SEED src/db.ts baris 647: ['1100', 'Kas ZIS', ...] -- label selaras
// dgn seed (bukan "Kas Sosial (ZIS)"), lesson W2.4: COA label = seed db.ts.
const KAS_SOSIAL_NAME = 'Kas ZIS';
const CASH_CODES = new Set<string>([...KAS_USAHA.map((k) => k.code), KAS_SOSIAL_ACCT]);

/** Akun lawan = INVESTASI: aset tetap 1050, akad 1070-1090 (pencairan/angsuran). */
const INVESTASI = new Set(['1050', '1070', '1080', '1090']);
/** Akun lawan = PENDANAAN: modal 3010, distribusi SHU 3060, simpanan 2050-2070. */
const PENDANAAN = new Set(['3010', '3060', '2050', '2060', '2070']);

/** Baris rincian ZIS (nama + kode dikandung modul, Sek.5.4) + fallback. */
const ZIS_ROWS: { code: string; label: string }[] = [
  { code: '4090', label: 'ZIS Masuk (infak/sedekah)' },
  { code: '5090', label: 'Zakat Keluar' },
  { code: '5100', label: 'Infak Keluar (distribusi)' },
  { code: '6030', label: 'ZIS (beban zakat)' },
];
const ZIS_OTHER = '(lain)';

type Leg = { d: number; cr: number };
type Entry = { type: string; legs: Map<string, Leg> };

/** Per (entry, akun): total debit/kredit s.d. `at` -- basis klasifikasi. */
async function perEntry(db: QueryDb, at: string): Promise<Map<string, Entry>> {
  const rows = (await db
    .prepare(
      `SELECT je.id id, je.type type, jl.account_code c,
              COALESCE(SUM(jl.debit), 0) d, COALESCE(SUM(jl.credit), 0) cr
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?
       GROUP BY je.id, je.type, jl.account_code`
    )
    .all(at)) as { id: string; type: string; c: string; d: number; cr: number }[];
  const m = new Map<string, Entry>();
  for (const r of rows) {
    let e = m.get(r.id);
    if (!e) {
      e = { type: r.type, legs: new Map() };
      m.set(r.id, e);
    }
    const leg = e.legs.get(r.c) ?? { d: 0, cr: 0 };
    leg.d += r.d;
    leg.cr += r.cr;
    e.legs.set(r.c, leg);
  }
  return m;
}

/** SUM global debit/credit seluruh journal_lines s.d. `at` (rekon #15). */
async function journalTotals(db: QueryDb, at: string): Promise<{ debit: number; credit: number }> {
  const r = (await db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.entry_date < ?`
    )
    .get(at)) as { d: number; c: number } | undefined;
  return {
    debit: Math.round(Number(r?.d ?? 0) || 0),
    credit: Math.round(Number(r?.c ?? 0) || 0),
  };
}

type Acc = { masuk: number; keluar: number; codes: Set<string> };

/** Klasifikasi aktivitas per entry (kaki kas usahanya), Sek.5.4. */
function classify(counters: string[]): 'operasional' | 'investasi' | 'pendanaan' {
  for (const c of counters) if (INVESTASI.has(c)) return 'investasi';
  for (const c of counters) if (PENDANAAN.has(c)) return 'pendanaan';
  return 'operasional';
}

/**
 * Bangun LAK s.d. `at` (ISO WIB / 'YYYY-MM-DD', entry_date < at).
 * Import-free: hanya `QueryDb`. Nama akun (COA) dikandung modul;
 * modul mengembalikan kode + angka saja (pola buildLka).
 */
export async function buildLak(db: QueryDb, at: string): Promise<LakPayload> {
  const entries = await perEntry(db, at);
  const dk = await journalTotals(db, at);

  const act: Record<'operasional' | 'investasi' | 'pendanaan', Acc> = {
    operasional: { masuk: 0, keluar: 0, codes: new Set() },
    investasi: { masuk: 0, keluar: 0, codes: new Set() },
    pendanaan: { masuk: 0, keluar: 0, codes: new Set() },
  };

  // Akun kas usaha (1010/1020).
  type KasAcc = {
    code: string;
    name: string;
    pembuka: number;
    masuk: number;
    keluar: number;
    transfer: number;
    penutup: number;
  };
  const kas = KAS_USAHA.map((k): KasAcc => ({
    code: k.code,
    name: k.name,
    pembuka: 0,
    masuk: 0,
    keluar: 0,
    transfer: 0,
    penutup: 0,
  }));

  // Seksi kas sosial (1100).
  const s = { pembuka: 0, masuk: 0, keluar: 0, transfer: 0, penutup: 0 };
  const zis = new Map<string, { label: string; masuk: number; keluar: number }>();
  for (const z of ZIS_ROWS) zis.set(z.code, { label: z.label, masuk: 0, keluar: 0 });
  zis.set(ZIS_OTHER, { label: 'Pergerakan lain (lawan bukan ZIS)', masuk: 0, keluar: 0 });
  let pergeseran = 0; // pergeseran kas usaha <-> 1100 (bukan aktivitas)

  for (const e of entries.values()) {
    const legs = e.legs;
    const bal = (code: string): number => {
      const l = legs.get(code) as Leg | undefined;
      return l ? Math.round(l.d) - Math.round(l.cr) : 0;
    };

    // Saldo pembuka/penutup per akun kas (pembuka = hanya type='opening').
    for (const k of kas) {
      const b = bal(k.code);
      if (b === 0) continue;
      k.penutup += b;
      if (e.type === 'opening') k.pembuka += b;
    }
    const b1100 = bal(KAS_SOSIAL_ACCT);
    if (b1100 !== 0) {
      s.penutup += b1100;
      if (e.type === 'opening') s.pembuka += b1100;
    }
    // Kaki pembuka bukan arus (basis saldo awal; pola LPE).
    if (e.type === 'opening') continue;

    const counters = [...legs.keys()].filter((c) => !CASH_CODES.has(c));

    // Transfer antar-kas murni (tanpa kaki non-kas) = bukan aktivitas.
    if (counters.length === 0) {
      let businessNet = 0;
      for (const k of kas) {
        const b = bal(k.code);
        if (b === 0) continue;
        k.transfer += b;
        businessNet += b;
      }
      if (legs.has(KAS_SOSIAL_ACCT)) {
        s.transfer += b1100;
        // 1010/1020 <-> 1100 mengubah TOTAL kas usaha -> footer.
        if (businessNet !== 0) pergeseran += businessNet;
      }
      continue;
    }

    // Arus kas usaha (1010/1020): klasifikasi per aktivitas (Sek.5.4).
    const key = classify(counters);
    const a = act[key];
    let anyCash = false;
    for (const k of kas) {
      const b = bal(k.code);
      if (b === 0) continue;
      anyCash = true;
      // Akumulasi per akun kas (k.masuk/k.keluar) + total aktivitas.
      if (b > 0) {
        a.masuk += b;
        k.masuk += b;
      } else {
        a.keluar += -b;
        k.keluar += -b;
      }
    }
    if (anyCash) for (const c of counters) a.codes.add(c);

    // Arus kas sosial (1100): rincian per akun lawan ZIS (atribusi eksak).
    if (legs.has(KAS_SOSIAL_ACCT)) {
      if (b1100 > 0) s.masuk += b1100;
      else if (b1100 < 0) s.keluar += -b1100;
      for (const c of counters) {
        const l = legs.get(c) as Leg;
        const cd = Math.round(l.d);
        const cc = Math.round(l.cr);
        const row = zis.get(c) ?? zis.get(ZIS_OTHER)!;
        if (cc > cd) row.masuk += cc - cd; // lawan sisi kredit = kas sosial masuk
        else if (cd > cc) row.keluar += cd - cc; // lawan sisi debit = kas sosial keluar
      }
    }
  }

  const toActivity = (x: Acc): LakActivity => ({
    masuk: x.masuk,
    keluar: x.keluar,
    neto: x.masuk - x.keluar,
    codes: [...x.codes].sort(),
  });

  // Rincian ZIS: semua baris dikenal tetap (0 = belum terjadi);
  // baris '(lain)' hanya bila ada.
  const rincian: LakSosialRow[] = ZIS_ROWS.map((z) => ({
    code: z.code,
    label: z.label,
    masuk: zis.get(z.code)!.masuk,
    keluar: zis.get(z.code)!.keluar,
  }));
  const other = zis.get(ZIS_OTHER)!;
  if (other.masuk !== 0 || other.keluar !== 0) {
    rincian.push({ code: ZIS_OTHER, label: other.label, masuk: other.masuk, keluar: other.keluar });
  }

  const kasRows: LakKasRow[] = kas.map((k) => ({
    code: k.code,
    name: k.name,
    pembuka: k.pembuka,
    masuk: k.masuk,
    keluar: k.keluar,
    transfer: k.transfer,
    neto: k.masuk - k.keluar + k.transfer,
    penutup: k.penutup,
  }));

  const aOp = toActivity(act.operasional);
  const aInv = toActivity(act.investasi);
  const aPen = toActivity(act.pendanaan);
  const netoAktivitas = aOp.neto + aInv.neto + aPen.neto;
  const saldoAwal = kasRows.reduce((t, k) => t + k.pembuka, 0);
  const saldoAkhir = kasRows.reduce((t, k) => t + k.penutup, 0);

  const totalDebit = dk.debit;
  const totalCredit = dk.credit;
  const gap = totalDebit - totalCredit;
  const balanced = totalDebit === totalCredit;

  return {
    as_of: at,
    kas: kasRows,
    aktivitas: { operasional: aOp, investasi: aInv, pendanaan: aPen },
    kas_sosial: {
      code: KAS_SOSIAL_ACCT,
      name: KAS_SOSIAL_NAME,
      pembuka: s.pembuka,
      masuk: s.masuk,
      keluar: s.keluar,
      transfer: s.transfer,
      neto: s.masuk - s.keluar + s.transfer,
      penutup: s.penutup,
      rincian,
    },
    footer: {
      saldo_awal: saldoAwal,
      neto_aktivitas: netoAktivitas,
      pergeseran_kas_sosial: pergeseran,
      saldo_akhir: saldoAkhir,
    },
    d_k: {
      total_debit: totalDebit,
      total_credit: totalCredit,
      balanced,
      gap,
    },
    // B4 (audit W2.2): flag_rekon15 ini PROXY D=K GLOBAL (SUM debit =
    // SUM credit s.d. `at`), BUKAN cek per-entry + orphan rekon #15
    // yang otoritatif. Validasi penuh di /admin/rekonsiliasi.
    flag_rekon15: !balanced,
  };
}
