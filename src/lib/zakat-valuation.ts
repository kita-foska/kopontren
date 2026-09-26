/**
 * P3 Step 2 (PROVISIONAL — menunggu tashih pengasuh; subject to
 * correction): mode penilaian harta dagang + anchor haul + akumulasi
 * (accrual) + settlement.
 *
 * Semua fungsi murni (tanpa dependensi DB/Next) -> dipakai route
 * /api/zakat, reusable utk UI/test (`npm run test:zakat`).
 *
 * Keputusan provisional (lihat P3-TASHIH-ZAKAT.md §B):
 * - Periode laba di-ANCHOR pada `haul_start_date` (haul tetap 1 tahun).
 *   `last_zakat_date` tidak me-reset siklus (pembayaran = ta'jil); ia
 *   hanya fallback anchor saat haul_start_date belum diisi, dan audit.
 * - Penilaian modal: 'market' (default; V1 proxy = harga jual
 *   products.base_price) | 'hpp' (fallback, harga perolehan
 *   products.cost_price).
 * - total = modal + laba + piutang − hutang [P3 §C].
 * - V1: sumber data = products (stok×harga), sales/COGS (laba),
 *   debts (piutang), payables (hutang) — diisi route /api/zakat.
 */
export const ZAKAT_VALUATION_MODES = ['market', 'hpp'] as const;
export type ZakatValuationMode = (typeof ZAKAT_VALUATION_MODES)[number];

/** Baris produk minimal utk penilaian (tanpa dependensi tipe DB). */
export interface ProductRow {
  stock: number;
  base_price: number; // harga jual (V1: proxy harga pasar)
  cost_price: number; // harga perolehan / HPP
}

/**
 * `valuation_mode` dari settings: trim + lowercase; nilai tak dikenal /
 * kosong -> 'market' (default provisional: penilaian harga pasar).
 */
export function resolveValuationMode(v: unknown): ZakatValuationMode {
  const s = String(v ?? '').trim().toLowerCase();
  return (ZAKAT_VALUATION_MODES as readonly string[]).includes(s)
    ? (s as ZakatValuationMode)
    : 'market';
}

const rupiah = (n: number) => Math.round(n);

export interface ValuationResult {
  mode: ZakatValuationMode;
  /** modal dagang: market = Σ stok×base_price; hpp = Σ stok×cost_price */
  modal: number;
  /** laba bersih periode (V1: laba kotor penjualan − COGS) */
  laba: number;
  /** piutang: Σ debts.remaining (status open) — DITAMBAHKAN ke harta */
  piutang: number;
  /** hutang: Σ payables.remaining (status open) — DIKURANGKAN dr harta */
  hutang: number;
  /** P3 §C: total = modal + laba + piutang − hutang, min 0 */
  total_assets: number;
}

/**
 * Penilaian harta dagang (P3 §B.3/§C). `sales` = laba periode,
 * `receivables` = piutang (hutang customer, ditambahkan),
 * `payables` = hutang dagang (kewajiban, dikurangkan — "utang
 * dicicilkan saka harta"). V1: caller route mengisi dari DB;
 * modul tetap deterministik utk test.
 */
export function computeValuation(
  mode: ZakatValuationMode | unknown,
  products: ProductRow[],
  sales: number,
  receivables: number,
  payables: number
): ValuationResult {
  const m = resolveValuationMode(mode);
  const priceCol = m === 'hpp' ? 'cost_price' : 'base_price';
  const modal = rupiah(
    (products ?? []).reduce(
      (sum, p) =>
        sum + Math.max(0, Number(p?.stock) || 0) * Math.max(0, Number(p?.[priceCol]) || 0),
      0
    )
  );
  const laba = rupiah(sales);
  const piutang = Math.max(0, rupiah(receivables));
  const hutang = Math.max(0, rupiah(payables));
  return {
    mode: m,
    modal,
    laba,
    piutang,
    hutang,
    total_assets: Math.max(0, modal + laba + piutang - hutang),
  };
}

/**
 * Jumlah zakat & status nisab. `totalAssets` < `nisabRp` -> belum wajib
 * (zakat 0, catat shortfall). Di atas / = nisab: zakat = total × rate.
 */
export function computeZakatAmount(
  totalAssets: number,
  nisabRp: number,
  ratePct: number
): { zakat: number; status: 'wajib' | 'belum_nisab'; shortfall: number } {
  const total = Math.max(0, rupiah(totalAssets));
  const nisab = Math.max(0, rupiah(nisabRp));
  const rate = Math.max(0, Number(ratePct) || 0);
  if (total < nisab) {
    return { zakat: 0, status: 'belum_nisab', shortfall: nisab - total };
  }
  return { zakat: rupiah((total * rate) / 100), status: 'wajib', shortfall: 0 };
}

const HAUL_DAYS = 365; // haul tetap 1 tahun (simplifikasi hari masehi)

/**
 * Akumulasi (accrual) kewajiban zakat s.d. `days` hari sejak awal haul.
 * Proporsional: wajib penuh (ratePct × totalAssets) saat haul penuh;
 * sebelum itu = full × (hari/365), cap 365. Route memanggil dgn
 * totalAssets & rate apa adanya — saat status belum_nisab, caller
 * memakai hasil computeZakatAmount (zakat=0) sehingga accrual = 0.
 */
export function computeAccrual(totalAssets: number, ratePct: number, days: number): number {
  const full = (Math.max(0, rupiah(totalAssets)) * Math.max(0, Number(ratePct) || 0)) / 100;
  const d = Math.min(Math.max(0, Math.floor(Number(days) || 0)), HAUL_DAYS);
  return rupiah(full * (d / HAUL_DAYS));
}

export type HaulAnchorSource = 'haul_start' | 'last_payment' | 'current_month';

export interface HaulAnchor {
  /** awal periode laba (YYYY-MM-DD) */
  anchor: string;
  /** dari mana anchor diambil (fallback chain) */
  source: HaulAnchorSource;
  /** akhir haul (anchor + 1 tahun; Feb-29 di-clamp ke Mar-01) */
  haul_end: string;
  /** hari berjalan sejak anchor (clamp 0..365) */
  days_elapsed: number;
  days_total: number;
  status: 'belum_haul' | 'haul_jatuh';
}

const isoUtc = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Anchor periode laba + status haul (P3-Q1, provisional).
 * Fallback chain: `haul_start_date` (di-anchor; pembayaran ta'jil tidak
 * menggeser) -> `last_payment` (hanya jika haul_start kosong) -> awal
 * bulan hari ini. `today` = tanggal WIB (YYYY-MM-DD); default UTC-now
 * agar deterministik, route selalu melewatkan `wibToday()`.
 */
export function computeHaulAnchor(
  haulStart: string,
  lastPayment: string,
  today: string = new Date().toISOString().slice(0, 10)
): HaulAnchor {
  const h = String(haulStart ?? '').trim();
  const p = String(lastPayment ?? '').trim();
  let anchor: string;
  let source: HaulAnchorSource;
  if (h) {
    anchor = h;
    source = 'haul_start';
  } else if (p) {
    anchor = p;
    source = 'last_payment';
  } else {
    anchor = String(today).slice(0, 8) + '01';
    source = 'current_month';
  }
  const [ay, am, ad] = anchor.split('-').map(Number);
  const [ty, tm, td] = String(today).split('-').map(Number);
  const anchorMs = Date.UTC(ay, am - 1, ad);
  const todayMs = Date.UTC(ty, tm - 1, td);
  // Guard: tanggal tak valid (NaN) -> jangan clamp ke 0 (accrual penuh
  // palsu); pakai 0 + status 'belum_haul' (konservatif).
  const valid = Number.isFinite(anchorMs) && Number.isFinite(todayMs);
  const days_elapsed = valid
    ? Math.min(Math.max(0, Math.floor((todayMs - anchorMs) / 86400000)), HAUL_DAYS)
    : 0;
  // +1 tahun dengan clamp (Feb-29 -> Mar-01 thn tak lompat): hitung dulu
  // via Date.UTC (meng-clamp), lalu baca ulang komponen yang sudah clamped.
  const end = new Date(Date.UTC(ay + 1, am - 1, ad));
  const haul_end = valid
    ? isoUtc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate())
    : anchor;
  return {
    anchor,
    source,
    haul_end,
    days_elapsed,
    days_total: HAUL_DAYS,
    status: days_elapsed >= HAUL_DAYS ? 'haul_jatuh' : 'belum_haul',
  };
}

/**
 * Settlement vs pembayaran: overpaid = dibayar lebih; underpaid =
 * masih kurang (selisih). net = paid - zakat (negatif = kurang).
 */
export function computeBalance(
  zakatAmount: number,
  paidAmount: number
): { overpaid: number; underpaid: number; net: number } {
  const z = Math.max(0, rupiah(zakatAmount));
  const p = Math.max(0, rupiah(paidAmount));
  const net = p - z;
  return {
    overpaid: net > 0 ? net : 0,
    underpaid: net < 0 ? -net : 0,
    net,
  };
}