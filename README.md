# Kopontren AL ITTIHAD — Kasir & Pembukuan (PWA Fullstack)

Aplikasi toko kasir + pembukuan multi-user untuk Kopontren AL ITTIHAD, dibangun ulang dari
versi Next.js lama dengan fitur lengkap (POS, stok, belanja, kas, laporan, backup) dan visual
**Blue Notebook**.

## Teknis
- Next.js 15 (App Router, TypeScript) + Tailwind CSS
- DB: **Turso/libSQL** (`@libsql/client`, remote) via env `DATABASE_URL` +
  `DATABASE_AUTH_TOKEN` (lihat `.env.example` / `DEPLOY-VERCEL.txt`).
  Migrasi skema idempotent + gate `schema_version` (cold start = 1 SELECT).
- Auth: session cookie HttpOnly (scrypt) + **verifikasi PIN** (4–6 digit,
  lockout 5x → kunci 15 menit) + idle-timeout sesi (default 1 jam, bisa
  diatur admin 1 mnt–7 hari) + countdown sisa sesi di header.
- Anti brute-force login: 10 gagal (username+IP) dalam 15 mnt → kunci 15 mnt.
- Peran: `admin`, `pengurus` (manager), `kasir`
- PWA installable + **web push** (VAPID, hanya admin) + in-app notification
  (20 jenis, prefensi per-admin, cron terjadwal `due|daily|weekly|monthly`)
- Zona waktu tampilan: Asia/Jakarta (WIB); data disimpan UTC

## Teknis
- Next.js 15 (App Router, TypeScript) + Tailwind CSS
- SQLite via `better-sqlite3` (file `data/kopontren.db`, nol konfigurasi DB)
- Auth: session cookie HttpOnly (scrypt hash), peran `admin` (pengurus) & `kasir`
- PWA: `public/manifest.json` + `public/sw.js` + ikon (installable)
- Zona waktu tampilan: Asia/Jakarta (WIB); data disimpan UTC

## Menjalankan
```bash
npm install
# salin .env.example -> .env lalu isi DATABASE_URL + DATABASE_AUTH_TOKEN
# (Turso; untuk dev lokal bisa file:local.db)
npm run dev      # http://localhost:3000
```
Database + akun awal dibuat otomatis saat pertama kali jalan
(migrasi skema jalan idempotent, gate `schema_version`).

**Login awal (wajib diganti!):**
- username: `admin`
- password: `kopontren`
- Setelah login, ganti lewat **Admin → Pengguna → Ganti password saya**
  (banner amber di beranda mengingatkan selama password default dipakai).

## Fitur per Peran

### Keamanan & Sesi
- Login password + **PIN 4–6 digit** (anti brute-force: 5x salah → kunci 15 mnt).
- Idle timeout sesi (default 1 jam, admin bisa set 1 mnt–7 hari) dengan
  **countdown sisa sesi** di header (kuning <5 mnt, merah <1 mnt, habis → re-auth PIN).
- Throttle login (10 gagal per username+IP dalam 15 mnt → kunci 15 mnt).

### Kasir
- **POS** (`/kasir`): grid produk + cari (ranking + fuzzy) + filter kategori, keranjang,
  nama pembeli, metode bayar (Tunai/Transfer/QRIS), **scan barcode** (USB Enter &
  kamera via jsQR), **antrean transaksi offline** (tersinkron otomatis saat online,
  idempoten via `client_ref`), **struck** (cetak `window.print`, bagikan via WhatsApp,
  salin teks), **shift kasir** (buka/tutup + rekap otomatis), **member & loyalty poin**
  (poin per `points_every` dari pengaturan member), hotkey F1–F5/ESC.
- **Laporan & Rekap** (`/laporan`): filter periode/status, rincian per transaksi, tandai
  Sudah/Belum, tombol **Rekap WA** (pesan ASCII polos, aman semua versi WhatsApp —
  `navigator.share` → fallback `wa.me`).
- **Piutang** (`/piutang`): catatan hutang pelanggan + cicilan + tunggak; **Retur**
  (`/retur`): retur penjualan (stok balik, refund opsional → jurnal kas keluar).

### Pengurus / Admin (semua kasir + yang berikut)
- **Dashboard Global** (`/pengurus/dashboard`): KPI 30 hari, grafik 7/30/365 hari
  + deteksi anomali, export CSV/Excel/PDF, laporan via WhatsApp.
- **Dashboard Kasir** (`/admin/dashboard`): stok menipis + ringkasan.
- **Produk** (`/admin/produk`): CRUD + operasi massal (stok/kategori/aktif/hapus),
  impor CSV/XLSX (upsert via barcode/nama, validasi + laporan kesehatan HPP).
- **Belanja & Pengeluaran** (`/admin/belanja`): stok masuk menambah stok + memperbarui HPP;
  pengeluaran operasional tercatat ke kas.
- **Kas / Pembukuan** (`/admin/kas`): saldo kas otomatis (jual + jurnal masuk − belanja −
  pengeluaran − jurnal keluar), tabel ledger, jurnal manual masuk/keluar.
- **Laporan** (`/admin/laporan`): ringkasan per periode (penjualan, HPP, laba kotor, kas
  keluar, arus neto, top produk, metode bayar) + unduhan **CSV**.
- **Member & Loyalty** (`/admin/member`): kelola member, poin, QR badge member;
  **Pengaturan Member** (`/admin/pengaturan-member`): `points_every` (diterapkan POS),
  serta diskon member, cashback, promo ulang tahun, grosir & tier Silver/Gold
  (masih konfigurasi — belum diterapkan otomatis di alur transaksi, lihat TODO.md).
- **Hutang Supplier** (`/admin/hutang`): utang dagang + cicilan (terintegrasi jurnal kas).
- **Konsinyasi** (`/admin/konsinyasi`): titip jual (jual/kembali/bayar/penutupan).
- **BMT / Zakat** (`/admin/zakat`): penghitungan zakat tijarah (nisab 85 gram,
  kadar 2,5%, harga emas, haul) + riwayat.
- **Notifikasi** (`/admin/notifications` + settings): 20 jenis in-app + web push
  (VAPID), prefensi per-admin, cron `due/daily/weekly/monthly/all`.
- **Shift** (`/admin/shift`): pantau & rekap shift kasir.
- **Pengguna** (`/admin/pengguna`): buat akun kasir/pengurus, reset password,
  aktif/nonaktif, ganti password sendiri, reset PIN user lain.
- **Audit Log** (`/admin/audit`): jejak semua mutasi + purge 90 hari.
- **Data & Backup** (`/admin/data`): unduh **backup JSON** penuh, import (ganti data),
  reset data operasional (dua kali konfirmasi; akun tetap ada).

## Desain "Blue Notebook"
- Canvas navy `#0A1220` (dark default), paper `#F6F8FC` (light)
- Aksen biru `#2563EB` (CTA), light `#93C5FD`
- Amber `#F59E0B` = status "Belum Dilapor" & peringatan (tenang, bukan merah)
- Tema dark/light: toggle header, tersimpan di cookie `theme` (default dark)

## Deploy
- Lokal/self-host: `npm run build && npm start` (pakai `DATABASE_URL=file:local.db`
  atau URL Turso).
- **Vercel (produksi saat ini):** DB = Turso (persisten). Env wajib:
  `DATABASE_URL`, `DATABASE_AUTH_TOKEN`; opsional `CRON_SECRET` (scheduler
  notifikasi), `VAPID_SUBJECT`. Vercel build dari branch **`main`**
  (main = cermin master, lihat state.txt).
- Situs Vercel lama (`kopontren-app.vercel.app`) adalah proyek Next.js terpisah
  (login email); proyek ini berdiri sendiri.

## Skema Data
- `users` (username, role, salt, pass_hash, active, pw_default), `user_pins`
  (pin_hash, failed_attempts, locked_until)
- `sessions` (token_hash, user_id, expires_at, last_activity)
- `products` (name, category, unit, base_price, cost_price, stock, active, barcode)
- `sales` + `sale_items` (harga per item dikunci saat transaksi; `client_ref`
  utk idempotensi antrean offline; status unreported/reported)
- `purchases`, `expenses`, `cash_entries` (pembukuan)
- `members` (poin, total_spent, qr_code) + `member_settings` (key-value loyalty)
  + `point_history` (ledger earn/void)
- `shifts` (rekap kasir per shift), `debts` (piutang), `payables` (hutang supplier)
- `returns` (retur), `consignments` (konsinyasi), `stores`, `audit_log`
- `notifications` + `notification_settings` + `notification_logs` +
  `push_subscriptions` + `vapid_keys`
- BMT: `zakat_settings` + `zakat_history`
- `settings` (key-value shop) — termasuk `session_timeout`

## Roadmap / Belum (lihat TODO.md)
- Terapkan perks member otomatis di POS: diskon member, cashback, promo
  ulang tahun, grosir, tier (setting ada, belum dipakai alur transaksi)
- Redemisi poin (poin → Rupiah/diskon)
- Pembayaran campuran (tunai + transfer) dalam satu transaksi
- Cetak label barcode
- Backup/restore mencakup debts/payables/returns/notifications
- QRIS asli (gateway) — modal QRIS saat ini mock
