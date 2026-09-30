# Keputusan F3.3 — Jawaban Tashih Proposal Akuntansi (Level C)

> **Jawaban: Gus Fi (Ali Makfi) · 30 September 2026**
> Merespons `docs/akuntansi-proposal.md` §13 (14 poin) via antarmuka
> tashih interaktif `/tutorial/akuntansi-proposal`
> (`docs/AKUNTANSI-PROPOSAL.html`, §13 — tombol "Copy Jawaban Tashih").
>
> **Alur (aturan F3.3, §13 proposal):** Cline presentasi dokumen →
> Gus Fi tinjau + putuskan **langsung** (pengasuh mengikuti
> keputusan; tidak ada forum pengurus+pengasuh terpisah) →
> keputusan di-rekam di berkas ini (**commit terpisah**) →
> revisi proposal bila perlu (**commit terpisah**) → F3.4+ mulai.
>
> **Prinsip: syariah nomer 1, fitur nomer 2.** Cline TIDAK
> memutuskan fiqih/standar — semua nilai syariah diputuskan Gus Fi.

---

## Ringkasan

**12 Setuju · 0 Ora Setuju · 2 Koreksi**
Perlu ditindaklanjuti: item **6** (denda) & item **14** (wakaf).

| # | Item (opsi yang disajikan · rujukan proposal) | Jawaban | Catatan Gus Fi |
|---|---|---|---|
| 1 | Nisbah mudharabah & musyarakah — % per akad, input manual · §6.5 | **SETUJU** | - |
| 2 | Rate zakat (mal/tijarah/fitrah) + mustahik — angka + daftar mustahik sah; finalkan P3 (24K/market/haul) · §8.3 | **SETUJU** | - |
| 3 | Margin murabahah — % / nominal per akad; basis pengakuan · §6.5 | **SETUJU** | - |
| 4 | Rasio distribusi SHU — cadangan umum/khusus/jasa anggota/dibagi + periodik · §7.2 | **SETUJU** | - |
| 5 | Rate ijarah — nominal per periode per akad · §6.5 | **SETUJU** | - |
| 6 | Denda keterlambatan — ada/tidak; nominal/rasio; ke kas sosial · §6.4 | **KOREKSI** | "ini tidak usah, bisa dengan yang lain. tidak denda." |
| 7 | Penerima LK formal (CALK/LK 5) — siapa & frekuensi · §5.5 | **SETUJU** | - |
| 8 | Tanggal N buku pembuka + angka saldo pembuka · §10 | **SETUJU** | - |
| 9 | Sumber teks PAP (+ status ED SAK Koperasi) · §9 | **SETUJU** | - |
| 10 | Simpanan wajib + ketentuan tarik sukarela · §7.2 | **SETUJU** | - |
| 11 | Periode closing jurnal + metode penyusutan & umur aset (1050/1060) · §3.2.6 | **SETUJU** | - |
| 12 | Pola pencairan mudharabah/musyarakah (1080 vs 2040) · §6.4 | **SETUJU** | - |
| 13 | Switch label entitas ("Kopontren (dalam proses)" → resmi, `coop_registered`) · §1.1 | **SETUJU** | - |
| 14 | Revisi keputusan #7 (wakaf) — bila tidak lagi ditunda, scope tambahan PSAK 112 · §8.2 | **KOREKSI** | "wakaf aktif" |

---

## Tindak Lanjut (koreksi #6 & #14)

### #6 — Denda keterlambatan: TIDAK ADA

Gus Fi memutuskan skema denda keterlambatan **tidak diterapkan**
("ini tidak usah, bisa dengan yang lain. tidak denda."). Penanganan
keterlambatan bila diperlukan = mekanisme lain di luar denda,
**di luar scope proposal GL ini** — diputuskan terpisah bila
dibutuhkan (aspek fiqih-nya, bila mau, tetap tashih ulama).

Dampak teknis (direvisi di `docs/akuntansi-proposal.md`, commit
terpisah):
- Akun **5050** (Denda/Keterlambatan clearing) **tidak diaktifkan** —
  tetap di-seed dgn `status=closed` (akun tidak dihapus, aturan §2.7
  "hapus = TIDAK ADA"), tidak ada fitur input denda.
- Baris "Denda diterima" (§6.4) & parameter denda (§6.5) dicoret.
- Kolom `kind` tabel `zis`: `'zakat'|'infak'|'sedekah'|'wakaf'`
  ('denda' keluar; 'wakaf' masuk — lihat #14).
- LKA/CALK: sebutan denda pada kas sosial (1100) & struktur LKA
  dihapus (beban operasi → "Laba Sebelum ZIS"; ZIS = 5090+5100+6030).
- Roadmap: **W3.5** (input denda) dialokasikan ulang → scope wakaf
  (lihat #14) — total commit tetap 32.

### #14 — Wakaf: AKTIF (revisi keputusan #7)

Keputusan #7 (29 Sep: "B — Belum sekarang, ditunda; hook §8.2")
**di-revisi**: wakaf **aktif** → scope tambahan PSAK 112 berlaku.

Dampak teknis:
- Akun **1120** (Aset Wakaf), **4100** (Wakaf Masuk), **6020**
  (Aset Wakaf, grup 6xx) = **AKTIF** (bukan placeholder ditunda).
- Booking = hook yang sudah disiapkan §8.2: input `kind='wakaf'` di
  UI `/admin/zis` + jurnal manual ke 1120/4100/6020.
- Invarian anti-campur **tetap**: wakaf tidak dicampur kas toko
  (rekon #16: 1010+1020 = kas V1; 1100 terpisah).
- Roadmap: **W3.5** kini = fitur wakaf aktif + test.

### Item Setuju — yang dikunci

12 item SETUJU mengunci **bentuk keputusan** yang disajikan §13
(input manual per akad utk nisbah/margin/rate; angka zakat P3
24K/market/haul + mustahik **final** via #2; penerima LK formal;
tanggal N; sumber teks PAP; simpanan wajib/sukarela; periode closing
+ penyusutan; pola booking mudharabah/musyarakah; label entitas).
Konsekuensi:
- Nilai yang masih "placeholder teknis" kini menjadi ketentuan.
- **#2 = tashih P3 turun** → larangan prabatasih R6 lepas utk modul
  zakat: jembatan `zakat_history` boleh di-switch + badge
  "provisional" dihapus, **saat commit implementasi** (F3.4+),
  bukan sekarang.
- **F3.4+ siap mulai** sesuai roadmap §12 (Wave 1, 6 minggu).

---

## Lampiran — Teks Jawaban Tashih (asli, copy dari §13)

```
JAWABAN TASHIH — AKUNTANSI PROPOSAL (F3.3)
Tanggal: 30 September 2026
Oleh: Gus Fi (Ali Makfi)

1. Nisbah mudharabah & musyarakah → SETUJU
2. Rate zakat (mal/tijarah/fitrah) + mustahik → SETUJU
3. Margin murabahah → SETUJU
4. Rasio distribusi SHU → SETUJU
5. Rate ijarah → SETUJU
6. Denda keterlambatan → KOREKSI (ini tidak usah, bisa dengan
   yang lain. tidak denda.)
7. Penerima LK formal (CALK/LK 5) → SETUJU
8. Tanggal N buku pembuka + angka saldo pembuka → SETUJU
9. Sumber teks PAP (+ status ED SAK Koperasi) → SETUJU
10. Simpanan wajib + ketentuan tarik sukarela → SETUJU
11. Periode closing jurnal + penyusutan → SETUJU
12. Pola pencairan mudharabah/musyarakah → SETUJU
13. Switch label entitas → SETUJU
14. Revisi keputusan #7 (wakaf) → KOREKSI (wakaf aktif)

Ringkasan: 12 Setuju, 0 Ora Setuju, 2 Koreksi
Perlu ditindaklanjuti: 6, 14
```
