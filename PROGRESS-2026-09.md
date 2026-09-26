# 📋 PROGRES LENGKAP APLIKASI KOPONTREN AL ITTIHAD

### Konsolidasi & Koreksi Status Proyek

**Periode: 18 September 2026 – 26 September 2026**

> Dokumen ini adalah **versi revisi terkoreksi** (26 Sep 2026). Membedakan
> empat status: **sudah coding · sudah live · sudah teruji · sudah ditashih**.
> Istilah "SIAP PRODUKSI" tidak dipakai tanpa kualifikasi.

---

# BAGIAN 1 — IDENTITAS & KONTEKS PROYEK

| Item                                        | Keterangan                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Nama aplikasi**                           | Kopontren AL ITTIHAD — Kasir & Pembukuan                                                         |
| **Konteks**                                 | Sistem kasir, stok, pembukuan, keanggotaan, dan operasional Koperasi Pondok Pesantren Al Ittihad |
| **Lingkup kelembagaan**                     | Koperasi pesantren Al Ittihad, dalam lingkungan YPI Ngudi Susilo                                 |
| **Path utama**                              | `D:\Ngudi Susilo\kopontren-app`                                                                  |
| **Clone**                                   | `C:\Users\baiti\Desktop\kp`                                                                      |
| **Repository**                              | `github.com/kita-foska/kopontren`                                                                |
| **Branch**                                  | `master` dan `main`                                                                              |
| **Deployment**                              | Vercel dari `main`                                                                               |
| **Production URL**                          | `https://kopontren-gamma.vercel.app`                                                             |
| **Schema Version terakhir yang dilaporkan** | 18                                                                                               |
| **HEAD remote terakhir yang dilaporkan**    | `origin/master = origin/main = 6c9d939`                                                          |

## Prinsip pengembangan

Pengembangan aplikasi berpedoman pada:

* `CLAUDE.md`
* `README.md`
* prinsip kehati-hatian dalam perubahan kode;
* tidak mengubah file/proses penting tanpa dasar yang jelas;
* AI tidak boleh menetapkan hukum fiqih secara mandiri;
* keputusan syariah yang belum ditashih harus diberi status **provisional**;
* prinsip dasar muamalah: menghindari riba, gharar, maysir, kezhaliman, dan memastikan kejelasan akad.

**Prinsip utama proyek:**

> **Syariah nomor 1, fitur nomor 2.**

---

# BAGIAN 2 — STATUS EKSEKUTIF PER 26 SEPTEMBER 2026

## Status keseluruhan

Aplikasi telah mencapai tahap **engineering yang sangat matang / production candidate**, dengan banyak fitur utama sudah berjalan dan sejumlah hardening telah dilakukan.

Namun istilah:

> "SIAP PRODUKSI"

perlu diberi kualifikasi.

Status yang lebih tepat:

> **Secara engineering: mendekati siap produksi / production candidate.**
> **Secara operasional: masih memerlukan uji manual akhir.**
> **Secara syariah: bagian P3 dan P4 yang bersifat fiqih masih menunggu tashih pengasuh/ulama.**

Dengan demikian, tidak tepat menyatakan seluruh sistem telah final tanpa syarat.

---

# BAGIAN 3 — TIMELINE MILESTONE

## 18–19 September 2026 — Baseline

Pekerjaan awal:

* baseline Zakat Tijarah;
* pencatatan known issues;
* audit kode awal;
* hardening awal.

Baseline commit:

`da2d3ba`

---

## 20 September 2026 — Audit Kode 3-Pass

Dilakukan audit kode 3-pass yang mencakup:

* keamanan;
* performa;
* konsistensi;
* integrity data;
* potensi bug;
* kesiapan deployment.

---

## 21 September 2026 — PWA, UI, dan Role

Pekerjaan utama:

* PWA installability;
* whitelist `/sw.js`;
* whitelist `/manifest.json`;
* batch UI;
* hotkey F1–F9;
* cheatsheet kasir;
* matriks permission;
* 7 role.

Role:

1. `admin`
2. `manajer`
3. `pengurus`
4. `kasir`
5. `gudang`
6. `pembelian`
7. `member`

Commit penting:

`b83b75e`

---

## 22 September 2026 — PWA, Produk/Stok, dan Fase 1–2

Pekerjaan:

* favicon PWA multi-size;
* revisi Produk/Stok;
* pendekatan CSV;
* phone guard;
* purchases floor;
* FASE 1–2 bug sweep;
* UI polish;
* accessibility polish;
* verifikasi live;
* penjaga margin perk;
* redemption poin;
* cashback rollback/delete.

Commit penting:

`eeb9a50`

---

## 23 September 2026 — Integritas Data & PWA

Pekerjaan:

* integrity `amount_paid`;
* integrity `change`;
* timezone WIB;
* PWA icon 180;
* exact-source headers;
* PWA Edge test;
* cleanup 113+ file scratch;
* audit trail per-user;
* perbaikan transaksi Turso;
* penghapusan dead table `stock_opname`.

Commit penting:

* `83a29dd` — audit trail per-user
* `91802a5` — fix `tx()` Turso commit
* `c46f4fa` — drop `stock_opname`, schema v15

---

# BAGIAN 4 — 24 SEPTEMBER: KEUANGAN, KONSINYASI, PWA, DAN GROSIR

Pada 24 September terjadi perkembangan besar:

* A1 Laba-Rugi V1 dilaporkan sudah live;
* A3 Neraca dilaporkan sudah live;
* P4 Konsinyasi;
* perbaikan akad konsinyasi;
* perbaikan bug konsinyasi;
* dokumen P3 tashih zakat;
* proposal P4 pengurus;
* PWA update notification;
* Grosir V1;
* QRIS encoder;
* monitoring Grosir.

Commit penting:

* `2a34a8f` — retur refund diskon
* `4f12818` — versi awal konsinyasi 20% berbasis Ju'alah
* `9dbc22c` — koreksi arah Wakalah bil Ujrah + implementasi awal zakat
* `0e34c45` — P4-B komisi fleksibel
* `d461ef5` — Point History
* `d3e99f5` — PWA update notification
* `37d0a34` — Grosir V1
* `0dbecf4`
* `54b22e6`
* `61dadd4`
* `74f704d`
* `0777fcf` — QRIS encoder
* `d8c1ec0` — Grosir monitor

### Catatan koreksi penting

Commit `4f12818` yang memakai pendekatan Ju'alah merupakan **riwayat perkembangan**, bukan akad final.

Akad yang menjadi arah P4 setelah koreksi adalah:

> **Wakalah bil Ujrah**

sesuai pembahasan P4 dan Fatwa DSN-MUI No. 113/DSN-MUI/IX/2017 tentang Akad Wakalah bi Al-Ujrah.

---

# BAGIAN 5 — 25 SEPTEMBER: UX/UI DAN BATCH #5

Pekerjaan:

## Batch #5

### C1 — Membership Card

Commit:

`1895a6e`

Fitur:

* kartu membership;
* QR;
* layout landscape;
* tier;
* auto-generate;
* konfirmasi "Perbarui QR".

### C2 — Jam Sibuk

Commit:

`3b38685`

Fitur:

* endpoint jam sibuk;
* `HourBarChart`;
* integrasi tab Ringkasan;
* 24 jam berbasis WIB.

### Dokumentasi

`c0908bb`

### P3/P4 HTML

`e5d3119`

### Verifikasi keamanan PII

`6651cb7`

---

# BAGIAN 6 — UX-1

## UX-1a

### Font & kontras

`3760c22`

dan

`4b22ed9`

Hasil yang dilaporkan:

> 78/78 titik kontras telah diperbaiki.

### Currency

`7c7e3de`

Mengganti penggunaan `toLocaleString` tertentu dengan helper:

`rp()`

### Retry

`4870aa8`

Implementasi:

* `fetchRetry`;
* GET-only retry;
* `apiRetry`;
* loader tertentu;
* test fetch.

Hasil:

> `test:fetch` — 20/20 PASS.

### Rekap

`ac0dfa2`

Hasil:

> `test:rekap` — 19/19 PASS.

---

# BAGIAN 7 — 26 SEPTEMBER: P3 ZAKAT

Pekerjaan P3 telah masuk ke tahap implementasi teknis bertahap.

---

## Step 1 — Payment Type

Migration:

**v17**

Menambahkan:

`zakat_history.payment_type`

Disertai:

* helper `normalizePaymentType`;
* wiring POST.

Commit:

* `2bd27a1`
* `10c8e87`

---

## Step 2 — Haul Anchor, Gold Standards, Valuation Mode

Migration:

**v18**

Ditambahkan:

* haul anchor;
* gold standards log;
* valuation mode;
* helper `zakat-valuation.ts`;
* tabel `zakat_gold_standards`;
* append-only log;
* index;
* route gold standards;
* label provisional;
* pilihan valuation mode.

Commit:

`ebe2e8a`

Test:

> `test:zakat` — **37/37 PASS**

---

# BAGIAN 8 — KOREKSI STATUS SYARIAH ZAKAT

Bagian ini perlu diperbaiki dari ringkasan sebelumnya.

## 1. Nisab

Untuk zakat perdagangan, sumber BAZNAS saat ini menyebut:

* nisab = 85 gram emas;
* haul = satu tahun;
* kadar = 2,5%.

BAZNAS menjelaskan zakat perdagangan menggunakan aset usaha yang relevan dikurangi kewajiban jangka pendek, bukan sekadar omzet.

Maka pernyataan:

> "Nisab tetap"

boleh digunakan sebagai **parameter prinsip**, tetapi angka rupiahnya harus mengikuti standar harga emas yang telah ditetapkan/diadopsi.

---

## 2. Haul

Keputusan teknis aplikasi:

> Haul tidak boleh otomatis reset hanya karena pengguna melakukan pembayaran zakat.

Namun:

> Mekanisme pembayaran berkala, ta'jil, dan hubungan antara pembayaran dengan haul tetap harus diposisikan sebagai bagian dari keputusan syariah yang menunggu tashih.

Jadi jangan menulis:

> "ini sudah pasti hukum fiqih final."

Lebih tepat:

> **"Implementasi aplikasi mengikuti rancangan haul anchor provisional, menunggu tashih pengasuh."**

---

## 3. Harga emas

Ini merupakan koreksi penting.

Sebelumnya tertulis:

> "Zakat Tijarah — Emas 24K"

dan:

> "Keputusan: harga emas 24K."

**Kalimat tersebut terlalu final.**

Status yang benar:

> **Standar emas 24K saat ini hanya provisional/configurable dan belum merupakan keputusan syariah final.**

MUI pada 2026 bahkan menyatakan bahwa persoalan karat emas sebagai ukuran nilai zakat penghasilan masih dikaji secara internal, dan menyebut pilihan 24, 22, 21, atau 14 karat belum diberikan rekomendasi final kepada pihak luar.

Perlu pula dibedakan:

> **zakat perdagangan ≠ zakat penghasilan.**

Jangan mengambil standar 14K untuk zakat penghasilan tahun 2026 lalu otomatis menerapkannya kepada zakat perdagangan.

BAZNAS sendiri saat ini mempublikasikan standar 14K dalam konteks **zakat pendapatan dan jasa 2026**, bukan sebagai pernyataan bahwa seluruh jenis zakat perdagangan harus menggunakan 14K.

---

## 4. Gold Standards Log

Fitur ini justru sangat tepat dipertahankan.

Tabel:

`zakat_gold_standards`

sebaiknya dipahami sebagai **history parameter**, bukan fatwa.

Minimal mencatat:

* tanggal;
* kadar/karat emas;
* harga per gram;
* sumber;
* tanggal sumber;
* periode berlaku;
* status provisional/final;
* referensi tashih;
* siapa yang menetapkan.

Dengan demikian, aplikasi tidak menghapus histori ketika standar berubah.

---

# BAGIAN 9 — VALUASI HARTA DAGANG

Ringkasan sebelumnya menyebut:

> market / HPP fallback.

Status ini perlu diperjelas.

### Yang sudah ada secara engineering

Aplikasi menyediakan:

* `valuation_mode`;
* mode `market`;
* mode `hpp`.

### Yang belum final secara syariah

Belum boleh ditulis:

> "market value sudah diputuskan sebagai metode fiqih final."

Yang benar:

> **Market valuation merupakan metode provisional yang sedang diuji/menunggu tashih; HPP merupakan fallback teknis, bukan otomatis keputusan fiqih.**

Untuk sumber umum, BAZNAS menjelaskan objek zakat perdagangan sebagai aset/harta usaha dan bukan semata-mata omzet atau laba.

---

# BAGIAN 10 — AKUMULASI HARIAN

Fitur:

> Zakat Akumulasi Harian

boleh dicatat sebagai **fitur engineering**.

Namun jangan menyebut:

> "Akumulasi harian adalah keputusan fiqih final."

Lebih tepat:

> **Aplikasi menyimpan histori/pergerakan nilai secara harian untuk membantu perhitungan dan rekonstruksi periode haul. Mekanisme final perhitungan menunggu tashih.**

Demikian pula:

> "akumulasi dimulai dari pembayaran terakhir"

adalah **aturan implementasi provisional**, bukan kesimpulan hukum final.

---

# BAGIAN 11 — TA'JIL ZAKAT

Status:

> **Provisional / referensi.**

Jangan menjadikan ta'jil sebagai dasar untuk menggeser haul.

Dalam aplikasi, pembayaran sebelum akhir haul dapat dicatat dengan tipe pembayaran tersendiri sehingga:

* tidak otomatis mengubah `haul_start`;
* tidak otomatis membuat haul baru;
* tetap tercatat dalam histori.

Tetapi validitas dan cara pembukuannya secara fiqih tetap menunggu tashih pengasuh.

---

# BAGIAN 12 — SEDekAH

Sedekah harus tetap dipisahkan dari zakat.

Jangan mencampur:

* zakat;
* infak;
* sedekah;
* pembayaran kewajiban lain.

Secara sistem, transaksi tersebut harus mempunyai identitas yang jelas agar tidak terjadi double counting.

---

# BAGIAN 13 — P4 KONSINYASI

## Akad

Status akad yang sedang digunakan:

> **Wakalah bil Ujrah**

bukan Ju'alah.

DSN-MUI mencantumkan Fatwa No. 113/DSN-MUI/IX/2017 tentang Akad Wakalah bi Al-Ujrah.

---

## Para pihak

### Pemilik barang

`Muwakkil`

### Kopontren

`Wakil`

### Imbalan

`Ujrah`

---

# BAGIAN 14 — KOMISI KONSINYASI

Komisi:

> fleksibel sesuai kesepakatan.

Ini merupakan prinsip desain yang benar.

Misalnya:

* 10%;
* 15%;
* 20%;
* 25%;

dapat berbeda berdasarkan akad/kesepakatan, selama nilai atau formula ujrah diketahui dan disepakati.

### Koreksi istilah "default 20%"

Jangan tulis:

> "Komisi default 20% adalah ketentuan syariah."

Yang benar:

> **20% adalah preset/default operasional aplikasi apabila pengurus memilihnya sebagai nilai awal. Nilai aktual tetap mengikuti kesepakatan akad.**

Jadi:

`default 20% ≠ ketentuan syariah`

---

# BAGIAN 15 — RATE SNAPSHOT

Ini tetap menjadi desain yang baik.

Ketika titipan dibuat, sistem menyimpan:

* rate;
* basis perhitungan;
* tanggal akad/transaksi;
* pihak terkait.

Rate lama tidak boleh berubah hanya karena admin mengubah pengaturan default.

Contoh:

Titipan A:

`20%`

Kemudian pengaturan default diubah:

`15%`

Maka titipan A tetap:

`20%`

sampai akad/transaksi tersebut selesai sesuai ketentuan yang berlaku.

---

# BAGIAN 16 — BASIS PERHITUNGAN UJRAH

Ini adalah salah satu bagian P4 yang **belum boleh dianggap final**.

Ada dua kemungkinan desain:

### Model A

`ujrah = harga jual aktual × rate`

atau:

### Model B

`ujrah = harga yang disepakati × rate`

Yang penting bukan sekadar rumusnya, tetapi:

> **basisnya harus jelas dan disepakati dalam akad.**

Untuk implementasi aplikasi, model yang menggunakan **harga jual aktual** akan lebih mudah dipahami jika memang akad menyatakan komisi sebagai persentase hasil penjualan.

Contoh:

Harga jual aktual:

Rp100.000

Ujrah:

20%

Maka:

`Rp100.000 × 20% = Rp20.000`

Hak pemilik:

`Rp100.000 − Rp20.000 = Rp80.000`

Tetapi ini tetap:

> **usulan mapping teknis, menunggu tashih P4.**

---

# BAGIAN 17 — HAK PEMILIK BARANG

Ini merupakan koreksi penting terhadap cara membaca laporan keuangan.

Jika barang konsinyasi merupakan milik pihak lain, maka:

> **nilai seluruh barang yang terjual bukan otomatis revenue Kopontren.**

Contoh:

Penjualan:

Rp100.000

Hak pemilik:

Rp80.000

Ujrah Kopontren:

Rp20.000

Maka secara mapping provisional:

* Rp100.000 = nilai transaksi penjualan barang titipan;
* Rp80.000 = kewajiban/hak pemilik yang harus diselesaikan;
* Rp20.000 = ujrah Kopontren.

Jadi revenue Kopontren bukan Rp100.000.

---

# BAGIAN 18 — STATUS P&L KONSINYASI

Implementasi sekarang:

> **Ujrah masih diposisikan sebagai mapping provisional/off-P&L sesuai keputusan development sebelumnya.**

Mapping target setelah P4 ditashih:

> **Ujrah Kopontren → revenue**

sedangkan:

> **Hak pemilik barang → settlement payable**

Jangan mengubah mapping ini secara diam-diam sebelum keputusan P4 ditetapkan.

Commit:

`6c9d939`

berisi dokumentasi mapping akuntansi provisional:

> supplier goods ≠ revenue
> ujrah = revenue
> pending tashih

---

# BAGIAN 19 — A1 LABA-RUGI

A1 Laba-Rugi V1 dilaporkan sudah live.

Namun status dalam laporan konsolidasi sebaiknya ditulis:

> **A1 P&L V1 — reported live; perlu verifikasi final terhadap implementasi production dan test coverage sebelum diberi label fully verified.**

Struktur yang digunakan dalam rancangan A1:

1. Penjualan Bruto
2. Retur Penjualan
3. Pendapatan Bersih
4. HPP / COGS
5. Laba Kotor
6. Beban Operasional
7. Laba Bersih

### Aturan penting

Retur penjualan:

> mengurangi revenue.

Namun karena retur lama belum mempunyai snapshot HPP yang memadai:

> **jangan otomatis membalik COGS retur dalam A1 tanpa dasar data yang aman.**

---

# BAGIAN 20 — CASHBACK

Cashback tidak boleh otomatis dimasukkan sebagai beban jika mekanisme transaksi sudah memperhitungkannya dengan cara lain.

Untuk A1:

> cashback diperlakukan sebagai memo/komponen informasi sampai mapping akuntansinya ditetapkan secara definitif.

Tujuannya:

> mencegah double counting.

---

# BAGIAN 21 — MANUAL DEBTS / PIUTANG

Modul `debts` tidak boleh otomatis dianggap sebagai:

> revenue penjualan.

Jika debt tersebut tidak berasal dari transaksi penjualan yang tercatat sebagai sales, maka jangan dimasukkan ke revenue.

Ini penting untuk menjaga integritas P&L.

---

# BAGIAN 22 — PURCHASES DAN PAYABLES

`purchases` dan `payables` merupakan dua konsep yang harus dibedakan.

Jangan melakukan:

> purchases = expense

secara otomatis.

Barang yang dibeli untuk stok dapat menjadi inventory/asset terlebih dahulu.

Demikian juga:

> payable ≠ otomatis cash outflow.

Cash flow terjadi ketika pembayaran benar-benar dilakukan.

Integrasi pembelian kredit/payable yang lebih lengkap merupakan pekerjaan lanjutan.

---

# BAGIAN 23 — NERACA

A3 Neraca dilaporkan sudah live.

Namun karena ringkasan ini tidak mencantumkan commit khusus dan hasil test terpisah untuk seluruh Neraca, status yang paling aman:

> **A3 Neraca — dilaporkan live; perlu verifikasi production/test terpisah sebelum dinyatakan fully verified.**

Jangan menyamakan:

> "sudah ada halaman Neraca"

dengan:

> "seluruh accounting model sudah menjadi double-entry accounting penuh."

Aplikasi saat ini belum dapat disebut sebagai sistem akuntansi double-entry penuh hanya karena telah mempunyai P&L dan Neraca.

---

# BAGIAN 24 — FITUR LIVE

Berdasarkan milestone yang dilaporkan, terdapat **29 item fitur/modul/kapabilitas**:

| #  | Fitur                      | Status                              |
| -- | -------------------------- | ----------------------------------- |
| 1  | POS                        | ✅                                   |
| 2  | Shift                      | ✅                                   |
| 3  | Stok                       | ✅                                   |
| 4  | Member                     | ✅                                   |
| 5  | Laporan                    | ✅                                   |
| 6  | Zakat Tijarah              | ✅ Engineering / provisional syariah |
| 7  | Backup/Restore             | ✅                                   |
| 8  | Notifikasi                 | ✅                                   |
| 9  | Auth                       | ✅                                   |
| 10 | 7 Role + Guard             | ✅                                   |
| 11 | Audit Trail                | ✅                                   |
| 12 | Member Perks               | ✅                                   |
| 13 | Margin Guard               | ✅                                   |
| 14 | Redemption Poin + Cashback | ✅                                   |
| 15 | Split Payment              | ✅                                   |
| 16 | PWA                        | ✅                                   |
| 17 | Hotkey POS                 | ✅                                   |
| 18 | P&L V1                     | 🟡 Reported live / perlu verifikasi |
| 19 | Neraca                     | 🟡 Reported live / perlu verifikasi |
| 20 | Point History              | ✅                                   |
| 21 | PWA Update Notification    | ✅                                   |
| 22 | Grosir V1                  | ✅                                   |
| 23 | Konsinyasi                 | ✅ Engineering / P4 provisional      |
| 24 | QRIS Encoder               | ✅ Encoder; belum QRIS production    |
| 25 | Grosir Monitor             | ✅ Script                            |
| 26 | Jam Sibuk                  | ✅                                   |
| 27 | Zakat Accumulation         | ✅ Engineering / provisional         |
| 28 | Gold Standards Log         | ✅                                   |
| 29 | Valuation Mode             | ✅ Engineering / provisional         |

### Catatan

Status "✅" tidak selalu berarti:

> "sudah ditashih syariah."

Untuk modul syariah, harus dibedakan:

* **engineering live**
* **operationally verified**
* **syariah verified**

---

# BAGIAN 25 — BUG YANG TELAH DIPERBAIKI

Bug yang tercatat:

* Login/PIN stuck "Memeriksa sesi..."
* Service Worker versioning
* Vercel build command
* dual branch synchronization
* zakat hutang dagang
* role guard
* audit trail
* XSS struk
* Turso transaction commit
* favicon
* icon 180
* `amount_paid`
* `change`
* timezone UTC/WIB
* phone guard
* dead `stock_opname`
* konsinyasi `consignment_items`
* tombol terima konsinyasi
* harga konsinyasi 0
* PWA update notification
* QRIS encoder test
* Grosir monitor
* cleanup scratch files.

---

# BAGIAN 26 — TEST YANG SUDAH DILAPORKAN

### Zakat

`37/37 PASS`

### Fetch

`20/20 PASS`

### Rekap

`19/19 PASS`

### QRIS

`28/28 PASS`

Total tersebut menunjukkan perkembangan test yang baik.

Namun:

> PASS pada automated test tidak sama dengan verifikasi manual dan tidak sama dengan tashih syariah.

---

# BAGIAN 27 — UX/UI

## UX-1 — SELESAI

### R1 — Font & kontras

✅

### R5 — Retry pattern

✅

### R7 — Currency helper

✅

---

## UX-2 — SEDANG BERJALAN

### R2 — Empty State CTA

🔄

### R4 — Panduan Kasir

🔄

Commit pertama EmptyState telah dikerjakan.

Commit kedua PanduanKasir masih menunggu/berjalan.

---

## UX-3 — BELUM DIMULAI/DITUNDA

### R3 — TermTip

⏳

### R6 — StatusBadge

⏳

### R8 — Rename `.grad-hero`

⏳

---

# BAGIAN 28 — KOREKSI STATUS ENGINEERING

Pernyataan sebelumnya:

> "0 engineering WIP"

**salah.**

Karena UX-2 masih berlangsung.

Status yang benar:

> **Engineering WIP: UX-2 masih berjalan.**

Dengan demikian:

> "0 engineering WIP"

harus dihapus dari laporan.

---

# BAGIAN 29 — STATUS COMMIT

Commit terakhir yang dilaporkan:

`6c9d939`

dengan:

`origin/master = origin/main = 6c9d939`

SCHEMA_VERSION:

`18`

---

# BAGIAN 30 — DAFTAR COMMIT PENTING

| Commit    | Fungsi                                                   |
| --------- | -------------------------------------------------------- |
| `da2d3ba` | Audit + hardening                                        |
| `b83b75e` | Role 7 + matriks                                         |
| `eeb9a50` | Rename AL ITTIHAD + layout                               |
| `83a29dd` | Audit trail per-user                                     |
| `91802a5` | Fix Turso transaction                                    |
| `c46f4fa` | Drop stock_opname                                        |
| `2a34a8f` | Retur refund diskon                                      |
| `4f12818` | Konsinyasi versi awal                                    |
| `9dbc22c` | Koreksi arah Wakalah bil Ujrah + implementasi awal zakat |
| `0e34c45` | P4-B komisi fleksibel                                    |
| `d461ef5` | Point History                                            |
| `d3e99f5` | PWA update notification                                  |
| `37d0a34` | Grosir V1                                                |
| `0777fcf` | QRIS Encoder                                             |
| `d8c1ec0` | Grosir Monitor                                           |
| `1895a6e` | Membership Card                                          |
| `3b38685` | Jam Sibuk                                                |
| `c0908bb` | Dokumentasi Batch #5                                     |
| `e5d3119` | P3/P4 HTML                                               |
| `6651cb7` | PII security verification                                |
| `3760c22` | UX-1a font/kontras                                       |
| `4b22ed9` | UX-1a kontras                                            |
| `7c7e3de` | Currency helper                                          |
| `4870aa8` | Retry pattern                                            |
| `ac0dfa2` | Test rekap                                               |
| `2bd27a1` | Zakat Step 1                                             |
| `10c8e87` | Zakat Step 1 wiring                                      |
| `ebe2e8a` | Zakat Step 2                                             |
| `6c9d939` | P4 accounting mapping provisional                        |

---

# BAGIAN 31 — STATUS P3 ZAKAT

## Engineering

🟢 **Sudah maju dan terimplementasi bertahap**

## Syariah

🟡 **Belum final — menunggu tashih**

### Yang sudah tersedia secara teknis

* payment type;
* haul anchor;
* gold standard log;
* valuation mode;
* histori;
* akumulasi;
* parameter configurable.

### Yang belum boleh dianggap final

* karat emas;
* metode valuasi;
* detail mekanisme ta'jil;
* detail pengaruh pembayaran berkala terhadap perhitungan;
* definisi operasional seluruh komponen zakat;
* final accounting treatment.

---

# BAGIAN 32 — STATUS P4 KONSINYASI

## Engineering

🟢 **Live**

## Akad

🟡 **Wakalah bil Ujrah — menunggu tashih pengurus/pengasuh**

## Komisi

🟡 **Fleksibel sesuai kesepakatan**

## Default 20%

🟡 **Preset operasional, bukan keputusan syariah**

## Rate snapshot

🟢 **Desain dipertahankan**

## Hak pemilik

🟡 **Settlement payable**

## Ujrah Kopontren

🟡 **Target mapping sebagai revenue, tetapi masih provisional**

---

# BAGIAN 33 — SISA PEKERJAAN NON-ENGINEERING

1. **P3 Tashih Ulama/Pengasuh**

   * dokumen sudah tersedia;
   * menunggu tashih.

2. **P4 Proposal Pengurus**

   * dokumen sudah tersedia;
   * menunggu keputusan/tanda tangan.

3. **NMID QRIS**

   * belum tersedia;
   * QRIS encoder belum sama dengan QRIS production.

4. **Grosir Monitor**

   * jalankan 3–7 hari;
   * amati margin;
   * amati error;
   * amati transaksi abnormal.

5. **Uji Manual HP**

   * Grosir;
   * PWA banner;
   * Zakat;
   * Hotkey;
   * CSV.

6. **Checklist Zakat**

   * verifikasi 10 item.

7. **Upload CSV**

   * menunggu penggunaan nyata.

---

# BAGIAN 34 — RENCANA LANJUTAN

## Sekarang

### UX-2

* EmptyState CTA;
* Panduan Kasir.

## Setelah UX-2

### UX-3

* TermTip;
* StatusBadge;
* penyempurnaan naming `.grad-hero`.

## Berikutnya

### P4 Accounting Correction

Setelah P4 ditashih:

* supplier goods ≠ revenue;
* owner entitlement → payable;
* ujrah → revenue;
* basis ujrah ditetapkan;
* mapping masuk P&L;
* settlement diperjelas.

### Grosir V2

Menunggu hasil monitoring.

### QRIS Asli

Menunggu NMID.

---

# BAGIAN 35 — HAL YANG JANGAN DILAKUKAN DULU

Sampai tashih selesai:

### Jangan

* menganggap 24K sebagai keputusan fiqih final;
* menganggap market valuation sebagai keputusan final;
* mengubah haul berdasarkan asumsi sendiri;
* menganggap ta'jil otomatis menggeser haul;
* menganggap 20% sebagai ketentuan syariah;
* menganggap semua penjualan konsinyasi sebagai revenue Kopontren;
* memasukkan settlement pemilik sebagai expense;
* mengubah P4 accounting mapping secara diam-diam;
* membuat keputusan fiqih baru hanya karena kebutuhan coding.

---

# BAGIAN 36 — KESIMPULAN FINAL

Per 26 September 2026, aplikasi Kopontren AL ITTIHAD telah mengalami perkembangan besar dari baseline awal menjadi sistem yang mencakup:

* POS;
* stok;
* shift;
* member;
* cashback;
* poin;
* membership card;
* grosir;
* konsinyasi;
* laporan;
* P&L;
* Neraca;
* zakat;
* audit trail;
* backup;
* notifikasi;
* PWA;
* QRIS encoder;
* analytics jam sibuk;
* dan berbagai hardening keamanan/integritas data.

Secara engineering, proyek telah berada pada tahap:

> **PRODUCTION CANDIDATE / MATURE ENGINEERING**

tetapi belum tepat menyebut:

> **"100% final dan selesai."**

Karena masih terdapat:

* UX-2 yang berjalan;
* UX-3 yang belum selesai;
* verifikasi manual;
* monitoring Grosir;
* NMID QRIS;
* tashih P3;
* tashih P4;
* dan beberapa mapping accounting yang masih provisional.

---

## STATUS RESMI YANG DISARANKAN UNTUK DICANTUMKAN

> ### 🟢 ENGINEERING
>
> **Mature / Production Candidate**
>
> Fitur inti telah banyak tersedia, automated test utama lulus, dan hardening telah dilakukan.

> ### 🟡 OPERASIONAL
>
> **Perlu final manual verification**
>
> Terutama pada HP/PWA, Grosir, Zakat, CSV, QRIS, dan alur kasir nyata.

> ### 🟡 SYARIAH
>
> **Sebagian masih provisional**
>
> P3 Zakat dan P4 Konsinyasi menunggu tashih pengasuh/ulama.

> ### 🔵 NEXT PRIORITY
>
> 1. Selesaikan UX-2
> 2. Tashih P3
> 3. Tashih P4
> 4. Verifikasi manual
> 5. Monitoring Grosir
> 6. QRIS production setelah NMID
> 7. Baru lakukan koreksi accounting P4 berdasarkan hasil tashih.

---

## PRINSIP PENUTUP

> **Kita tidak mengejar supaya aplikasi terlihat sudah sempurna.**
>
> **Kita mengejar supaya setiap angka benar, setiap transaksi dapat dilacak, setiap akad jelas, dan setiap keputusan syariah mempunyai dasar serta tashih.**

> **Fitur boleh berkembang bertahap.
> Tetapi integritas data, amanah keuangan, dan ketepatan akad tidak boleh dikompromikan.**

---

## Rujukan

* [1] MUI — Komisi Fatwa MUI masih mengkaji nisab zakat pendapatan versi BAZNAS
  (2026): https://mui.or.id/public/index.php/baca/berita/komisi-fatwa-mui-masih-kaji-nisab-zakat-pendapatan-versi-baznas
* [2] BAZNAS — Zakat Perdagangan: nisab 85 gram emas, haul 1 tahun, kadar 2,5%,
  basis aset lancar usaha dikurangi utang jangka pendek:
  https://baznas.go.id/zakatperdagangan
* [3] DSN-MUI — Fatwa No. 113/DSN-MUI/IX/2017 tentang Akad Wakalah bi Al-Ujrah:
  https://dsnmui.or.id/kategori/fatwa/
* [4] BAZNAS — Zakat Penghasilan dan Jasa 2026 (konteks standar 14K untuk
  zakat pendapatan/jasa, BUKAN untuk zakat perdagangan):
  https://www.baznas.go.id/zakatpenghasilan