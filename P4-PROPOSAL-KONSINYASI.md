# PROPOSAL PENGURUS — KOMISI KONSINYASI 20% (JU'ALAH)
## Kopontren Al Ittihad

> **Materi musyawarah pengurus, BUKAN fatwa.**
> Bagian teknis sudah diimplementasi & teruji (commit `4f12818`);
> dokumen ini meminta **per setujuan resmi pengurus** atas skema
> + parameter yang dipilih. Opsi alternatif dicantumkan agar
> musyawarah bisa mengganti keputusan tanpa engineering baru
> yang besar.

- Tanggal: 24 Sep 2026
- Penyusun: Tim app Kopontren (admin)
- Landasan: SYARIAH-CHECKLIST.md — keputusan P4 (akad ju'alah)
- Status teknis: SELESAI (pushed master+main, menunggu approval
  pengurus + tashih sisa ke ulama)

### A. Latar Belakang
Pengurus berkeputusan: toko mengambil komisi 20% dari harga jual
barang konsinyasi. Sebelumnya (18 Sep) fitur konsinyasi berjalan
tanpa komisi — 100% hasil untuk pemilik barang. Keputusan P4
checklist syariah: bila toko mau komisi, pakai akad **ju'alah**
(upah atas pekerjaan yang terlaksana — Fatwa DSN-MUI No. 62/2007),
komisi disepakati di muka & tercatat di baris konsinyasi.

### B. Opsi yang Dideliberasi (beserta pilihan yang terpasang)
| Aspek | Opsi | Terpilih |
|-------|------|----------|
| Akad | wadiah (tanpa komisi) / ju'alah / ijara | **ju'alah** (pengurus minta komisi) |
| Waktu ujrah | di muka (saat titipan diterima) / saat terjual | **saat terjual** — komisi baru ada bila hasil ada (prinsip ju'alah: upah atas kerja yang terlaksana; barang dikembalikan tanpa komisi = "ora payu") |
| Besaran | % global / % per titipan / Rp flat per item | **% (default 20), ter-snapshot per titipan** |
| Rate snapshot | per titipan (diambil saat titipan dibuat) / mengambang ikut setting | **snapshot** — kontrak berjalan tak berubah walau setting global di-ubah |
| Pencatatan kas | otomatis saat sell / manual admin | **otomatis** "Ujrah Kon. <pemilik> − <barang>" — anti dobel hitung |
| Tagihan pemilik | bruto / neto komisi | **neto** (pemilik dapat 80%) |
| Alokasi ujrah | masuk P&L / off-P&L | **off-P&L (memo)** di V1, baris "Ujrah Konsinyasi" — setara settlement |

### C. Implementasi (sudah teruji, commit `4f12818`)
- Setting baru `konsinyasi_commission` (default '20'; admin bisa
  ubah 0–100 via `/api/settings`; 0 = tanpa komisi = status quo).
- Kolom `consignments.commission_rate` (DB v15, idempoten) =
  snapshot rate per titipan; baris lama default 20.
- Helper murni `src/lib/konsinyasi.ts`: `splitConsignment` —
  komisi = floor(harga × rate/100), pemilik = harga − komisi,
  total persis tanpa pecahan rupiah.
- `/api/konsinyasi`: `sell` otomatis mencatat kas masuk ujrah
  (+invalidate cache kas/laporan); `return` tidak menambah tagihan.
- P&L V1 + memo WA + CSV: baris "Ujrah Konsinyasi" + peringatan
  "jangan dicatat manual".
- UI `/admin/konsinyasi`: badge "Komisi toko X% · Ujrah Rp …",
  "Tagihan pemilik", hint akad ju'alah.
- Backup: kolom `commission_rate` ikut export/restore.

### D. Bukti Teknis
`tsc --noEmit` exit 0 · `test:konsinyasi` 24/24 ·
`test:margin` 57/57 · `test:split` ALL_PASS ·
`test:clientip` 16 ok. Contoh skenario teruji: 4 unit terjual
@10.000 → ujrah 4×2.000 = 8.000 (otomatis ke kas),
tagihan pemilik = 4×8.000 = 32.000; barang dikembalikan →
ujrah 0, tagihan tidak berubah.

### E. Risiko & Penahan
1. **Dobel hitung ujrah** di laporan → dihalau: otomatis +
   warning V1; tashih tersisa utk ulama: bolehkah ujrah
   dihitung dari harga jual aktual bila berbeda dari harga
   perjanjian (V1 memakai harga perjanjian).
2. **Setting di-ubah semasa kontrak berjalan** → snapshot
   per titipan (kontrak lama tak berubah).
3. **Toko merugi** bila komisi 20% dianggap besar →
   parameter `konsinyasi_commission` bisa di-ubah admin
   kapan saja utk titipan BARU.
4. **Pemilik protes** (tagihan jadi neto) → label UI jelas
   ("Tagihan pemilik", "Ujrah Rp …"); akad + besaran
   tercatat di baris konsinyasi (bukti).

### F. Permohonan Keputusan Pengurus
1. [ ] Setujui skema komisi 20% (ju'alah, ujrah saat terjual)
   **sesuai implementasi** commit `4f12818`.
2. [ ] Setujui default 20% + hak admin ubah parameter
   `konsinyasi_commission` (0–100) utk titipan baru.
3. [ ] Setujui meneruskan pertanyaan sisa ke ulama (lihat
   E.1 + lampiran P3 bila relevan).

Keputusan dicatat di `MEMORY.md` + `SYARIAH-CHECKLIST.md`
(seksi "Keputusan user P").

### G. Lampiran
- `SYARIAH-CHECKLIST.md` (item 4 + keputusan P4)
- Commit `4f12818` (14 file)
- `scripts/test-konsinyasi.ts` (skenario teruji)
- `src/lib/konsinyasi.ts`, `src/app/api/konsinyasi/route.ts`