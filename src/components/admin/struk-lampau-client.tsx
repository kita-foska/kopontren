'use client';

/**
 * V2 /admin/laporan -- seksi "Lihat Struk Lampau" (past receipt view).
 * Regenerasi struk m-banking 58mm dari transaksi lampau: GET /api/sales
 * (READ-ONLY -- tidak mengubah transaksi), filter hari (7/30/semua),
 * tabel list (No, Tgl, Pelanggan, Metode, Total, Poin) + tombol
 * "Kirim Struk" (PDF) & "Foto" (JPEG) per baris via lib/struk-media
 * (jsPDF + html2canvas dynamic import -- chunk laporan tak terbebani
 * sampai tombol ditekan). Mobile = navigator.share (-> WhatsApp),
 * desktop = unduh. Mount di src/app/admin/laporan/page.tsx -- V1
 * (LaporanFormalClient / laporan-admin-client.tsx) TIDAK disentuh.
 *
 * Catatan deviasi: tanpa QRIS qrcode di struk lampau -- /api/sales tak
 * menyimpan kode QRIS (cuma nama metode), jadi yang diregenerasi =
 * teks struk + logo saja.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  apiRetry,
  Button,
  ErrorState,
  PageSkeleton,
  useToast,
} from '@/components/ui';
import { fmtDateTime, rp } from '@/lib/format';
import { payMethodLabel } from '@/lib/pay-methods';
import { generateStrukJpeg, generateStrukPdf } from '@/lib/struk-media';
import { type StrukPdfOpts } from '@/lib/struk-pdf';
import { Camera, Send } from 'lucide-react';

type SaleItem = {
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal: number;
};

/** Baris dari GET /api/sales (kasir/member/items ter-embed server-side). */
type SaleRow = {
  id: number;
  customer: string;
  pay_method: string;
  pay_split?: string | null;
  total: number;
  amount_paid: number;
  change: number;
  discount: number;
  cashback?: number;
  member_points: number;
  created_at: string;
  kasir_name: string;
  member_name: string;
  items: SaleItem[];
};

type DaysPreset = '7' | '30' | 'all';

/** kolom pay_split = JSON string (format lib/pay-methods parsePaySplit). */
function parseSplit(v: string | null | undefined): { m: string; a: number }[] {
  if (!v) return [];
  try {
    const p: unknown = JSON.parse(v);
    return Array.isArray(p) ? (p as { m: string; a: number }[]) : [];
  } catch {
    return [];
  }
}

/**
 * StrukPdfOpts dari baris sales -- hanya field yang TERSIMPAN di tabel
 * sales/sale_items (tier & saldo member tidak tersimpan per transaksi
 * -> dilewati; struk lampau = rekonstruksi terbaik, bukan replika
 * persis struk saat transaksi).
 */
function buildOpts(r: SaleRow): StrukPdfOpts {
  const split = parseSplit(r.pay_split);
  const isCash = r.pay_method === 'cash';
  return {
    no: '#' + r.id,
    kasir: r.kasir_name || '-',
    tgl: fmtDateTime(r.created_at),
    items: r.items.map((i) => ({
      qty: i.qty,
      unit: i.unit,
      name: i.product_name,
      price: i.unit_price,
      total: i.subtotal,
    })),
    customer: r.customer || r.member_name || undefined,
    member: r.member_name || undefined,
    discount: r.discount || 0,
    cashback: r.cashback || 0,
    points: r.member_points || 0,
    total: r.total,
    pay: r.pay_method,
    received: isCash ? r.amount_paid || undefined : undefined,
    change: isCash ? r.change || undefined : undefined,
    paySplit: split.length > 0 ? split : undefined,
  };
}

export function StrukLampauClient() {
  const [, showToast] = useToast();
  const [days, setDays] = useState<DaysPreset>('7');
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  /** Muat halaman awal (offset 0) atau lampirkan halaman berikutnya. */
  const load = useCallback(
    async (d: DaysPreset, off: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setErr('');
      }
      try {
        const qs = d === 'all' ? '0' : d;
        const res = await apiRetry<{ sales: SaleRow[]; total: number }>(
          '/api/sales?days=' + qs + '&status=all&limit=50&offset=' + off
        );
        if (!res.ok) throw new Error(res.error || 'Gagal memuat');
        const sales = res.data.sales || [];
        setRows((prev) => (append ? [...prev, ...sales] : sales));
        setTotal(res.data.total || 0);
        setOffset(off + sales.length);
      } catch (e) {
        if (append) {
          showToast(
            'Gagal memuat lanjut: ' + (e instanceof Error ? e.message : String(e)),
            'error'
          );
        } else {
          setErr(e instanceof Error ? e.message : 'Gagal memuat transaksi');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void load(days, 0, false);
  }, [days, load]);

  /** Generate struk baris (PDF/JPEG) lalu share sheet / unduh. */
  async function kirimStruk(r: SaleRow, foto: boolean) {
    if (busy !== null) return;
    setBusy(r.id);
    try {
      const f = foto
        ? await generateStrukJpeg(buildOpts(r))
        : await generateStrukPdf(buildOpts(r));
      const url = URL.createObjectURL(f);
      let shared = false;
      try {
        if (navigator.canShare?.({ files: [f] })) {
          await navigator.share({
            files: [f],
            title: 'Struk Kopontren #' + r.id,
          });
          shared = true;
        }
      } catch {
        /* dibatalkan user -> fallback unduh */
      }
      if (!shared) {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast('Struk #' + r.id + (foto ? ' (foto)' : ' (PDF)') + ' siap dibagikan.');
    } catch (e) {
      showToast(
        'Gagal membuat struk #' + r.id + ': ' + (e instanceof Error ? e.message : String(e)),
        'error'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mt-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold tracking-tight">
          Lihat Struk Lampau
        </h2>
        <div className="flex flex-wrap gap-1">
          {(['7', '30', 'all'] as DaysPreset[]).map((d) => (
            <Button
              key={d}
              variant={days === d ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d === '7' ? '7 Hari' : d === '30' ? '30 Hari' : 'Semua'}
            </Button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Regenerasi struk 58mm dari transaksi lampau (read-only -- tidak
        mengubah transaksi). "Kirim Struk" = PDF, "Foto" = JPEG; di HP
        pilih WhatsApp dari menu share.
      </p>
      {err ? (
        <ErrorState text={err} onRetry={() => void load(days, 0, false)} />
      ) : loading && rows.length === 0 ? (
        <PageSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tidak ada transaksi pada periode terpilih.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="pb-2 pr-2">No</th>
                  <th className="pb-2 pr-2">Tgl</th>
                  <th className="pb-2 pr-2">Pelanggan</th>
                  <th className="pb-2 pr-2">Metode</th>
                  <th className="pb-2 pr-2 text-right">Total</th>
                  <th className="pb-2 pr-2">Poin</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-200 dark:border-navy-600"
                  >
                    <td className="py-2 pr-2 font-mono">#{r.id}</td>
                    <td className="whitespace-nowrap py-2 pr-2">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="py-2 pr-2">
                      {r.customer || r.member_name || '-'}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2">
                      {payMethodLabel(r.pay_method)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-right font-mono font-bold">
                      {rp(r.total)}
                    </td>
                    <td className="py-2 pr-2">
                      {r.member_points > 0 ? r.member_points : '-'}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Send className="h-3.5 w-3.5" />}
                        disabled={busy !== null}
                        onClick={() => void kirimStruk(r, false)}
                      >
                        Kirim Struk
                      </Button>{' '}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Camera className="h-3.5 w-3.5" />}
                        disabled={busy !== null}
                        onClick={() => void kirimStruk(r, true)}
                      >
                        Foto
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Menampilkan {rows.length} dari {total} transaksi.
          </p>
          {offset < total && (
            <Button
              variant="ghost"
              size="sm"
              disabled={loadingMore}
              onClick={() => void load(days, offset, true)}
            >
              Muat Lebih ({Math.max(0, total - rows.length)} tersisa)
            </Button>
          )}
        </>
      )}
    </div>
  );
}