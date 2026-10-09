'use client';

/**
 * P2/Q62 (ruling Gus Fi 2026-10-10): /admin/persetujuan -- UI antrean
 * alur persetujuan. Dua tab:
 *  - "Menunggu"  = approval_requests WHERE status='pending'
 *  - "Riwayat"   = status IN ('approved','rejected','applied','withdrawn')
 * Aksi tombol: Setujui/Tolak (decide, alasan wajib utk tolak) + Tarik
 * (withdraw, hanya pemohon; server meng-enforce). Ikon = inline SVG
 * (tanpa emoji/unicode/ikon-font); label bahasa Indonesia. Tier admin
 * (guard page + GET/POST /api/approvals).
 */
import { useCallback, useEffect, useState } from 'react';
import { api, Badge, Button, PageSkeleton, Table, Td, Th, TEmpty, Trow, useToast } from '@/components/ui';
import { fmtDateTime, rp } from '@/lib/format';

type ApprovalReq = {
  id: number;
  action: string;
  label: string;
  payload: Record<string, unknown>;
  status: string;
  request_username: string;
  reason: string;
  decided_username: string;
  decided_at: string | null;
  applied_at: string | null;
  created_at: string;
};

type Tab = 'menunggu' | 'riwayat';

/** Ikon aksi (system LOCK: 16px, viewBox 24, stroke-2, currentColor). */
const IconCheck = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);
const IconCross = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);
const IconUndo = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8.5 4.5L3.5 9.5l5 5" />
    <path d="M3.5 9.5H15a6 6 0 0 1 0 12h-3" />
  </svg>
);

const STATUS_BADGE: Record<string, { tone: 'green' | 'red' | 'amber' | 'blue' | 'gray'; label: string }> = {
  applied: { tone: 'green', label: 'DITERAPKAN' },
  approved: { tone: 'blue', label: 'DISETUJUI' },
  rejected: { tone: 'red', label: 'DITOLAK' },
  withdrawn: { tone: 'amber', label: 'DIKEMBALIKAN' },
  pending: { tone: 'amber', label: 'MENUNGGU' },
};

/** Rangkuman payload per aksi (tanpa membeberkan salt/pass_hash). */
function payloadText(r: ApprovalReq): string {
  const p = r.payload || {};
  switch (r.action) {
    case 'user:create_admin':
      return (
        'username "' +
        String(p.username ?? '') +
        '" (role admin' +
        (p.display_name ? ', nama ' + String(p.display_name) : '') +
        ')'
      );
    case 'user:role':
      return (
        'user #' +
        String(p.user_id ?? '') +
        ' ("' +
        String(p.username ?? '') +
        '"): ' +
        String(p.cur_primary ?? '') +
        ' -> ' +
        String(p.new_primary ?? '') +
        (Array.isArray(p.new_roles) && p.new_roles.length > 1 ? ' + tambahan' : '')
      );
    case 'user:active':
      return (
        'user #' + String(p.user_id ?? '') + ' ("' + String(p.username ?? '') + '") -> ' + (p.active ? 'aktif' : 'nonaktif')
      );
    case 'jurnal:reverse':
      return 'jurnal #' + String(p.entry_id ?? '') + (p.reason ? ' (alasan: ' + String(p.reason) + ')' : '');
    case 'kas:delete': {
      const s = (p.snapshot ?? {}) as { label?: string; amount?: number };
      return 'kas "' + String(s.label ?? '') + '" (' + rp(Number(s.amount ?? 0)) + ')';
    }
    default:
      return r.action;
  }
}

export function PersetujuanClient() {
  const [tab, setTab] = useState<Tab>('menunggu');
  const [rows, setRows] = useState<ApprovalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    const r = await api<{ tab: Tab; requests: ApprovalReq[] }>('/api/approvals?tab=' + t);
    if (r.ok && r.data) setRows(r.data.requests || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function decide(id: number, approve: boolean, reason: string) {
    if (busyId !== null) return;
    setBusyId(id);
    setMsg(null);
    const r = await api<{ ok?: boolean; status?: string; guard_reason?: string; error?: string }>(
      '/api/approvals',
      { method: 'POST', body: JSON.stringify({ op: 'decide', id, approve, reason }) }
    );
    setBusyId(null);
    if (r.ok && r.data?.ok) {
      const applied = r.data.status === 'applied';
      setMsg({
        ok: applied,
        text: applied
          ? 'Persetujuan #' + id + ' diterapkan.'
          : 'Permintaan #' +
            id +
            ' ditolak' +
            (r.data.guard_reason ? ' (guard: ' + r.data.guard_reason + ')' : '') +
            '.',
      });
      load(tab);
    } else {
      setMsg({ ok: false, text: r.data?.error || r.error || 'Gagal memproses keputusan.' });
    }
  }

  async function withdraw(id: number) {
    if (busyId !== null) return;
    setBusyId(id);
    const r = await api<{ ok?: boolean; error?: string }>('/api/approvals', {
      method: 'POST',
      body: JSON.stringify({ op: 'withdraw', id }),
    });
    setBusyId(null);
    if (r.ok && r.data?.ok) {
      showToast('Permintaan #' + id + ' dikembalikan.');
      load(tab);
    } else {
      showToast(r.data?.error || r.error || 'Gagal menarik permintaan', 'error');
    }
  }

  function startReject(id: number) {
    setRejectingId(id);
    setRejectReason('');
  }

  function badge(s: string) {
    const b = STATUS_BADGE[s] ?? { tone: 'gray' as const, label: s.toUpperCase() };
    return <Badge tone={b.tone}>{b.label}</Badge>;
  }

  if (loading && rows.length === 0) return <PageSkeleton />;

  const menolakRow = (r: ApprovalReq) => {
    if (rejectingId === r.id) {
      return (
        <span className="flex items-center justify-end gap-1">
          <input
            className="input w-40 text-xs"
            placeholder="Alasan (wajib)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
          />
          <Button
            variant="danger"
            size="sm"
            icon={IconCross}
            disabled={busyId !== null || rejectReason.trim().length === 0}
            onClick={() => {
              const rid = r.id;
              const rs = rejectReason;
              setRejectingId(null);
              decide(rid, false, rs.trim());
            }}
          >
            Tolak
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId !== null}
            onClick={() => setRejectingId(null)}
          >
            Batal
          </Button>
        </span>
      );
    }
    return (
      <span className="flex items-center justify-end gap-1">
        <Button
          variant="primary"
          size="sm"
          icon={IconCheck}
          loading={busyId === r.id}
          disabled={busyId !== null}
          onClick={() => decide(r.id, true, '')}
        >
          Setujui
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={IconCross}
          disabled={busyId !== null}
          onClick={() => startReject(r.id)}
        >
          Tolak
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={IconUndo}
          disabled={busyId !== null}
          title="Tarik permintaan (hanya pemohon)"
          onClick={() => {
            if (window.confirm('Tarik permintaan #' + r.id + '?')) void withdraw(r.id);
          }}
        >
          Tarik
        </Button>
      </span>
    );
  };
  // (render lanjut di bawah: tab + tabel)

  return (
    <div>
      {/* Tab (FilterPill-style: chip + aria-pressed, pola tab POS) */}
      <div role="tablist" aria-label="Tab persetujuan" className="mb-3 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          active={tab === 'menunggu'}
          aria-pressed={tab === 'menunggu'}
          onClick={() => setTab('menunggu')}
        >
          Menunggu
        </Button>
        <Button
          variant="secondary"
          size="sm"
          active={tab === 'riwayat'}
          aria-pressed={tab === 'riwayat'}
          onClick={() => setTab('riwayat')}
        >
          Riwayat
        </Button>
      </div>

      {msg && (
        <div
          role="status"
          className={
            'mb-3 rounded-field border px-3 py-2 text-sm ' +
            (msg.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-300')
          }
        >
          {msg.text}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <Table minW="min-w-[44rem]">
          {tab === 'menunggu' ? (
            <>
              <thead>
                <tr>
                  <Th>No.</Th>
                  <Th>Aksi</Th>
                  <Th>Detail</Th>
                  <Th>Pemohon</Th>
                  <Th>Waktu</Th>
                  <Th className="text-right">Keputusan</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <TEmpty colSpan={6}>Tidak ada permintaan yang menunggu. (Q62)</TEmpty>
                )}
                {rows.map((r) => (
                  <Trow key={r.id} hover>
                    <Td>#{r.id}</Td>
                    <Td>
                      <Badge tone="blue">{r.label}</Badge>
                    </Td>
                    <Td className="max-w-[22rem] text-xs">{payloadText(r)}</Td>
                    <Td>{r.request_username}</Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</Td>
                    <Td className="whitespace-nowrap text-right">{menolakRow(r)}</Td>
                  </Trow>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <Th>No.</Th>
                  <Th>Status</Th>
                  <Th>Aksi</Th>
                  <Th>Detail</Th>
                  <Th>Pemohon</Th>
                  <Th>Keputusan</Th>
                  <Th>Waktu</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <TEmpty colSpan={7}>Belum ada riwayat keputusan. (Q62)</TEmpty>}
                {rows.map((r) => (
                  <Trow key={r.id} hover>
                    <Td>#{r.id}</Td>
                    <Td>{badge(r.status)}</Td>
                    <Td className="whitespace-nowrap">{r.label}</Td>
                    <Td className="max-w-[22rem] text-xs">{payloadText(r)}</Td>
                    <Td>{r.request_username}</Td>
                    <Td className="text-xs">
                      {r.decided_username ? (
                        <>
                          {r.decided_username}
                          {r.status === 'applied' ? ' (diterapkan)' : ''}
                        </>
                      ) : (
                        '-'
                      )}
                      {r.reason ? (
                        <span className="block text-slate-500 dark:text-slate-400">{r.reason}</span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {r.created_at ? fmtDateTime(r.created_at) : ''}
                      {r.decided_at ? (
                        <span className="block text-slate-500 dark:text-slate-400">
                          {fmtDateTime(r.decided_at)}
                        </span>
                      ) : null}
                    </Td>
                  </Trow>
                ))}
              </tbody>
            </>
          )}
        </Table>
      </div>
    </div>
  );
}