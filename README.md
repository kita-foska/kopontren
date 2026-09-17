# Kopontren Al Ittihad — Kasir & Pembukuan (PWA Fullstack)

Aplikasi toko kasir + pembukuan multi-user untuk Kopontren Al Ittihad, dibangun ulang dari
versi Next.js lama dengan fitur lengkap (POS, stok, belanja, kas, laporan, backup) dan visual
**Blue Notebook**.

## Teknis
- Next.js 15 (App Router, TypeScript) + Tailwind CSS
- SQLite via `better-sqlite3` (file `data/kopontren.db`, nol konfigurasi DB)
- Auth: session cookie HttpOnly (scrypt hash), peran `admin` (pengurus) & `kasir`
- PWA: `public/manifest.json` + `public/sw.js` + ikon (installable)
- Zona waktu tampilan: Asia/Jakarta (WIB); data disimpan UTC

## Menjalankan
```bash
npm install
npm run dev      # http://localhost:3000
```
Database + akun awal dibuat otomatis saat pertama kali jalan.

**Login awal (wajib diganti!):**
- username: `admin`
- password: `kopontren`
- Setelah login, ganti lewat **Admin → Pengguna → Ganti password saya**
  (banner amber di beranda mengingatkan selama password default dipakai).

## Fitur per Peran

### Kasir
- **POS** (`/kasir`): grid produk + cari + filter kategori, keranjang qty, nama pembeli,
  metode bayar (Tunai/Transfer/WA), catatan. Harga & stok terkunci; stok berkurang otomatis.
  Transaksi tersimpan berstatus **Belum Dilapor** (amber — bukan error, hanya menunggu rekap).
- **Laporan & Rekap** (`/laporan`): filter periode/status, rincian per transaksi, tandai
  Sudah/Belum, tombol **Rekap WA** (pesan ASCII polos, aman semua versi WhatsApp —
  `navigator.share` → fallback `wa.me`).

### Pengurus / Admin (semua kasir + yang berikut)
- **Tandai Semua Laporan** dengan **Urungkan** (undo 8 detik), hapus transaksi (stok balik).
- **Produk** (`/admin/produk`): CRUD produk (nama, kategori, satuan, harga jual, HPP, stok),
  penyesuaian stok cepat, aktif/nonaktif.
- **Belanja & Pengeluaran** (`/admin/belanja`): stok masuk menambah stok + memperbarui HPP;
  pengeluaran operasional tercatat ke kas.
- **Kas / Pembukuan** (`/admin/kas`): saldo kas otomatis (jual + jurnal masuk − belanja −
  pengeluaran − jurnal keluar), tabel ledger, jurnal manual masuk/keluar.
- **Laporan** (`/admin/laporan`): ringkasan per periode (penjualan, HPP, laba kotor, kas
  keluar, arus neto, top produk, metode bayar) + unduhan **CSV**.
- **Pengguna** (`/admin/pengguna`): buat akun kasir/pengurus, reset password,
  aktif/nonaktif, ganti password sendiri.
- **Data & Backup** (`/admin/data`): unduh **backup JSON** penuh, import (ganti data),
  reset data operasional (dua kali konfirmasi; akun tetap ada).

## Desain "Blue Notebook"
- Canvas navy `#0A1220` (dark default), paper `#F6F8FC` (light)
- Aksen biru `#2563EB` (CTA), light `#93C5FD`
- Amber `#F59E0B` = status "Belum Dilapor" & peringatan (tenang, bukan merah)
- Tema dark/light: toggle header, tersimpan di cookie `theme` (default dark)

## Deploy
`npm run build && npm start` (lokal/self-host).
**Catatan penting untuk Vercel:** SQLite file bersifat sementara di Vercel — data akan
hilang saat redeploy/hibernasi. Untuk produksi awan, gunakan:
1. Self-host (VPS / mesin pengurus) — data permanen di `data/kopontren.db`, atau
2. Ganti layer DB ke Turso/libSQL atau Postgres (struk schema sudah rapi, tinggal port query).
Situs Vercel lama (`kopontren-app.vercel.app`) adalah proyek Next.js terpisah (login email);
proyek ini berdiri sendiri dan bisa menggantikan peran tersebut.

## Skema Data
- `users` (username, role, salt, pass_hash, active, pw_default)
- `sessions` (token_hash, user_id, expires_at)
- `products` (name, category, unit, base_price, cost_price, stock, active)
- `sales` + `sale_items` (harga per item dikunci saat transaksi — integritas data)
- `purchases`, `expenses`, `cash_entries` (pembukuan)

## Roadmap
- HPP historis per penjualan (laba per transaksi benar-benar historis)
- Harga bertingkat per kuantitas (tiering madu sachet)
- Migrasi DB awan (Turso) untuk Vercel
- Push notification untuk stok menipis
