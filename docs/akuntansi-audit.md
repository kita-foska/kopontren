# Audit Akuntansi — Fase 3 "Akuntansi Terbaru" (A.1)

> Kopontren Al Ittihad — aplikasi KasirKopontren (`kopontren-app`, repo `D:\Ngudi Susilo\kopontren-app`)
>
> - Tanggal: 29 Sep 2026
> - Status: **DRAFT UNTUK TASHIH** — hasil audit read-only (fakta aplikasi).
>   Tim app TIDAK menyimpulkan fiqih/standar akuntansi syariah sendiri:
>   semua item yang menyentuh standar (SAK EP, SAK Syariah, DSN-MUI,
>   PAP, PSAK 112, ISAK 35) dan hukum transaksi = **PERLU TASHIH**
>   pengurus + pengasuh. Pola dokumen: sama dengan `P3-TASHIH-ZAKAT.md`
>   ("opsi teknis aplikasi; hukum tiap opsi diputuskan ulama").
> - Prinsip: **Syariah nomer 1, fitur nomer 2.**
> - Referensi standar yang disebut di dokumen ini (SAK EP ef. 1 Jan 2025,
>   SAK Syariah, PAP BI+MUI, PSAK 112, DSN-MUI Fatwa, ISAK 35, ED SAK
>   Koperasi) = *daftar dari arahan Gus Fi 29 Sep*; **isi & relevansi
>   masing-masing belum diverifikasi app** — verifikasi = bagian tashih.

---

## 0. Ringkasan Eksekutif

Aplikasi saat ini adalah **buku kas + laporan turunan (derived reports)**,
bukan sistem akuntansi:

1. **Single-entry, basis kas.** Tidak ada Bagan Akun (COA), tidak ada
   jurnal berdebit-kredit, tidak ada buku besar, neraca saldo, atau
   jurnal penyesuaian. Kas dihitung sebagai agregat transaksi:
   `Σsales + Σcash_in − Σpurchases − Σexpenses − Σcash_out`
   (rumus kanonik `/api/kas`, di-reuse `lib/neraca.ts`).
2. **Tiga "laporan" V1 sudah ada** (fase A1/A2/A3 lama, bukan akuntansi
   final): Laba-Rugi Operasional V1 (`/api/keuangan`), Neraca Sederhana
   V1 snapshot (`/api/neraca`), dan kartu "Arus Kas Neto" di tab
   Ringkasan (`/api/reports` `cash_net`). Tidak ada Laporan Perubahan
   Ekuitas, tidak ada Laporan Arus Kas formal, tidak ada CALK.
3. **Ekuitas formal tidak dimodelkan.** "Modal Setara" di neraca V1
   = aset − kewajiban; sistem tidak menyimpan saldo awal / modal
   disetor (label "setara" disengaja, `lib/neraca.ts`).
4. **Shariah-aware secara parsial & provisional**: modul zakat tijarah
   (FASE 2, status PROVISIONAL menunggu tashih P3), komisi konsinyasi
   sebagai ujrah (FASE P4, akad wakalah bil ujrah, default 20% —
   "jangan anggap 20% ketentuan syariah"), loyalty (poin/cashback)
   di-treat sebagai potongan/hibah bukan bunga (SYARIAH-CHECKLIST B).
   **Tidak ada** pemisahan dana ZIS/wakaf, tidak ada modul akad
   murabahah/mudharabah/musyarakah/ijarah, tidak ada aset wakaf,
   tidak ada simpanan pokok/wajib/sukarela, tidak ada SHU.
5. **Kualitas data kuat**: 14 cek rekonsiliasi flag-only
   (`lib/rekonsiliasi.ts`, kontrak INV-1..7 `docs/qa/DATA-INVARIANTS.md`),
   audit trail per-user + diff, snapshot COGS retur (V2-2), skema v20
   migrasi idempoten.
6. **Kesimpulan audit**: aplikasi sudah *siap sebagai sumber data*
   untuk upgrade akuntansi (data transaksi, snapshot harga, rekonsiliasi,
   pola modul bebas-import + test node:sqlite). Yang hilang adalah
   **lapisan akuntansi** (COA → jurnal → buku besar → laporan formal →
   pemisahan dana syariah/koperasi), dan itu **tergantung tashih**
   untuk bagian syariah/koperasi.

---

## 1. Metode & Sumber Data

Read-only (tanpa perubahan kode), 29 Sep 2026:

| Sumber | Isi audit |
|---|---|
| `src/db.ts` (skema v20, `SCHEMA_VERSION = 20`) | Daftar tabel & kolom — cek ada/tidaknya COA/jurnal/GL |
| `src/app/api/kas/route.ts` + `lib/pay-methods.ts` | Rumus saldo kas, metode bayar (cash/tf/wa, split) |
| `src/lib/keuangan.ts` + `api/keuangan/` + CSV | Laba-Rugi V1 (keputusan A1 + V2-2) |
| `src/lib/neraca.ts` + `api/neraca/` | Neraca Sederhana V1 (keputusan A3) |
| `src/lib/rekonsiliasi.ts` + `docs/qa/DATA-INVARIANTS.md` | 14 cek + kontrak INV-1..7 |
| `src/lib/zakat-*.ts` + `api/zakat/*` + skema v17/v18 | Modul zakat (PROVISIONAL P3) |
| `src/lib/konsinyasi.ts` + `api/konsinyasi` (P4) | Ujrah wakalah bil ujrah (PROVISIONAL) |
| `SYARIAH-CHECKLIST.md`, `P3-TASHIH-ZAKAT.md`, `P4-PROPOSAL-KONSINYASI.md`, `TODO.md` (Fase 3 + larangan prabatasih), `MEMORY.md` | Konteks syariah & aturan kerja |
| `kp-zip3` (reference-only, snapshot beku) | Konfirmasi: referensi pun TIDAK punya COA/jurnal/GL |
| `scripts/test-*.ts` | Pola test (modul bebas-import, DB in-memory) |

Perlu dicatat: `kp-zip3` adalah snapshot terbeku dari app yang sama
(lib `keuangan.ts`/`neraca.ts`/`zakat-*.ts` identik bentuk, tanpa modul
jurnal/COA) → **tidak ada desain buku besar siap pinjam** di referensi;
lapisan akuntansi baru = desain dari nol di app ini.

## 2. Dimensi A — Akuntansi Saat Ini

| Item | Status | Bukti |
|---|---|---|
| Single-entry / double-entry | **Single-entry / basis kas** | Tidak ada tabel akun/jurnal; kas = agregat transaksi (`api/kas` kasAgg, `lib/neraca.ts` baris rumus) |
| Bagan Akun (COA) | **TIDAK ADA** | Skema v20: tidak ada tabel `accounts`/`coa` |
| Jurnal (formal, 2 sisi) | **TIDAK ADA** | `cash_entries` = jurnal kas manual 1 sisi (type income/expense + label + nominal); transaksi lain tidak menulis jurnal |
| Buku besar (GL) | **TIDAK ADA** | Tidak ada tabel per-akun; agregat selalu dihitung dari tabel transaksi |
| Neraca saldo | **TIDAK ADA** | Tidak ada mekanisme saldo akun yang bisa disandingkan |
| Jurnal penyesuaian (penutup/penyesuai) | **TIDAK ADA** | Tidak ada konsep periode/penutup; laporan = query rentang tanggal ad-hoc |

Yang ADA dan relevan:
- Tabel transaksi: `sales` (+`sale_items`, `returns`, `sale_cancellations`),
  `purchases`, `expenses`, `cash_entries`, `debts` (piutang),
  `payables` (hutang), `consignments` (konsinyasi P4).
- Snapshot COGS: `sale_items.cost_price` + `returns.cogs` (V2-2, skema
  v20) → basis HPP terlacak per transaksi.
- Shift kasir: `shifts` (sales_count/sales_total/cash_total/by_method,
  status open/closed) — kontrol kasir, bukan jurnal.
- Pengendataan integritas: `lib/rekonsiliasi.ts` (14 cek, flag-only
  read-only: SALES_PAY, SALES_MONEY, SPLIT, SHIFT, RETURN, STOCK, DEBTS,
  PAYABLES, POINTS, CASHBACK, KONSIN, KONSIN_UJRAH, KONSIN_PAY,
  RETURN_COGS) + `docs/qa/DATA-INVARIANTS.md` INV-1..7 + test
  `scripts/test-rekonsiliasi.ts`.
- Audit trail: `audit_log` per-user (aksi, tabel, record, old/new value
  JSON, user_name/role/IP/UA — skema v11).

## 3. Dimensi B — Laporan Keuangan Saat Ini

| Laporan | Status | Keterangan |
|---|---|---|
| Laporan Posisi Keuangan (Neraca) | **Ada, versi sederhana V1** — `lib/neraca.ts` + `/api/neraca` + tab "Neraca" di `/admin/laporan` | Snapshot tanpa periode: Aset = kas + stok (harga beli) + piutang (remaining open); Kewajiban = hutang (remaining open) + cashback member; Konsinyasi terbuka = off-balance memo; "Modal Setara" = aset − kewajiban (**bukan ekuitas formal**; tidak ada saldo awal/modal disetor). Guard tier `laporan`; cache 60 dtk. |
| Laba-Rugi | **Ada, V1 operasional** — `lib/keuangan.ts` + `/api/keuangan` + CSV | Pendapatan bruto/neto (diskon manual, diskon member, redeem, retur), HPP bruto + netting COGS retur (V2-2 `hppRetur`), Laba Kotor, Beban per kategori (expenses.category), Laba Bersih; MEMO: cashback (kewajiban, bukan beban), zakat (dari `zakat_history`, difilter `paid_at`), settlement konsinyasi (`cash_entries` expense 'Kon. …'), ujrah konsinyasi (`cash_entries` income 'Ujrah Kon. …' — off-P&L). Catatan teknis `KEUANGAN_NOTES` tampil di UI. |
| Perubahan Ekuitas | **TIDAK ADA** | Ekuitas tidak dimodelkan (lihat Neraca di atas) |
| Arus Kas | **Tidak formal** | Hanya kartu "Arus Kas Neto" (masuk − keluar) di tab Ringkasan (`/api/reports` `cash_net`) + halaman `/admin/kas` (feed 50 baris × 4 sumber + jurnal manual kas). Bukan LAK per aktivitas (operasi/investasi/pembiayaan). |
| Catatan Atas LK (CALK) | **TIDAK ADA** | `*_NOTES` yang ada = catatan teknis V1 untuk UI, bukan CALK |
| Laporan pendukung lain | Ada | `/api/reports` (KPI periodik: penjualan, HPP, laba, cash_net), rekap WA mingguan (`lib/rekap.ts` + `buildLabaRugiWa`), rekonsiliasi, audit log, shif |

## 4. Dimensi C — Gap Analysis vs Standar

> **PERLU TASHIH (semua baris):** rincian/kecocokan tiap standar di bawah
> belum diverifikasi oleh app; ini *pertanyaan untuk pengurus+pengasuh +
> rujukan standar asli*, bukan vonis kepatuhan.

### 4.1 SAK EP (SAK Entitas Privat, efektif 1 Jan 2025)
| Aspek | Posisi app | Gap / pertanyaan tashih |
|---|---|---|
| Basis akuntansi | Kas (transaksi) | SAK EP → akrual: selisih piutang/hutang, penyusutan, akrual beban. **Apakah Kopontren wajib/ingin SAK EP (kelas entitasnya apa — LKE/EP kecil)?** |
| COA + jurnal | Tidak ada | Inti upgrade (commit F3.4a–c, §9) |
| Inventori | Harga beli (HPP) snapshot | Kecocokan dgn metode SAK EP (RNB/AVG) — PERLU TASHIH |
| Ekuitas | "Modal Setara" | Saldo awal/modal disetor tidak tercatat → migrasi data (F3.6) |
| LK lengkap | 2 dari 5 laporan | LPE, LAK formal, CALK belum ada (F3.4d, F3.4g) |
| Entitas | Asumsi "privat" (arahan Gus Fi) | Kopontren = badan **koperasi** → SAK EP vs ED SAK Koperasi vs SAK Syariah? **PERTANYAAN AKAR tashih** |

### 4.2 SAK Syariah / DSN-MUI (untuk entitas syariah)
| Aspek | Posisi app | Gap / pertanyaan tashih |
|---|---|---|
| Akun syariah (ZIS, wakaf, bagi hasil) | Tidak ada; zakat hanya `zakat_history` (memo P&L) | Pemisahan dana sosial (zakat/infak/sedekah/wakaf) belum ada (F3.4f) |
| Akad (murabahah, mudharabah, musyarakah, ijarah, wakalah) | Hanya wakalah bil ujrah (konsinyasi, PROVISIONAL) | Akad lain: masuk lingkup sekarang/tidak? Detail aturan = PERLU TASHIH |
| Bagi hasil | Tidak ada | Mudharabah/musyarakah belum dimodelkan |
| Riba | Tidak ditemukan mekanisme bunga/denda-ke-pendapatan (SYARIAH-CHECKLIST B: loyalty = potongan/hibah, [x]) | Pertahankan; verifikasi ulang saat tashih |
| Fatwa DSN-MUI (mis. zakat, wakaf) | Referensi zakat sudah dikoreksi (MUI Fatwa 78/2023, judul menunggu pengasuh; koreksi sitasi 26 Sep di P3-TASHIH-ZAKAT §D) | Tashih P3 masih terbuka → jangan finalkan zakat sebelum Fase 3 selesai |

### 4.3 PAP (Pedoman Akuntansi Pesantren, BI + MUI)
| Aspek | Posisi app | Gap / pertanyaan tashih |
|---|---|---|
| Peta akun spesifik pesantren | Tidak ada | App tidak memiliki teks PAP → **PERLU TASHIH + akses dokumen PAP**. Pemetaan akun PAP = bagian proposal desain, bukan audit |
| Dana pesantren vs unit usaha | Hanya unit usaha (toko POS); dana pesantren tidak tercatat di app | Kapan dana pesantren masuk (sekarang/tidak)? |

### 4.4 Lain-lain
- **PSAK 112 (Akuntansi Wakaf):** tidak relevan selama belum ada pencatatan
  aset wakaf (F3.4f/opsi 3) — **PERLU TASHIH** (apakah Kopontren punya
  aset wakaf yang wajib dikelola/dilaporkan?).
- **ISAK 35 (Entitas Nirlaba):** relevan HANYA JIKA Kopontren
  mengadopsi struktur nirlaba — bertabrakan dgn status koperasi;
  **PERLU TASHIH** (jawaban: kemungkinan tidak relevan; konfirmasi pengasuh).
- **ED SAK Koperasi:** status finalisasi belum diverifikasi app;
  **PERLU TASHIH + riset dokumen**.

### 4.5 Kesenjangan Utama (faktual, tidak bergantung standar)
1. Tidak ada COA/jurnal/GL/neraca saldo/penyesuaian (§2) — inti upgrade.
2. Basis kas, bukan akrual — piutang/hutang ada sebagai saldo (remaining)
   tapi tidak mempengaruhi P&L (integrasional: piutang = off-POS).
3. Ekuitas tidak terdefinisi (tidak ada saldo awal) → angka "Modal
   Setara" tidak bisa diaudit ke sumber.
4. Dana syariah & dana koperasi belum terpisah (§5–§6).
5. Label "V1/sederhana" di 3 laporan = eksplisit BUKAN akuntansi final
   (`NERACA_NOTES`, `KEUANGAN_NOTES`) → upgrade F3.4d mengganti
   sumber angka dari GL, bukan mengedit rumus V1 diam-diam.

## 5. Dimensi D — Struktur Koperasi

| Item | Status | Bukti |
|---|---|---|
| Simpanan Pokok | **TIDAK ADA** | Tidak ada tabel/fitur simpanan |
| Simpanan Wajib | **TIDAK ADA** | — |
| Simpanan Sukarela | **TIDAK ADA** | — |
| SHU (Sisa Hasil Usaha) | **TIDAK ADA** | Tidak ada perhitungan SHU; P&L V1 = laba neto (istilah korporat, bukan istilah koperasi). Distribusi (cadangan/jasa anggota/dana pendidikan) tidak ada |
| Partisipasi anggota | **Hanya loyalty** | `members` = program member POS (poin, cashback, perk, QR); BUKAN keanggotaan koperasi. Syar'i secara checklist (poin/cashback = potongan/hibah, bukan bunga — SYARIAH-CHECKLIST B [x]) |
| Modal penyertaan | **TIDAK ADA** | Tidak ada pencatatan modal per anggota/pemilik |

**Pertanyaan tashih:** apakah Kopontren legal badannya (a) koperasi
simpan-pinjam/usaha, (b) unit usaha pesantren (bukan koperasi), atau
(c) hybrid — dan apakah struktur simpanan + SHU harus dimodelkan
sekarang (skala kecil: bisa cukup akun + jurnal manual dulu).

## 6. Dimensi E — Pemisahan Dana Syariah

| Item | Status |
|---|---|
| Pemisahan dana komersial vs sosial (ZIS) | **TIDAK ADA.** Zakat tercatat di `zakat_history` (+memo P&L), bukan sebagai dana/akun terpisah. Infak/sedekah/wakaf: tidak tercatat di app (kalau ada, tercatat manual di luar sistem → gap) |
| Akad murabahah / mudharabah / musyarakah / ijarah | **TIDAK ADA** modul |
| Wakalah bil ujrah | **ADA (PROVISIONAL)** — komisi konsinyasi P4: default 20% (`konsinyasi_commission`, setting), kas masuk otomatis 'Ujrah Kon. …' saat barang terjual; tagihan pemilik NETO komisi. Status menunggu tashih P4 ("jangan anggap 20% ketentuan syariah") |
| Bagi hasil | **TIDAK ADA** |
| Kontrol anti-riba | Checklist SYARIAH-CHECKLIST B (tidak ada bunga/denda-ke-pendapatan; denda wajib ke kas sosial — **catatan: mekanisme "denda ke kas sosial" belum ada di app karena memang tidak ada skema denda saat ini**) |

## 7. Dimensi F — Khusus Pesantren

| Item | Status |
|---|---|
| Aset wakaf | **TIDAK ADA** modul (relasi PSAK 112: tidak teruji) |
| Dana kebajikan / dana pesantren | **TIDAK ADA** pencatatan di app |
| Unit usaha pesantren | **ADA** — toko POS (produk, stok, konsinyasi, grosir, multi-store `stores` table siap, QRIS, shift, margin guard). Unit = satu "toko"; tidak ada multi-unit usaha (madrasah, asrama, pertanian, dll.) dimodelkan |

## 8. Isu & Risiko yang Menyentuh Fase 3 (faktual)

| # | Isu | Dampak utk Fase 3 |
|---|---|---|
| R1 | **Zakat UTC known-issue** (MEMORY: `paid_at`/periode zakat rentan interpretasi UTC vs WIB) | Jika GL + periode formal dibangun, bug zona waktu lama ikut terbawa ke jurnal zakat → wajib difix dalam F3 (atau sebelum F3.4d memakai zakat dari GL) |
| R2 | **Neraca off-balance membaca tabel legacy `consignment_items`** (catatan rekonsiliasi #7: data P4 ada di `consignments`) | Neraca V1 punya sumber data ganda; upgrade GL harus memilih satu sumber (`consignments`) + cleanup |
| R3 | **Tidak ada saldo awal** (Modal Setara ≠ ekuitas) | Migrasi data F3.6 wajib (buka buku: kas, stok, piutang, hutang, cashback @ tanggal N) — desain akun pembuka = item tashih |
| R4 | **Konflik label fase lama vs plan baru**: "FASE A1/A2/A3" sudah dipakai utk Laba-Rugi/Arus Kas/Neraca V1; plan Gus Fi memakai A.1–A.7 | Rekomendasi: label baru **F3.1–F3.9** (lihat §9) agar commit log tak ambigu |
| R5 | **Turso Rows-Read** (agregat global termahal; cache TTL 60 dtk 'kas:'/'neraca:'/'keuangan:'); `db.exec` per-statement HTTP | Desain GL harus: agregat via kolom saldo (running balance) atau cache; hindari full-scan Σ per render UI |
| R6 | **Tashih P3 (zakat) & P4 (konsinyasi) masih terbuka** — TODO larangan prabatasih: jangan finalkan 24K/market/haul/20%, jangan ubah mapping akuntansi P4 diam-diam | F3.4f (dana syariah) harus kompatibel: jangan merefactor modul zakat/konsinyasi sampai tashih P3/P4 turun; bangun **sekitarnya** (akun, jurnal), biarkan sumber angka tetap di modul lama sampai tashih |
| R7 | Pola test: modul bebas-import + DB in-memory (`scripts/test-*.ts`) | Modul GL baru WAJIB ikut pola ini (test golden path F3.5) |
| R8 | `kp-zip3` beku & tidak punya GL | Tidak ada desain pinjam; seluruh lapisan akuntansi = desain baru (tingkat kompleksitas penuh, bukan porting) |

## 9. Rekomendasi — Opsi & Trade-off (opsi teknis app; hukum/syarat = tashih)

> Prinsip dokumen tashih: **tim app menyajikan opsi; pengurus + pengasuh
> memutuskan.** Tidak ada opsi yang dipoposisi sebagai "yang benar".

### Opsi 1 — COA + Jurnal + Auto-Posting (tanpa GL full)
- Tabel `accounts` (COA hierarkis: komersial / ZIS / koperasi / wakaf)
  + `journal_entries`/`journal_lines` (2 sisi) + auto-posting dari
  POS/kas/belanja/debts/payables/konsinyasi + buku besar & neraca
  saldo per akun + 5 laporan formal (Laporan Posisi Keuangan, Laba-Rugi,
  Perubahan Ekuitas, Arus Kas, CALK-lite) + pencatatan ZIS sebagai
  akun kas sosial (input manual sederhana).
- **Pro:** menjawab kebutuhan laporan formal + pemisahan dana ZIS dgn
  biaya kompleksitas terendah; laporan V1 (keuangan/neraca) tetap jalan
  paralel sampai diverifikasi; shu/simpanan = akun + jurnal manual.
- **Contra:** belum ada modul akad (murabahah dkk. tidak ada),
  simulasi bagi hasil tidak ada; SHU/distribusi = manual.
- Estimasi: ~8–12 commit.

### Opsi 2 — Opsi 1 + Modul Akad & Bagi-Hasil
- Tambah modul akad (murabahah / mudharabah / musyarakah / ijarah /
  wakalah) dgn entitas akad (pihak, nominal, jangka, nisbah, settlement),
  jurnal otomatis per akad, laporan bagi hasil.
- **Pro:** entitas syariah utuh (SAK Syariah).
- **Contra:** lingkup besar; aturan tiap akad = PERLU TASHIH penuh
  (nisbah, denda, ma'rudh); UI per akad; risiko over-engineer
  (Q95) jika volume akad saat ini kecil.
- Estimasi: Opsi 1 + 6–10 commit.

### Opsi 3 — Opsi 2 + Struktur Koperasi & Wakaf
- Tambah simpanan pokok/wajib/sukarela per anggota, SHU + distribusi
  (cadangan/jasa anggota), aset wakaf (PSAK 112), penggabungan PAP
  (peta akun pesantren) — jika PAP relevan hasil tashih.
- **Pro:** paling lengkap secara entitas (koperasi + pesantren + syariah).
- **Contra:** scope terluas (±20 commit tambahan); butuh banyak
  keputusan tashih serentak; dependensi status badan hukum (pertanyaan
  akar §5).

**Rekomendasi app (bukan keputusan):** **Opsi 1** sebagai fondasi
Fase 3 (auto-posting + COA + ZIS + 5 laporan + migrasi saldo awal),
lalu **Opsi 2 bertahap** (akad yang benar-benar ada di lapangan dulu —
saat ini hanya wakalah bil ujrah), Opsi 3 hanya jika tashih
menetapkan badan = koperasi resmi dgn simpanan anggota.

## 10. Ruang Lingkup Upgrade (draft — label F3.x, pengganti A.4a–g rancangan)

| Commit | Scope | Catatan |
|---|---|---|
| F3.1 | docs: audit + gap (dokumen ini) | = A.1; dibuat di commit ini |
| F3.2 | docs: proposal desain (COA, skema jurnal, auto-posting, 5 laporan, akun ZIS, migrasi saldo awal) | ditunggu ACC A.2 |
| F3.3 | (tashih) presentasi pengurus + pengasuh + revisi hasil tashih | dokumen tashih baru (pola `P3-TASHIH-ZAKAT.md`); revisi = commit terpisah (aturan P3/P4) |
| F3.4a | feat: COA (tabel accounts + seed) + jurnal manual (tabel + UI dasar) | modul bebas-import, pola `lib/neraca.ts`; test `scripts/test-gl.ts` |
| F3.4b | feat: auto-posting dari POS / kas / belanja / piutang-hutang / konsinyasi | satu tx per transaksi; invalidate cache 'kas:'/'keuangan:'/'neraca:'; rekonsiliasi cek baru (Σ jurnal = Σ sumber) |
| F3.4c | feat: buku besar + neraca saldo | query per-akun; cache (R5) |
| F3.4d | feat: 5 laporan formal (Laporan Posisi Keuangan, Laba-Rugi, Perubahan Ekuitas, Arus Kas, CALK-lite) | laporan V1 lama TIDAK dihapus (paralel s/d rekonsiliasi F3.5 green) |
| F3.4e | feat: SHU + distribusi (jika ACC & tashih) | |
| F3.4f | feat: pemisahan dana syariah (akun ZIS + input zakat/infak/sedekah/wakaf) | **tidak** refactor modul zakat P3 (R6) — jembatan: jurnal dari `zakat_history` + input manual |
| F3.4g | feat: CALK + catatan (disclaimer standar, basis, kejadian material) | |
| F3.5 | test: golden path akuntansi + rekonsiliasi GL vs laporan V1 (angka harus identik: kas V1 = kas GL, dsb.) | tambah `docs/qa` INV baru + `test-gl.ts` |
| F3.6 | feat: migrasi data (buku pembuka saldo awal @ tanggal N) | satu tombol admin + undo via backup |
| F3.7 | docs: SOP akuntansi + dokumentasi (update SOP-ADMIN/SOP-PENGURUS) | |

## 11. Estimasi Commit & Timeline

- **Total: 15–25 commit** (sesuai rencana Gus Fi), rincian F3.x di §10.
  Opsi 1 ≈ 9–12, Opsi 2 ≈ 15–22, Opsi 3 ≈ 25.
- **Timeline: 4–8 minggu**, dominan oleh **tashih** (F3.3):
  - Pra-tashih (audit F3.1 + proposal F3.2): 1 minggu.
  - Tashih pengurus + pengasuh: tidak terjadwal (tergantung forum) —
    seluruh F3.4* BLOCK sampai ACC + hasil tashih turun.
  - Pasca-ACC: implementasi 3–6 minggu (urutan F3.4a→g → F3.5 → F3.6 → F3.7).
- Semua commit: show diff → commit subject ASCII-safe → dual-push
  `origin/master` + `origin/main` → verifikasi `git ls-remote`.

## 12. Checklist Tashih (bahan F3.3 — pertanyaan untuk pengurus + pengasuh)

> Format mengikuti `P3-TASHIH-ZAKAT.md`: pertanyaan terbuka + opsi
> teknis; jawaban = keputusan ulama/pengurus, bukan app.

1. **Entitas:** badan hukum Kopontren = koperasi / badan usaha pesantren /
   nirlaba? Standar yang diadopsi: SAK EP / SAK Syariah / PAP / hybrid?
   (Ini pertanyaan akar: menentukan Opsi 1 vs 2 vs 3.)
2. **Basis:** akuntansi akrual penuh atau kas+penyesuaian (SME kecil)?
3. **Buku pembuka:** tanggal N & saldo awal yang diakui (kas, stok @
   HPP, piutang, hutang, cashback beredar)?
4. **Zakat/infak/sedekah:** dicatat sebagai akun kas sosial terpisah
   (input manual) — setuju? (Tanpa mengubah modul P3 sebelum tashih P3)
5. **Wakaf:** apakah ada aset wakaf yang wajib tercatat (PSAK 112)?
6. **Akad syariah:** dari {murabahah, mudharabah, musyarakah, ijarah,
   wakalah} — akad mana yang BENAR-BENAR terjadi di lapangan saat ini
   (saat ini: wakalah bil ujrah konsinyasi, provisional)? Yang mana
   butuh modul sekarang vs nanti?
7. **Koperasi:** simpanan pokok/wajib/sukarela + SHU (distribusi
   cadangan/jasa anggota) — dimodelkan sekarang (jurnal manual) atau
   modul penuh?
8. **Loyalty (poin/cashback):** konfirmasi tetap sebagai
   potongan/hibah (SYARIAH-CHECKLIST B), treatment akuntansi apa?
9. **PAP:** ketersediaan teks PAP + peta akun pesantren yang harus
   diikuti (jika ada, sumber dokumennya dari mana?).
10. **Laporan untuk publik:** apakah LK formal (5 laporan + CALK) akan
    dilaporkan ke pihak tertentu (kemenkop, MUI, donatur)? Frekuensi?
11. **Zakat UTC (R1):** fix zona waktu WIB untuk periode zakat — bagian
    Fase 3 atau fix terpisah lebih dulu?
12. **Legacy `consignment_items` (R2):** hapus / pisah / gabungkan dgn
    `consignments`?

## 13. Batasan & Aturan Kerja (reminder)

- Cline hanya mengurai fakta aplikasi; **AI tidak menyimpulkan fiqih /
  standar akuntansi syariah**. Item §4–§7 yang menyentuh hukum/standar
  semuanya PERLU TASHIH.
- **Cline tidak implementasi sebelum tashih** (alur: audit → proposal →
  tashih → implementasi bertahap).
- Dual-push disiplin; show diff sebelum commit; commit subject ASCII-safe
  (via `[IO.File]::WriteAllLines` no-BOM); tidak commit `sw.js` berstempel.
- Visual check Gus Fi berjalan terus, tidak blocking.

*— Akhir audit A.1 (read-only). Lanjut: F3.2 proposal desain, menunggu
ACC Gus Fi. —*
