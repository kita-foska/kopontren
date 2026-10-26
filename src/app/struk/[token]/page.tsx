import { db } from '@/db';
import { rp, fmtDateTime } from '@/lib/format';
import { payMethodLabel } from '@/lib/pay-methods';
import {
  estrukSecret,
  parseEstructId,
  saleToEstructOpts,
  verifyEstructToken,
  type EstrukItemRow,
  type EstrukSaleRow,
} from '@/lib/struk-link';
import { strukWaText } from '@/lib/rekap';
import { EstructActions } from '@/components/estruct-actions';
import Link from 'next/link';

/**
 * W14-1 E-STRUK (m-banking style) -- halaman PUBLIK /struk/[token]:
 * token = `saleId.hmac16` (lib/struk-link). Tanpa login: pembeli bisa
 * membuka tautan kapan pun; digest HMAC (env STRUK_LINK_SECRET) membuat
 * link tak bisa ditebak. Payload dihitung dari sales/sale_items saat
 * halaman dibuka (data live, tanpa tabel baru -- frozen skema tetap).
 * Tombol: Unduh PDF / Unduh Foto / Kirim WA / Salin (EstructActions).
 */
export const dynamic = 'force-dynamic';

function InvalidView({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{desc}</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-500"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

export default async function EstructPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const secret = estrukSecret();
  if (!secret || !verifyEstructToken(token, secret)) {
    return (
      <InvalidView
        title="Link struk tidak valid"
        desc="Link ini rusak, kedaluwarsa, atau bukan milik transaksi yang terdaftar. Hubungi kasir untuk meminta link baru."
      />
    );
  }
  const saleId = parseEstructId(token);
  if (saleId === null) {
    // Verifikasi HMAC di atas sudah lolos; guard ini utk TypeScript
    // (token format terjamin, jalan ini tak pernah diambil).
    return <InvalidView title="Link struk tidak valid" desc="Format link tidak dikenali." />;
  }
  const d = await db();
  const sale = (await d
    .prepare(
      `SELECT s.id, s.customer, s.pay_method, s.note, s.total, s.discount,
              s.member_points, s.amount_paid, s.change, s.created_at,
              COALESCE(NULLIF(TRIM(k.display_name), ''), k.username, 'Kasir') AS kasir,
              m.name AS member
       FROM sales s
       LEFT JOIN users k ON k.id = s.kasir_id
       LEFT JOIN members m ON m.id = s.member_id
       WHERE s.id = ?`
    )
    .get(saleId)) as unknown as EstrukSaleRow | undefined;
  if (!sale) {
    return (
      <InvalidView
        title="Transaksi tidak ditemukan"
        desc="Transaksi untuk link ini sudah tidak tersedia di sistem. Hubungi kasir bila Anda merasa link-nya benar."
      />
    );
  }
  const items = (await d
    .prepare(
      `SELECT product_name, qty, unit, unit_price, subtotal
       FROM sale_items WHERE sale_id = ? ORDER BY id`
    )
    .all(saleId)) as unknown as EstrukItemRow[];

  const opts = saleToEstructOpts(sale, items, sale.kasir ?? '', fmtDateTime(sale.created_at));
  const waText = strukWaText(opts);

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent-50 to-white px-4 py-8 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto w-full max-w-sm">
        {/* Kepala -- gaya struk m-banking: logo + identitas + nomor */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
          <div className="bg-gradient-to-br from-accent-600 to-accent-800 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <img
                src="/logo-kopontren.svg"
                alt="Logo Kopontren"
                className="h-11 w-11 shrink-0 rounded-xl bg-white/95 p-1.5"
              />
              <div>
                <p className="text-sm font-extrabold leading-tight">KOPONTREN AL ITTIHAD</p>
                <p className="text-[11px] font-medium text-white/80">Struk Pembelian (e-Struk)</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-accent-700 dark:text-accent-300">{opts.no}</span>
              <span>{opts.tgl}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-400">
              Kasir: <span className="font-semibold text-slate-600 dark:text-slate-300">{opts.kasir}</span>
            </p>
            {opts.customer ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pembeli: <span className="font-semibold text-slate-700 dark:text-slate-200">{opts.customer}</span>
              </p>
            ) : null}
            {opts.member ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                Member:
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-500/15 dark:text-slate-300">
                  {opts.member}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
          {/* Detail barang */}
          <div className="px-5 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Detail Belanja</p>
            {items.length === 0 ? (
              <p className="text-xs text-slate-400">Tidak ada rincian barang (struk lama).</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700 dark:text-slate-200">
                        {it.qty} {it.unit} {it.product_name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {rp(it.unit_price)} x {it.qty}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                      {rp(it.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {opts.discount ? (
              <div className="mt-2 flex justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span>Diskon</span>
                <span>-{rp(opts.discount)}</span>
              </div>
            ) : null}
          </div>

          {/* Total + pembayaran -- sorotan gaya struk m-banking */}
          <div className="border-t border-dashed border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="flex items-end justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total
              </span>
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{rp(opts.total)}</span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <p className="flex justify-between">
                <span>Metode</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{payMethodLabel(opts.pay)}</span>
              </p>
              {opts.received != null ? (
                <p className="flex justify-between">
                  <span>Diterima / Kembali</span>
                  <span className="font-semibold">
                    {rp(opts.received)} / {rp(opts.change ?? 0)}
                  </span>
                </p>
              ) : null}
              {opts.points ? (
                <p className="flex justify-between">
                  <span>Poin didapat</span>
                  <span className="font-semibold text-accent-600 dark:text-accent-400">
                    +{opts.points} poin
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <p className="border-t border-dashed border-slate-200 px-5 py-3 text-center text-[10px] italic text-slate-400 dark:border-slate-700">
            Terima kasih. Mohon maaf atas segala ketidaknyamanan.
          </p>
        </div>

        {/* Aksi: Unduh PDF / Foto / WA / Salin */}
        <EstructActions opts={opts} waText={waText} />
      </div>
    </div>
  );
}
