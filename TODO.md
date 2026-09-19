# TODO — Kopontren Al Ittihad

Prioritas: [!] tinggi · [m] sedang · [r] rendah.

## Bug / konsistensi (hasil audit 18 Sep 2026)
- [x] Anti brute-force `/api/auth/login` (throttle per username+IP) — SELESAI
- [x] `pin/change`: PIN lama salah kini menghitung lockout (konsisten
      dgn `pin/verify`) — SELESAI
- [x] Loyalty points memakai `member_settings.points_every` (dulu
      hard-coded Rp 10.000) di POST /api/sales + estimasi di POS — SELESAI
- [x] Ledger `point_history` tertulis (earn saat jual, void saat hapus
      transaksi) — SELESAI
- [x] `ref-cache` diberi cap 256 key (key `members:totals:<q>` dulu
      tak berujung) — SELESAI
- [x] Retur: qty plafon = (qty terjual − sudah diretur) — SELESAI
- [x] `CRON_SECRET` dipbandingkan constant-time — SELESAI
- [x] `/api/products`: `role` dihapus dari payload yang di-cache
      browser — SELESAI
- [r] Backup GET/POST: pesan 403 "Hanya pengurus" → "Hanya admin"
      (guard-nya `isAdmin`) — SELESAI
- [r] `pin/reset`: validasi integer `user_id` — SELESAI

## Fitur (gap fungsional)
- [m] Terapkan perks member di alur POS: diskon member, cashback
      (saldo member), promo ulang tahun, grosir, tier Silver/Gold.
      Setting-nya sudah ada (`member_settings` + halaman
      /admin/pengaturan-member) tapi belum dipakai transaksi.
- [m] Redemisi poin: tukar poin → Rupiah/diskon (ledger
      `point_history` sudah siap dipakai; butuh route + UI di POS/admin).
- [m] Backup/restore memperluas cakupan: `debts`, `payables`, `returns`,
      `notifications` (+ log push).
- [m] Pembayaran campuran dalam satu transaksi (tunai + transfer) —
      saat ini satu `pay_method` saja.
- [r] QRIS asli (gateway/NMID resmi) — modal QRIS di POS masih mock SVG.
- [r] Cetak label barcode produk (cetak struk & scan sudah ada).
- [r] `debts` & `payables`: ringkasan `date('now')` (UTC) bisa meleset
      ±7 jam utk jatuh tempo tengah malam — badge per-baris sudah
      dihitung client-side WIB; agregat server opsional diperbaiki.
- [r] Notifikasi `cash_low`: pemicu `notifyCashBalance()` mengecek saldo
      kas penuh (5 query SUM) tiap jurnal — throttled dedupe 60 mnt,
      biarkan tapi pantau Rows Read.

## Performa (status: BERSIH)
- [x] Target Turso Rows Read < 3.000 tercapai: list cap 50 baris,
      agregat di-cache 60 dtk + invalidasi, N+1 dibatch, gate
      `schema_version` (cold start 1 SELECT). `next build` 48 page,
      First Load JS maks ±123 kB (POS lazy).
- [r] `notifyStockAfterSale` menjalankan loop per produk (tiap notify =
      beberapa round-trip). Batasi: group/limit produk per transaksi.
- [r] `reports/csv` tanpa batas baris (manager-only, aman, tapi
      "sejak awal" = baca seluruh sale_items).

## Catatan
- BMT/zakat: ada & berfungsi penuh (di luar scope audit kali ini).
- Vercel: build dari `main`; setelah commit di `master`, mirror main
  (reset --hard + push -f).
