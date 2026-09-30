# Proposal Desain Akuntansi — Fase 3 "Akuntansi Terbaru" (F3.2)

> Kopontren Al Ittihad — aplikasi KasirKopontren (`kopontren-app`,
> repo `D:\Ngudi Susilo\kopontren-app`)
>
> - Tanggal: 29 Sep 2026
> - Status: **DRAFT UNTUK KEPUTUSAN GUS FI (F3.3)** — proposal teknis
>   Cline. Alur baru (keputusan 29 Sep): Cline mengusulkan, **Gus Fi
>   meninjau + memutuskan langsung** (pengasuh mengikuti keputusan
>   Gus Fi; tidak ada forum pengurus+pengasuh terpisah).
> - Prinsip: **Syariah nomer 1, fitur nomer 2.**
> - Cline TIDAK memutuskan fiqih/standar: semua item bernilai syariah
>   (nisbah, rate zakat, rasio SHU, akad terms) ditandai
>   **PERLU KEPUTUSAN GUS FI** — Cline hanya menyajikan opsi teknis.
> - Dasar: `docs/akuntansi-audit.md` (A.1, commit `84a3266`).
> - **Revisi 30 Sep 2026 (pasca-F3.3):** jawaban tashih Gus Fi
>   ter-rekam di `docs/akuntansi-keputusan.md` — 12 Setuju, 0 Ora
>   Setuju, 2 Koreksi: #6 (tidak ada denda keterlambatan) & #14
>   (wakaf AKTIF, revisi keputusan #7). Rincian perubahan: §15.

---

## 0. Ringkasan Eksekutif + Catatan 12 Keputusan

Proposal ini = implementasi **Level C (struktur koperasi penuh)** dgn
standar **hybrid PRIORITAS SYARIAH** (SAK Syariah utama, PAP, SAK EP
fallback), di atas fondasi Opsi 1 (COA + jurnal double-entry +
auto-posting + 5 laporan) + Opsi 2 (modul akad) + Opsi 3 (koperasi).

Tabel keputusan final (Gus Fi, 29 Sep 2026):

| # | Item | Keputusan |
|---|---|---|
| 1 | Badan hukum | **Koperasi resmi** (proses registrasi berjalan) |
| 2 | Standar | **Hybrid — PRIORITAS SYARIAH** (SAK Syariah + PAP + SAK EP) |
| 3 | Level struktur | **C — Full koperasi** (simpanan + SHU + modal penyertaan) |
| 4 | COA | **B — Menengah, ±40–60 akun** (proposal: 52 akun, §2) |
| 5 | ZIS | **A — Perlu** (pemisahan akun ZIS, §8) |
| 6 | SHU | **A — Perlu** (hitung + distribusi, §7) |
| 7 | Wakaf | **AKTIF** (revisi F3.3 #14, 30 Sep 2026 — dari "B — Belum sekarang"; §8, §15) |
| 8 | Auto-posting | **B — Bertahap** (Wave 1/2/3, §4) |
| 9 | Saldo pembuka | **A — Saat implementasi** (Wave 6, §10) |
| 10 | Laporan | **A — 5 lengkap** (Posisi Keuangan, Laba-Rugi, LPE, LAK, CALK, §5) |
| 11 | Modul akad | **A — Bareng fondasi** (Wave 3, §6) |
| 12 | Timeline | **B — Menengah, 6 minggu** (±30 commit, §12) |

Estimasi total: **28–32 commit, 6 wave, 6 minggu** (rincian §12).
Semua angka syariah di dokumen ini = **placeholder teknis**,
bukan ketentuan — keputusan nilai = **Gus Fi** (§13).
**PASCA-F3.3 (30 Sep 2026): semua 14 poin §13 terjawab** (12 Setuju,
2 Koreksi #6 & #14 — lihat §15 + `docs/akuntansi-keputusan.md`).

---

## 1. Konteks Legal & Standar

### 1.1 Dual-entity design

| Entitas | Status | Representasi di app |
|---|---|---|
| **Koperasi Kopontren** (resmi, registrasi berjalan) | Utama | COA penuh, simpanan, SHU, akad, ZIS — semua tabel baru Fase 3 |
| **Pesantren Al Ittihad** (unit non-komersial) | Pendamping | Akun memo grup 69xx (PAP) — dana pesantren tercatat terpisah, bukan dicampur dgn kas toko |

- Sampai registrasi koperasi tuntas, laporan berjalan dgn label
  entitas "**Kopontren (dalam proses)**" — flag `settings.coop_registered`
  (nilai awal: belum) untuk tampilan CALK. PERLU KEPUTUSAN GUS FI:
  kapan label di-switch (§13.7).
- Dana pesantren (sumbangan, kegiatan madrasah) belum tercatat di app
  (audit §7) → masuk sebagai **akun memo grup 69xx + input manual**
  (bukan POS). Tidak ada pencampuran dgn arus kas toko (invariant:
  kas GL toko = kas V1).

### 1.2 Hierarki standar (keputusan #2)

1. **SAK Syariah** (utama) — untuk akun syariah: ZIS (§8), akad
   (§6), bagi hasil (skema denda dihapus — F3.3 #6, §15).
2. **PAP** (BI+MUI) — peta akun pesantren (grup 69xx); teks PAP
   belum dimiliki app (open item §9).
3. **SAK EP** (fallback) — konstruksi umum: Posisi Keuangan,
   Laba-Rugi, LPE, LAK, CALK (§5).
4. **ED SAK Koperasi** — rujukan opsional utk struktur SHU/simpanan;
   status finalisasi = item riset (§13.9).


---

## 2. Bagan Akun (COA) — ±52 akun, 6 grup (keputusan #4: B)

**Legenda status:** `APL` = struktur teknis disetujui masuk build
(tanpa nilai syariah) · `PKGF` = **PERLU KEPUTUSAN GUS FI** (nilai/
aktivasi menunggu F3.3). Nomor mengikuti pola SAK EP 2 digit grup.
Grup 6xx = syariah/pesantren (SAK Syariah/PAP).

### 2.1 10xx ASET (12)

| Kode | Nama | Sumber data / deskripsi | Status |
|---|---|---|---|
| 1010 | Kas Toko | agregat kas POS (`/api/kas` rumus kanonik) | APL |
| 1020 | Kas Bank | setoran/transfer (cash_entries jenis bank) | APL |
| 1030 | Piutang Penjualan | `debts` (remaining open) | APL |
| 1040 | Persediaan | stok × harga beli (snapshot COGS V2-2) | APL |
| 1050 | Aset Tetap | modal aset (input manual, nilai awal = tashih buku pembuka) | APL |
| 1060 | Akum. Penyusutan | contra-asset 1050 (metode: lurus, umur = PKGF §13.8) | PKGF |
| 1070 | Piutang Murabahah | akad murabahah (term) yang belum lunas | PKGF |
| 1080 | Investasi Mudharabah | dana shahib (pemilik modal) per akad | PKGF |
| 1090 | Investasi Musyarakah | kontribusi per akad | PKGF |
| 1100 | Kas ZIS | kas sosial zakat/infak/sedekah (terpisah, §8; denda dihapus F3.3 #6) | APL |
| 1110 | Piutang Zakat | mustahik yang belum menerima (jika ada penyaluran bertahap) | PKGF |
| 1120 | Aset Wakaf | **AKTIF** (revisi F3.3 #14, 30 Sep — keputusan #7 di-revisi; booking via §8) | APL |

### 2.2 20xx KEWAJIBAN (10)

| Kode | Nama | Sumber data / deskripsi | Status |
|---|---|---|---|
| 2010 | Hutang Pembelianan | `payables` (remaining open) | APL |
| 2020 | Hutang Ujrah Konsinyasi | settlement neto komisi pemilik (P4, default 20% = **provisional, P4 belum tashih**) | APL |
| 2030 | Utang Cashback Member | `members.cashback_balance` (kewajiban, bukan beban — A1) | APL |
| 2040 | Kewajiban Akad (jika koperasi = pihak pembeli) | murabahah/musyarakah dari pihak ketiga | PKGF |
| 2050 | Simpanan Pokok | per anggota, **boleh dijamin, kembali saat keluar** | APL |
| 2060 | Simpanan Wajib | per anggota, jadwal setor (jumlah & jadwal = PKGF §13.10) | APL |
| 2070 | Simpanan Sukarela | tabungan anggota, bisa ditarik (ketentuan = PKGF) | APL |
| 2080 | SHU Berjalan | SHU tahun berjalan sebelum distribusi | PKGF |
| 2090 | ZIS Terkumpul Belum Disalurkan | zakat/infak diterima, belum keluar | PKGF |

### 2.3 30xx EKUITAS (7)

| Kode | Nama | Sumber data / deskripsi | Status |
|---|---|---|---|
| 3010 | Modal Penyertaan | saldo pembuka (input) + setoran tambahan anggota | APL |
| 3020 | SHU Ditahan | SHU setelah distribusi (carry ekuitas) | PKGF |
| 3030 | SHU Cadangan Umum | alokasi % (rasio = PKGF §13.4) | PKGF |
| 3040 | SHU Cadangan Khusus | alokasi % | PKGF |
| 3050 | SHU Jasa Anggota | accrued sebelum distribusi (bobot = PKGF) | PKGF |
| 3060 | SHU Dibagi | jurnal distribusi (mengurangi 3020) | PKGF |
| 3070 | Koreksi Saldo | jurnal koreksi administrasi (non-akad) | APL |

### 2.4 40xx PENDAPATAN (10)

| Kode | Nama | Sumber data / deskripsi | Status |
|---|---|---|---|
| 4010 | Pendapatan Penjualan | Σ`sales.total` bruto | APL |
| 4020 | Potongan & Diskon | diskon manual + member + redeem poin (loyalty = diskon/hibah, CHECKLIST B) | APL |
| 4030 | Retur Penjualan | Σ`returns` | APL |
| 4040 | Ujrah Konsinyasi | `cash_entries` income "Ujrah Kon…" (P4 — 20% **provisional**) | PKGF |
| 4050 | Pendapatan Ijarah | sewa aset/ruang (akad, §6) | PKGF |
| 4060 | Laba Murabahah | margin tetap per akad (diakui saat penerimaan, pola IFRS/Syariah — rincian = PKGF) | PKGF |
| 4070 | Bagi Hasil Mudharabah | porsi koperasi sebagai shahib al-mal | PKGF |
| 4080 | Bagi Hasil Musyarakah | porsi koperasi | PKGF |
| 4090 | ZIS Masuk | infak/sedekah diterima → kas sosial | APL |
| 4100 | Wakaf Masuk | **AKTIF** (revisi F3.3 #14 — keputusan #7 di-revisi; booking via §8) | APL |

### 2.5 50xx BEBAN (10)

| Kode | Nama | Sumber data / deskripsi | Status |
|---|---|---|---|
| 5010 | HPP | snapshot `sale_items.cost_price` (V2-2) | APL |
| 5020 | Retur COGS | netting `returns.cogs` (V2-2) | APL |
| 5030 | Beban Operasional | `expenses.category` per kategori | APL |

---

## 3. Skema Jurnal — double-entry, immutable, invariant D=K

### 3.1 Tabel

```sql
-- v21 (additive; semua tabel baru, tidak ubah tabel lama)
CREATE TABLE IF NOT EXISTS journal_entries(
  id TEXT PRIMARY KEY,              -- uuid; satu transaksi sumber = 1 entry
  ref_table TEXT NOT NULL,          -- 'sales','purchases','expenses','cash_entries',
                                    -- 'debts','payables','consignments','akad','coop','zis','manual','open'
  ref_id TEXT,                      -- FK logis ke sumber (bukan FK hard, agar backup/restore bebas)
  entry_date TEXT NOT NULL,         -- ISO, WIB (lihat 3.4 R1)
  type TEXT NOT NULL,               -- 'auto' | 'manual' | 'reversal' | 'opening' | 'closing'
  desc TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  reversed_by TEXT,                 -- entry id (nanti diisi) — koreksi = reversal
  CHECK (ref_table IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS journal_lines(
  entry_id TEXT NOT NULL,
  account_code TEXT NOT NULL,      -- FK coa.code (coa dulu)
  debit INTEGER NOT NULL DEFAULT 0,-- integer rupiah penuh
  credit INTEGER NOT NULL DEFAULT 0,
  balance_running INTEGER,         -- saldo kumulatif setelah line ini
  source TEXT,                     -- detail sumber (mis 'sales#id', 'akad#id:installment#2')
  PRIMARY KEY(entry_id, account_code, source)
);
CREATE INDEX IF NOT EXISTS idx_jl_acct ON journal_lines(account_code, entry_id);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);
```

Aturan nilai: `debit` XOR `credit` (satu sisi = 0, sisi lain ≥ 0),
`debit+credit > 0`. **Rupiah integer penuh** (1 rupiah = 1, tanpa
desimal) — konsisten dgn `sales.total` (integer).

### 3.2 Invariant & integritas

1. **D=K per entry**: di-enforce **dua lapis** (app level wajib di
   `lib/jurnal.ts` sebelum commit; DB level: Turso/libSQL tidak
   punya multi-row constraint → enforce = app + **cek
   rekonsiliasi #15 `JOURNAL_BAL`** `Σ debit = Σ credit` per entry
   + global, flag-only read-only, pola R7/INV).
2. **Immutable**: tidak ada `UPDATE`/`DELETE` pada entry/line yang
   sudah tercatat. Koreksi = **jurnal pembalik (reversal)**:
   `type='reversal'`, kolom `reversed_by` terisi kedua arah, desc
   "Reversal of JE-xxx (alasan: …)". `audit_log` mencatat tiap
   reversal (siapa/kapan).
3. **Running balance**: kolom `balance_running` di `journal_lines`
   = saldo akun kumulatif s/d line tsb. Benefit (R5): report/neraca
   saldo **baca kolom terakhir per akun** (indexed) → hindari
   full-scan Σ per render. Saat write: SELECT balance terakhir
   akun tsb dalam **tx yang sama**.
4. **Satu transaksi sumber = satu `journal_entries`** (multi-line
   di dalam); idempoten via UNIQUE `(ref_table, ref_id, type)`
   untuk posting auto (re-post transaksi sama = tidak double;
   posting ulang pasca-reversal pakai ref_id baru `…#rev1`).
5. Jurnal manual: UI `/admin/jurnal` (tier `admin`), wajib desc,
   validasi D=K, hanya akun status=open.
6. Jurnal penutup (`closing`): transfer pendapatan/beban → 3020
   SHU Ditahan per periode (tahunan atau bulanan = PKGF §13.11).

### 3.3 Modul (bebas-import, pola `lib/neraca.ts`; test
`scripts/test-jurnal.ts` in-memory)

- `lib/jurnal.ts`: `postJournal(db, {ref_table, ref_id, lines[]})`
  (tx: cek idempoten → validasi D=K → insert entry+lines dgn
  balance_running → invalidate cache), `reverseJournal(db,
  entryId, reason, user)`, `openingBalance(db, date)`
  (jurnal tipe `opening`).
- `lib/gl.ts`: `accountBalance(db, code, at?)`,
  `trialBalance(db, at)`, `accountStatement(db, code, from, to)`
  (buku besar: opening + kronologis + closing).
- R5: cache `gl:` TTL 60 dtk untuk trial balance & saldo (pola
  cache lama); query per akun = akses terindeks.

### 3.4 Zona waktu (mitigasi R1 — known-issue zakat UTC)

- `entry_date` & `created_at` selalu **ISO WIB (+07:00)** — pakai
  helper `nowWib()` (satu-satunya sumber waktu untuk jurnal;
  pola `T00:00:00+07:00` yang sudah dipakai cutoff V2).
- **Fix zona waktu modul zakat** (`paid_at` terekam/terbaca UTC →
  display/periode WIB) = commit tersendiri di Wave 5; R1 wajib
  close **sebelum** zakat diambil dari GL (LAK Wave 2 &
  penguatan Wave 5), bukan boleh.
- Cek rekonsiliasi baru `JOURNAL_TZ`: assert `entry_date` selalu
  berakhiran `+07:00`.
---

## 4. Auto-posting — 3 wave (keputusan #8: B)

Prinsip: **satu tx per transaksi** (transaksi + jurnal dalam satu
commit DB, pola `writeAndInvalidate`); posting gagal = transaksi
gagal (rollback); idempoten (§3.2.4); setiap posting meng-invalidate
cache `'kas:'`/`'keuangan:'`/`'neraca:'`/`'gl:'`.

### 4.1 Wave 1 (mgg 1–2) — POS / kas / belanja

| Sumber | Pemicu | Jurnal |
|---|---|---|
| `sales` | INSERT | Debit 1010 (cash/QRIS→1010, bank/transfer→1020) atau 1030 (kredit) · Kredit 4010 (bruto) · Debit 4020 diskon/redeem · Debit 5010 HPP · Kredit 1040 (stok keluar) |
| `cash_entries` | INSERT | income: Debit 1010/1020 → Kredit 4040 (ujrah kon.) / 4090 (ZIS masuk) / 3010 (setoran modal); expense: Debit 5030/50xx (per label) → Kredit 1010 |
| `expenses` | INSERT | Debit 5030 (per kategori) → Kredit 1010/1020 |
| `purchases` | INSERT | Debit 1040 (stok masuk) → Kredit 1010 (lunas) / 2010 (tempo) |
| shift close | UPDATE `shifts` | (tanpa jurnal — kontrol kasir; diverifikasi rekon #16: Σ shift vs jurnal kas periode sama) |

### 4.2 Wave 2 (mgg 3–4) — piutang / hutang / retur / konsinyasi

| Sumber | Pemicu | Jurnal |
|---|---|---|
| `debts` | INSERT | **TANPA journal entry** (lihat §4.5 — piutang sudah terbukukan lewat `sales`) |
| `debts` | bayar % (UPDATE) | Debit 1010 → Kredit 1030 (sebesar nominal bayar) |
| `payables` | bayar (UPDATE) | Debit 2010 → Kredit 1010 |
| `returns` | INSERT | Debit 4030 + Debit 1040 (stok kembali @`cogs`) → Kredit 1030/1010; netting HPP: Debit 5020 / Kredit 5010 (V2-2) |
| `consignments` | SETTLEMENT | Debit 1010 (bruto) · split: Kredit 2020 (komisi pemilik, % = `konsinyasi_commission` **provisional 20% P4**) + Kredit 4010 (sisa = pendapatan koperasi). Ujrah diterima: Debit 1010 → Kredit 4040. **Mapping P4 TIDAK diubah diam-diam (R6)** |

### 4.3 Wave 3 (mgg 4–5) — akad / koperasi / ZIS

| Sumber | Pemicu | Jurnal |
|---|---|---|
| `akad_*` (§6) | per event (pencairan, angsuran, bagi hasil, settlement) | per tipe akad (§6.4) |
| simpanan anggota | setor/tarik | setor: Debit 1010 → Kredit 2050/2060/2070; tarik: kebalikan |
| SHU (§7) | hitung/distribusi | hitung: Debit 3020 → Kredit 3030/3040/3050/3060 (rasio PKGF); bayar: Debit 3060 → Kredit 1010 / Kredit 2070 (dihitung di tabungan) |
| ZIS (§8) | input manual | masuk: Debit 1010 → Kredit 1100; zakat keluar: Debit 5090 → Kredit 1100; infak keluar: Debit 5100 → Kredit 1100 |

### 4.4 Batas scope per wave

- Wave 1 = **minimal viable GL**: kas, penjualan, belanja, HPP →
  Laporan Posisi & Laba-Rugi formal bisa diverifikasi vs V1
  (rekon #16) sejak akhir Wave 1.
- Wave 2 = siklus kredit & retur utuh (akrual piutang/hutang).
- Wave 3 = entitas syariah & koperasi (akad, SHU, simpanan, ZIS).
- **TIDAK auto-post**: jurnal penutup (manual periodik), koreksi
  (selalu reversal manual), saldo pembuka (sekali, Wave 6).

### 4.5 Anti-double (kredit penjualan & tempo pembelian)

**Satu sumber = satu entry lengkap.**
- `sales` metode `credit`: Debit 1030 + Debit 5010 (HPP) →
  Kredit 4010 (pendapatan penuh) + Kredit 1040 (stok keluar).
  Piutang = sisi debit entry sales.
- `debts` = tabel pelacak sisa piutang **per customer**. INSERT
  `debts` **tidak membuat entry**; entry terjadi hanya saat
  **pembayaran**: Debit 1010 → Kredit 1030 (sebesar nominal bayar).
- `payables` = pelacak sisa hutang per supplier. INSERT tidak
  membuat entry; entry di `purchases` tempo: Debit 1040 → Kredit
  2010; dan pembayaran: Debit 2010 → Kredit 1010.

Hasil: tidak ada double booking, invariant D=K selalu utuh,
dan `debts`/`payables` tetap tabel operational (sumber saldo
akun 1030/2010 utk rekonsiliasi #16).
---

## 5. 5 Laporan Formal (keputusan #10: A)

Semua: periode WIB (`nowWib`), guard tier `laporan`, cache 60 dtk,
CSV export, **label standar** (§1.2). Halaman baru di
`/admin/laporan` (tab: Formal | GL | V1 lama — V1 TIDAK dihapus,
paralel s/d rekonsiliasi F3.5 green).

### 5.1 Laporan Posisi Keuangan (Neraca)
- Aset: lancar (1010+1020+1030+1040+1070+1100+1110) · tetap neto
  (1050−1060) · investasi syariah (1080+1090) · wakaf (memo
  1120/6020, tidak dijumlahkan).
- Kewajiban: lancar (2010+2020+2030+2040+2100) · anggota
  (2050+2060+2070+2080) · ZIS (2090).
- Ekuitas: 3010+3020+3030+3040+3050+3060+3070.
- **Periksa D=K: ΣAset = ΣKewajiban + ΣEkuitas** (invariant §3.2.1;
  jika ngga balance, report menolak render + flag rekon #15).

### 5.2 Laporan Laba-Rugi (Periode)
- Pendapatan: 4010 − (4020+4030) = neto operasi.
- (−) HPP: (5010 − 5020) = **Laba Kotor**.
- (−) Beban operasi: 5030+5040+5060+5070+5080 → Laba Sebelum
  ZIS.
- (−) ZIS: 5090+5100+6030 → **Laba Bersih** (5050 tidak aktif —
  F3.3 #6: tidak ada skema denda).
- MEMO (tidak digabung): ujrah konsinyasi (P4), cashback
  (kewajiban, bukan beban — keputusan A1), SHU (di LPE/CALK).
- Struktur baris netting = V1 `keuangan.ts` (V2-2 `hppRetur`)
  dipetakan ke akun COA.

### 5.3 Laporan Perubahan Ekuitas (LPE)
Per kolom: Modal (3010) · SHU Ditahan (3020) · Cadangan Umum
(3030) · Cadangan Khusus (3040) · Jasa Anggota (3050) · Dibagi
(3060) · Koreksi (3070).
Baris: pembuka + SHU diperoleh (dari LKA, jurnal closing §3.2.6)
+ alokasi (rasio **PKGF §13.4**) − distribusi = penutup.
Catatan: simpanan 2050–2070 = kewajiban anggota (bukan ekuitas)
— ditampilkan di neraca sisi kewajiban + **footnote LPE**
(perubahan saldo simpanan periode).

### 5.4 Laporan Arus Kas (LAK)
Per akun kas (1010 toko / 1020 bank / 1100 ZIS):
- **Operasional**: Kas penjualan (K-1010 dari 4010 neto kas),
  (+) kas retur, (−) belanja kas (5030, 2010 bayar), (−/+ )
  stok kas (1040 vs 2010), perubahan piutang/hutang dagang.
- **Investasi**: aset tetap (1050), akad (pencairan 1070–1090,
  penerimaan angsuran).
- **Pendanaan**: modal (3010), simpanan anggota (2050–2070),
  SHU distribusi (3060).
- **Kas Sosial (1100)**: ditampilkan seksi terpisah — masuk
  (infak/sedekah; denda dihapus F3.3 #6) & keluar (zakat/infak distribusi) —
  **dilarang dicampur** ke kas usaha (invariant rekon #16:
  1010+1020 = kas V1; 1100 terpisah).
- Footer: saldo awal → arus per aktivitas → saldo akhir,
  cross-check dgn `shifts` (#16).

### 5.5 CALK (Catatan Atas LK) — template
1. Informasi umum entitas + **status koperasi** (flag §1.1,
   "dalam proses" s/d registrasi tuntas) + dasar penyusunan
   (hybrid SAK Syariah–PAP–SAK EP, §1.2) + tanggal N buku
   pembuka (§10).
2. Ikhtiar & struktur: unit usaha toko POS + dana pesantren
   (memo 6010), multi-store siap.
3. Kebijakan akuntansi utama: HPP (RNB snapshot V2-2),
   penyusutan (metode/umur **PKGF §13.8**), komisi konsinyasi
   (provisional P4), zakat (P3 final via F3.3 #2, 30 Sep — bridge belum di-switch, R6), nisbah & margin akad
   (**PKGF §13.1/3/5**), kurs: n/a (IDR).
4. Komponen kas: 1010/1020/1100 terpisah.
5. Piutang & hutang per lawan transaksi (ringkasan).
6. Ekuitas: modal, simpanan, SHU + rasio distribusi (**PKGF**).
7. ZIS: diterima/disalurkan per jenis (zakat/infak/sedekah/wakaf;
   denda dihapus F3.3 #6), periode.
8. Akad berjalan per jenis + saldo per akad.
9. Peristiwa pasca-periode (manual input).
**Penerima LK formal = PKGF §13.13** (siapa menerima & berapa
sering: pengurus? pengasuh? BKK? rapat anggota?).

### 5.6 Invariant rekonsiliasi baru (cek #15–#17, pola flag-only
read-only `lib/rekonsiliasi.ts` + `docs/qa/DATA-INVARIANTS.md`)

| # | Cek | Rumus |
|---|---|---|
| 15 `JOURNAL_BAL` | `Σ debit = Σ credit` per entry & global | invariant D=K |
| 16 `GL_CASH` | **kas V1 (rumus kanonik `/api/kas`) = saldo GL (1010+1020) per periode** & per shift; 1100 tidak ikut | "angka kas V1 ≈ kas GL" (cek rekonsiliasi wajib) |
| 17 `GL_TZ` | semua `entry_date` berakhiran `+07:00` | mitigasi R1 |

Selisih #16 = bug posting → flag-only (read-only), TIDAK
auto-fix; dilaporkan di halaman rekonsiliasi + test
`scripts/test-rekonsiliasi.ts` (golden path F3.5).

---

## 6. Modul Akad (keputusan #11: A — bareng fondasi, Wave 3)

### 6.1 Struktur tabel

```sql
-- v22
CREATE TABLE IF NOT EXISTS akad(
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,            -- 'murabahah'|'mudharabah'|'musyarakah'|'ijarah'|'wakalah'
  counterparty TEXT NOT NULL,    -- nama pihak lawan
  amount INTEGER NOT NULL,       -- integer rupiah
  terms_json TEXT,              -- {margin_nisbah, jangka, schedule[], ...}
  status TEXT NOT NULL DEFAULT 'active', -- active|settled|cancelled
  opened_at TEXT NOT NULL,       -- ISO WIB
  settled_at TEXT,
  note TEXT,
  UNIQUE(type, counterparty, opened_at, amount)  -- anti-double input
);
CREATE TABLE IF NOT EXISTS akad_events(
  id TEXT PRIMARY KEY,
  akad_id TEXT NOT NULL,
  kind TEXT NOT NULL,           -- per type, lihat 6.4
  amount INTEGER NOT NULL,
  event_date TEXT NOT NULL,     -- ISO WIB
  posted_entry TEXT,            -- id journal_entries
  created_by TEXT, created_at TEXT NOT NULL
);
```

UI: `/admin/akad` (list + create + timeline event + detail jurnal
terkait). Tier `admin`. Per-type form: margin/nisbah **field input
manual per akad** (TIDAK preset default syariah) — placeholder
teknis; nilai ketentuan = **PERLU KEPUTUSAN GUS FI (§13.1/3/5/6)**.
Wakalah = konsinyasi yang SUDAH ADA (P4) — modul `akad` hanya
mencatat jurnalnya (bridge), **bukan** duplikat fitur.

### 6.2 Per-tipe — event & aturan

| Tipe | Event valid | Catatan teknis |
|---|---|---|
| murabahah | pencairan, angsuran, settlement (denda dihapus — F3.3 #6) | harga jual = pokok + margin tetap; margin = PKGF |
| mudharabah | pencairan (dana), kontribusi, bagi hasil (per periode), settlement | nisbah = PKGF; pembagian di event `bagi_hasil` |
| musyarakah | pencairan (kontribusi), bagi hasil, settlement | rasio = PKGF |
| ijarah | pencairan (imbalan awal, jika ada), ijarah periodik, settlement | rate sewa = PKGF |
| wakalah | (bridge ke konsinyasi P4: ujrah + settlement neto) | komisi = `konsinyasi_commission` (P4 provisional) |

### 6.3 Simulasi

- Form akad menampilkan **simulasi** (tanpa booking): total
  kewajiban, jadwal, porsi bagi hasil per skenario — semua angka
  dari input user (nisbah/margin), bukan asumsi app.

### 6.4 Posting rules per tipe (ref_table=`'akad'`, `ref_id=akad#id:evt#kind`)

| Tipe & event | Jurnal |
|---|---|
| Murabahah — pencairan | Debit 1010 (terima pembayaran pertama) · Kredit 2040 (sisa pokok+margin bila bertahap) / Kredit 4060 (lunas saat pencairan) |
| Murabahah — angsuran | Debit 1010 → Kredit 2040 (nominal angsuran) |
| Murabahah — settlement (lunas) | Debit 2040 → Kredit 4060 (recognition margin sisa) |
| Mudharabah — pencairan | Debit 1010 (P diterima) → Kredit 1080 (P ditahan s/d settlement) |
| Mudharabah — bagi hasil | 1 entry 4 sisi: Debit 1080 (Pc) + Debit 5060 (Pp) → Kredit 4070 (Pc, porsi koperasi) + Kredit 1010 (Pp, dibayar cash) — D=K utuh; bila Pp ditahan dulu: Kredit 2040 |
| Musyarakah — pencairan | Debit 1010 (K diterima) → Kredit 1090 |
| Musyarakah — bagi hasil | 1 entry 4 sisi: Debit 1090 (Pc) + Debit 5060 (Pp) → Kredit 4080 (Pc) + Kredit 1010 (Pp) |
| Musyarakah/mudharabah — settlement | Debit 1080/1090 (sisa pokok) → Kredit 1010 (pengembalian ke shahib/pemilik) |
| Ijarah — periodik | Debit 1010 → Kredit 4050 (imbalan sewa) |
| Wakalah (bridge P4) | settlement: Debit 1010 (bruto) → Kredit 2020 + Kredit 4010; ujrah: Debit 1010 → Kredit 4040 (sama §4.2) |
| Denda diterima | **TIDAK DIANGKAT** — F3.3 #6 (30 Sep): tidak ada skema denda; akun 5050 `status=closed` (lihat §15) |

> Catatan: entry `bagi hasil` & `settlement` dirancang agar
> **tidak mengubah saldo Kas** (non-cash: pergeseran antar
> akun) — hanya event "terima pembayaran" yang menyentuh 1010/1020.
> Cek rekonsiliasi #16 tetap valid karena kas V1 tidak berubah
> utk event non-cash.

### 6.5 Semua parameter syariah = PERLU KEPUTUSAN GUS FI

| Parameter | Opsi teknis yang ditawarkan app |
|---|---|
| Margin murabahah | % per akad (input manual, simulasi §6.3) |
| Nisbah mudharabah/musyarakah | % per akad (input manual) |
| Rate ijarah | nominal per periode per akad |
| Denda keterlambatan | **TIDAK ADA** (keputusan F3.3 #6, 30 Sep) — penanganan keterlambatan via mekanisme lain tanpa denda; di luar scope GL |
| Pengakuan laba murabahah | saat penerimaan (cash basis) vs periode (accrual) |
| Frekuensi bagi hasil | per periode (bulanan/triwulan/rapat) — periodik manual |

---

## 7. Struktur Koperasi (Level C — keputusan #3)

### 7.1 Tabel

```sql
-- v22 (bersama modul akad)
CREATE TABLE IF NOT EXISTS coop_members(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  npwp TEXT,
  member_since TEXT NOT NULL,     -- ISO WIB
  status TEXT NOT NULL DEFAULT 'aktif', -- aktif|nonaktif|keluar
  UNIQUE(name)
);
CREATE TABLE IF NOT EXISTS coop_savings(
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'pokok'|'wajib'|'sukarela'
  amount INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY(member_id, kind, saved_at, amount)
);
CREATE TABLE IF NOT EXISTS coop_shu(
  id TEXT PRIMARY KEY,            -- satu baris per periode distribusi
  period TEXT NOT NULL,          -- '2026' / '2026-Q1' (periodik = PKGF §13.11)
  shu_total INTEGER NOT NULL,    -- dari jurnal closing (3020)
  cadangan_umum INTEGER,
  cadangan_khusus INTEGER,
  jasa_anggota INTEGER,
  dibagi INTEGER,
  rasio_json TEXT,               -- {cad_umum, cad_khusus, jasa, dibagi} (%)
  created_by TEXT, created_at TEXT NOT NULL,
  UNIQUE(period)
);
```

### 7.2 Alur SHU (distribusi = jurnal, hitungan = input)

1. **Hitung**: admin input SHU periode (dari LKA/Laba-Rugi) ke
   `/admin/koperasi/shu` + rasio alokasi (cadangan umum/khusus/jasa
   anggota/sisa dibagi). Rasio = **PERLU KEPUTUSAN GUS FI §13.4**
   (app TIDAK mengisi default angka rasio).
2. **Posting**: jurnal `ref_table='coop'`:
   - alokasi: Debit 3020 (SHU Ditahan) → Kredit 3030 + 3040 +
     3050 + 3060 (per rasio).
   - jasa anggota: Debit 3050 → Kredit 2070 (per anggota)
     dihitung di tabungan) atau 1010 (tunai).
   - cadangan: berhenti di 3030/3040 (ekuitas).
3. **Simpanan**:
   - setor: Debit 1010 → Kredit 2050/2060/2070 (per `kind`).
   - tarik sukarela: Debit 2070 → Kredit 1010 (sisa ≥ 0 per
     anggota, cek aplikasi; ketentuan tarik = PKGF).
   - pokok kembali saat anggota keluar: Debit 2050 → Kredit 1010
     (kembali sesuai simpanan pokok).
   - **Jumlah & jadwal simpanan wajib = PKGF §13.10** (app hanya
     wadah pencatatan, bukan penentu besaran).
4. Modal penyertaan (3010): setoran tambahan anggota/admin:
   Debit 1010 → Kredit 3010.

### 7.3 Koneksi ke V1

- Anggota koperasi ≠ member loyalty (dua entitas berbeda; bisa
  orang yang sama — tidak ada penggabungan data).
- SHU hanya dihitung dari **LKA formal (GL)** — bukan dari Laba
  Bersih V1 (V1 = operasional saja, MEMO cashback/zakat).

---

## 8. Pemisahan ZIS (keputusan #5: A; #7 wakaf: **AKTIF** pasca-revisi F3.3 #14)

### 8.1 Prinsip

- Dana sosial (zakat/infak/sedekah/wakaf) **terpisah dari kas
  usaha**: kas masuk = `1100` (Kas ZIS); Kas Toko `1010/1020`
  **tidak pernah** menyentuh ZIS (invariant rekon #16).
- **Anti-campur**: LAK menampilkan ZIS sebagai seksi terpisah
  (§5.4); neraca menampilkan 1100 di aset lancar, 2090 di
  kewajiban khusus.

### 8.2 Tabel & UI

```sql
CREATE TABLE IF NOT EXISTS zis(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- 'zakat'|'infak'|'sedekah'|'wakaf'
  direction TEXT NOT NULL,        -- 'in'|'out'
  amount INTEGER NOT NULL,
  payer TEXT,                    -- pemberi (in) / mustahik (out)
  occurred_at TEXT NOT NULL,      -- ISO WIB
  posted_entry TEXT,             -- id journal_entries
  created_by TEXT, created_at TEXT NOT NULL
);
```

- UI `/admin/zis`: input manual sederhana (in/out per kind),
  riwayat, export CSV. Jurnal auto dari `zis` (§4.3).
- **Jembatan modul zakat P3 (TIDAK refactor, R6)**: baris
  `zakat_history` yang sudah ada = sumber angka 6030/5090;
  F3.2 tidak mengubah modul `zakat-*`. Setelah tashih P3 turun,
  jembatan bisa di-switch (commit terpisah).
- **Wakaf (AKTIF — revisi F3.3 #14, 30 Sep 2026)**: keputusan #7
  ("Belum sekarang") di-revisi. Akun 1120/4100/6020 **aktif**
  (bukan placeholder ditunda). Booking = hook §8.2: input
  `kind='wakaf'` di UI `/admin/zis` + jurnal manual ke
  1120/4100/6020 (scope tambahan PSAK 112); invarian anti-campur
  tetap (rekon #16). Build = W3.5 (roadmap §12).

### 8.3 Rate zakat & aturan penyaluran = PERLU KEPUTUSAN GUS FI

- Rate zakat (mal, tijarah, fitrah, dll.) & siapa mustahik yang
  sah = **PKGF §13.2 — TERPUTUSKAN F3.3 #2 (30 Sep 2026)**:
  angka P3 (24K/market/haul) + daftar mustahik **final**. Badge
  "provisional" di UI zakat tetap sampai switch jembatan
  `zakat_history` (R6, commit terpisah saat F3.4+).
---

## 9. Peta Kepatuhan PAP (Pedoman Akuntansi Pesantren, BI+MUI)

### 9.1 Open item: sumber teks PAP

**Pertanyaan terbuka (§13.9):** teks PAP belum dimiliki app.
Opsi sumber (urutan prioritas):
1. Publikasi **Bank Indonesia** (PAP keluaran BI+MUI — cari di
   situs BI, bagian kebijakan/standar akuntansi non-BA).
2. Publikasi **MUI** (situs resmi MUI / penerbit fatwa).
3. Salinan cetakan dari pengurus/pengasuh (jika sudah ada
   di pondok).
4. Jika tak tersedia sampai Wave 2: **fallback = SAK Syariah +
   SAK EP** untuk akun pesantren (6010) — app tetap build,
   kolom `pap_ref` (COA, §2.7) kosong sampai teks PAP dapat.

### 9.2 Peta akun (draft, menunggu teks PAP)

| Grup COA usul | Ekuivalen PAP (kiraan) | Catatan |
|---|---|---|
| 6010 Dana Pesantren | Dana kegiatan pesantren / sumbangan | memo, input manual |
| 6020 Aset Wakaf | Aset wakaf (PSAK 112) | **AKTIF** (revisi F3.3 #14, 30 Sep), booking via §8.2 |
| 4090/5090/5100 ZIS | Dana sosial pesantren | terpisah dari kas toko |
| (baru) 60xx | Beban kegiatan pesantren | TIDAK dibuat sampai teks PAP ada |

Peta final = **commit tersendiri setelah teks PAP tersedia +
keputusan Gus Fi** — tidak masuk Wave 1–5.

### 9.3 Komitmen desain

- TIDAK ada pencampuran kas toko dgn dana pesantren (invariant
  #16).
- Akun pesantren (6010/6020) = memo-only di neraca (tidak
  dijumlahkan ke total aset/kewajiban formal).
- CALK menampilkan seksi pesantren terpisah (§5.5.7).

---

## 10. Migrasi / Saldo Pembuka (keputusan #9: A)

### 10.1 Tanggal N

- **Tanggal buku pembuka N = PERLU KEPUTUSAN GUS FI §13.12**
  (saran teknis: akhir bulan terakhir sebelum implementasi
  Wave 6, misal `31 Okt 2026`; fleksibel sampai Wave 6).
- Semua jurnal `type='opening'` dgn `entry_date = N`,
  `ref_table='open'`.

### 10.2 Jurnal pembuka (buku N)

| Akun | Nilai @ N | Sumber |
|---|---|---|
| 1010 Kas Toko | saldo kas V1 @ N (`/api/kas` rumus kanonik per store + manual entries) | input manual + verifikasi V1 |
| 1020 Kas Bank | saldo bank @ N (manual) | input manual |
| 1030 Piutang | Σ `debts` remaining open @ N | query app |
| 1040 Persediaan | stok × harga beli @ N (snapshot V2-2) | query app |
| 1050 Aset Tetap | nilai buku awal aset | **input manual + tashih** (R3) |
| 1100 Kas ZIS | 0 (dimulai bersih) | — |
| 2010 Hutang | Σ `payables` remaining open @ N | query app |
| 2030 Cashback | Σ `members.cashback_balance` > 0 @ N | query app |
| 2050–2070 Simpanan | 0 atau input (jika sudah ada simpanan manual) | **input manual** |
| 3010 Modal | **= ΣAset − ΣKewajiban − ΣSimpanan − SHU** (seimbang, R3) | hasil hitung (bukan input bebas) |

> **Invariant buku pembuka: D = K (ΣAset = ΣKewajiban +
> Ekuitas + Simpanan).** 3010 dihitung sebagai selisih, sehingga
> selalu balance — **TIDAK** pakai angka "Modal Setara" V1
> (bukan ekuitas, R3).

### 10.3 Eksekusi & rollback

- UI `/admin/gl/opening` (tier `super`, sekali, terkunci setelah
  post): input → validasi D=K → post `type='opening'`.
- Post opening **TIDAK reverse-able otomatis** (immutable, §3.2.2);
  koreksi = jurnal `3070 Koreksi Saldo` + audit_log.
- **Rollback (sistem sudah running, tidak mau GL)**:
  - Backup DB (pola backup/restore existing, `backup.json` +
    re-import).
  - Tabel GL (`coa`, `journal_entries`, `journal_lines`) **TIDAK
    dihapus** — tinggal di-disable dgn flag `settings.gl_enabled=0`
    (auto-posting mati, UI GL disamarkan). V1 tetap hidup
    tanpa perubahan.
  - `coop_members`/`coop_savings`/`coop_shu`/`akad`/`zis`
    = fitur terpisah; GL-off tidak menghapus data mereka
    (bisa di-backup terpisah bila perlu).

### 10.4 Verifikasi pasca-migrasi (F3.5)

- **Rekon #16 = "angka kas V1 ≈ kas GL"**: di tanggal N,
  1010+1020 (GL) **harus =** kas V1 (rumus kanonik) **tepat**.
  Selisih = bug → flag (bukan auto-fix).
- 1030 = Σ debts, 2010 = Σ payables, 2030 = Σ cashback,
  1040 = stok×harga beli — bandingkan query sumber vs GL.
- `scripts/test-gl.ts` golden path: opening → auto-posting →
  closing → 5 laporan → rekon #15/#16/#17 all PASS (pola
  `test-rekonsiliasi.ts`).





| 5040 | Beban Penyusutan | dari 1060 (metode/umur = PKGF) | PKGF |
| 5050 | Denda/Keterlambatan (clearing) | **TIDAK AKTIF** — F3.3 #6 (30 Sep): tidak ada skema denda; seed `status=closed` (§2.7) | CLOSED |
| 5060 | Bagi Hasil Partner | porsi partner (mudharabah/musyarakah, nisbah = PKGF) | PKGF |
| 5070 | Beban Ijarah | jika koperasi sebagai penyewa | PKGF |
| 5080 | Distribusi SHU | jurnal distribusi ke 3060 → kas/transfer | PKGF |
| 5090 | Zakat Keluar | distribusi zakat → mustahik (jembatan `zakat_history`, §8) | PKGF |
| 5100 | Infak/Sedekah Keluar | distribusi kas sosial | APL |

### 2.6 60xx SYARIAH & PESANTREN / PAP (3) — memo & khusus

| Kode | Nama | Sumber data / deskripsi | Status |
|---|---|---|---|
| 6010 | Dana Pesantren | sumbangan/kegiatan pesantren (input manual, **tidak** campur kas toko) | PKGF |
| 6020 | Aset Wakaf (memo) | **AKTIF** (revisi F3.3 #14 — keputusan #7 di-revisi; booking via §8) | APL |
| 6030 | Zakat Tijarah Dibayar | jembatan dari `zakat_history` (P3 — 24K/market/haul **final via F3.3 #2, 30 Sep**; badge "provisional" sampai switch jembatan, R6) | PKGF |

**Total: 12 + 10 + 7 + 10 + 10 + 3 = 52 akun** (di rentang 40–60,
keputusan #4).

### 2.7 Tata kelola COA

- COA di-seed via migrasi skema `v21` (idempoten, pola `db.ts`);
  tabel `coa(code PRIMARY KEY, name, group, kind, status, pap_ref,
  needs_decision, created_by)`.
- **Tambah = admin menu `/admin/coa`; hapus = TIDAK ADA** (akun yang
  pernah dipakai jurnal tidak dihapus, hanya `status=closed`).
- Kolom `pap_ref` = nomor akun PAP bila cocok (isi saat teks PAP
  tersedia, §9); `needs_decision=1` untuk semua akun PKGF (tampil
  badge di UI sampai keputusan turun).
- Grup 6xx & 4090/4100/5090/5100 **diaktifkan bertahap**: seed
  tetap ada, namun posting hanya terjadi lewat fitur yg dibangun
  (ZIS Wave 2, akad Wave 3) — tidak ada auto-posting ke akun PKGF
  sebelum F3.3.


---

## 11. Risiko R1–R8 + Mitigasi (dari audit §8)

| # | Risiko (audit) | Mitigasi di proposal |
|---|---|---|
| R1 | Zakat UTC known-issue (`paid_at` UTC vs WIB) | Jurnal hanya `nowWib()` (+07:00), §3.4; rekon #17 `GL_TZ`; **commit fix zona waktu zakat di Wave 5 (wajib)** sebelum GL memakai angka zakat; LAK/ZIS periode selalu WIB |
| R2 | Neraca V1 baca legacy `consignment_items` (data P4 di `consignments`) | GL (V2) TIDAK membaca `consignment_items`; rekon #16 berbasis `consignments` (sumber resmi P4); `consignment_items` dibiarkan legacy (TIDAK dihapus) — cleanup = scope terpisah |
| R3 | Tidak ada saldo awal ("Modal Setara" ≠ ekuitas) | Buku pembuka @ N (§10): 3010 dihitung sebagai **selisih** agar D=K; nilai 1050 aset tetap = input + keputusan |
| R4 | Konflik label fase (A1–A3 lama vs plan) | Label F3.x konsisten (audit §10); proposal & commit pakai F3.x; label V1 report tetap "V1" |
| R5 | Turso Rows-Read (agregat global = termahal) | `balance_running` + index `idx_jl_acct` (§3.1) → saldo = 1 akses terindeks; trial balance per akun; cache `gl:` 60 dtk; batch per transaksi |
| R6 | Tashih P3/P4 terbuka (larangan prabatasih) | **TIDAK** refactor `zakat-*`/`konsinyasi` sampai tashih turun; GL membangun **sekitarnya** (akun + jembatan); komisi 20% tetap via `konsinyasi_commission` (setting, ubah tanpa code); badge "provisional" di UI zakat & ujrah kon. |
| R7 | Pola test bebas-import + in-memory | `lib/jurnal.ts`, `lib/gl.ts`, `lib/zis.ts`, `lib/coop.ts` bebas-import; test `test-jurnal/gl/zis/coop` (in-memory, tanpa import Next) |
| R8 | `kp-zip3` beku, tak ada GL | Tidak ada pinjam desain; lapisan GL = desain baru di repo ini (proposal ini = blueprint); referensi hanya utk pola modul & backup |

**Risiko tambahan (app):**

- R9: **Post-GL, kas V1 & GL selisih** (bug posting) → rekon #16
  flag-only; selisih tampil peringatan merah di laporan formal,
  tidak di-sembunyikan.
- R10: **Rollback** → §10.3 (flag `gl_enabled`, backup, tabel
  tidak dihapus). V1 tetap hidup paralel tanpa perubahan.


---

## 12. Roadmap & Commit Map (keputusan #12: B — 6 minggu)

> Total **28–32 commit, 6 wave**. Tiap commit: test +
> `next build` EXIT 0 + `git ls-remote` verify + dual-push
> master+main + `public/sw.js` TIDAK staged (aturan, §14).

### Wave 1 — Fondasi GL (mgg 1–2, 5 commit)

| # | Scope | Catatan |
|---|---|---|
| W1.1 | Skema `v21`: tabel `coa` + seed 52 akun + `journal_entries`/`journal_lines` + `settings.gl_enabled` + `settings.coop_registered` | idempoten; seed = semua 52 akun, PKGF dgn `needs_decision=1` |
| W1.2 | `lib/jurnal.ts` (post/reversal/opening; D=K; balance_running; idempoten; invalidate cache) + `lib/gl.ts` (balance, trial, statement) + `scripts/test-jurnal.ts` | pola R7 |
| W1.3 | Auto-posting Wave 1: `sales`, `cash_entries`, `expenses`, `purchases` (§4.1; hanya jika `gl_enabled=1`) | invalidate cache `kas:/keuangan:/neraca:/gl:` |
| W1.4 | UI `/admin/jurnal` (list, detail, manual, reversal) + `/admin/gl` (buku besar, trial balance) | tier admin; cache |
| W1.5 | Rekon #15 `JOURNAL_BAL` + #17 `GL_TZ` di `lib/rekonsiliasi.ts` + test + UI flag | flag-only |

### Wave 2 — Laporan formal + ZIS (mgg 3–4, 7 commit)

| # | Scope |
|---|---|
| W2.1 | Auto-posting Wave 2: pembayaran `debts`/`payables`, `returns` (netting V2-2), `consignments` (bridge P4; mapping TIDAK diubah, R6) |
| W2.2 | Laporan Posisi Keuangan formal (`lib/laporan/posisi.ts` + API + UI tab) |
| W2.3 | Laba-Rugi formal (`lib/laporan/lka.ts`) — struktur V1 → COA (netting `hppRetur` utuh) |
| W2.4 | LPE (`lib/laporan/lpe.ts`) |
| W2.5 | LAK (`lib/laporan/lak.ts`) — per aktivitas + seksi kas sosial terpisah |
| W2.6 | CALK template (`lib/laporan/calk.ts` + UI form) — label standar §1.2 + badge PKGF |
| W2.7 | Modul ZIS: tabel `zis` + `lib/zis.ts` + `/admin/zis` + auto-posting + anti-campur (#16 seksi ZIS) |

### Wave 3 — Akad (mgg 4–5, 5 commit)

| # | Scope |
|---|---|
| W3.1 | Skema `v22`: `akad` + `akad_events` |
| W3.2 | `lib/akad.ts` (per event, §6.4) + `scripts/test-akad.ts` (golden: murabahah & mudharabah) |
| W3.3 | UI `/admin/akad` (form per tipe + simulasi §6.3 + timeline event + jurnal terkait) |
| W3.4 | Bridge wakalah: jurnal utk settlement/ujrah `consignments` (aktifkan bila `gl_enabled=1`) |
| W3.5 | Wakaf aktif (revisi F3.3 #14, 30 Sep): input `zis` `kind='wakaf'` + jurnal 1120/4100/6020 + test (skema denda dihapus — F3.3 #6; ak. 5050 `status=closed`) |

### Wave 4 — Koperasi (mgg 5–6, 5 commit)

| # | Scope |
|---|---|
| W4.1 | Skema: `coop_members`, `coop_savings`, `coop_shu` (v22 lanjutan / v23) |
| W4.2 | `lib/coop.ts` (setor/tarik simpanan, validasi sisa ≥ 0, keluar anggota) + test |
| W4.3 | UI `/admin/koperasi` (anggota, simpanan per anggota, riwayat, rumpun) |
| W4.4 | SHU: hitung (input + rasio, §7.2) + posting distribusi + test |
| W4.5 | Modal penyertaan (3010) + jurnal closing periodik (§3.2.6) |

### Wave 5 — Penguatan (mgg 5–6, 5 commit)

| # | Scope |
|---|---|
| W5.1 | **Fix zona waktu zakat (R1)**: `paid_at`/periode → WIB (`nowWib`) + test zakat update; badge "provisional" tetap (R6) |
| W5.2 | Rekon #16 `GL_CASH` (kas V1 = kas GL per periode + per shift + ZIS terpisah) + golden F3.5 |
| W5.3 | Export: CSV laporan formal + export GL (journal, trial, buku besar) |
| W5.4 | Cache & perf (R5): audit query GL, index, batch (target: trial < 200ms @ 100k lines) |
| W5.5 | Test & build final Wave 5 (all green) |

### Wave 6 — Migrasi + SOP (mgg 6, 4 commit)

| # | Scope |
|---|---|
| W6.1 | UI `/admin/gl/opening` (input saldo pembuka, validasi D=K, sekali-post, §10) |
| W6.2 | Post opening @ N (tanggal keputusan §13.12) + verifikasi rekon #15/#16 |
| W6.3 | `docs/SOP-GL.md`: operasional GL (jurnal harian, koreksi via reversal, closing periodik, distribusi SHU, input ZIS, hak per tier) |
| W6.4 | Docs closing: update `README.md` (seksi GL) + `TODO.md` (F3.4–F3.6 done) + label F3.6 |

**Total: 5+7+5+5+5+4 = 32 commit** (rentang 28–32; dapat
dipadatkan 28 bila W5.3 digabung W5.4). Pasca-F3.3: W3.5 kini =
wakaf aktif (#14); skema denda dihapus (#6) — total tetap.

### Gate antar-wave

- **Akhir Wave 1**: rekon #15 green (D=K utuh); kas GL (1010+1020)
  = kas V1 (cek manual, bukan flag).
- **Akhir Wave 2**: 5 laporan render; rekon #16 per shift green.
- **Akhir Wave 3**: test akad golden (murabahah & mudharabah)
  PASS.
- **Akhir Wave 4**: SHU posting balance + simpanan validasi PASS.
- **Akhir Wave 5**: R1 close; all rekon green; perf target R5.
- **Wave 6**: F3.5 rekon green → F3.6 closing commit.

---

## 13. 14 Poin Keputusan F3.3 — **SEMUA TERJAWAB 30 SEP 2026**

> Jawaban tashih Gus Fi: **12 Setuju, 0 Ora Setuju, 2 Koreksi
> (#6 & #14)**. Ter-rekam: `docs/akuntansi-keputusan.md`;
> rincian perubahan: §15.

| # | Item | Opsi / bentuk keputusan | Rujukan | Jawaban 30 Sep |
|---|---|---|---|---|
| 1 | **Nisbah** mudharabah & musyarakah | % per akad (input manual) — tetapkan rentang/referensi yg dipakai | §6.5 | Setuju |
| 2 | **Rate zakat** (mal/tijarah/fitrah) + mustahik | angka + daftar mustahik sah (finalkan P3: 24K/market/haul) | §8.3 | Setuju |
| 3 | **Margin murabahah** | % / nominal per akad; basis pengakuan (cash vs accrual) | §6.5 | Setuju |
| 4 | **Rasio distribusi SHU** (cadangan umum / khusus / jasa anggota / dibagi) | % per komponen + periodik distribusi | §7.2 | Setuju |
| 5 | **Rate ijarah** | nominal per periode per akad | §6.5 | Setuju |
| 6 | **Denda keterlambatan** | ada/tidak; nominal/rasio; wajib ke kas sosial (CHECKLIST B) | §6.4 | **KOREKSI: tidak ada denda** |
| 7 | **Penerima LK formal** (CALK/LK 5) | siapa (pengurus? pengasuh? BKK? rapat anggota) & frekuensi | §5.5 | Setuju |
| 8 | **Tanggal N buku pembuka** + angka saldo pembuka | tanggal + nilai 1050 aset tetap | §10 | Setuju |
| 9 | **Sumber teks PAP** (+ status ED SAK Koperasi) | BI / MUI / salinan pengurus; bila tak dapat = fallback SAK Syariah+SAK EP | §9 | Setuju |
| 10 | **Simpanan wajib** (jumlah & jadwal per anggota) + ketentuan tarik sukarela | nominal/jadwal + aturan tarik | §7.2 | Setuju |
| 11 | **Periode closing jurnal** (tahunan / bulanan) + metode penyusutan & umur aset (1050/1060) | periodik + metode/umur | §3.2.6 | Setuju |
| 12 | **Pola pencairan mudharabah/musyarakah** (1080 vs 2040, §6.4) | pilih pola booking | §6.4 | Setuju |
| 13 | **Switch label entitas** ("Kopontren (dalam proses)" → resmi) | kapan `coop_registered=1` | §1.1 | Setuju |
| 14 | **Revisi keputusan #7 (wakaf)** — bila wakaf tidak lagi ditunda | scope tambahan (PSAK 112) | §8.2 | **KOREKSI: wakaf AKTIF** |

**Aturan F3.3 (alur baru):** Cline presentasi dokumen ini →
Gus Fi tinjau + putuskan item 1–14 → (pengasuh mengikuti
keputusan) → keputusan di-rekam di `docs/akuntansi-keputusan.md`
(commit terpisah) → revisi proposal bila perlu (commit terpisah) →
F3.4+ mulai.

---

## 14. Aturan Kerja (reminder, sesuai repo)

- **Dual-push disiplin**: tiap commit → `git push origin master`
  + `git push origin main` + verify `git ls-remote origin master
  main` sinkron.
- **Show diff** sebelum commit; commit message **ASCII-safe**
  (subject tanpa karakter jawa/non-ASCII; body boleh Indonesia —
  tulis via `[IO.File]::WriteAllLines` no-BOM).
- **`public/sw.js` TIDAK pernah di-commit** (diabaikan, disiplin
  lama).
- `D:\Ngudi Susilo\kopontren-app` = D write/commit;
  `D:\Ngudi Susilo\kp-zip3` = reference-only (baca, jangan
  tulis).
- **Syariah first, features second**; Cline mengusulkan, Gus Fi
  memutuskan.
- Larangan prabatasih (P3/P4): P3 angka zakat **sudah turun via
  F3.3 #2 (30 Sep)** — boleh di-switch saat implementasi (R6);
  P4 (konsinyasi) tetap jangan finalkan angka & jangan ubah
  mapping diam-diam sampai tashih P4 turun.

---

## 15. Revisi pasca-F3.3 (keputusan 30 Sep 2026)

> Teks jawaban tashih + dampak teknis lengkap:
> `docs/akuntansi-keputusan.md` (commit terpisah sesuai aturan
> F3.3). Ringkas: 12 item Setuju, 2 koreksi (#6 & #14).

### 15.1 #6 — Denda keterlambatan: TIDAK ADA
- Skema denda keterlambatan **dihapus** ("ini tidak usah, bisa
  dengan yang lain. tidak denda."). Penanganan keterlambatan
  alternatif (mis. perpanjangan jadwal) = **di luar scope
  proposal ini** — diputuskan terpisah bila diperlukan.
- Akun 5050 tetap di-seed dgn `status=closed` (aturan §2.7:
  "hapus = TIDAK ADA"); tidak ada fitur input denda.
- Baris "Denda diterima" (§6.4) = tidak dibangun; parameter
  denda (§6.5) dihapus.
- `zis.kind` = `'zakat'|'infak'|'sedekah'|'wakaf'` ('denda'
  keluar; 'wakaf' masuk — lihat 15.2).
- LKA/CALK: sebutan denda dihapus ("Laba Sebelum ZIS";
  baris ZIS = 5090+5100+6030).
- Roadmap: W3.5 dialokasikan ulang → wakaf (15.2); total
  commit 32 / 6 minggu TIDAK berubah.

### 15.2 #14 — Wakaf: AKTIF (revisi keputusan #7)
- Keputusan #7 (29 Sep: "B — Belum sekarang") **di-revisi**:
  wakaf aktif → scope tambahan PSAK 112 berlaku.
- Akun 1120 / 4100 / 6020 = **aktif** (APL, bukan placeholder
  ditunda).
- Booking = input `kind='wakaf'` via UI `/admin/zis` + jurnal
  manual ke 1120/4100/6020 — build = **W3.5** (+ test).
- Invarian anti-campur tetap berlaku (rekon #16: 1010+1020 =
  kas V1; 1100 terpisah; wakaf tidak dicampur kas usaha).

### 15.3 Yang dikunci 12 item Setuju
- Bentuk keputusan §13 menjadi ketentuan: nisbah/margin/rate =
  input manual per akad; penerima LK formal; tanggal N + saldo
  pembuka; sumber teks PAP; simpanan wajib/sukarela; periode
  closing + penyusutan; pola pencairan akad; label entitas.
- **#2 = angka P3 final** (zakat 24K/market/haul + daftar
  mustahik sah) → R6: jembatan `zakat_history` boleh di-switch
  + badge "provisional" dihapus **saat implementasi F3.4+**
  (commit terpisah).
- **F3.4+ siap mulai** sesuai roadmap §12 (Wave 1, ±32 commit,
  6 minggu).
- Tiap commit implementasi (F3.4+): test golden + `next build`
  EXIT 0 + backup DB sebelum migrasi skema baru (v21/v22/v23).
- Visual check oleh Gus Fi: ongoing, TIDAK blocking.
