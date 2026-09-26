import {
  createClient,
  type Client,
  type InArgs,
  type ResultSet,
  type Transaction,
} from '@libsql/client';
import crypto from 'node:crypto';

// Data layer: remote SQLite (Turso / libSQL) via the @libsql/client async client.
// Drop-in replacement for the previous local node:sqlite layer: same
// prepare().get/.all/.run + exec() surface, so all API routes stay unchanged
// (only difference: the methods are now async - call sites add `await`).
//
// Required environment variable:
//   DATABASE_URL        -> libsql://<db>.<region>.turso.io   (Vercel/Turso)
//   DATABASE_AUTH_TOKEN -> Turso database token
// For pure local development (no Turso), point DATABASE_URL at a local file:
//   DATABASE_URL = file:///D:/Ngudi Susilo/kopontren-app/data/kopontren.db

export type Db = {
  prepare(sql: string): {
    get(...args: unknown[]): Promise<unknown>;
    all(...args: unknown[]): Promise<unknown[]>;
    run(...args: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
  };
  exec(sql: string): Promise<void>;
};

class DbShim implements Db {
  constructor(public c: Client) {}
  prepare(sql: string) {
    // @libsql/client >= 0.15 has no prepare(); build the same surface
    // on top of client.execute({ sql, args }) instead.
    const exec = (args: unknown[]) => this.c.execute({ sql, args: args as InArgs });
    return {
      get: async (...args: unknown[]) => {
        const rs = (await exec(args)) as ResultSet;
        return rs.rows[0];
      },
      all: async (...args: unknown[]) => {
        const rs = (await exec(args)) as ResultSet;
        return rs.rows as unknown[];
      },
      run: async (...args: unknown[]) => {
        const rs = (await exec(args)) as ResultSet;
        return {
          changes: rs.rowsAffected,
          lastInsertRowid: Number(rs.lastInsertRowid ?? 0),
        };
      },
    };
  }
  async exec(sql: string) {
    // Multi-statement SQL: run each statement on its own logical
    // connection (the remote HTTP API accepts one statement per call).
    for (const stmt of sql.split(';')) {
      const s = stmt.trim();
      if (s) await this.c.execute(s);
    }
  }
}

let _db: Db | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'kasir',
  active INTEGER NOT NULL DEFAULT 1,
  salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  pw_default INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  last_activity TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- PIN 4-6 digit per user (scrypt, sama seperti password). Untuk re-auth
-- setelah sesi idle timeout. unique(user_id): satu PIN per user.
CREATE TABLE IF NOT EXISTS user_pins (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'pcs',
  base_price INTEGER NOT NULL DEFAULT 0,
  cost_price INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  barcode TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  kasir_id INTEGER,
  customer TEXT NOT NULL DEFAULT '',
  pay_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'unreported',
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  member_id INTEGER,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  change INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  member_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reported_at TEXT
);
CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  cost_price INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY,
  kasir_id INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  start_time TEXT NOT NULL,
  end_time TEXT,
  sales_count INTEGER NOT NULL DEFAULT 0,
  sales_total INTEGER NOT NULL DEFAULT 0,
  cash_total INTEGER NOT NULL DEFAULT 0,
  by_method TEXT NOT NULL DEFAULT '',
  setor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  username TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  table_name TEXT NOT NULL DEFAULT '',
  record_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS cash_entries (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS consignments (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  owner_phone TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  qty_received INTEGER NOT NULL DEFAULT 0,
  agree_price INTEGER NOT NULL DEFAULT 0,
  qty_sold INTEGER NOT NULL DEFAULT 0,
  qty_returned INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_si_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_consignments_status ON consignments(status);
CREATE INDEX IF NOT EXISTS idx_shifts_kasir ON shifts(kasir_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id, product_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, category);
`;

function hashPassword(pw: string, salt: string): string {
  return crypto.scryptSync(pw, salt, 32).toString('hex');
}

async function seed(d: Db) {
  const adminExists = await d
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('admin');
  if (!adminExists) {
    const salt = crypto.randomBytes(16).toString('hex');
    await d
      .prepare(
        `INSERT INTO users (username, display_name, role, active, salt, pass_hash, pw_default, created_by)
         VALUES ('admin', 'Pengurus', 'admin', 1, ?, ?, 1, NULL)`
      )
      .run(salt, hashPassword('kopontren', salt));
  }
  const prodCount = ((await d.prepare('SELECT COUNT(*) c FROM products').get()) as { c: number }).c;
  if (prodCount === 0) {
    const ins = d.prepare(
      `INSERT INTO products (name, category, unit, base_price, cost_price, stock, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    );
    const demo = [
      ['Madu Sachet', 'Madu', 'sachet', 6000, 5000, 500],
      ['Madu Box', 'Madu', 'box', 45000, 38000, 12],
      ['Madu Botol 500ml', 'Madu', 'botol', 25000, 21000, 24],
      ['Teh Hijau Premium', 'Minuman', 'pcs', 12000, 9000, 40],
      ['Keripik Bayam', 'Camilan', 'pcs', 5000, 3500, 60],
      ['Gula Halus 1kg', 'Sembako', 'kg', 15000, 13000, 30],
      ['Beras Premium 5kg', 'Sembako', 'sak', 72000, 66000, 10],
      ['Air Mineral 600ml', 'Minuman', 'botol', 3000, 2000, 200],
    ] as const;
    for (const row of demo) {
      await ins.run(row[0], row[1], row[2], row[3], row[4], row[5]);
    }
  }
}

let _dbPromise: Promise<Db> | null = null;

/** Ensure a column exists on a table (no-op when it's already there). */
async function execColumn(d: Db, sql: string) {
  const m = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
  if (m) {
    const rows = (await d.prepare(`PRAGMA table_info(${m[1]})`).all()) as {
      name: string;
    }[];
    if (rows.some((r) => r.name === m[2])) return;
  }
  await d.exec(sql);
}

/**
 * Idempotent migration of the feature batch on top of an existing database
 * (fresh databases get everything from SCHEMA): extra sales columns,
 * sale_items discount & cost snapshot, products.barcode, and the new
 * members / shifts / audit_log tables.
 */
async function migrate(d: Db) {
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN member_id INTEGER');
  await execColumn(
    d,
    "ALTER TABLE sales ADD COLUMN amount_paid INTEGER NOT NULL DEFAULT 0"
  );
  await execColumn(d, "ALTER TABLE sales ADD COLUMN change INTEGER NOT NULL DEFAULT 0");
  await execColumn(d, "ALTER TABLE sales ADD COLUMN discount INTEGER NOT NULL DEFAULT 0");
  await execColumn(d, "ALTER TABLE sales ADD COLUMN member_points INTEGER NOT NULL DEFAULT 0");
  await execColumn(d, "ALTER TABLE sale_items ADD COLUMN discount REAL NOT NULL DEFAULT 0");
  await execColumn(d, "ALTER TABLE sale_items ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0");
  await execColumn(d, "ALTER TABLE products ADD COLUMN barcode TEXT NOT NULL DEFAULT ''");
  // legacy DBs pre-date reported_at: without this, sales/report queries 500 on cold start
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN reported_at TEXT');
  // role batch: pengurus users link to a members row (auto-member) & loyalty columns
  await execColumn(d, 'ALTER TABLE users ADD COLUMN member_id INTEGER');
  await execColumn(d, 'ALTER TABLE members ADD COLUMN is_pengurus INTEGER NOT NULL DEFAULT 0');
  await execColumn(d, "ALTER TABLE members ADD COLUMN birth_date TEXT NOT NULL DEFAULT ''");
  await execColumn(d, "ALTER TABLE members ADD COLUMN tier TEXT NOT NULL DEFAULT ''");
  await execColumn(d, 'ALTER TABLE members ADD COLUMN cashback_balance INTEGER NOT NULL DEFAULT 0');
  // setor kas flag on closed shifts (kasir hands the till over to admin)
  await execColumn(d, 'ALTER TABLE shifts ADD COLUMN setor INTEGER NOT NULL DEFAULT 0');
  // Perks loyalitas member: nominal potongan diskon member/ulang tahun,
  // tercatat terpisah dari kolom discount (manual/grosir) agar laporan
  // kasir bisa membedakan keduanya.
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN member_discount INTEGER NOT NULL DEFAULT 0');
  // Redemsi & cashback per transaksi (fitur 2): direkam di baris sales agar
  // DELETE transaksi bisa membalikkan cashback_balance & redemsi member
  // tanpa bergantung nilai setting admin yang bisa berubah.
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN cashback INTEGER NOT NULL DEFAULT 0');
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN redeem INTEGER NOT NULL DEFAULT 0');
  // Pembayaran campur (fitur 3): pay_split = JSON array [{m, a}] — m
  // {cash,tf,wa}, Σa = total, split penuh (tanpa piutang). NULL/'' =
  // metode tunggal -> kolom pay_method tetap rujukan (legacy).
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN pay_split TEXT');
  await d.exec('CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT \'\', address TEXT NOT NULL DEFAULT \'\', points INTEGER NOT NULL DEFAULT 0, total_spent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))');
  await d.exec('CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY, kasir_id INTEGER NOT NULL, label TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'open\', start_time TEXT NOT NULL, end_time TEXT, sales_count INTEGER NOT NULL DEFAULT 0, sales_total INTEGER NOT NULL DEFAULT 0, cash_total INTEGER NOT NULL DEFAULT 0, by_method TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))');
  await d.exec('CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, user_id INTEGER, username TEXT NOT NULL DEFAULT \'\', action TEXT NOT NULL, table_name TEXT NOT NULL DEFAULT \'\', record_id INTEGER, old_value TEXT, new_value TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')))');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_sales_member ON sales(member_id)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_shifts_kasir ON shifts(kasir_id)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)');
  // performance batch for low-end devices: the report/dashboard queries
  // filter & order on these columns; all IF NOT EXISTS -> idempotent.
  await d.exec('CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_cash_entries_created ON cash_entries(created_at)');
  // role/member batch: lookups on members by name & phone (search + auto-member dedupe)
  await d.exec('CREATE INDEX IF NOT EXISTS idx_members_name ON members(name)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone)');
  // hot-list indexes: dashboard/report filters & joins (sales by date+status,
  // sale items by sale, products by active+category)
  await d.exec('CREATE INDEX IF NOT EXISTS idx_sales_created_status ON sales(created_at, status)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id, product_id)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, category)');
  // loyalty settings (key-value) + web-push VAPID keys
  await d.exec("CREATE TABLE IF NOT EXISTS member_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  await d.exec("CREATE TABLE IF NOT EXISTS vapid_keys (id INTEGER PRIMARY KEY CHECK (id = 1), public_key TEXT NOT NULL DEFAULT '', private_key TEXT NOT NULL DEFAULT '')");

  // ── feature batch 2 (2026-09-17): admin extras, member-by-phone, finance ──
  // Products: photo / min-stock / expiry; stores; member QR token; sales store link
  await execColumn(d, "ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  await execColumn(d, 'ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0');
  await execColumn(d, "ALTER TABLE products ADD COLUMN expiry_date TEXT NOT NULL DEFAULT ''");
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN store_id INTEGER');
  await execColumn(d, "ALTER TABLE members ADD COLUMN qr_code TEXT NOT NULL DEFAULT ''");
  // shop settings (key-value: store name, address, phone, logo, receipt footer, currency, timezone)
  await d.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')");
  // categories (admin-managed; products.category stores the name)
  await d.exec("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // tiered units per product: 1 <unit_name> = conversion_factor <base unit>
  await d.exec("CREATE TABLE IF NOT EXISTS product_units (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, unit_name TEXT NOT NULL, conversion_factor REAL NOT NULL DEFAULT 1, UNIQUE (product_id, unit_name))");
  // stock opname (v1): DEAD TABLE, di-drop di v15 — tidak pernah ditulis
  // oleh kode mana pun & fiturnya tak terpasang di UI. DROP-nya ada di
  // bagian akhir fullInit (migration v15).
  // trade payables ("Hutang" / utang dagang ke supplier): same shape as
  // debts + created_by. Paying via /api/payables/[id] also inserts a
  // cash_entries 'expense' row (integrasi kas keluar), mirroring /api/kas.
  await d.exec("CREATE TABLE IF NOT EXISTS payables (id INTEGER PRIMARY KEY, supplier_name TEXT NOT NULL, supplier_phone TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL DEFAULT 0, due_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', note TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  await d.exec('CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_payables_created ON payables(created_at)');
  // customer debts (receivables)
  await d.exec("CREATE TABLE IF NOT EXISTS debts (id INTEGER PRIMARY KEY, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL DEFAULT 0, due_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // sales returns (restocks)
  await d.exec("CREATE TABLE IF NOT EXISTS returns (id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL, product_id INTEGER, qty INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // cancelled sales (stock is restored when the cancellation is recorded)
  await d.exec("CREATE TABLE IF NOT EXISTS sale_cancellations (id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', cancelled_by INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // wholesale tiers: buy >= min_qty -> discount_percent off
  await d.exec("CREATE TABLE IF NOT EXISTS product_prices (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, min_qty INTEGER NOT NULL DEFAULT 1, discount_percent INTEGER NOT NULL DEFAULT 0)");
  // Grosir v1 (2026-09-25): index utk lookup tier per produk (UI admin +
  // subquery kolom `wholesale` di /api/products). product_id asc supaya
  // tier terbaca urut ambang naik.
  await d.exec('CREATE INDEX IF NOT EXISTS idx_product_prices_product ON product_prices(product_id, min_qty)');
  // bundles (items = JSON array of {product_id, qty})
  await d.exec("CREATE TABLE IF NOT EXISTS bundles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0, items TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // multi-store support (default store seeded when missing)
  await d.exec("CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  const firstStore = await d.prepare('SELECT id FROM stores LIMIT 1').get();
  if (!firstStore) await d.exec("INSERT INTO stores (name, address) VALUES ('Kopontren AL ITTIHAD', 'Pondok Pesantren Al Ittihad')");
  // web-push subscriptions
  await d.exec("CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY, user_id INTEGER, endpoint TEXT NOT NULL, keys TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // loyalty ledger: point earn / redeem, cashback credit / use
  await d.exec("CREATE TABLE IF NOT EXISTS point_history (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL, delta INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, sale_id INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  // indexes
  await d.exec('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_point_history_member ON point_history(member_id)');
  // Batch 2 (2026-09-21, guard retur kasir): kolom kasir_id sudah masuk
  // CREATE TABLE sales — tetapi CREATE TABLE IF NOT EXISTS TIDAK diterapkan
  // ke DB existing (tabel lama). Tanpa execColumn ini, index idx_sales_kasir
  // di bawah + INSERT/SELECT sales.kasir_id (POS & guard retur) akan error
  // "no such column" di DB produksi. Baris lama tetap NULL = transaksi
  // historis tanpa atribusi kasir; guard hanya membatasi role kasir.
  await execColumn(d, 'ALTER TABLE sales ADD COLUMN kasir_id INTEGER');
  // perf batch 3 (2026-09-18): close the remaining hot-query gaps from the
  // Rows-Read audit. idx_sales_kasir: per-cashier sales (shift close,
  // cashier filters). idx_returns_sale: sales -> returns joins (rekap retur).
  await d.exec('CREATE INDEX IF NOT EXISTS idx_sales_kasir ON sales(kasir_id)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id)');
  // perf batch 4 (2026-09-18): index compound utk dropdown /api/belanja
  // (SELECT id, name FROM products WHERE active=1 ORDER BY name) — filter
  // + sort langsung dari index, tanpa scan tabel produk.
  await d.exec('CREATE INDEX IF NOT EXISTS idx_products_active_name ON products(active, name)');
  // perf batch 5 (2026-09-18, audit Rows Read Turso): index utk query yang
  // sebelumnya full-scan: debts (ORDER BY created_at), shifts (list closed
  // ORDER BY end_time), consignments (ORDER BY created_at), audit_log
  // (filter table_name utk dropdown log audit).
  await d.exec('CREATE INDEX IF NOT EXISTS idx_debts_created ON debts(created_at)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_shifts_status_end ON shifts(status, end_time)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_consignments_created ON consignments(created_at)');
  await d.exec('CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name)');
  // audit-trail batch (2026-09-18): snapshot SIAPA + konteks request di
  // audit_log. user_name/user_role = snapshot (bukan FK) agar history tetap
  // utuh walau user dihapus/role-nya berubah. Semua idempotent.
  await execColumn(d, "ALTER TABLE audit_log ADD COLUMN user_name TEXT NOT NULL DEFAULT ''");
  await execColumn(d, "ALTER TABLE audit_log ADD COLUMN user_role TEXT NOT NULL DEFAULT ''");
  await execColumn(d, "ALTER TABLE audit_log ADD COLUMN ip_address TEXT NOT NULL DEFAULT ''");
  await execColumn(d, "ALTER TABLE audit_log ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''");
  await d.exec('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)');
  // POS offline-queue: client-generated idempotency key per transaksi. Retry
  // sinkronisasi offline tidak menciptakan duplikat (lookup O(1) via index
  // partial; baris legacy '' tidak terindeks).
  await execColumn(d, "ALTER TABLE sales ADD COLUMN client_ref TEXT NOT NULL DEFAULT ''");
  try {
    await d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_ref ON sales(client_ref) WHERE client_ref != ''");
  } catch {
    /* index mungkin gagal jika duplikat legacy; dedupe aplikasi tetap jalan */
  }
  // unique phone per member. Partial index: many members may have an empty
  // phone, but a non-empty phone must be unique. If duplicates already exist
  // (legacy data), keep the oldest row's phone and clear the newer ones first
  // so the index can be created without aborting the whole migration.
  try {
    await d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_members_phone_uniq ON members(phone) WHERE phone != ''");
  } catch {
    const dups = (await d
      .prepare(`SELECT phone, MIN(id) AS keep_id FROM members WHERE phone != '' GROUP BY phone HAVING COUNT(*) > 1`)
      .all()) as { phone: string; keep_id: number }[];
    for (const dp of dups) {
      await d.prepare(`UPDATE members SET phone = '' WHERE phone = ? AND id != ?`).run(dp.phone, dp.keep_id);
    }
    try {
      await d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_members_phone_uniq ON members(phone) WHERE phone != ''");
    } catch {
      /* still colliding - app-layer validation enforces uniqueness anyway */
    }
  }

  // ── Zakat tijarah (zakat perdagangan) batch ──
  // Key-value settings (harga emas, nishab, kadar, tanggal haul) + riwayat
  // pembayaran zakat (dicatat via POST /api/zakat).
  await d.exec("CREATE TABLE IF NOT EXISTS zakat_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')");
  await d.exec(
    "CREATE TABLE IF NOT EXISTS zakat_history (id INTEGER PRIMARY KEY, total_assets INTEGER NOT NULL DEFAULT 0, nishab INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT '', zakat_amount INTEGER NOT NULL DEFAULT 0, paid_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), payment_type TEXT NOT NULL DEFAULT 'cash')"
  );
  // Default sesuai rumus zakat tijarah: nishab 85 gram, kadar 2,5%.
  // ON CONFLICT DO NOTHING -> nilai yang sudah diubah admin tetap tersimpan.
  await d.exec("INSERT INTO zakat_settings (key, value) VALUES ('nishab_gram', '85') ON CONFLICT(key) DO NOTHING");
  await d.exec("INSERT INTO zakat_settings (key, value) VALUES ('zakat_rate', '2.5') ON CONFLICT(key) DO NOTHING");
  // v17: media pembayaran zakat per baris ('cash' | 'transfer' | 'qris' |
  // 'other'; baris lama di-backfill 'cash' via DEFAULT — keputusan: baris
  // lama hampir pasti dicatat tunai, '' justru bikin ambiguitas).
  // Idempoten (guard PRAGMA table_info di execColumn), aman utk DB existing.
  await execColumn(d, "ALTER TABLE zakat_history ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'cash'");

  // ── Keamanan (2026): PIN 4-6 digit + idle timeout sesi ──
  // sessions.last_activity: jejak aktivitas terakhir utk idle timeout (refresh
  // tiap request; entek setelah session_timeout detik tanpa aktivitas).
  await execColumn(d, 'ALTER TABLE sessions ADD COLUMN last_activity TEXT');
  // FASE P4 (2026-09-24, keputusan pengurus): komisi konsinyasi utk akad
  // WAKALAH BIL UJRAH (koreksi terminologi 24 Sep dsr riset Syafi'i —
  // BUKAN ju'alah, bentuk "laku = beli" = gharar): toko = wakil pemilik
  // menjual; ujrah hanya dicatat saat terjual. Ref. Fatwa
  // DSN-MUI No. 113/DSN-MUI/IX/2017 (wakalah) + Bahtsul Masail HIPJAS
  // VI 2023 (komisi persenan = ujrah ma'lum).
  // Rate disnapshot per baris saat barang dititipkan (kontrak
  // disepakati saat titipan).
  // Baris lama dapat 20 (default keputusan); setting global
  // konsinyasi_commission hanya berlaku utk titipan baru.
  await execColumn(
    d,
    'ALTER TABLE consignments ADD COLUMN commission_rate INTEGER NOT NULL DEFAULT 20'
  );
  // user_pins: PIN ter-hash scrypt (mirip password), 1 baris per user.
  await d.exec(
    "CREATE TABLE IF NOT EXISTS user_pins (" +
      'id INTEGER PRIMARY KEY, ' +
      'user_id INTEGER NOT NULL UNIQUE, ' +
      'pin_hash TEXT NOT NULL, ' +
      'salt TEXT NOT NULL, ' +
      'failed_attempts INTEGER NOT NULL DEFAULT 0, ' +
      'locked_until TEXT, ' +
      "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), " +
      "updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))" +
      ')'
  );
  // Seed default timeout sesi (hanya kalau belum ada; admin bisa override).
  await d.exec("INSERT INTO settings (key, value) VALUES ('session_timeout', '3600') ON CONFLICT(key) DO NOTHING");

  // ── Notifikasi (2026): in-app + web push, HANYA admin ──
  // notifications: baris notifikasi in-app per user admin (user_id selalu
  // role 'admin'; kasir/pengurus/member tidak pernah menerima).
  await d.exec(
    "CREATE TABLE IF NOT EXISTS notifications (" +
      "id INTEGER PRIMARY KEY, " +
      "user_id INTEGER NOT NULL, " +
      "type TEXT NOT NULL DEFAULT '', " +
      "title TEXT NOT NULL DEFAULT '', " +
      "message TEXT NOT NULL DEFAULT '', " +
      "link TEXT NOT NULL DEFAULT '', " +
      "read INTEGER NOT NULL DEFAULT 0, " +
      "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))" +
      ")"
  );
  await d.exec(
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at)"
  );
  // notification_settings: toggle per-admin per-jenis. Baris tidak ada =
  // default (in_app ON, push OFF) — push selalu opt-in eksplisit.
  await d.exec(
    "CREATE TABLE IF NOT EXISTS notification_settings (" +
      "id INTEGER PRIMARY KEY, " +
      "user_id INTEGER NOT NULL, " +
      "type TEXT NOT NULL, " +
      "enabled_in_app INTEGER NOT NULL DEFAULT 1, " +
      "enabled_push INTEGER NOT NULL DEFAULT 0, " +
      "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), " +
      "UNIQUE(user_id, type)" +
      ")"
  );
  await d.exec("CREATE INDEX IF NOT EXISTS idx_notif_settings_user ON notification_settings(user_id, type)");
  // notification_logs: jejak pengiriman per channel (in_app/push),
  // status sent/failed + pesan error. Gagal kirim tetap tercatat.
  await d.exec(
    "CREATE TABLE IF NOT EXISTS notification_logs (" +
      "id INTEGER PRIMARY KEY, " +
      "notification_id INTEGER, " +
      "channel TEXT NOT NULL, " +
      "status TEXT NOT NULL, " +
      "error TEXT NOT NULL DEFAULT '', " +
      "sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))" +
      ")"
  );
  await d.exec("CREATE INDEX IF NOT EXISTS idx_notif_logs_notif ON notification_logs(notification_id)");
}


/**
 * Loyalty / member perks configuration (key-value with sensible defaults).
 * Reads never throw; writes are admin-only (enforced in the API route).
 */
const MEMBER_SETTING_DEFAULTS: Record<string, string> = {
  points_every: '10000', // Rp per 1 loyalty point
  point_value: '100', // Rp value of 1 point when redeemed
  member_discount: '0', // % discount for member transactions
  cashback: '0', // % cashback credited to member balance
  birthday_active: '1', // enable birthday promo
  birthday_discount: '10', // % discount when member's birthday is today
  wholesale_min: '0', // qty threshold for wholesale discount (0 = off)
  wholesale_discount: '0', // % wholesale discount
  tier_silver: '1000000', // total spending threshold for Silver tier (Rp)
  tier_gold: '5000000', // total spending threshold for Gold tier (Rp)
};

/**
 * Shop settings (key-value with sensible defaults) used by receipts,
 * reports and the app shell (store name, currency, receipt footer, …).
 * Reads never throw; writes are admin-only (enforced in the API route).
 */
export const SHOP_SETTING_DEFAULTS: Record<string, string> = {
  store_name: 'Kopontren AL ITTIHAD',
  store_address: '',
  store_phone: '',
  store_logo: '', // data-URL image (kept small: logo thumbnail)
  receipt_footer: 'Jazakumullah Khairan Katsiran',
  currency: 'Rp',
  timezone: 'Asia/Jakarta',
  // Detik. Idle timeout sesi (default 3600 = 1 jam). Bisa diubah admin.
  session_timeout: '3600',
  // FASE P4 (akad wakalah bil ujrah, keputusan pengurus 2026-09-24): komisi toko
  // utk konsinyasi (% dr harga jual); bagian pemilik = 100 - rate. Upah
  // baru tercatat saat barang terjual, tidak di muka. Default 20.
  konsinyasi_commission: '20',
  // FASE P4-B: komisi FLEKSIBEL per pemilik (antardhin) — JSON
  // {nama_pemilik: rate%} utk pre-fill titipan baru. '{}' = pakai
  // global. Dikelola di /admin/konsinyasi (aksi save/delete_owner_rate).
  konsinyasi_owner_rates: '{}',
  // QRIS (2026-09-25, placeholder pralayar): NMID/NMID2/MCC/kota utk
  // encoder QRIS statis/dinamis (src/lib/qris.ts). Kosong = fitur offline
  // (UI /admin/qris menampilkan state "NMID belum diset"). Nama merchant
  // mengikuti store_name. Kosong sejak awal -> tanpa data existing.
  qris_nmid: '',
  qris_nmid2: '',
  qris_mcc: '',
  qris_city: '',
};

export async function getSettings(): Promise<Record<string, string>> {
  try {
    const d = await db();
    const rows = (await d.prepare('SELECT key, value FROM settings').all()) as {
      key: string;
      value: string;
    }[];
    const out: Record<string, string> = { ...SHOP_SETTING_DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  } catch {
    return { ...SHOP_SETTING_DEFAULTS };
  }
}

export async function saveSettings(
  d: Db,
  patch: Record<string, string>,
  who?: { id: number; username: string }
): Promise<void> {
  const ins = d.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in SHOP_SETTING_DEFAULTS) await ins.run(k, String(v));
  }
  if (who) {
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit(who, 'settings:update', 'settings', null, undefined, patch);
    } catch {
      /* audit is best-effort */
    }
  }
}

// Per-instance TTL cache for member settings: the loyalty key-value table is
// read on every sale POST. 30 s staleness is fine (settings change only when
// an admin saves them, which invalidates the cache below).
let _memberSettingsCache: { at: number; value: Record<string, string> } | null = null;
const MEMBER_SETTINGS_TTL_MS = 30_000;

export async function getMemberSettings(): Promise<Record<string, string>> {
  if (_memberSettingsCache && Date.now() - _memberSettingsCache.at < MEMBER_SETTINGS_TTL_MS)
    return _memberSettingsCache.value;
  try {
    const d = await db();
    const rows = (await d.prepare('SELECT key, value FROM member_settings').all()) as {
      key: string;
      value: string;
    }[];
    const out: Record<string, string> = { ...MEMBER_SETTING_DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    _memberSettingsCache = { at: Date.now(), value: out };
    return out;
  } catch {
    return { ...MEMBER_SETTING_DEFAULTS };
  }
}

export async function saveMemberSettings(
  d: Db,
  patch: Record<string, string>,
  who?: { id: number; username: string }
): Promise<void> {
  _memberSettingsCache = null; // writes make the cached settings stale
  const ins = d.prepare('INSERT INTO member_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in MEMBER_SETTING_DEFAULTS) await ins.run(k, String(v));
  }
  if (who) {
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit(who, 'member:settings', 'member_settings', null, undefined, patch);
    } catch {
      /* audit is best-effort */
    }
  }
}

/**
 * Zakat tijarah settings (key-value; default nishab 85 gram, kadar 2,5%).
 * Reads never throw; writes are admin-only (enforced in the API route).
 * Per-instance 30 s TTL cache: halaman /admin/zakat membaca penghitungan
 * berulang saat navigasi; simpan pengaturan menginvalidasi cache.
 */
export const ZAKAT_SETTING_DEFAULTS: Record<string, string> = {
  gold_price: '0', // harga emas MURNI 24 KARAT per 1 gram (Rp) — diisi admin (dasar nisab = emas murni 85 g; emas 14/18K TIDAK boleh, Muktamar NU ke-35)
  nishab_gram: '85', // nishab (gram)
  zakat_rate: '2.5', // kadar zakat (%)
  haul_start_date: '', // tanggal mulai haul (YYYY-MM-DD, kosong = auto awal bulan)
  last_zakat_date: '', // zakat terakhir dibayar (YYYY-MM-DD)
};

let _zakatSettingsCache: { at: number; value: Record<string, string> } | null = null;
const ZAKAT_SETTINGS_TTL_MS = 30_000;

export async function getZakatSettings(): Promise<Record<string, string>> {
  if (_zakatSettingsCache && Date.now() - _zakatSettingsCache.at < ZAKAT_SETTINGS_TTL_MS)
    return _zakatSettingsCache.value;
  try {
    const d = await db();
    const rows = (await d.prepare('SELECT key, value FROM zakat_settings').all()) as {
      key: string;
      value: string;
    }[];
    const out: Record<string, string> = { ...ZAKAT_SETTING_DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    _zakatSettingsCache = { at: Date.now(), value: out };
    return out;
  } catch {
    return { ...ZAKAT_SETTING_DEFAULTS };
  }
}

export async function saveZakatSettings(
  d: Db,
  patch: Record<string, string>,
  who?: { id: number; username: string }
): Promise<void> {
  _zakatSettingsCache = null; // write membuat cached settings stale
  const ins = d.prepare(
    'INSERT INTO zakat_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [k, v] of Object.entries(patch)) {
    if (k in ZAKAT_SETTING_DEFAULTS) await ins.run(k, String(v));
  }
  if (who) {
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit(who, 'zakat:settings', 'zakat_settings', null, undefined, patch);
    } catch {
      /* audit is best-effort */
    }
  }
}
// Bump this when migrate()/SCHEMA gain new statements so already-migrated
// databases re-run fullInit exactly once per deploy that changes the schema.
// Bump: zakat batch — tabel zakat_settings + zakat_history (zakat
// perdagangan/tijarah) + seed default nishab/kadar. Semua statement
// IF NOT EXISTS / DO NOTHING, idempotent, aman utk DB existing.
// Bump v6 (2026): tabel payables (Hutang / utang dagang ke supplier)
// + index status/created. Semua statement IF NOT EXISTS, idempotent,
// aman utk DB existing.
// Bump v7 (2026): sales.client_ref (idempotency key utk antrean POS
// offline) + index partial unique. Idempotent, aman utk DB existing.
// Bump v8 (2026): keamanan — tabel user_pins (PIN 4-6 digit, scrypt) +
// sessions.last_activity (idle timeout) + setting session_timeout. Semua
// statement IF NOT EXISTS / idempotent, aman utk DB existing.
  // v9: kolom settings.session_timeout (idle timeout, default 3600 dtk).
  async function migrate28(d: Db) {
    await execColumn(
      d,
      'ALTER TABLE settings ADD COLUMN session_timeout INTEGER NOT NULL DEFAULT 3600'
    );
  }

// Bump v10 (2026): notifikasi admin — tabel notifications,
// notification_settings, notification_logs (+ index). Idempotent, aman
// utk DB existing.
// Bump v11 (20 Sep 2026): audit trail per-user — audit_log +4 kolom
// (user_name, user_role, ip_address, user_agent) + index idx_audit_user.
// Dipakai execColumn idempoten di migrate(); DB existing (v10) akan
// menjalankan fullInit sekali lagi pada cold start berikutnya.
// Bump v12 (2026): redemsi poin & cashback (fitur 2) — sales.cashback +
// sales.redeem (rekam nominal per transaksi utk rollback DELETE &
// pelaporan). execColumn idempoten di migrate(); DB existing (v11) akan
// menjalankan fullInit sekali lagi pada cold start berikutnya.
// Bump v13 (2026): pembayaran campur (fitur 3) — sales.pay_split
// (JSON array [{m,a}], Σa = total; NULL = single method, pay_method
// rujukan). execColumn idempoten di migrate(); DB existing (v12) akan
// menjalankan fullInit sekali lagi pada cold start berikutnya.
// Bump v14 (2026-09-21): guard retur kasir — execColumn sales.kasir_id
// utk DB existing (CREATE TABLE baru tidak menambah kolom ke tabel lama).
// DB existing (v13) menjalankan fullInit sekali lagi; index
// idx_sales_kasir kini aman dibuat.
// Bump v15 (2026-09-23): drop dead table stock_opname (fitur opname
// tak pernah dipakai / tak pernah ditulis kode). DB existing (v14)
// menjalankan fullInit sekali lagi -> DROP TABLE IF EXISTS v15.
// Bump v16 (2026-09-24): FASE P4 (4f12818) menambah execColumn
// consignments.commission_rate ke fullInit TANPA bump versi (tetap 15)
// -> DB produksi (sudah stempel v15) skip fullInit -> kolom tak pernah
// dibuat -> SELECT /api/konsinyasi 500 "no such column: commission_rate"
// -> halaman Konsinyasi PWA stuck "Memuat…" (pelaporan 24 Sep). Bump v16
// memaksa DB existing (v15) menjalankan fullInit sekali lagi (idempoten);
// cold start Turso pertama butuh ~15-20 s, hanya satu kali.
// Bump v17 (2026): kolom baru zakat_history.payment_type (media
// pembayaran zakat: cash/transfer/qris/other, default 'cash').
// Purely additive (ADD COLUMN dgn DEFAULT; tidak menyentuh data lama)
// -> TIDAK ada risiko kehilangan data; rollback aman (Turso SQLite
// >=3.35: ALTER TABLE ... DROP COLUMN bila perlu). DB stempel v16
// menjalankan fullInit sekali lagi saat cold start berikutnya.
const SCHEMA_VERSION = 17;

/** One-time full initialization (fresh DB or schema upgrade). */
async function fullInit(d: Db) {
  await d.exec(SCHEMA); // idempotent: creates tables when missing
  await migrate(d); // feature batch: new columns & tables on existing DBs
  // One-time migration: legacy 'YYYY-MM-DD HH:MM:SS' (UTC, space-separated)
  // timestamps -> ISO 'YYYY-MM-DDTHH:MM:SS.sssZ', so string comparisons with
  // startOfDayJakarta() work consistently. Idempotent: rows already in ISO
  // have no space and are left untouched.
  for (const t of [
    'sales',
    'purchases',
    'expenses',
    'cash_entries',
    'consignments',
    'products',
    'users',
  ]) {
    await d.exec(
      `UPDATE ${t} SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE instr(created_at, ' ') > 0;`
    );
  }
  await migrate28(d);
  await d.exec(
    `UPDATE sales SET reported_at = strftime('%Y-%m-%dT%H:%M:%fZ', reported_at) WHERE reported_at IS NOT NULL AND instr(reported_at, ' ') > 0;`
  );
  await d.exec(
    `UPDATE consignments SET settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', settled_at) WHERE settled_at IS NOT NULL AND instr(settled_at, ' ') > 0;`
  );
  await seed(d);
  // v15: drop dead table stock_opname (tidak pernah ditulis oleh kode
  // mana pun sejak era fitur v3; tanpa entry UI). Idempoten & aman utk
  // DB fresh (CREATE-nya sudah tidak ada di bagian atas). Data lama
  // yang mungkin pernah diinput manual tetap bisa dipulihkan dari
  // snapshot backup Turso pra-drop.
  await d.exec('DROP TABLE IF EXISTS stock_opname');
  await d.exec('DROP INDEX IF EXISTS idx_stock_opname_created');
  // Stamp the schema version: every later cold start skips all migrations
  // (one cheap SELECT instead of ~150 sequential Turso round-trips, which
  // made the first page load take 15-20 s over the remote HTTP API).
  await d.exec('CREATE TABLE IF NOT EXISTS schema_version(id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)');
  await d.exec(
    `INSERT INTO schema_version(id, version) VALUES (1, ${SCHEMA_VERSION}) ON CONFLICT(id) DO UPDATE SET version = excluded.version`
  );
}

export function db(): Promise<Db> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL is not set (see DEPLOY-VERCEL.txt)');
  const token = process.env.DATABASE_AUTH_TOKEN;
  _dbPromise = (async () => {
    const c = createClient({ url, authToken: token || undefined });
    const d = new DbShim(c);
    // Fast path: database already at the current schema version -> skip the
    // whole migration chain. Table missing (fresh DB) => select throws => fullInit.
    let row: { version: number } | undefined;
    try {
      row = (((await d.prepare('SELECT version FROM schema_version LIMIT 1').get()) ??
        undefined) as unknown) as { version: number } | undefined;
    } catch {
      row = undefined;
    }
    if (!row || Number(row.version) < SCHEMA_VERSION) {
      await fullInit(d);
    }
    _db = d;
    return d;
  })();
  return _dbPromise;
}

/**
 * Run fn inside a transaction.
 *
 * Remote (Turso, libsql://): `client.transaction('write')` opens a server-side
 * transaction; statements issued on it are shipped as one atomic batch that is
 * applied ONLY on an explicit `commit()`. We temporarily point the DbShim at
 * that transaction so call sites keep using `d` as-is, then:
 *   - success -> await t.commit()  (persists the batch; propagates errors)
 *   - failure -> await t.rollback() (discards the batch; original error wins)
 * A bare close() would DROP the open transaction, which is the historical bug
 * that silently lost every tx() write in production.
 *
 * Local (file:): run fn() sequentially (auto-commit per statement) — safe.
 */
export async function tx<T>(d: Db, fn: () => Promise<T> | T): Promise<T> {
  const shim = d as DbShim;
  const c = shim.c;
  // Local SQLite (file:) pada @libsql/client 0.15: client.transaction()
  // SILENTLY LOST — statement dalam tx dibuang saat close() tanpa commit
  // (diverifikasi: INSERT/UPDATE dalam tx tidak persist di file backend).
  // Jalankan sekuensial (auto-commit per statement) — safe utk dev lokal.
  // Turso remote (libsql:// / ?ws=1): c.transaction('write') membuka transaksi
  // di SERVER. Statement dalam fn() di-batch; batch baru terapply saat
  // COMMIT eksplisit. close() saja TIDAK commit -> write DIBUANG (bug lama:
  // semua write via tx() hilang di produksi, sementara audit/produk (db()
  // auto-commit) tetap persist).
  const rawUrl = (process.env.DATABASE_URL || '').trim();
  if (rawUrl.startsWith('file:')) return fn();
  if (typeof c.transaction === 'function') {
    const t: Transaction = await c.transaction('write');
    const orig = shim.c;
    shim.c = t as unknown as Client;
    let ok = false;
    try {
      const r = await fn();
      ok = true;
      return r;
    } finally {
      shim.c = orig;
      if (ok) {
        // Persist transaksi. JANGAN swallow error commit: bila gagal, propagasi
        // ke caller agar route mengembalikan error (bukan sukses palsu + data
        // hilang). commit() juga menutup stream.
        await t.commit();
      } else {
        // fn() gagal: buang batch. rollback() menutup stream; error-nya
        // tidak boleh menimpa error asli fn() -> biarkan propagasi.
        try {
          await t.rollback();
        } catch {
          /* error asli fn() tetap propagasi */
        }
      }
    }
  }
  return fn();
}
