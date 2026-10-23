'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Button, Table, Th, Td, Trow, TEmpty, useToast, PageSkeleton } from '@/components/ui';

type WadiRow = { id: number; name: string; balance: number; updated_at: string | null };
type LedgerRow = {
  id: number;
  member_id: number;
  type: string;
  amount: number;
  balance_after: number;
  note: string;
  created_by: number | null;
  created_at: string;
};

const ICON_WALLET = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 8h20" />
    <circle cx="18" cy="14" r="2" />
  </svg>
);

const ICON_DEPOSIT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 19 19 12" />
  </svg>
);

const ICON_WITHDRAW = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 5 5 12" />
  </svg>
);

const ICON_HISTORY = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

function fmtRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export function WadiClient() {
  const [toast, showToast] = useToast();
  const [members, setMembers] = useState<WadiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selMember, setSelMember] = useState<number>(0);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerMember, setLedgerMember] = useState<number>(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: WadiRow[] }>('/api/wadi');
      if (res.data) setMembers(res.data.items);
    } catch (e) {
      showToast('Gagal memuat data: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  async function doSetor() {
    if (!selMember || !amount) { showToast('Pilih santri dan isi jumlah', 'warning'); return; }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; balance: number }>('/api/wadi', {
        method: 'POST',
        body: JSON.stringify({ action: 'setor', member_id: selMember, amount: Number(amount), note }),
      });
      if (res.data) showToast('Setor berhasil. Saldo: ' + fmtRp(res.data.balance), 'success');
      setAmount(''); setNote('');
      void load();
    } catch (e) {
      showToast('Gagal: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally { setBusy(false); }
  }

  async function doTarik() {
    if (!selMember || !amount) { showToast('Pilih santri dan isi jumlah', 'warning'); return; }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; balance: number }>('/api/wadi', {
        method: 'POST',
        body: JSON.stringify({ action: 'tarik', member_id: selMember, amount: Number(amount), note }),
      });
      if (res.data) showToast('Tarik berhasil. Saldo: ' + fmtRp(res.data.balance), 'success');
      setAmount(''); setNote('');
      void load();
    } catch (e) {
      showToast('Gagal: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally { setBusy(false); }
  }

  async function showRiwayat(memberId: number) {
    setLedgerMember(memberId);
    setLedgerLoading(true);
    try {
      const res = await api<{ entries: LedgerRow[]; saldo: number }>('/api/wadi', {
        method: 'POST',
        body: JSON.stringify({ action: 'riwayat', member_id: memberId, limit: 50, offset: 0 }),
      });
      if (res.data) setLedger(res.data.entries);
    } catch (e) {
      showToast('Gagal memuat riwayat: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally { setLedgerLoading(false); }
  }

  if (loading) return <PageSkeleton />;
  const totalWadi = members.reduce((s, m) => s + m.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-300">
          {ICON_WALLET}
        </div>
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Wadi'ah Santri</div>
          <div className="text-xl font-bold">{fmtRp(totalWadi)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
        <div className="border-b border-slate-100 p-3 dark:border-navy-700">
          <h2 className="text-sm font-semibold">Saldo per Santri</h2>
        </div>
        <Table minW="min-w-[36rem]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-navy-700">
              <Th>Santri</Th>
              <Th>Saldo</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <TEmpty colSpan={3}>Belum ada saldo wadi'ah</TEmpty>
            ) : (
              members.map((m) => (
                <Trow key={m.id}>
                  <Td>{m.name}</Td>
                  <Td>{fmtRp(m.balance)}</Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => showRiwayat(m.id)}>
                      {ICON_HISTORY} Riwayat
                    </Button>
                  </Td>
                </Trow>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800">
        <h2 className="mb-3 text-sm font-semibold">Transaksi Wadi'ah</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Santri</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
              value={selMember}
              onChange={(e) => setSelMember(Number(e.target.value))}
            >
              <option value={0}>Pilih santri</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Jumlah (Rp)</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Catatan</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opsional"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={doSetor} disabled={busy}>
              {ICON_DEPOSIT} Setor
            </Button>
            <Button variant="secondary" onClick={doTarik} disabled={busy}>
              {ICON_WITHDRAW} Tarik
            </Button>
          </div>
        </div>
      </div>

      {ledgerMember > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
          <div className="flex items-center justify-between border-b border-slate-100 p-3 dark:border-navy-700">
            <h2 className="text-sm font-semibold">
              Riwayat {members.find((m) => m.id === ledgerMember)?.name ?? ''}
            </h2>
          </div>
          {ledgerLoading ? (
            <PageSkeleton />
          ) : (
            <Table minW="min-w-[40rem]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-700">
                  <Th>Tanggal</Th>
                  <Th>Tipe</Th>
                  <Th>Jumlah</Th>
                  <Th>Saldo</Th>
                  <Th>Catatan</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <TEmpty colSpan={5}>Belum ada riwayat</TEmpty>
                ) : (
                  ledger.map((r) => (
                    <Trow key={r.id}>
                      <Td>{r.created_at.slice(0, 10)}</Td>
                      <Td>
                        <span className={r.type === 'setor' ? 'text-emerald-600' : 'text-rose-600'}>
                          {r.type === 'setor' ? 'Setor' : 'Tarik'}
                        </span>
                      </Td>
                      <Td>{fmtRp(r.amount)}</Td>
                      <Td>{fmtRp(r.balance_after)}</Td>
                      <Td>{r.note || '-'}</Td>
                    </Trow>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {toast}
    </div>
  );
}
