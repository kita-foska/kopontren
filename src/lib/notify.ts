import { db, getSettings, type Db } from '@/db';
import { invalidate } from '@/lib/ref-cache';
import { rp, startOfDayJakarta } from '@/lib/format';
import * as webpush from 'web-push';

/**
 * Sistem notifikasi KOPONTREN — HANYA untuk ADMIN.
 * Media: in-app (ikon lonceng) + web push (PWA/Service Worker).
 * TIDAK ada WhatsApp/Telegram/Email.
 *
 * Semua pengiriman best-effort: error tidak pernah dibuang ke route bisnis
 * (agar pencatatan penjualan/kas/shift tidak terganggu). Kegagalan
 * pengiriman push dicatat di `notification_logs`.
 */

// ── Jenis notifikasi (20) + label + prioritas + link default ──
export type NotifyType =
  | 'stock_low'
  | 'stock_out'
  | 'debt_due'
  | 'payable_due'
  | 'large_txn'
  | 'cash_low'
  | 'shift_open'
  | 'shift_close'
  | 'retur_new'
  | 'belanja_new'
  | 'konsinyasi_new'
  | 'zakat_new'
  | 'report_daily'
  | 'report_sales'
  | 'report_top'
  | 'report_cash'
  | 'report_weekly'
  | 'report_monthly'
  | 'rekap_debt'
  | 'rekap_payable';

export const NOTIFY_TYPES: {
  key: NotifyType;
  label: string;
  priority: 1 | 2 | 3;
  link: string;
}[] = [
  { key: 'stock_low', label: 'Stok Menipis', priority: 1, link: '/admin/produk' },
  { key: 'stock_out', label: 'Stok Habis', priority: 1, link: '/admin/produk' },
  { key: 'debt_due', label: 'Piutang Jatuh Tempo', priority: 1, link: '/piutang' },
  { key: 'payable_due', label: 'Hutang Jatuh Tempo', priority: 1, link: '/admin/hutang' },
  { key: 'large_txn', label: 'Transaksi Besar', priority: 1, link: '/admin/laporan' },
  { key: 'cash_low', label: 'Kas Menipis', priority: 1, link: '/admin/kas' },
  { key: 'shift_open', label: 'Shift Dibuka', priority: 1, link: '/admin/shift' },
  { key: 'shift_close', label: 'Shift Ditutup', priority: 1, link: '/admin/shift' },
  { key: 'retur_new', label: 'Retur Baru', priority: 1, link: '/retur' },
  { key: 'belanja_new', label: 'Belanja Baru', priority: 1, link: '/admin/belanja' },
  { key: 'konsinyasi_new', label: 'Konsinyasi Baru', priority: 1, link: '/admin/konsinyasi' },
  { key: 'zakat_new', label: 'Zakat Baru', priority: 1, link: '/admin/zakat' },
  { key: 'report_daily', label: 'Laporan Harian', priority: 2, link: '/admin/laporan' },
  { key: 'report_sales', label: 'Ringkasan Penjualan', priority: 2, link: '/admin/laporan' },
  { key: 'report_top', label: 'Produk Terlaris', priority: 2, link: '/admin/laporan' },
  { key: 'report_cash', label: 'Kas Akhir Hari', priority: 2, link: '/admin/kas' },
  { key: 'report_weekly', label: 'Laporan Mingguan', priority: 3, link: '/admin/laporan' },
  { key: 'report_monthly', label: 'Laporan Bulanan', priority: 3, link: '/admin/laporan' },
  { key: 'rekap_debt', label: 'Rekap Piutang', priority: 3, link: '/piutang' },
  { key: 'rekap_payable', label: 'Rekap Hutang', priority: 3, link: '/admin/hutang' },
];

const NOTIFY_TYPE_MAP = new Map(NOTIFY_TYPES.map((t) => [t.key, t]));
export const NOTIFY_KEYS = NOTIFY_TYPES.map((t) => t.key) as string[];

function defaultLink(type: string): string {
  return NOTIFY_TYPE_MAP.get(type as NotifyType)?.link ?? '/admin/notifications';
}

/** Label manusia utk jenis notifikasi (fallback: string mentah). */
export function typeLabel(type: string): string {
  return NOTIFY_TYPE_MAP.get(type as NotifyType)?.label ?? type;
}

// ── Admin only ──
/** Semua user aktif ber-role admin (penerima SATU-SATUNYA notifikasi). */
export async function getAdminUserIds(d: Db): Promise<number[]> {
  const rows = (await d
    .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1")
    .all()) as { id: number }[];
  return rows.map((r) => Number(r.id));
}

// ── VAPID (web push) ──
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@kopontren.app';
let _vapid: { publicKey: string; privateKey: string } | null = null;

/** Pastikan kunci VAPID ada (generate + simpan sekali), lalu set global web-push. */
export async function ensureVapidKeys(d: Db): Promise<{ publicKey: string; privateKey: string }> {
  if (_vapid) return _vapid;
  let row = (await d
    .prepare('SELECT public_key, private_key FROM vapid_keys WHERE id = 1')
    .get()) as { public_key: string; private_key: string } | undefined;
  if (!row || !row.public_key || !row.private_key) {
    const keys = webpush.generateVAPIDKeys();
    _vapid = keys;
    await d
      .prepare(
        'INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, private_key = excluded.private_key'
      )
      .run(keys.publicKey, keys.privateKey);
  } else {
    _vapid = { publicKey: row.public_key, privateKey: row.private_key };
  }
  webpush.setVapidDetails(VAPID_SUBJECT, _vapid.publicKey, _vapid.privateKey);
  return _vapid;
}

/** Kunci publik (base64url) utk subscription klien. Panggil setelah ensureVapidKeys. */
export async function getVapidPublicKey(d: Db): Promise<string> {
  const k = await ensureVapidKeys(d);
  return k.publicKey;
}
// ── Prefensi per admin per jenis (default: in_app ON, push OFF) ──
type Prefs = { inApp: boolean; push: boolean };

function prefsMap(
  rows: { user_id: number; enabled_in_app: number; enabled_push: number }[],
  adminIds: number[]
): Map<number, Prefs> {
  const m = new Map<number, Prefs>();
  for (const uid of adminIds) m.set(uid, { inApp: true, push: false });
  for (const r of rows) {
    m.set(Number(r.user_id), {
      inApp: r.enabled_in_app !== 0,
      push: r.enabled_push === 1,
    });
  }
  return m;
}

/** Ambil semua konfigurasi notifikasi untuk user (merge default utk jenis tanpa baris). */
export async function getNotificationSettings(d: Db, userId: number) {
  const rows = (await d
    .prepare('SELECT type, enabled_in_app, enabled_push FROM notification_settings WHERE user_id = ?')
    .all(userId)) as { type: string; enabled_in_app: number; enabled_push: number }[];
  const byType = new Map(rows.map((r) => [r.type, r]));
  return NOTIFY_TYPES.map((t) => {
    const r = byType.get(t.key);
    return {
      key: t.key,
      label: t.label,
      priority: t.priority,
      in_app: r ? r.enabled_in_app !== 0 : true,
      push: r ? r.enabled_push === 1 : false,
    };
  });
}

/** Simpan konfigurasi notifikasi (upsert per jenis). */
export async function saveNotificationSettings(
  d: Db,
  userId: number,
  patch: { type: string; enabled_in_app?: number; enabled_push?: number }[]
): Promise<void> {
  const ins = d.prepare(
    'INSERT INTO notification_settings (user_id, type, enabled_in_app, enabled_push) ' +
      'VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(user_id, type) DO UPDATE SET ' +
      'enabled_in_app = excluded.enabled_in_app, enabled_push = excluded.enabled_push'
  );
  for (const p of patch) {
    if (!NOTIFY_KEYS.includes(p.type)) continue; // abaikan jenis tak dikenal
    await ins.run(userId, p.type, p.enabled_in_app ? 1 : 0, p.enabled_push ? 1 : 0);
  }
  invalidate('notif:');
}
// ── Inti pengiriman ──
export type NotifyInput = {
  type: string;
  title: string;
  message: string;
  link?: string;
  /** Jika > 0: lewati bila sudah ada notifikasi unread (type+link) dalam N menit. */
  dedupeMinutes?: number;
};

export type NotifyResult = { ok: boolean; inApp: number; push: number; error?: string };

function ph(n: number): string {
  return Array(n).fill('?').join(', ');
}

/**
 * Kirim notifikasi ke SEMUA admin (in-app + push sesuai prefensi).
 * Best-effort: tidak pernah throw. Kegagalan push dicatat di notification_logs.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const d = await db();
    const adminIds = await getAdminUserIds(d);
    if (!adminIds.length) return { ok: true, inApp: 0, push: 0 };

    const link = input.link || defaultLink(input.type);
    const now = new Date().toISOString();

    // Dedupe (threshold-type): jangan spam notifikasi serupa.
    if (input.dedupeMinutes && input.dedupeMinutes > 0) {
      const cutoff = new Date(Date.now() - input.dedupeMinutes * 60000).toISOString();
      const recent = (await d
        .prepare(
          'SELECT 1 AS x FROM notifications WHERE type = ? AND link = ? AND read = 0 AND created_at > ? LIMIT 1'
        )
        .get(input.type, link, cutoff)) as { x?: number } | undefined;
      if (recent && recent.x) return { ok: true, inApp: 0, push: 0 };
    }

    const prefRows = adminIds.length
      ? ((await d
          .prepare(
            `SELECT user_id, enabled_in_app, enabled_push FROM notification_settings WHERE user_id IN (${ph(
              adminIds.length
            )}) AND type = ?`
          )
          .all(...adminIds, input.type)) as unknown) as {
        user_id: number;
        enabled_in_app: number;
        enabled_push: number;
      }[]
      : [];
    const prefs = prefsMap(prefRows, adminIds);
    await ensureVapidKeys(d); // set detail VAPID global sebelum push

    let inApp = 0;
    let push = 0;

    for (const uid of adminIds) {
      const p = prefs.get(uid) ?? { inApp: true, push: false };
      let notifId: number | null = null;

      if (p.inApp) {
        const info = await d
          .prepare(
            'INSERT INTO notifications (user_id, type, title, message, link, read, created_at) ' +
              'VALUES (?, ?, ?, ?, ?, 0, ?)'
          )
          .run(uid, input.type, input.title, input.message, link, now);
        notifId = Number(info.lastInsertRowid);
        inApp++;
        await d
          .prepare(
            "INSERT INTO notification_logs (notification_id, channel, status, error, sent_at) " +
              "VALUES (?, 'in_app', 'sent', '', ?)"
          )
          .run(notifId, now);
      }

      if (p.push) {
        const subs = (await d
          .prepare('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ?')
          .all(uid)) as { endpoint: string; keys: string }[];
        for (const sub of subs) {
          let okSend = false;
          let err = '';
          try {
            const parsed = JSON.parse(sub.keys || '{}') as { p256dh?: string; auth?: string };
            const res = await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: parsed.p256dh || '', auth: parsed.auth || '' },
              },
              JSON.stringify({
                title: input.title,
                body: input.message,
                icon: '/icon-192.png',
                data: { link, type: input.type, id: notifId },
              }),
              { TTL: 60 }
            );
            okSend = res.status >= 200 && res.status < 300;
            if (res.status === 404 || res.status === 410) {
              // Subscription basi / dihapus -> bersihkan.
              await d
                .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
                .run(sub.endpoint);
              err = 'subscription basi (dihapus)';
            }
          } catch (e) {
            err = e instanceof Error ? e.message : String(e);
          }
          if (notifId !== null) {
            await d
              .prepare(
                "INSERT INTO notification_logs (notification_id, channel, status, error, sent_at) " +
                  "VALUES (?, 'push', ?, ?, ?)"
              )
              .run(notifId, 'push', okSend ? 'sent' : 'failed', okSend ? '' : err, now);
          }
          if (okSend) push++;
        }
      }
    }
    invalidate('notif:');
    return { ok: true, inApp, push };
  } catch (e) {
    console.warn('[notify] gagal:', e);
    return { ok: false, inApp: 0, push: 0, error: e instanceof Error ? e.message : 'gagal' };
  }
}
// ── Pemicu berbasis peristiwa (dipanggil dari route bisnis) ──

/** Stok berubah (manual / pasca penjualan): < 5 menipis, = 0 habis. */
export async function notifyStockChange(productId: number, stock: number, name: string, unit: string) {
  if (stock <= 0) {
    await notify({
      type: 'stock_out',
      title: 'Stok Habis',
      message: `${name} habis (0 ${unit}). Segera restok.`,
      link: '/admin/produk',
      dedupeMinutes: 60,
    });
  } else if (stock < 5) {
    await notify({
      type: 'stock_low',
      title: 'Stok Menipis',
      message: `${name} tersisa ${stock} ${unit}.`,
      link: '/admin/produk',
      dedupeMinutes: 60,
    });
  }
}

/** Cek stok sejumlah produk (mis. pasca transaksi mengurangi stok). */
export async function notifyStockAfterSale(productIds: number[]) {
  if (!productIds.length) return;
  const d = await db();
  const unique = [...new Set(productIds.map(Number))].filter(Boolean);
  const rows = (await d
    .prepare(`SELECT id, name, stock, unit FROM products WHERE id IN (${ph(unique.length)})`)
    .all(...unique)) as { id: number; name: string; stock: number; unit: string }[];
  // Batasi deretan notifikasi per transaksi (audit [r]): hanya produk di
  // bawah ambang (< 5) yang diperiksa, urutkan stok terendah dulu (habis
  // diprioritaskan), dan cap 5 produk paling kritis agar transaksi ramai
  // tidak memicu puluhan round-trip beruntun. Produk di luar cap tetap
  // kebagian saat transaksi berikutnya (dedupe 60 mnt di notify()).
  const critical = rows
    .filter((p) => Number(p.stock || 0) < 5)
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
    .slice(0, 5);
  for (const p of critical) await notifyStockChange(p.id, p.stock, p.name, p.unit);
}

/** Transaksi besar (> Rp 1.000.000). */
export async function notifyLargeTransaction(total: number, id: number, customer: string, method: string) {
  if (total <= 1_000_000) return;
  await notify({
    type: 'large_txn',
    title: 'Transaksi Besar',
    message: `Transaksi #${id} ${rp(total)}${customer ? ' · ' + customer : ''} (${method}).`,
    link: '/admin/laporan',
  });
}

/** Saldo kas saat ini (masuk: penjualan+jurnal masuk; keluar: belanja+pengeluaran+jurnal keluar). */
export async function cashBalance(d: Db): Promise<number> {
  const g = (rows: unknown[]) => Number((rows[0] as { v?: number } | undefined)?.v ?? 0);
  const [sales, purchases, expenses, cashIn, cashOut] = await Promise.all([
    d.prepare('SELECT COALESCE(SUM(total),0) v FROM sales').all(),
    d.prepare('SELECT COALESCE(SUM(qty * unit_cost),0) v FROM purchases').all(),
    d.prepare('SELECT COALESCE(SUM(amount),0) v FROM expenses').all(),
    d.prepare("SELECT COALESCE(SUM(amount),0) v FROM cash_entries WHERE type = 'income'").all(),
    d.prepare("SELECT COALESCE(SUM(amount),0) v FROM cash_entries WHERE type = 'expense'").all(),
  ]);
  return g(sales) + g(cashIn) - g(purchases) - g(expenses) - g(cashOut);
}

/** Kas menipis (< Rp 500.000) — dipanggil tiap mutasi yang menyentuh kas. */
export async function notifyCashBalance() {
  try {
    const d = await db();
    const balance = await cashBalance(d);
    if (balance < 500_000) {
      await notify({
        type: 'cash_low',
        title: 'Kas Menipis',
        message: `Saldo kas ${rp(balance)} (di bawah ${rp(500_000)}).`,
        link: '/admin/kas',
        dedupeMinutes: 120,
      });
    }
  } catch (e) {
    console.warn('[notify] cash low gagal:', e);
  }
}

export function notifyShiftOpened(id: number, label: string, kasirName: string) {
  return notify({
    type: 'shift_open',
    title: 'Shift Dibuka',
    message: `Shift #${id}${label ? ' (' + label + ')' : ''} dibuka oleh ${kasirName}.`,
    link: '/admin/shift',
  });
}

export function notifyShiftClosed(id: number, kasirName: string, salesCount: number, salesTotal: number) {
  return notify({
    type: 'shift_close',
    title: 'Shift Ditutup',
    message: `Shift #${id} (${kasirName}) ditutup: ${salesCount} transaksi, ${rp(salesTotal)}.`,
    link: '/admin/shift',
  });
}

export function notifyNewRetur(saleId: number, productName: string, qty: number, amount: number) {
  return notify({
    type: 'retur_new',
    title: 'Retur Baru',
    message: `Retur transaksi #${saleId}: ${qty}x ${productName} (${rp(amount)}).`,
    link: '/retur',
  });
}

export function notifyNewBelanja(productName: string, qty: number, supplier: string, total: number) {
  return notify({
    type: 'belanja_new',
    title: 'Belanja Baru',
    message: `Stok masuk: ${qty}x ${productName}${supplier ? ' · ' + supplier : ''} (${rp(total)}).`,
    link: '/admin/belanja',
  });
}

export function notifyNewKonsinyasi(owner: string, itemName: string, qty: number) {
  return notify({
    type: 'konsinyasi_new',
    title: 'Konsinyasi Baru',
    message: `Konsinyasi ${owner}: ${qty}x ${itemName}.`,
    link: '/admin/konsinyasi',
  });
}

export function notifyNewZakat(amount: number, status: string, totalAssets: number) {
  return notify({
    type: 'zakat_new',
    title: 'Zakat Baru',
    message: `Zakat tercatat ${rp(amount)} (status: ${status}). Aset: ${rp(totalAssets)}.`,
    link: '/admin/zakat',
  });
}
// ── Pekerjaan terjadwal (cron) ──

function wibDateStr(offsetDays = 0): string {
  // 'YYYY-MM-DD' sesuai dinding WIB; offset hari (0 = hari ini).
  const wib = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400000);
  return wib.toISOString().slice(0, 10);
}

async function alreadyRanToday(key: string): Promise<boolean> {
  const s = await getSettings();
  return (s[key] ?? '') === wibDateStr(0);
}

async function markRanToday(d: Db, key: string): Promise<void> {
  // Catat marker langsung ke tabel settings (bukan saveSettings, karena
  // saveSettings hanya menulis kunci yang ada di SHOP_SETTING_DEFAULTS).
  await d
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, wibDateStr(0));
}

/**
 * Sapuan jatuh tempo piutang/hutang (H-7, H-3, H-1). Idempotent harian via
 * marker settings `notif_due_last` (cron bisa dipanggil > 1x/hari, aman).
 */
export async function runDueDateSweep(force = false): Promise<{ piutang: number; hutang: number }> {
  const d = await db();
  if (!force && (await alreadyRanToday('notif_due_last'))) return { piutang: 0, hutang: 0 };

  let piutangNoted = 0;
  let hutangNoted = 0;
  for (const offset of [7, 3, 1]) {
    const dueStr = wibDateStr(offset); // jatuh tempo dalam `offset` hari
    const debts = (await d
      .prepare(
        "SELECT id, customer_name, remaining, due_date FROM debts WHERE status = 'open' AND due_date = ? AND remaining > 0"
      )
      .all(dueStr)) as { id: number; customer_name: string; remaining: number; due_date: string }[];
    if (debts.length) {
      const total = debts.reduce((s, x) => s + Number(x.remaining), 0);
      await notify({
        type: 'debt_due',
        title: `Piutang Jatuh Tempo (H-${offset})`,
        message: `${debts.length} piutang jatuh ${dueStr} (total ${rp(total)}).`,
        link: '/piutang',
      });
      piutangNoted++;
    }
    const pays = (await d
      .prepare(
        "SELECT id, supplier_name, remaining, due_date FROM payables WHERE status = 'open' AND due_date = ? AND remaining > 0"
      )
      .all(dueStr)) as { id: number; supplier_name: string; remaining: number; due_date: string }[];
    if (pays.length) {
      const total = pays.reduce((s, x) => s + Number(x.remaining), 0);
      await notify({
        type: 'payable_due',
        title: `Hutang Jatuh Tempo (H-${offset})`,
        message: `${pays.length} hutang jatuh ${dueStr} (total ${rp(total)}).`,
        link: '/admin/hutang',
      });
      hutangNoted++;
    }
  }
  await markRanToday(d, 'notif_due_last');
  return { piutang: piutangNoted, hutang: hutangNoted };
}

type PeriodAgg = { count: number; total: number; cogs: number; byMethod: Record<string, number> };

async function periodSales(d: Db, from: string, to?: string): Promise<PeriodAgg> {
  const where = to ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?';
  const args: (string | number)[] = to ? [from, to] : [from];
  const cnt = (await d
    .prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE ${where}`)
    .get(...args)) as { c: number; t: number };
  const cogs = Number(
    (
      (await d
        .prepare(
          `SELECT COALESCE(SUM(si.qty * COALESCE(NULLIF(si.cost_price,0), p.cost_price, 0)),0) v
           FROM sale_items si JOIN sales s ON s.id = si.sale_id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE ${where.replace('created_at', 's.created_at')}`
        )
        .get(...args)) as { v: number }
    ).v
  );
  const methods = (await d
    .prepare(`SELECT pay_method m, COALESCE(SUM(total),0) t FROM sales WHERE ${where} GROUP BY pay_method`)
    .all(...args)) as { m: string; t: number }[];
  return {
    count: Number(cnt.c),
    total: Number(cnt.t),
    cogs,
    byMethod: Object.fromEntries(methods.map((x) => [x.m, Number(x.t)])),
  };
}

async function topProducts(d: Db, from: string, to?: string, limit = 3) {
  const where = to ? 's.created_at >= ? AND s.created_at < ?' : 's.created_at >= ?';
  const args: (string | number)[] = to ? [from, to] : [from];
  return (await d
    .prepare(
      `SELECT si.product_name, COALESCE(SUM(si.qty),0) q, COALESCE(SUM(si.subtotal),0) sub
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE ${where}
       GROUP BY si.product_name ORDER BY q DESC, sub DESC LIMIT ?`
    )
    .all(...args, limit)) as { product_name: string; q: number; sub: number }[];
}
/** Laporan harian (dijadwalkan 21:00): 4 notifikasi Prioritas 2. */
export async function runDailyReports(force = false): Promise<number> {
  const d = await db();
  if (!force && (await alreadyRanToday('notif_daily_last'))) return 0;
  const today = startOfDayJakarta(0);
  const agg = await periodSales(d, today);
  const profit = agg.total - agg.cogs;

  await notify({
    type: 'report_daily',
    title: 'Laporan Harian',
    message: `Hari ini ${agg.count} transaksi, ${rp(agg.total)} (laba ${rp(profit)}).`,
    link: '/admin/laporan',
  });

  const methodText = Object.entries(agg.byMethod)
    .map(([m, t]) => `${m} ${rp(t)}`)
    .join(' · ');
  await notify({
    type: 'report_sales',
    title: 'Ringkasan Penjualan',
    message:
      `Total ${rp(agg.total)} (${agg.count} transaksi). ` +
      (methodText ? 'Per metode: ' + methodText + '.' : ''),
    link: '/admin/laporan',
  });

  const top = await topProducts(d, today, undefined, 3);
  await notify({
    type: 'report_top',
    title: 'Produk Terlaris',
    message: top.length
      ? top.map((t, i) => `${i + 1}. ${t.product_name} (${t.q} terjual)`).join(' · ')
      : 'Belum ada penjualan hari ini.',
    link: '/admin/laporan',
  });

  const sum = (rows: unknown[]) => Number((rows[0] as { v?: number } | undefined)?.v ?? 0);
  const cashIn =
    sum(await d.prepare('SELECT COALESCE(SUM(total),0) v FROM sales WHERE created_at >= ?').all(today)) +
    sum(
      await d
        .prepare("SELECT COALESCE(SUM(amount),0) v FROM cash_entries WHERE type = 'income' AND created_at >= ?")
        .all(today)
    );
  const cashOut =
    sum(
      await d
        .prepare('SELECT COALESCE(SUM(qty * unit_cost),0) v FROM purchases WHERE created_at >= ?')
        .all(today)
    ) +
    sum(await d.prepare('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE created_at >= ?').all(today)) +
    sum(
      await d
        .prepare("SELECT COALESCE(SUM(amount),0) v FROM cash_entries WHERE type = 'expense' AND created_at >= ?")
        .all(today)
    );
  await notify({
    type: 'report_cash',
    title: 'Kas Akhir Hari',
    message: `Arus kas hari ini: masuk ${rp(cashIn)}, keluar ${rp(cashOut)}, neto ${rp(cashIn - cashOut)}.`,
    link: '/admin/kas',
  });

  await markRanToday(d, 'notif_daily_last');
  return 4;
}

/** Laporan mingguan (dijadwalkan Sabtu 21:00): ringkasan 7 hari terakhir. */
export async function runWeeklyReport(force = false): Promise<number> {
  const d = await db();
  if (!force && (await alreadyRanToday('notif_weekly_last'))) return 0;
  const from = startOfDayJakarta(-6);
  const agg = await periodSales(d, from);
  const profit = agg.total - agg.cogs;
  const top = await topProducts(d, from, undefined, 3);
  await notify({
    type: 'report_weekly',
    title: 'Laporan Mingguan',
    message:
      `7 hari terakhir: ${agg.count} transaksi, ${rp(agg.total)} (laba ${rp(profit)}). ` +
      (top.length ? 'Terlaris: ' + top.map((t) => t.product_name).join(', ') + '.' : ''),
    link: '/admin/laporan',
  });
  await markRanToday(d, 'notif_weekly_last');
  return 1;
}

function prevMonthRange(): { from: string; to: string } {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const y = wib.getUTCFullYear();
  const m = wib.getUTCMonth(); // bulan berjalan (0-based)
  const py = m === 0 ? y - 1 : y;
  const pm = (m + 11) % 12; // bulan sebelumnya (0-based)
  const from = new Date(Date.UTC(py, pm, 1) - 7 * 3600 * 1000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) - 7 * 3600 * 1000).toISOString();
  return { from, to };
}
/** Laporan bulanan + rekap piutang/hutang (dijadwalkan tgl 1, 08:00). */
export async function runMonthlyReports(force = false): Promise<number> {
  const d = await db();
  if (!force && (await alreadyRanToday('notif_monthly_last'))) return 0;
  const { from, to } = prevMonthRange();
  const agg = await periodSales(d, from, to);
  const profit = agg.total - agg.cogs;

  await notify({
    type: 'report_monthly',
    title: 'Laporan Bulanan',
    message: `Bulan lalu: ${agg.count} transaksi, ${rp(agg.total)} (laba ${rp(profit)}).`,
    link: '/admin/laporan',
  });

  const debt = (await d
    .prepare("SELECT COUNT(*) c, COALESCE(SUM(remaining),0) t FROM debts WHERE status = 'open'")
    .get()) as { c: number; t: number };
  await notify({
    type: 'rekap_debt',
    title: 'Rekap Piutang',
    message: `${Number(debt.c)} piutang terbuka, total ${rp(Number(debt.t))}.`,
    link: '/piutang',
  });

  const pay = (await d
    .prepare("SELECT COUNT(*) c, COALESCE(SUM(remaining),0) t FROM payables WHERE status = 'open'")
    .get()) as { c: number; t: number };
  await notify({
    type: 'rekap_payable',
    title: 'Rekap Hutang',
    message: `${Number(pay.c)} hutang terbuka, total ${rp(Number(pay.t))}.`,
    link: '/admin/hutang',
  });

  await markRanToday(d, 'notif_monthly_last');
  return 3;
}

/**
 * Jalankan pekerjaan terjadwal. Dipanggil scheduler eksternal (Vercel Cron /
 * crontab / GitHub Actions) via POST /api/notifications/cron.
 * job: 'due' | 'daily' | 'weekly' | 'monthly' | 'audit' | 'all' (default: due + prune).
 */
/**
 * Auto-purge audit_log: hapus entri lebih lama dari days (default 90,
 * konsisten dgn purge manual DELETE /api/audit?days=90). Job cron:
 * ?job=audit atau ?job=all.
 */
export async function purgeAuditLog(days = 90): Promise<number> {
  const n = Math.max(1, Math.floor(days));
  const d = await db();
  const cutoff = new Date(Date.now() - n * 86400000).toISOString();
  const res = await d.prepare(`DELETE FROM audit_log WHERE created_at < ?`).run(cutoff);
  invalidate('audit:');
  return Number(res.changes);
}
export async function runCron(job?: string) {
  switch (job) {
    case 'daily':
      return { job: 'daily', ran: await runDailyReports() };
    case 'weekly':
      return { job: 'weekly', ran: await runWeeklyReport() };
    case 'monthly':
      return { job: 'monthly', ran: await runMonthlyReports() };
    case 'audit':
      return { job: 'audit', purged: await purgeAuditLog() };
    case 'all':
      await runDueDateSweep(true);
      await runDailyReports(true);
      await runWeeklyReport(true);
      await runMonthlyReports(true);
      await pruneOldNotifications(true);
      const purged = await purgeAuditLog();
      return { job: 'all', purged };
    case 'due':
    default:
      const due = await runDueDateSweep();
      await pruneOldNotifications();
      return { job: 'due', ...due };
  }
}

// ── Rutin hapus data lama (30 hari) ──
let _lastPrune = 0;
/** Hapus notifikasi & log > 30 hari. Throttle 1 jam/instance (force utk cron). */
export async function pruneOldNotifications(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - _lastPrune < 3600_000) return 0;
  _lastPrune = now;
  const d = await db();
  const cutoff = new Date(now - 30 * 86400000).toISOString();
  const info = await d.prepare('DELETE FROM notifications WHERE created_at < ?').run(cutoff);
  await d.prepare('DELETE FROM notification_logs WHERE sent_at < ?').run(cutoff);
  return Number(info.changes);
}
