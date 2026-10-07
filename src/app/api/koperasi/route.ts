/**
 * W4.3 -- API Koperasi: /api/koperasi
 *
 * Dua handler, pola /api/akad (w3.3) + engine W4.2 (src/lib/coop.ts,
 * Sek.7.1/7.2/7.3 skema v24):
 *  - GET  : rekap read-only (anggota + saldo simpanan + riwayat + saldo
 *           akun 2050/2060/2070/30xx + riwayat SHU). Tier baca = koperasi
 *           (admin+manajer) ATAU laporan (pengurus read-only, pola Q3).
 *           Cache: ref-cache prefix 'coop:' (key 'coop:rekap', TTL 60 dtk
 *           backstop -- pola gl: route W1.4).
 *  - POST : dispatch op (ruling OQ2 W4.3; 1 route, tanpa PUT):
 *           - member_create : INSERT coop_members (engine
 *             createCoopMemberInTx; UNIQUE(name) -> 409 coop_member_duplicate;
 *             tanpa jurnal -- Sek.7.2 tak mendefinisikan posting pembuatan).
 *           - setor         : recordCoopSavingsInTx (D1: auto-jurnal
 *             D1010->K205x hanya saat gl_enabled='1'; idempoten ref_id).
 *           - tarik         : recordCoopWithdrawInTx (baris NEGATIF
 *             sukarela; guard sisa >= 0 -> 400 coop_insufficient).
 *           - status        : setCoopMemberStatusInTx (aktif<->nonaktif;
 *             'keluar' ditolak -> 400 coop_status_terminal; op 'keluar'
 *             jalur terpisah).
 *           - keluar        : recordCoopMemberKeluarInTx (status terminal
 *             + refund pokok D2050->K1010 saat gl-on; sudah 'keluar' =
 *             no-op idempoten).
 *           - shu           : recordShuInTx W4.4 (distribusi SHU rasio input
 *             admin; 1 jurnal alokasi D3020->C3030/3040/3050/3060 saat
 *             gl-on; entry_date = awal periode (period+'-01'); periode unik
 *             -> 409 shu_period_exists; validasi rasio/total -> 400).
 *           - modal         : recordCoopModalInTx W4.5a (modal anggota
 *             3010; baris kind 'modal' di coop_savings + jurnal D1010->K3010
 *             saat gl-on; ref_id +uuid; event duplikat -> 409
 *             coop_modal_duplicate; anggota tak ada -> 404; tier =
 *             koperasi (OQ7-A).
 *           - closing       : postCoopClosingInTx W4.5a (Sek.3.2.6; net
 *             P&L 4010-4030 & 5010-5040 KUMULATIF -> 3020, excl.
 *             4040/4090 (OQ1); 3020 boleh negatif = rugi (OQ2); legs
 *             net-0 ditiada (OQ9); 1 periode = 1 closing -> 409
 *             closing_period_exists; periode tanpa aktivitas -> 400
 *             closing_no_activity; ADMIN-ONLY (OQ7-B); gl-off -> 400).
 *           - jasa          : recordCoopJasaInTx W4.5b (jasa per
 *             anggota; pool = SELURUH coop_shu.jasa_anggota periode,
 *             tanpa input nominal (OQ10); rata-rata Q5 = floor +
 *             sisa per urut nama COLLATE NOCASE (OQ4/OQ5); N baris
 *             coop_savings kind 'jasa' saved_at = hari terakhir
 *             periode (OQ6/OQ11) + SATU jurnal agregat D3050 ->
 *             K2070 (N kaki, OQ9) saat gl-on; SHU periode tak
 *             tercatat -> 404 shu_period_missing; pool = 0 -> 400
 *             jasa_no_pool; N aktif = 0 -> 400 jasa_no_active; 1
 *             periode = 1 distribusi (pre-check event-level --
 *             gl-off pun, OQ15) -> 409 jasa_period_exists; tier
 *             koperasi (OQ14)).
 *           - tunai         : recordCoopTunaiInTx W4.5b (pencairan
 *             SHU dibagi 3060; nominal input admin <= saldo GL 3060
 *             (OQ12; saldo <= 0 -> 400 tunai_no_pool; lebih -> 400
 *             tunai_exceeds_balance); SATU jurnal D3060 -> C1010
 *             (kas) / C1020 (bank/transfer), akun default 1010
 *             (OQ7-A/OQ13: 5080 TAK PERNAH jadi leg -- saldo tetap
 *             0; entry_date = hari posting); 1 periode = 1
 *             pencairan (guard jurnal, pola closing) -> 409
 *             tunai_period_exists; gl-off = tanpa jurnal (OQ15 D1;
 *             konsekuensi: 400 tunai_no_pool); tier koperasi (OQ14)).
 *           Semua op tulis: SATU transaksi (db + logAudit + engine InTx,
 *           pola W2.7/W3.3) + invalidate('coop:') dan invalidate('gl:')
 *           (OQ4 W4.3: auto-jurnal coop mencemari cache /api/gl).
 *
 * Error mapping (OQ3 W4.3): 401 tak login; 403 tier; 404 anggota tak ada;
 * 409 konflik (UNIQUE); 400 validasi (amount/kind/saved_at/status);
 * 500 tak terduga.
 */
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db, getSettings, tx } from '@/db';
import { canAccess, currentUser, isAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { cached, invalidate } from '@/lib/ref-cache';
import { nowWib } from '@/lib/jurnal';
import { wibToday } from '@/lib/zakat-period';
import {
  COOP_KINDS,
  COOP_STATUSES,
  coopValidateAmount,
  createCoopMemberInTx,
  setCoopMemberStatusInTx,
  recordCoopSavingsInTx,
  recordCoopWithdrawInTx,
  recordCoopMemberKeluarInTx,
} from '@/lib/coop';
import {
  recordShuInTx,
  validateShuInput,
  type ShuRasio,
  type ShuValidated,
} from '@/lib/shu';
import { recordCoopModalInTx } from '@/lib/coop-modal';
import { postCoopClosingInTx, validateClosingPeriod } from '@/lib/coop-closing';
import { recordCoopJasaInTx } from '@/lib/coop-jasa';
import { recordCoopTunaiInTx, TUNAI_ACCTS } from '@/lib/coop-tunai';

export const dynamic = 'force-dynamic';

// -- Tipe respons (type export sah: constraint type-check .next/types
//    hanya memblokir export NILAI selain handler, pola /api/akad W3.3).
export type CoopMemberRow = {
  id: string;
  name: string;
  npwp: string | null;
  rumpun: string | null;
  member_since: string;
  status: string;
};

/** Saldo aljabar per kind (SUM coop_savings; baris tarik = negatif). */
export type CoopBalance = { pokok: number; wajib: number; sukarela: number; total: number };

export type CoopHistoryRow = {
  member_id: string;
  member_name: string | null;
  kind: string;
  amount: number;
  saved_at: string;
};

export type CoopAccountRow = { code: string; name: string; balance: number };

/** Baris distribusi SHU (Sek.7.2/Sek.13.4; POST jurnal distribusi = W4.4). */
export type CoopShuRow = {
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

export type CoopRekap = {
  members: CoopMemberRow[];
  balances: Record<string, CoopBalance>;
  history: CoopHistoryRow[];
  accounts: CoopAccountRow[];
  shu: CoopShuRow[];
  gl_enabled: boolean;
};

export type CoopActionResult = {
  ok: boolean;
  id?: string;
  entryId?: string | null;
  gl_enabled?: boolean;
  status?: string;
  // -- respons ops lainnya (W4.5a/W4.5b; mirror PostResult client) ----
  uuid?: string; // modal (W4.5a)
  period?: string; // shu/closing/jasa/tunai
  shu?: number; // shu (W4.4)
  profit?: boolean; // shu (W4.4)
  jasa_total?: number; // jasa (W4.5b)
  member_count?: number; // jasa (W4.5b)
  per_member?: { member_id: string; name: string; amount: number }[]; // jasa (W4.5b)
  amount?: number; // tunai (W4.5b)
  acct?: string; // tunai (W4.5b)
};

/** Akun rekap (OQ6 W4.3): simpanan 2050/2060/2070 (kewajiban -- memo kaki,
 *  TIDAK dijumlah ke ekuitas, konsisten W2.4) + modal/SHU 30xx.
 *  2080 = pending, tak ditampil. */
const REKAP_ACCOUNTS = ['2050', '2060', '2070', '3010', '3020', '3030', '3040', '3050', '3060'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** UNIQUE constraint (SQLite/Turso) -- pola isUniqueViolation /api/akad W3.3. */
function isUniqueViolation(e: unknown): boolean {
  return String((e as Error | undefined)?.message ?? e).includes('UNIQUE constraint failed');
}
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  // W4.3 (OQ1: mirror Q3 akad): baca = tier koperasi ATAU laporan
  // (pengurus read-only -- transparansi Sek.7).
  if (!canAccess(user, 'koperasi') && !canAccess(user, 'laporan'))
    return NextResponse.json({ error: 'Hanya admin/manajer/pengurus' }, { status: 403 });

  try {
    const payload = await cached('coop:rekap', async () => {
      const d = await db();
      const settings = await getSettings();
      const glOn = settings.gl_enabled === '1';

      const members = (await d
        .prepare(
          'SELECT id, name, npwp, rumpun, member_since, status ' +
            'FROM coop_members ORDER BY name COLLATE NOCASE'
        )
        .all()) as CoopMemberRow[];

      // Saldo aljabar per anggota+kind (baris tarik = negatif, Option A
      // W4.2: saldo = SUM). Default nol utk anggota tanpa mutasi.
      const balRows = (await d
        .prepare('SELECT member_id, kind, SUM(amount) s FROM coop_savings GROUP BY member_id, kind')
        .all()) as { member_id: string; kind: string; s: number }[];
      const balances: Record<string, CoopBalance> = {};
      for (const m of members) {
        balances[m.id] = { pokok: 0, wajib: 0, sukarela: 0, total: 0 };
      }
      for (const r of balRows) {
        const b = balances[r.member_id];
        if (!b) continue; // baris yatim (tak mungkin: FK idempoten)
        if (r.kind === 'pokok') b.pokok = Math.round(Number(r.s) || 0);
        else if (r.kind === 'wajib') b.wajib = Math.round(Number(r.s) || 0);
        else if (r.kind === 'sukarela') b.sukarela = Math.round(Number(r.s) || 0);
      }
      for (const b of Object.values(balances)) b.total = b.pokok + b.wajib + b.sukarela;

      const history = (await d
        .prepare(
          'SELECT cs.member_id, cm.name AS member_name, cs.kind, cs.amount, cs.saved_at ' +
            'FROM coop_savings cs LEFT JOIN coop_members cm ON cm.id = cs.member_id ' +
            'ORDER BY cs.saved_at DESC, cs.amount ASC LIMIT 100'
        )
        .all()) as CoopHistoryRow[];

      // Saldo akun rekap = SUM(debit)-SUM(credit) di journal_lines
      // (kumulatif, pola gl route W1.4). Nama dari COA (fallback kode).
      const ph = REKAP_ACCOUNTS.map(() => '?').join(', ');
      const accRows = (await d
        .prepare(
          'SELECT account_code, SUM(debit) - SUM(credit) AS bal FROM journal_lines ' +
            'WHERE account_code IN (' +
            ph +
            ') GROUP BY account_code'
        )
        .all(...REKAP_ACCOUNTS)) as { account_code: string; bal: number }[];
      const coa = (await d
        .prepare('SELECT code, name FROM coa WHERE code IN (' + ph + ')')
        .all(...REKAP_ACCOUNTS)) as { code: string; name: string }[];
      const coaMap = new Map(coa.map((r) => [r.code, r.name] as const));
      const balMap = new Map(accRows.map((r) => [r.account_code, Math.round(Number(r.bal) || 0)] as const));
      const accounts: CoopAccountRow[] = REKAP_ACCOUNTS.map((code) => ({
        code,
        name: coaMap.get(code) ?? 'Akun ' + code,
        balance: balMap.get(code) ?? 0,
      }));

      const shu = (await d
        .prepare(
          'SELECT id, period, shu_total, cadangan_umum, cadangan_khusus, jasa_anggota, dibagi, rasio_json, created_at ' +
            'FROM coop_shu ORDER BY created_at DESC, period DESC LIMIT 20'
        )
        .all()) as CoopShuRow[];

      return { members, balances, history, accounts, shu, gl_enabled: glOn };
    });
    return NextResponse.json(payload as CoopRekap);
  } catch {
    return NextResponse.json({ error: 'Gagal memuat rekap koperasi' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canAccess(user, 'koperasi'))
    return NextResponse.json({ error: 'Hanya admin/manajer (tulis koperasi)' }, { status: 403 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'json body rusak' }, { status: 400 });
  const op = String(b.op ?? '').trim();

  const d = await db();
  const settings = await getSettings();
  const glOn = settings.gl_enabled === '1';

  switch (op) {
    // -- op: member_create (tanpa jurnal; UNIQUE(name) -> 409) --------
    case 'member_create': {
      const name = String(b.name ?? '').trim();
      if (!name || name.length > 120)
        return NextResponse.json({ error: 'name wajib (maks 120 karakter)' }, { status: 400 });
      const npwp = b.npwp ? String(b.npwp).trim() : '';
      if (npwp.length > 60)
        return NextResponse.json({ error: 'npwp maks 60 karakter' }, { status: 400 });
      const rumpun = b.rumpun ? String(b.rumpun).trim() : '';
      if (rumpun.length > 80)
        return NextResponse.json({ error: 'rumpun maks 80 karakter' }, { status: 400 });
      const memberSince = b.member_since ? String(b.member_since) : wibToday();
      if (!DATE_RE.test(memberSince))
        return NextResponse.json({ error: 'member_since harus YYYY-MM-DD (WIB)' }, { status: 400 });

      const id = crypto.randomUUID();
      try {
        await tx(d, async () => {
          await createCoopMemberInTx(d, {
            id,
            name,
            npwp: npwp || null,
            rumpun: rumpun || null,
            memberSince,
          });
          await logAudit(user, 'coop:member', 'coop_members', null, undefined, {
            id,
            name,
            rumpun: rumpun || null,
            member_since: memberSince,
          });
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json({ ok: true, id } satisfies CoopActionResult);
      } catch (e) {
        if (isUniqueViolation(e))
          return NextResponse.json(
            { error: 'Nama anggota sudah terdaftar di koperasi', code: 'coop_member_duplicate' },
            { status: 409 }
          );
        return NextResponse.json(
          { error: 'Gagal membuat anggota: ' + (e instanceof Error ? e.message : String(e)) },
          { status: 500 }
        );
      }
    }

    // -- op: setor / tarik (D1: auto-jurnal hanya saat gl-on) ---------
    case 'setor':
    case 'tarik': {
      const memberId = String(b.member_id ?? '').trim();
      if (!memberId) return NextResponse.json({ error: 'member_id wajib' }, { status: 400 });
      let amount: number;
      try {
        amount = coopValidateAmount(b.amount);
      } catch {
        return NextResponse.json({ error: 'amount harus rupiah integer > 0' }, { status: 400 });
      }
      let kind = '';
      if (op === 'setor') {
        kind = String(b.kind ?? '').trim();
        if (!(COOP_KINDS as readonly string[]).includes(kind))
          return NextResponse.json(
            { error: 'kind harus salah satu dari ' + COOP_KINDS.join('/') },
            { status: 400 }
          );
      }
      const savedAt = b.saved_at ? String(b.saved_at) : nowWib();
      if (!DATETIME_RE.test(savedAt))
        return NextResponse.json(
          { error: 'saved_at harus ISO WIB (mis. 2026-10-06T10:00:00.000+07:00)' },
          { status: 400 }
        );
      const mem = (await d
        .prepare('SELECT 1 ok FROM coop_members WHERE id = ?')
        .get(memberId)) as { ok: number } | undefined;
      if (!mem) return NextResponse.json({ error: 'Anggota tidak ditemukan' }, { status: 404 });

      try {
        const out = await tx(d, async () => {
          if (op === 'setor') {
            const r = await recordCoopSavingsInTx(d, {
              memberId,
              kind,
              amount,
              savedAt,
              createdBy: String(user.id),
              gl_enabled: glOn,
            });
            await logAudit(user, 'coop:setor', 'coop_savings', null, undefined, {
              member_id: memberId,
              kind,
              amount,
              saved_at: savedAt,
              gl_enabled: glOn,
            });
            return r;
          }
          const r = await recordCoopWithdrawInTx(d, {
            memberId,
            amount,
            savedAt,
            createdBy: String(user.id),
            gl_enabled: glOn,
          });
          await logAudit(user, 'coop:tarik', 'coop_savings', null, undefined, {
            member_id: memberId,
            amount,
            saved_at: savedAt,
            gl_enabled: glOn,
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          { ok: true, entryId: out.entryId, gl_enabled: glOn } satisfies CoopActionResult
        );
      } catch (e) {
        // OQ3: guard saldo sukarela = galat validasi (400, bukan 500/409).
        if (String(e instanceof Error ? e.message : String(e)).includes('melebihi sisa'))
          return NextResponse.json(
            {
              error: 'Tarik sukarela melebihi sisa saldo sukarela anggota (belum dicicil / sudah habis)',
              code: 'coop_insufficient',
            },
            { status: 400 }
          );
        if (isUniqueViolation(e))
          return NextResponse.json(
            {
              error: 'Transaksi identik sudah tercatat (idempoten: perbarui dulu simpanannya)',
              code: 'coop_duplicate',
            },
            { status: 409 }
          );
        return NextResponse.json(
          { error: 'Gagal mencatat ' + op + ': ' + (e instanceof Error ? e.message : String(e)) },
          { status: 500 }
        );
      }
    }

    // -- op: status (aktif <-> nonaktif; 'keluar' ditolak di sini) ----
    case 'status': {
      const memberId = String(b.member_id ?? '').trim();
      if (!memberId) return NextResponse.json({ error: 'member_id wajib' }, { status: 400 });
      const status = String(b.status ?? '').trim();
      // OQ3: 'keluar' TIDAK lewat op status -- hanya op keluar (terminal).
      if (status === 'keluar')
        return NextResponse.json(
          {
            error: 'Status keluar hanya lewat op "keluar" (terminal: tidak bisa dikembalikan)',
            code: 'coop_status_terminal',
          },
          { status: 400 }
        );
      if (!(COOP_STATUSES as readonly string[]).includes(status))
        return NextResponse.json({ error: 'status harus aktif/nonaktif' }, { status: 400 });
      const cur = (await d
        .prepare('SELECT status s FROM coop_members WHERE id = ?')
        .get(memberId)) as { s: string } | undefined;
      if (!cur) return NextResponse.json({ error: 'Anggota tidak ditemukan' }, { status: 404 });
      if (cur.s === 'keluar')
        return NextResponse.json(
          {
            error: 'Anggota sudah KELUAR (terminal) -- tidak dapat diubah statusnya',
            code: 'coop_status_terminal',
          },
          { status: 400 }
        );
      try {
        await tx(d, async () => {
          await setCoopMemberStatusInTx(d, { memberId, status });
          await logAudit(user, 'coop:status', 'coop_members', null, { status: cur.s }, {
            member_id: memberId,
            status,
          });
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json({ ok: true, status } satisfies CoopActionResult);
      } catch (e) {
        return NextResponse.json(
          { error: 'Gagal ubah status anggota: ' + (e instanceof Error ? e.message : String(e)) },
          { status: 500 }
        );
      }
    }

    // -- op: keluar (terminal; refund pokok saat gl-on; idempoten) -----
    case 'keluar': {
      const memberId = String(b.member_id ?? '').trim();
      if (!memberId) return NextResponse.json({ error: 'member_id wajib' }, { status: 400 });
      const mem = (await d
        .prepare('SELECT status s FROM coop_members WHERE id = ?')
        .get(memberId)) as { s: string } | undefined;
      if (!mem) return NextResponse.json({ error: 'Anggota tidak ditemukan' }, { status: 404 });
      try {
        const out = await tx(d, async () => {
          // Engine: sudah 'keluar' = no-op idempoten (tanpa refund kedua).
          const r = await recordCoopMemberKeluarInTx(d, {
            memberId,
            createdBy: String(user.id),
            gl_enabled: glOn,
          });
          await logAudit(user, 'coop:keluar', 'coop_members', null, { status: mem.s }, {
            member_id: memberId,
            status: 'keluar',
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          { ok: true, entryId: out.entryId, gl_enabled: glOn } satisfies CoopActionResult
        );
      } catch (e) {
        return NextResponse.json(
          { error: 'Gagal memproses keluar anggota: ' + (e instanceof Error ? e.message : String(e)) },
          { status: 500 }
        );
      }
    }

    // -- op: shu (W4.4: distribusi SHU rasio input + jurnal alokasi) ------
    case 'shu': {
      // OQ7: tulis = tier koperasi ATAU shu (admin+manajer); pengurus = 403.
      if (!canAccess(user, 'koperasi') && !canAccess(user, 'shu'))
        return NextResponse.json({ error: 'Hanya admin/manajer (tulis SHU)' }, { status: 403 });
      let validated: ShuValidated;
      try {
        validated = validateShuInput({
          period: String(b.period ?? ''),
          shu_total: Number(b.shu_total),
          rasio: (b.rasio ?? {}) as ShuRasio,
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: 'Validasi SHU: ' + m, code: m }, { status: 400 });
      }
      try {
        const out = await tx(d, async () => {
          const r = await recordShuInTx(d, {
            id: crypto.randomUUID(),
            period: validated.period,
            shu_total: validated.shu_total,
            rasio: validated.rasio,
            amounts: validated.amounts,
            glDate: validated.period + '-01', // entry_date = awal periode (correction 2)
            glEnabled: glOn,
            createdBy: String(user.id),
          });
          await logAudit(user, 'coop:shu', 'coop_shu', null, undefined, {
            period: validated.period,
            shu_total: validated.shu_total,
            rasio: validated.rasio,
            gl_enabled: glOn,
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          { ok: true, id: out.id, entryId: out.entryId, gl_enabled: glOn } satisfies CoopActionResult
        );
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m === 'SHU_PERIOD_EXISTS' || isUniqueViolation(e))
          return NextResponse.json(
            {
              error: 'SHU periode ini sudah tercatat (periode unik; koreksi via jurnal pembalik)',
              code: 'shu_period_exists',
            },
            { status: 409 }
          );
        return NextResponse.json({ error: 'Gagal mencatat SHU: ' + m }, { status: 500 });
      }
    }

    // -- op: modal (W4.5a: modal anggota 3010; OQ7-A tier koperasi) ----
    case 'modal': {
      if (!canAccess(user, 'koperasi'))
        return NextResponse.json({ error: 'Hanya admin/manajer (catat modal)' }, { status: 403 });
      const memberId = String(b.member_id ?? '').trim();
      if (!memberId) return NextResponse.json({ error: 'member_id wajib', code: 'member_required' }, { status: 400 });
      let savedAt: string | undefined;
      const rawDate = b.saved_at ?? b.date;
      if (rawDate != null && rawDate !== '') {
        savedAt = String(rawDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(savedAt))
          return NextResponse.json(
            { error: 'saved_at harus YYYY-MM-DD', code: 'saved_at_invalid' },
            { status: 400 }
          );
      }
      const mem = (await d.prepare('SELECT 1 AS x FROM coop_members WHERE id = ?').get(memberId)) as
        | { x?: number }
        | undefined;
      if (!mem)
        return NextResponse.json(
          { error: 'Anggota tidak ditemukan', code: 'coop_member_not_found' },
          { status: 404 }
        );
      try {
        const out = await tx(d, async () => {
          const r = await recordCoopModalInTx(d, {
            memberId,
            amount: b.amount,
            savedAt,
            gl_enabled: glOn,
            createdBy: String(user.id),
          });
          await logAudit(user, 'coop:modal', 'coop_savings', null, undefined, {
            member_id: memberId,
            amount: b.amount,
            saved_at: savedAt ?? null,
            gl_enabled: glOn,
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          { ok: true, entryId: out.entryId, uuid: out.uuid, gl_enabled: glOn } satisfies CoopActionResult
        );
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m === 'COOP_MEMBER_NOT_FOUND')
          return NextResponse.json(
            { error: 'Anggota tidak ditemukan', code: 'coop_member_not_found' },
            { status: 404 }
          );
        if (m === 'COOP_MODAL_DUPLICATE' || isUniqueViolation(e))
          return NextResponse.json(
            {
              error: 'Modal ini sudah tercatat (anggota + tanggal + nominal sama)',
              code: 'coop_modal_duplicate',
            },
            { status: 409 }
          );
        if (m.startsWith('coop:'))
          return NextResponse.json({ error: 'Validasi modal: ' + m, code: 'coop_modal_invalid' }, { status: 400 });
        return NextResponse.json({ error: 'Gagal mencatat modal: ' + m }, { status: 500 });
      }
    }

    // -- op: closing (W4.5a Sek.3.2.6: nol-kan net P&L -> 3020) --------
    // OQ7-B: ADMIN-ONLY (tak ada tier closing -- ruling STEP 1 OQ7).
    case 'closing': {
      if (!isAdmin(user))
        return NextResponse.json({ error: 'Hanya admin (jurnal closing periode)' }, { status: 403 });
      if (!glOn)
        return NextResponse.json(
          { error: 'Jurnal closing butuh GL aktif', code: 'gl_off' },
          { status: 400 }
        );
      let period: string;
      try {
        period = validateClosingPeriod(b.period);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: 'Periode closing harus YYYY-MM', code: 'closing_period_invalid' },
          { status: 400 }
        );
      }
      try {
        const out = await tx(d, async () => {
          const r = await postCoopClosingInTx(d, {
            period,
            glEnabled: glOn,
            createdBy: String(user.id),
          });
          await logAudit(user, 'coop:closing', 'journal_entries', null, undefined, {
            period,
            shu: r.shu,
            profit: r.profit,
            entry_id: r.entryId,
            gl_enabled: glOn,
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          {
            ok: true,
            period: out.period,
            shu: out.shu,
            profit: out.profit,
            entryId: out.entryId,
            gl_enabled: out.gl,
          } satisfies CoopActionResult
        );
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m === 'CLOSING_PERIOD_EXISTS')
          return NextResponse.json(
            {
              error: 'Closing periode ini sudah dilakukan (1 periode = 1 closing; koreksi via jurnal manual)',
              code: 'closing_period_exists',
            },
            { status: 409 }
          );
        if (m === 'CLOSING_NO_ACTIVITY')
          return NextResponse.json(
            { error: 'Tidak ada aktivitas P&L untuk ditutup (semua net 0)', code: 'closing_no_activity' },
            { status: 400 }
          );
        if (m === 'CLOSING_PERIOD_INVALID')
          return NextResponse.json(
            { error: 'Periode closing harus YYYY-MM', code: 'closing_period_invalid' },
            { status: 400 }
          );
        return NextResponse.json({ error: 'Gagal posting jurnal closing: ' + m }, { status: 500 });
      }
    }

    // -- op: jasa (W4.5b: jasa per anggota; rata-rata Q5; OQ4-OQ11) --
    // OQ14: tier koperasi (admin+manajer).
    case 'jasa': {
      if (!canAccess(user, 'koperasi'))
        return NextResponse.json({ error: 'Hanya admin/manajer (bagi jasa per anggota)' }, { status: 403 });
      const periodJasa = String(b.period ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(periodJasa))
        return NextResponse.json(
          { error: 'Periode jasa harus YYYY-MM', code: 'coop_jasa_period_invalid' },
          { status: 400 }
        );
      try {
        const out = await tx(d, async () => {
          const r = await recordCoopJasaInTx(d, {
            period: periodJasa,
            gl_enabled: glOn,
            createdBy: String(user.id),
          });
          await logAudit(user, 'coop:jasa', 'coop_shu', null, undefined, {
            period: periodJasa,
            jasa_total: r.jasaTotal,
            member_count: r.perMember.length,
            entry_id: r.entryId,
            gl_enabled: glOn,
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          {
            ok: true,
            period: out.period,
            jasa_total: out.jasaTotal,
            member_count: out.perMember.length,
            per_member: out.perMember.map((m) => ({
              member_id: m.memberId,
              name: m.name,
              amount: m.amount,
            })),
            entryId: out.entryId,
            gl_enabled: glOn,
          } satisfies CoopActionResult
        );
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m === 'JASA_PERIOD_EXISTS' || isUniqueViolation(e))
          return NextResponse.json(
            {
              error: 'Jasa periode ini sudah dibagikan (1 periode = 1 distribusi; koreksi via jurnal pembalik)',
              code: 'jasa_period_exists',
            },
            { status: 409 }
          );
        if (m === 'JASA_SHU_MISSING')
          return NextResponse.json(
            { error: 'SHU periode ini belum tercatat (hitung alokasi SHU dulu)', code: 'shu_period_missing' },
            { status: 404 }
          );
        if (m === 'JASA_NO_POOL')
          return NextResponse.json(
            { error: 'Pool jasa periode ini = 0 (rasio jasa 0; tak ada yang dibagikan)', code: 'jasa_no_pool' },
            { status: 400 }
          );
        if (m === 'JASA_NO_ACTIVE')
          return NextResponse.json(
            { error: 'Belum ada anggota berstatus aktif (N = 0)', code: 'jasa_no_active' },
            { status: 400 }
          );
        if (m.startsWith('coop_jasa:') || m.startsWith('coop:'))
          return NextResponse.json(
            { error: 'Validasi jasa: ' + m, code: 'coop_jasa_invalid' },
            { status: 400 }
          );
        return NextResponse.json({ error: 'Gagal membagi jasa: ' + m }, { status: 500 });
      }
    }

    // -- op: tunai (W4.5b: pencairan SHU dibagi 3060; OQ7-A) -----------
    // OQ14: tier koperasi (admin+manajer).
    case 'tunai': {
      if (!canAccess(user, 'koperasi'))
        return NextResponse.json({ error: 'Hanya admin/manajer (pencairan tunai/transfer)' }, { status: 403 });
      const periodTunai = String(b.period ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(periodTunai))
        return NextResponse.json(
          { error: 'Periode tunai harus YYYY-MM', code: 'coop_tunai_period_invalid' },
          { status: 400 }
        );
      let amountTunai: number;
      try {
        amountTunai = coopValidateAmount(b.amount);
      } catch {
        return NextResponse.json(
          { error: 'Amount harus rupiah integer > 0', code: 'coop_tunai_amount_invalid' },
          { status: 400 }
        );
      }
      let acct = '1010';
      if (b.acct != null && String(b.acct).trim() !== '') {
        const a = String(b.acct).trim();
        if (!TUNAI_ACCTS.includes(a))
          return NextResponse.json(
            {
              error: 'Akun pencairan harus 1010 (kas) atau 1020 (bank/transfer)',
              code: 'coop_tunai_acct_invalid',
            },
            { status: 400 }
          );
        acct = a;
      }
      try {
        const out = await tx(d, async () => {
          const r = await recordCoopTunaiInTx(d, {
            period: periodTunai,
            amount: amountTunai,
            acct,
            gl_enabled: glOn,
            createdBy: String(user.id),
            entryDate: nowWib(),
          });
          await logAudit(user, 'coop:tunai', 'coop', null, undefined, {
            period: periodTunai,
            amount: amountTunai,
            acct,
            entry_id: r.entryId,
            gl_enabled: glOn,
          });
          return r;
        });
        invalidate('coop:');
        invalidate('gl:');
        return NextResponse.json(
          {
            ok: true,
            period: periodTunai,
            amount: amountTunai,
            acct,
            entryId: out.entryId,
            gl_enabled: glOn,
          } satisfies CoopActionResult
        );
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m === 'TUNAI_PERIOD_EXISTS' || isUniqueViolation(e))
          return NextResponse.json(
            {
              error: 'Pencairan periode ini sudah dilakukan (1 periode = 1 pencairan; koreksi via jurnal pembalik)',
              code: 'tunai_period_exists',
            },
            { status: 409 }
          );
        if (m === 'TUNAI_NO_POOL')
          return NextResponse.json(
            {
              error: 'Saldo SHU dibagi (3060) tak tersedia (GL off / belum ada distribusi) -- tidak bisa dicairkan',
              code: 'tunai_no_pool',
            },
            { status: 400 }
          );
        if (m.startsWith('coop_tunai:'))
          return NextResponse.json(
            {
              error:
                m === 'coop_tunai:exceeds_balance'
                  ? 'Nominal melebihi saldo SHU dibagi (3060)'
                  : 'Validasi tunai: ' + m,
              code: m === 'coop_tunai:exceeds_balance' ? 'tunai_exceeds_balance' : 'coop_tunai_invalid',
            },
            { status: 400 }
          );
        return NextResponse.json({ error: 'Gagal mencatat pencairan tunai: ' + m }, { status: 500 });
      }
    }

    default:
      return NextResponse.json(
        {
          error:
            'op tidak dikenal (ops: member_create/setor/tarik/status/keluar/shu/modal/closing/jasa/tunai)',
        },
        { status: 400 }
      );
  }
}