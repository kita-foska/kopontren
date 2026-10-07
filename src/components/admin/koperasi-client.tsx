'use client';

/**
 * W4.3 -- komponen client halaman /admin/koperasi (Sek.7.1/7.2/7.3, skema
 * v24; engine W4.2 src/lib/coop.ts -- wiring murni di sini):
 *  - 3 tab: Anggota (daftar + form anggota baru + status + KELUAR),
 *    Simpanan (form setor pokok/wajib/sukarela + tarik sukarela + riwayat),
 *    Rekap (saldo akun 2050/2060/2070 [kewajiban] + modal/SHU 30xx +
 *    riwayat SHU; distribusi SHU jurnal = W4.4).
 *  - Q3 (pola akad): prop canWrite (tier koperasi = admin+manajer);
 *    pengurus = read-only (form disembunyikan, data + rekap tetap).
 *  - D1: jurnal auto hanya saat GL aktif (badge); anggota keluar =
 *    useConfirm risk-3 (terminal: refund pokok bila GL on; wajib/sukarela
 *    TIDAK dikembalikan, Sek.7.2.3).
 *  - TermTips 5 istilah (Pokok/Wajib/Sukarela/SHU/Rumpun; definisi
 *    lengkap di /admin/glosarium, entri W4.3). 0 emoji; tanpa ikon-font.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  Badge,
  Button,
  Empty,
  FilterPill,
  Table,
  Td,
  Th,
  TermTip,
  TEmpty,
  Trow,
  Toast,
  useConfirm,
  useToast,
  useTablistNav,
} from '@/components/ui';
import { fmtDateTime, rp } from '@/lib/format';
import { wibToday } from '@/lib/zakat-period';

type MemberRow = {
  id: string;
  name: string;
  npwp: string | null;
  rumpun: string | null;
  member_since: string;
  status: string;
};

type CoopBalance = { pokok: number; wajib: number; sukarela: number; total: number };

type HistoryRow = {
  member_id: string;
  member_name: string | null;
  kind: string;
  amount: number;
  saved_at: string;
};

type AccountRow = { code: string; name: string; balance: number };

type ShuRow = {
  id: string;
  period: string;
  shu_total: number;
  cadangan_umum: number | null;
  cadangan_khusus: number | null;
  jasa_anggota: number | null;
  dibagi: number | null;
  rasio_json: string | null;
  created_at: string;
};

type KoperasiData = {
  members: MemberRow[];
  balances: Record<string, CoopBalance>;
  history: HistoryRow[];
  accounts: AccountRow[];
  shu: ShuRow[];
  gl_enabled: boolean;
};

type PostResult = {
  ok?: boolean;
  error?: string;
  entryId?: string | null;
  gl_enabled?: boolean;
  // W4.5a op closing (respons server; modal ikut entryId/gl_enabled).
  shu?: number;
  profit?: boolean;
  period?: string;
  // W4.5b op jasa/tunai (respons server).
  jasa_total?: number;
  member_count?: number;
  amount?: number;
  acct?: string;
};

const KINDS = ['pokok', 'wajib', 'sukarela'] as const;
const KIND_LABEL: Record<string, string> = {
  pokok: 'Pokok',
  wajib: 'Wajib',
  sukarela: 'Sukarela',
  modal: 'Modal (3010)',
  jasa: 'Jasa (3050)',
};

/** Tips TermTip (bahasa awam, ringkas; definisi lengkap di /admin/glosarium). */
const TIPS = {
  pokok:
    'Simpanan pokok: setoran awal saat menjadi anggota. Tak bisa ditarik selama keanggotaan aktif; dikembalikan (refund) saat anggota keluar, bila GL aktif.',
  wajib:
    'Simpanan wajib: setoran rutin yang ditentukan koperasi. Tetap milik anggota; tidak dikembalikan saat anggota keluar.',
  sukarela:
    'Simpanan sukarela: setoran bebas atas keinginan anggota. Bisa ditarik selama masih tersisa; tidak perlu refund saat keluar.',
  shu: 'SHU (Sisa Hasil Usaha): keuntungan koperasi per periode; dialokasikan via jurnal (W4.4). Jasa per orang + tunai = W4.5b.',
  rumpun:
    'Rumpun: lingkaran keluarga/pesantren; pengelompokan anggota koperasi (opsional, utk laporan).',
  cad_umum:
    'Cadangan umum: bagian SHU yang ditahan memperkuat permodalan koperasi (akun 3030); tidak dibagikan.',
  cad_khusus:
    'Cadangan khusus: bagian SHU yang ditahan utk kebutuhan tertentu koperasi (akun 3040).',
  jasa: 'Jasa anggota: bagian SHU utk imbal jasa/modal anggota (akun 3050); bobot rata-rata (konservatif, bukan bunga). W4.5b: dibagikan per anggota; jurnal D3050 -> K2070.',
  dibagi: 'SHU dibagi: bagian SHU utk dibagikan ke anggota (akun 3060); pencairan tunai/transfer (W4.5b) = jurnal D3060 -> kas 1010 / bank 1020 (akun 5080 tidak dipakai).',
  rasio: 'Rasio alokasi SHU (persen) cad um/khusus/jasa; porsi "dibagi" = sisa 100 - lainnya agar total pas. Diisi admin, tanpa angka default.',
  modal:
    'Modal: setoran uang anggota sebagai kekuatan kooperasi (akun 3010) -- bukan simpanan: tidak masuk 2050/2060/2070 dan tidak di-refund saat keluar. Jurnal D1010 -> K3010 hanya saat GL aktif.',
  closing:
    'Jurnal closing: nol-kan net akun operasi & beban (4010-4030, 5010-5040; 4040 & 4090 dikecualikan) ke 3020 SHU Ditahan, kumulatif sejak awal pembukuan (self-healing). Satu closing per periode; laba = kredit 3020, rugi = debit 3020 (3020 boleh negatif).',
};

type Tab = 'anggota' | 'simpanan' | 'rekap' | 'shu';

/** Urutan tab koperasi (navigasi keyboard tablist; W4.4 E.5). */
const COOP_TABS: Tab[] = ['anggota', 'simpanan', 'rekap', 'shu'];

const STATUS_TONE: Record<string, 'green' | 'gray' | 'red'> = {
  aktif: 'green',
  nonaktif: 'gray',
  keluar: 'red',
};

/** E.4: petakan kode validasi 400 server ("Validasi SHU: <CODE>") ke kalimat polos. */
const SHU_VALIDATION_TOAST: Record<string, string> = {
  SHU_TOTAL_INVALID: 'SHU Total harus rupiah > 0',
  SHU_RATIO_INVALID: 'Rasio harus angka >= 0',
  SHU_RATIO_SUM: 'Total rasio melebihi 100%',
  SHU_PERIOD_INVALID: 'Periode harus format YYYY-MM',
};

/** Suffix toast pencatatan (jurnal id / GL off; pola akad-client W3.3). */
function postNote(r: PostResult): string {
  if (r.entryId) return ' - jurnal ' + String(r.entryId).slice(0, 10);
  if (r.gl_enabled === false) return ' - GL off (tanpa jurnal)';
  return '';
}

export function KoperasiClient({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<KoperasiData | null>(null);
  const [tab, setTab] = useState<Tab>('anggota');
  const [busy, setBusy] = useState(false);
  const [msg, showToast, clearToast, tone, action] = useToast();
  const { ask, host } = useConfirm();

  // -- form: anggota baru --------------------------------------------
  const [mName, setMName] = useState('');
  const [mRumpun, setMRumpun] = useState('');
  const [mNpwp, setMNpwp] = useState('');
  const [mSince, setMSince] = useState(wibToday());

  // -- form: setor simpanan -----------------------------------------
  const [sMember, setSMember] = useState('');
  const [sKind, setSKind] = useState('pokok');
  const [sAmount, setSAmt] = useState('');
  const [sDate, setSDate] = useState('');

  // -- form: tarik sukarela -----------------------------------------
  const [wMember, setWMember] = useState('');
  const [wAmount, setWAmount] = useState('');
  const [wDate, setWDate] = useState('');

  // -- form: alokasi SHU (rasio input, W4.4) ------------------------
  const [shuPeriod, setShuPeriod] = useState('');
  const [shuTotal, setShuTotal] = useState('');
  const [shuCadU, setShuCadU] = useState('');
  const [shuCadK, setShuCadK] = useState('');
  const [shuJasa, setShuJasa] = useState('');

  // -- form: modal anggota 3010 (W4.5a; tab Simpanan) ----------------
  const [mdMember, setMdMember] = useState('');
  const [mdAmount, setMdAmount] = useState('');
  const [mdDate, setMdDate] = useState('');

  // -- form: jurnal closing 3020 (W4.5a; tab Rekap; admin-only) -----
  const [cPeriod, setCPeriod] = useState('');

  // -- form: jasa per anggota + pencairan tunai (W4.5b; tab SHU;
  //    tier koperasi; OQ14) -------------------------------------------
  const [jsPeriod, setJsPeriod] = useState('');
  const [tnPeriod, setTnPeriod] = useState('');
  const [tnAmount, setTnAmount] = useState('');
  const [tnAcct, setTnAcct] = useState('1010');

  // W4.4 E.5: keyboard nav tablist koperasi (pola APG, sama dgn POS via useTablistNav).
  const { onTabKeyDown } = useTablistNav<Tab>((i) => COOP_TABS[i] ?? 'anggota', setTab);

  const load = useCallback(async () => {
    const r = await api<KoperasiData>('/api/koperasi');
    if (r.ok && r.data) setData(r.data);
    else showToast(r.error || 'Gagal memuat rekap koperasi', 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Total saldo per kind utk kartu rekap (jumlah semua anggota). */
  const totals = useMemo(() => {
    const t = { pokok: 0, wajib: 0, sukarela: 0, total: 0 };
    for (const b of Object.values(data?.balances ?? {})) {
      t.pokok += b.pokok;
      t.wajib += b.wajib;
      t.sukarela += b.sukarela;
      t.total += b.total;
    }
    return t;
  }, [data]);

  /** Anggota belum terminal (setor/tarik hanya utk ini). */
  const savable = useMemo(
    () => (data?.members ?? []).filter((m) => m.status !== 'keluar'),
    [data]
  );

  async function post(body: Record<string, unknown>): Promise<PostResult | null> {
    const r = await api<PostResult>('/api/koperasi', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (r.ok) await load();
    return r.data ?? null;
  }
  /** op: member_create (tanpa jurnal; UNIQUE nama -> 409 pesan server). */
  async function submitMember(e: React.FormEvent) {
    e.preventDefault();
    if (!mName.trim()) {
      showToast('Nama anggota wajib diisi', 'error');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = {
      op: 'member_create',
      name: mName.trim(),
      member_since: mSince || wibToday(),
    };
    if (mRumpun.trim()) body.rumpun = mRumpun.trim();
    if (mNpwp.trim()) body.npwp = mNpwp.trim();
    const r = await post(body);
    if (r?.ok) {
      showToast('Anggota "' + mName.trim() + '" tercatat (status awal: aktif)', 'success');
      setMName('');
      setMRumpun('');
      setMNpwp('');
      setMSince(wibToday());
    } else if (!r) showToast('Gagal membuat anggota', 'error');
    else showToast(r.error || 'Gagal membuat anggota', 'error');
    setBusy(false);
  }

  /** op: setor (auto-jurnal D1010 -> K205x hanya saat GL aktif). */
  async function submitSetor(e: React.FormEvent) {
    e.preventDefault();
    if (!sMember) {
      showToast('Pilih anggota dulu', 'error');
      return;
    }
    const amt = Number(sAmount);
    if (!Number.isInteger(amt) || amt <= 0) {
      showToast('Jumlah harus rupiah integer > 0', 'error');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { op: 'setor', member_id: sMember, kind: sKind, amount: amt };
    if (sDate) body.saved_at = sDate + 'T00:00:00.000+07:00';
    const r = await post(body);
    if (r?.ok) {
      showToast((KIND_LABEL[sKind] ?? sKind) + ' ' + rp(amt) + ' tercatat' + postNote(r), 'success');
      setSAmt('');
      setSDate('');
    } else if (!r) showToast('Gagal mencatat setor', 'error');
    else showToast(r.error || 'Gagal mencatat setor', 'error');
    setBusy(false);
  }

  /** op: tarik (baris negatif sukarela; guard sisa >= 0 -> 400 server). */
  async function submitTarik(e: React.FormEvent) {
    e.preventDefault();
    if (!wMember) {
      showToast('Pilih anggota dulu', 'error');
      return;
    }
    const amt = Number(wAmount);
    if (!Number.isInteger(amt) || amt <= 0) {
      showToast('Jumlah harus rupiah integer > 0', 'error');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { op: 'tarik', member_id: wMember, amount: amt };
    if (wDate) body.saved_at = wDate + 'T00:00:00.000+07:00';
    const r = await post(body);
    if (r?.ok) {
      showToast('Tarik sukarela ' + rp(amt) + ' tercatat' + postNote(r), 'success');
      setWAmount('');
      setWDate('');
    } else if (!r) showToast('Gagal mencatat tarik', 'error');
    else showToast(r.error || 'Gagal mencatat tarik', 'error');
    setBusy(false);
  }

  /** op: status (aktif <-> nonaktif; tanpa jurnal). */
  async function toggleStatus(m: MemberRow) {
    const to = m.status === 'aktif' ? 'nonaktif' : 'aktif';
    setBusy(true);
    const r = await post({ op: 'status', member_id: m.id, status: to });
    if (r?.ok) showToast(m.name + ' -> ' + to, 'success');
    else showToast(r?.error || 'Gagal ubah status', 'error');
    setBusy(false);
  }

  /** op: keluar -- TERMINAL (Sek.7.2.3): confirm risk-3 + ringkasan dampak. */
  function askKeluar(m: MemberRow, glOn: boolean) {
    ask({
      title: 'Anggota keluar',
      message:
        'Proses "keluar" untuk ' +
        m.name +
        '? Status menjadi TERMINAL -- tidak bisa dikembalikan. Keluar = hak & kewajiban berakhir (Sek.7.2.3).',
      confirmLabel: 'Keluarkan',
      risk: 3,
      impact: [
        'Status anggota menjadi KELUAR (terminal; tak bisa dikembalikan).',
        glOn
          ? 'Simpanan pokok direfund otomatis (D2050 -> K1010) bila > 0.'
          : 'GL off: hanya status berubah; refund manual bila perlu.',
        'Simpanan wajib & sukarela TIDAK dikembalikan (sukarela bisa ditarik dulu).',
      ],
      proceed: async () => {
        setBusy(true);
        const r = await post({ op: 'keluar', member_id: m.id });
        if (r?.ok) showToast(m.name + ' keluar' + postNote(r), 'success');
        else showToast(r?.error || 'Gagal memproses keluar', 'error');
        setBusy(false);
      },
    });
  }

  /** op: shu (W4.4: distribusi SHU rasio input; 1 jurnal alokasi D3020 -> C30xx). */
  async function submitShu(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(shuPeriod)) {
      showToast('Periode harus format YYYY-MM', 'error');
      return;
    }
    const total = Math.round(Number(shuTotal) || 0);
    if (total <= 0) {
      showToast('SHU Total harus rupiah > 0', 'error');
      return;
    }
    const cu = Number(shuCadU) || 0;
    const ck = Number(shuCadK) || 0;
    const js = Number(shuJasa) || 0;
    if (cu + ck + js > 100) {
      showToast('Total rasio (cad um / cad khusus / jasa) melebihi 100%', 'error');
      return;
    }
    setBusy(true);
    const r = await post({
      op: 'shu',
      period: shuPeriod,
      shu_total: total,
      rasio: { cad_umum: cu, cad_khusus: ck, jasa: js },
    });
    if (r?.ok) {
      showToast('SHU ' + shuPeriod + ' tercatat (' + rp(total) + ')' + postNote(r), 'success');
      setShuTotal('');
      setShuCadU('');
      setShuCadK('');
      setShuJasa('');
    } else if (!r) showToast('Gagal mencatat SHU', 'error');
    else {
      // E.4: petakan kode validasi 400 server ke kalimat polos (kode tak dikenal lolos apa adanya).
      const raw = r.error || 'Gagal mencatat SHU';
      const mv = /^Validasi SHU: (SHU_[A-Z]+)$/.exec(raw);
      showToast(mv ? SHU_VALIDATION_TOAST[mv[1]] ?? raw : raw, 'error');
    }
    setBusy(false);
  }

  /** op: modal (W4.5a: modal anggota 3010; D1010 -> K3010 saat GL aktif). */
  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    if (!mdMember) {
      showToast('Pilih anggota dulu', 'error');
      return;
    }
    const amt = Number(mdAmount);
    if (!Number.isInteger(amt) || amt <= 0) {
      showToast('Jumlah harus rupiah integer > 0', 'error');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { op: 'modal', member_id: mdMember, amount: amt };
    if (mdDate) body.saved_at = mdDate + 'T00:00:00.000+07:00';
    const r = await post(body);
    if (r?.ok) {
      showToast('Modal ' + rp(amt) + ' tercatat' + postNote(r), 'success');
      setMdAmount('');
      setMdDate('');
    } else if (!r) showToast('Gagal mencatat modal', 'error');
    else showToast(r.error || 'Gagal mencatat modal', 'error');
    setBusy(false);
  }

  /** op: closing (W4.5a Sek.3.2.6: nol-kan net P&L -> 3020; admin-only). */
  async function submitClosing(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cPeriod.trim())) {
      showToast('Periode harus format YYYY-MM', 'error');
      return;
    }
    setBusy(true);
    const r = await post({ op: 'closing', period: cPeriod.trim() });
    if (r?.ok) {
      showToast(
        'Closing ' + (r.period ?? cPeriod) + ' tercatat: ' +
          (r.profit ? 'laba' : 'rugi') +
          ' ' +
          rp(Math.abs(r.shu ?? 0)) +
          ' -> 3020' +
          postNote(r),
        'success'
      );
      setCPeriod('');
    } else if (!r) showToast('Gagal posting jurnal closing', 'error');
    else showToast(r.error || 'Gagal posting jurnal closing', 'error');
    setBusy(false);
  }

  /** op: jasa (W4.5b: pool = jasa_anggota periode; rata-rata Q5; 1 jurnal agregat). */
  async function submitJasa(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(jsPeriod.trim())) {
      showToast('Periode harus format YYYY-MM', 'error');
      return;
    }
    setBusy(true);
    const r = await post({ op: 'jasa', period: jsPeriod.trim() });
    if (r?.ok) {
      showToast(
        'Jasa ' +
          (r.period ?? jsPeriod) +
          ': ' +
          rp(r.jasa_total ?? 0) +
          ' ke ' +
          (r.member_count ?? 0) +
          ' anggota' +
          postNote(r),
        'success'
      );
      setJsPeriod('');
    } else if (!r) showToast('Gagal membagi jasa', 'error');
    else showToast(r.error || 'Gagal membagi jasa', 'error');
    setBusy(false);
  }

  /** op: tunai (W4.5b: D3060 -> kas 1010 / bank 1020; guard saldo 3060). */
  async function submitTunai(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(tnPeriod.trim())) {
      showToast('Periode harus format YYYY-MM', 'error');
      return;
    }
    const amt = Math.round(Number(tnAmount) || 0);
    if (amt <= 0) {
      showToast('Nominal harus rupiah > 0', 'error');
      return;
    }
    setBusy(true);
    const r = await post({ op: 'tunai', period: tnPeriod.trim(), amount: amt, acct: tnAcct });
    if (r?.ok) {
      showToast('Pencairan ' + rp(amt) + ' (' + tnAcct + ') tercatat' + postNote(r), 'success');
      setTnPeriod('');
      setTnAmount('');
      setTnAcct('1010');
    } else if (!r) showToast('Gagal mencatat pencairan', 'error');
    else showToast(r.error || 'Gagal mencatat pencairan', 'error');
    setBusy(false);
  }

  const d = data;
  if (!d) {
    return <div className="card p-4 text-sm text-slate-500 dark:text-slate-400">Memuat...</div>;
  }
  const wSisa = wMember ? (d.balances[wMember]?.sukarela ?? 0) : 0;

  // -- pratinjau alokasi SHU (rasio input; "dibagi" = residu) -------
  const shuTotalN = Math.round(Number(shuTotal) || 0);
  const shuCu = Number(shuCadU) || 0;
  const shuCk = Number(shuCadK) || 0;
  const shuJs = Number(shuJasa) || 0;
  const shuSum3 = shuCu + shuCk + shuJs;
  const shuDibPct = 100 - shuSum3;
  const shuA: { cu: number; ck: number; js: number; dib: number } = {
    cu: Math.round((shuTotalN * shuCu) / 100),
    ck: Math.round((shuTotalN * shuCk) / 100),
    js: Math.round((shuTotalN * shuJs) / 100),
    dib: 0,
  };
  shuA.dib = shuTotalN - (shuA.cu + shuA.ck + shuA.js);

  return (
    <div className="space-y-4">
      {/* Pengumuman tier (Q3) + status GL (D1) */}
      <div className="flex flex-wrap items-center gap-3">
        {!canWrite && (
          <div className="card flex-1 p-3 text-xs text-slate-500 dark:text-slate-400">
            <Badge tone="amber">Read-only (pengurus, Q3)</Badge>
            <span className="ml-2">
              Data + rekap tetap bisa; form anggota/setor/tarik & tombol aksi hanya
              admin/manajer.
            </span>
          </div>
        )}
        <div className="card p-3">
          {d.gl_enabled ? (
            <Badge tone="green">GL aktif - auto jurnal (D1)</Badge>
          ) : (
            <Badge tone="gray">GL off - tercatat saja</Badge>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Setor/tarik/keluar mem-post jurnal (D1010/2070/2050) hanya saat GL aktif.
          </p>
        </div>
      </div>

      {/* Tab (APG tablist via FilterPill; 4 tab W4.4; nav keyboard E.5) */}
      <div role="tablist" aria-label="Tab koperasi" onKeyDown={onTabKeyDown} className="flex flex-wrap gap-2">
        {(
          [
            ['anggota', 'Anggota (' + d.members.length + ')'],
            ['simpanan', 'Simpanan'],
            ['rekap', 'Rekap'],
            ['shu', 'SHU'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <FilterPill key={t} role="tab" aria-selected={tab === t} active={tab === t} onClick={() => setTab(t)}>
            {label}
          </FilterPill>
        ))}
      </div>

      {/* -- Tab ANGGOTA: form baru + daftar + status + KELUAR ------- */}
      {tab === 'anggota' && (
        <div className="space-y-4">
          {canWrite && (
            <form onSubmit={submitMember} className="card p-4">
              <h2 className="mb-3 font-bold">Anggota Baru</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-2">
                  Nama
                  <input
                    className="input mt-1"
                    placeholder="mis. Abu Abdillah"
                    maxLength={120}
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  <TermTip term="Rumpun" tip={TIPS.rumpun}>
                    Rumpun
                  </TermTip>
                  <input
                    className="input mt-1"
                    placeholder="opsional"
                    maxLength={80}
                    value={mRumpun}
                    onChange={(e) => setMRumpun(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  NPWP
                  <input
                    className="input mt-1"
                    placeholder="opsional"
                    maxLength={60}
                    value={mNpwp}
                    onChange={(e) => setMNpwp(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Member Since
                  <input
                    className="input mt-1"
                    type="date"
                    value={mSince}
                    onChange={(e) => setMSince(e.target.value)}
                  />
                </label>
                <div className="md:col-span-1 flex items-end">
                  <Button type="submit" loading={busy}>
                    Tambah Anggota
                  </Button>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Status awal: aktif. Setoran{' '}
                    <TermTip term="Simpanan Pokok" tip={TIPS.pokok}>
                      pokok
                    </TermTip>{' '}
                    via tab Simpanan.
                  </p>
                </div>
              </div>
            </form>
          )}

          <div className="card p-4">
            <h2 className="mb-3 font-bold">Daftar Anggota ({d.members.length})</h2>
            {d.members.length === 0 ? (
              <Empty compact text="Belum ada anggota koperasi. Tambahkan via form di atas." />
            ) : (
              <Table minW="min-w-[820px]">
                <thead>
                  <tr>
                    <Th>Nama</Th>
                    <Th>
                      <TermTip term="Rumpun" tip={TIPS.rumpun}>
                        Rumpun
                      </TermTip>
                    </Th>
                    <Th>Status</Th>
                    <Th>Sejak</Th>
                    <Th className="text-right">
                      <TermTip
                        term="Simpanan"
                        tip={'Jumlah simpanan anggota: pokok + wajib + sukarela. ' + TIPS.sukarela}
                      >
                        Total Simpanan
                      </TermTip>
                    </Th>
                    {canWrite && <Th>Aksi</Th>}
                  </tr>
                </thead>
                <tbody>
                  {d.members.map((m) => {
                    const b = d.balances[m.id] ?? { pokok: 0, wajib: 0, sukarela: 0, total: 0 };
                    const keluar = m.status === 'keluar';
                    return (
                      <Trow key={m.id} hover>
                        <Td>
                          <span className="font-bold">{m.name}</span>
                          {m.npwp ? (
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                              NPWP {m.npwp}
                            </span>
                          ) : null}
                        </Td>
                        <Td>{m.rumpun ?? '-'}</Td>
                        <Td>
                          <Badge tone={STATUS_TONE[m.status] ?? 'gray'}>{m.status}</Badge>
                        </Td>
                        <Td>{m.member_since.slice(0, 10)}</Td>
                        <Td className="text-right font-bold tabular-nums">{rp(b.total)}</Td>
                        {canWrite && (
                          <Td>
                            {keluar ? (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                terminal
                              </span>
                            ) : (
                              <span className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void toggleStatus(m)}
                                  disabled={busy}
                                >
                                  {m.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => askKeluar(m, d.gl_enabled)}
                                  disabled={busy}
                                >
                                  Keluar
                                </Button>
                              </span>
                            )}
                          </Td>
                        )}
                      </Trow>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* -- Tab SIMPANAN: kartu saldo + form setor/tarik + riwayat --- */}
      {tab === 'simpanan' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-4">
              <p className="label">
                <TermTip term="Simpanan Pokok" tip={TIPS.pokok}>
                  Simpanan Pokok
                </TermTip>
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums tracking-tight">
                {rp(totals.pokok)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                refund saat keluar (GL on)
              </p>
            </div>
            <div className="card p-4">
              <p className="label">
                <TermTip term="Simpanan Wajib" tip={TIPS.wajib}>
                  Simpanan Wajib
                </TermTip>
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums tracking-tight">
                {rp(totals.wajib)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                rutin; tak direfund
              </p>
            </div>
            <div className="card p-4">
              <p className="label">
                <TermTip term="Simpanan Sukarela" tip={TIPS.sukarela}>
                  Simpanan Sukarela
                </TermTip>
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums tracking-tight">
                {rp(totals.sukarela)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                bisa ditarik selama tersisa
              </p>
            </div>
            <div className="card p-4">
              <p className="label">Total Simpanan</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                {rp(totals.total)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {savable.length} anggota aktif
              </p>
            </div>
          </div>

          {canWrite && (
            <div className="grid gap-4 lg:grid-cols-2">
              <form onSubmit={submitSetor} className="card p-4">
                <h2 className="mb-3 font-bold">Setor Simpanan</h2>
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Anggota
                    <select
                      className="input mt-1"
                      value={sMember}
                      onChange={(e) => setSMember(e.target.value)}
                    >
                      <option value="" disabled>
                        pilih anggota
                      </option>
                      {savable.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.status === 'nonaktif' ? ' (nonaktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    <TermTip
                      term="Jenis Simpanan"
                      tip={TIPS.pokok + ' ' + TIPS.wajib + ' ' + TIPS.sukarela}
                    >
                      Jenis
                    </TermTip>
                    <select
                      className="input mt-1"
                      value={sKind}
                      onChange={(e) => setSKind(e.target.value)}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Jumlah (Rp)
                    <input
                      className="input mt-1"
                      inputMode="numeric"
                      placeholder="mis. 100000"
                      value={sAmount}
                      onChange={(e) => setSAmt(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Tanggal (WIB)
                    <input
                      className="input mt-1"
                      type="date"
                      value={sDate}
                      onChange={(e) => setSDate(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Akun simpanan: 2050 pokok, 2060 wajib, 2070 sukarela (Sek.7.2.3).
                  Jurnal auto D1010 hanya saat GL aktif.
                </p>
                <div className="mt-3">
                  <Button type="submit" loading={busy}>
                    Catat Setor
                  </Button>
                </div>
              </form>

              <form onSubmit={submitTarik} className="card p-4">
                <h2 className="mb-3 font-bold">Tarik Sukarela</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Anggota
                    <select
                      className="input mt-1"
                      value={wMember}
                      onChange={(e) => setWMember(e.target.value)}
                    >
                      <option value="" disabled>
                        pilih anggota
                      </option>
                      {savable.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Jumlah (Rp)
                    <input
                      className="input mt-1"
                      inputMode="numeric"
                      placeholder="mis. 50000"
                      value={wAmount}
                      onChange={(e) => setWAmount(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Tanggal (WIB)
                    <input
                      className="input mt-1"
                      type="date"
                      value={wDate}
                      onChange={(e) => setWDate(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {wMember
                    ? 'Sisa sukarela anggota terpilih: ' +
                      rp(wSisa) +
                      ' (guard: tarik tak melebihi sisa).'
                    : 'Baris negatif sukarela (Option A W4.2); jurnal D2070 -> K1010 saat GL aktif.'}
                </p>
                <div className="mt-3">
                  <Button type="submit" variant="danger" loading={busy}>
                    Catat Tarik
                  </Button>
                </div>
              </form>

              <form onSubmit={submitModal} className="card p-4">
                <h2 className="mb-3 font-bold">
                  <TermTip term="Modal" tip={TIPS.modal}>
                    Modal Anggota (3010)
                  </TermTip>
                </h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Anggota
                    <select
                      className="input mt-1"
                      value={mdMember}
                      onChange={(e) => setMdMember(e.target.value)}
                    >
                      <option value="" disabled>
                        pilih anggota
                      </option>
                      {savable.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Jumlah (Rp)
                    <input
                      className="input mt-1"
                      inputMode="numeric"
                      placeholder="mis. 250000"
                      value={mdAmount}
                      onChange={(e) => setMdAmount(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                    Tanggal (WIB)
                    <input
                      className="input mt-1"
                      type="date"
                      value={mdDate}
                      onChange={(e) => setMdDate(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Modal = penyertaan anggota (akun 3010), TIDAK simpanan: tak masuk
                  2050/2060/2070, tak di-refund saat keluar. Jurnal D1010 -&gt; K3010
                  hanya saat GL aktif.
                </p>
                <div className="mt-3">
                  <Button type="submit" loading={busy}>
                    Catat Modal
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="card p-4">
            <h2 className="mb-3 font-bold">Riwayat Mutasi Simpanan ({d.history.length})</h2>
            {d.history.length === 0 ? (
              <Empty compact text="Belum ada mutasi simpanan." />
            ) : (
              <Table minW="min-w-[640px]">
                <thead>
                  <tr>
                    <Th>Waktu</Th>
                    <Th>Anggota</Th>
                    <Th>Jenis</Th>
                    <Th className="text-right">Jumlah</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.map((h, i) => (
                    <Trow key={h.member_id + h.saved_at + String(i)} hover>
                      <Td>{fmtDateTime(h.saved_at)}</Td>
                      <Td>{h.member_name ?? h.member_id}</Td>
                      <Td>{KIND_LABEL[h.kind] ?? h.kind}</Td>
                      <Td
                        className={
                          'text-right tabular-nums ' +
                          (h.amount < 0
                            ? 'font-bold text-rose-600 dark:text-rose-400'
                            : 'font-bold')
                        }
                      >
                        {h.amount < 0 ? '-' : '+'}
                        {rp(Math.abs(h.amount))}
                      </Td>
                    </Trow>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* -- Tab REKAP: saldo akun + riwayat SHU (distribusi = W4.4) -- */}
      {tab === 'rekap' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 font-bold">
              <TermTip term="SHU" tip={TIPS.shu}>
                Rekap Akun
              </TermTip>
            </h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Simpanan anggota (2050/2060/2070) = AKUN KEWAJIBAN: ditampil terpisah,
              TIDAK dijumlah ke ekuitas (konvensi SAK-EP; memo CALK -- OQ6 W4.3).
              2080 = simpanan pending (tak ditampil).
            </p>
            <Table minW="min-w-[520px]">
              <thead>
                <tr>
                  <Th>Kode</Th>
                  <Th>Nama Akun</Th>
                  <Th className="text-right">Saldo (Rp)</Th>
                </tr>
              </thead>
              <tbody>
                {d.accounts.length === 0 ? (
                  <TEmpty colSpan={3}>Belum ada mutasi akun koperasi (GL off / belum ada transaksi).</TEmpty>
                ) : (
                  d.accounts.map((a) => (
                    <Trow key={a.code} hover>
                      <Td className="font-mono text-xs">{a.code}</Td>
                      <Td>{a.name}</Td>
                      <Td className="text-right font-bold tabular-nums">{rp(a.balance)}</Td>
                    </Trow>
                  ))
                )}
              </tbody>
            </Table>
          </div>

          {canWrite && (
            <div className="card p-4">
              <h2 className="mb-2 font-bold">
                <TermTip term="Jurnal Closing" tip={TIPS.closing}>
                  Closing Periode (ke 3020)
                </TermTip>{' '}
                <Badge tone="amber">Hanya admin</Badge>
              </h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Nol-kan net operasi &amp; beban (4010-4030, 5010-5040; kumulatif,
                self-healing; 4040 &amp; 4090 dikecualikan) ke 3020 SHU Ditahan.
                Satu closing per periode.
              </p>
              <form onSubmit={submitClosing} className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Periode (YYYY-MM)
                  <input
                    className="input mt-1"
                    type="text"
                    placeholder="mis. 2026-09"
                    value={cPeriod}
                    onChange={(e) => setCPeriod(e.target.value)}
                  />
                </label>
                <div className="flex items-end md:col-span-1">
                  <Button type="submit" loading={busy}>
                    Posting Closing
                  </Button>
                </div>
              </form>
            </div>
          )}

        </div>
      )}

      {/* -- Tab SHU (W4.4): alokasi rasio input + riwayat SHU -- */}
      {tab === 'shu' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 font-bold">
              <TermTip term="SHU" tip={TIPS.shu}>
                Alokasi SHU
              </TermTip>
            </h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Hitung dari input admin + rasio alokasi (PKGF sisi-pasif). Distribusi tercatat
              otomatis: jurnal D3020 -&gt; C3030/3040/3050/3060 saat GL on. Jasa per anggota +
              tunai = W4.5b (form di bawah).
            </p>
            {canWrite ? (
              <form onSubmit={submitShu} className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Periode
                  <input
                    className="input mt-1"
                    placeholder="YYYY-MM"
                    maxLength={7}
                    value={shuPeriod}
                    onChange={(e) => setShuPeriod(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  <TermTip term="SHU" tip={TIPS.shu}>
                    SHU Total (Rp)
                  </TermTip>
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    step={100}
                    value={shuTotal}
                    onChange={(e) => setShuTotal(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  <TermTip term="Rasio Alokasi" tip={TIPS.rasio}>
                    <TermTip term="Cadangan Umum" tip={TIPS.cad_umum}>
                      Cad. Umum (%)
                    </TermTip>
                  </TermTip>
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    max={100}
                    value={shuCadU}
                    onChange={(e) => setShuCadU(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  <TermTip term="Cadangan Khusus" tip={TIPS.cad_khusus}>
                    Cad. Khusus (%)
                  </TermTip>
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    max={100}
                    value={shuCadK}
                    onChange={(e) => setShuCadK(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  <TermTip term="Jasa Anggota" tip={TIPS.jasa}>
                    Jasa (%)
                  </TermTip>
                  <input
                    className="input mt-1"
                    type="number"
                    min={0}
                    max={100}
                    value={shuJasa}
                    onChange={(e) => setShuJasa(e.target.value)}
                  />
                </label>
                <div className="md:col-span-1 flex items-end">
                  <Button type="submit" loading={busy}>
                    Catat Alokasi SHU
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mode baca (tulis SHU hanya admin/manajer).
              </p>
            )}
            {shuTotalN > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <TermTip term="Cadangan Umum" tip={TIPS.cad_umum}>
                    Cad. Umum
                  </TermTip>{' '}
                  {shuCu}% = {rp(shuA.cu)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <TermTip term="Cadangan Khusus" tip={TIPS.cad_khusus}>
                    Cad. Khusus
                  </TermTip>{' '}
                  {shuCk}% = {rp(shuA.ck)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <TermTip term="Jasa Anggota" tip={TIPS.jasa}>
                    Jasa
                  </TermTip>{' '}
                  {shuJs}% = {rp(shuA.js)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <TermTip term="SHU Dibagi" tip={TIPS.dibagi}>
                    Dibagi
                  </TermTip>{' '}
                  {shuDibPct}% = {rp(shuA.dib)}
                </p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  SHU Total {rp(shuTotalN)}
                </p>
              </div>
            )}
          </div>
          <div className="card p-4">
            <h2 className="mb-3 font-bold">Riwayat SHU ({d.shu.length})</h2>
            {d.shu.length === 0 ? (
              <Empty compact text="Belum ada alokasi SHU. Isi form di atas." />
            ) : (
              <Table minW="min-w-[880px]">
                <thead>
                  <tr>
                    <Th>Periode</Th>
                    <Th className="text-right">SHU Total</Th>
                    <Th className="text-right">Cad. Umum</Th>
                    <Th className="text-right">Cad. Khusus</Th>
                    <Th className="text-right">Jasa Anggota</Th>
                    <Th className="text-right">Dibagi</Th>
                    <Th>Dicat</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.shu.map((s) => (
                    <Trow key={s.id} hover>
                      <Td>
                        <span className="font-bold">{s.period}</span>
                        {s.rasio_json ? (
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            rasio {s.rasio_json}
                          </span>
                        ) : (
                          <Badge tone="amber">distribusi = W4.4</Badge>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{rp(s.shu_total)}</Td>
                      <Td className="text-right tabular-nums">
                        {s.cadangan_umum == null ? '-' : rp(s.cadangan_umum)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {s.cadangan_khusus == null ? '-' : rp(s.cadangan_khusus)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {s.jasa_anggota == null ? '-' : rp(s.jasa_anggota)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {s.dibagi == null ? '-' : rp(s.dibagi)}
                      </Td>
                      <Td>{fmtDateTime(s.created_at)}</Td>
                    </Trow>
                  ))}
                </tbody>
              </Table>
            )}
          </div>

          <div className="card p-4">
            <h2 className="mb-2 font-bold">
              <TermTip term="Jasa Anggota" tip={TIPS.jasa}>
                Jasa per Anggota (3050 -&gt; 2070)
              </TermTip>{' '}
              <Badge tone="blue">W4.5b</Badge>
            </h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Bagikan SELURUH jasa periode (akun 3050) rata-rata ke anggota aktif (bukan bunga;
              sisa dipas ke urutan nama A-Z). Satu distribusi per periode; jurnal agregat D3050
              -&gt; K2070 saat GL aktif.
            </p>
            {canWrite ? (
              <form onSubmit={submitJasa} className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Periode (YYYY-MM)
                  <input
                    className="input mt-1"
                    type="text"
                    placeholder="mis. 2026-09"
                    maxLength={7}
                    value={jsPeriod}
                    onChange={(e) => setJsPeriod(e.target.value)}
                  />
                </label>
                <div className="flex items-end md:col-span-1">
                  <Button type="submit" loading={busy}>
                    Bagikan Jasa
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mode baca (bagi jasa hanya admin/manajer).
              </p>
            )}
          </div>

          <div className="card p-4">
            <h2 className="mb-2 font-bold">
              <TermTip term="SHU Dibagi" tip={TIPS.dibagi}>
                Pencairan Tunai / Transfer (3060)
              </TermTip>{' '}
              <Badge tone="blue">W4.5b</Badge>
            </h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Cairkan bagian 'SHU dibagi' (akun 3060) ke kas (1010) atau bank/transfer (1020).
              Satu pencairan per periode; nominal tak melebihi saldo 3060.
            </p>
            {canWrite ? (
              <form onSubmit={submitTunai} className="grid gap-3 md:grid-cols-3">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Periode (YYYY-MM)
                  <input
                    className="input mt-1"
                    type="text"
                    placeholder="mis. 2026-09"
                    maxLength={7}
                    value={tnPeriod}
                    onChange={(e) => setTnPeriod(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Nominal (Rp)
                  <input
                    className="input mt-1"
                    inputMode="numeric"
                    placeholder="mis. 250000"
                    value={tnAmount}
                    onChange={(e) => setTnAmount(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:col-span-1">
                  Akun Pencairan
                  <select
                    className="input mt-1"
                    value={tnAcct}
                    onChange={(e) => setTnAcct(e.target.value)}
                  >
                    <option value="1010">1010 - Kas</option>
                    <option value="1020">1020 - Bank/Transfer</option>
                  </select>
                </label>
                <div className="flex items-end md:col-span-3">
                  <Button type="submit" loading={busy}>
                    Catat Pencairan
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mode baca (pencairan hanya admin/manajer).
              </p>
            )}
          </div>
        </div>
      )}

      {host}
      {msg ? <Toast msg={msg} tone={tone} action={action} onClose={clearToast} /> : null}
    </div>
  );
}