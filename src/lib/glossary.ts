/**
 * UX-1 (E39) -- kamus istilah resmi aplikasi: SATU sumber definisi
 * bahasa awam, dipakai halaman /admin/glosarium. TermTip (ui.tsx) di
 * tiap halaman memakai tip pendek per-konteks; definisi lengkap merujuk
 * ke sini. Aturan: bahasa awam, tanpa singkatan tanpa penjelasan,
 * ASCII-only.
 */
export interface GlossaryTerm {
  term: string;
  desc: string;
  group:
    | 'Toko & Transaksi'
    | 'Akad & Bagi Hasil'
    | 'ZIS & Zakat'
    | 'Laporan & Buku'
    | 'Member & Reward'
    | 'Koperasi & SHU';
}

export const GLOSSARY: GlossaryTerm[] = [
  // -- Toko & Transaksi
  {
    term: 'Omzet',
    desc: 'Total penjualan barang dalam periode. Belum dikurangi biaya, beban, atau zakat.',
    group: 'Toko & Transaksi',
  },
  {
    term: 'HPP',
    desc: 'Harga Pokok Penjualan: biaya perolehan barang yang terjual. Dasar menghitung laba dan zakat (mode HPP).',
    group: 'Toko & Transaksi',
  },
  {
    term: 'Laba Kotor',
    desc: 'Omzet dikurangi HPP. Belum dikurangi beban operasional (gaji, listrik, dll).',
    group: 'Toko & Transaksi',
  },
  {
    term: 'Laba Bersih',
    desc: 'Keuntungan akhir setelah semua pendapatan dan beban diperhitungkan.',
    group: 'Toko & Transaksi',
  },
  {
    term: 'QRIS',
    desc: 'Standar kode QR pembayaran nasional. Nasabah scan dari aplikasi bank/dompet digital; uang masuk ke rekening toko.',
    group: 'Toko & Transaksi',
  },
  {
    term: 'Campur (split)',
    desc: 'Satu transaksi dibayar dengan lebih dari satu cara sekaligus, mis. sebagian tunai, sebagian QRIS.',
    group: 'Toko & Transaksi',
  },
  // -- Akad & Bagi Hasil
  {
    term: 'Akad',
    desc: 'Kontrak kesepakatan antar pihak yang berlandaskan syariah. Contoh: murabahah, mudharabah, ijarah.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Murabahah',
    desc: 'Jual beli dengan margin keuntungan diketahui dan tetap sejak awal. Bisa dicicil; margin tidak berubah seiring waktu.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Mudharabah',
    desc: 'Kemitraan: satu pihak menaruh modal, pihak lain mengelola. Laba dibagi sesuai nisbah yang disepakati; kerugian finansial ditanggung pemilik modal.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Musyarakah',
    desc: 'Kemitraan di mana semua pihak menaruh modal; laba dan rugi dibagi sesuai nisbah.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Ijarah',
    desc: 'Sewa-menyewa: penyewa membayar biaya periodik untuk memakai barang; pemilik tetap memiliki barang.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Wakalah',
    desc: 'Kuasa: satu pihak beracara atas nama pihak lain sesuai amanah yang diberikan (mis. biaya perantara/agen).',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Nisbah',
    desc: 'Porsi pembagian laba atau rugi yang disepakati antar mitra, mis. 70:30.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Ujrah',
    desc: 'Imbalan jasa atau kerja; upah yang sah atas pelayanan (bukan bunga). Contoh: komisi penjualan barang titipan.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Konsinyasi',
    desc: 'Pemilik menitipkan barang di toko untuk dijualkan. Bayarannya baru terjadi setelah barang terjual; toko mengambil ujrah (komisi).',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Settlement',
    desc: 'Penyelesaian titipan: pembayaran ke pemilik setelah barang terjual, dihitung dari harga dikurangi komisi toko.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Denda',
    desc: 'Biaya akibat keterlambatan atau pelanggaran akad. Di aplikasi ini dicatat, tetapi tidak pernah di-bukukan (uang hasil denda tidak boleh jadi pendapatan).',
    group: 'Akad & Bagi Hasil',
  },
  // -- Koperasi (W4.3; akun simpanan 2050/2060/2070 + SHU 30xx, skema v24)
  {
    term: 'Simpanan Pokok',
    desc: 'Simpanan masuk awal saat menjadi anggota koperasi. Tidak bisa ditarik selama keanggotaan masih aktif; dikembalikan saat anggota keluar (bila GL aktif, refund otomatis D2050 ke kas).',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Simpanan Wajib',
    desc: 'Simpanan rutin yang diatur koperasi (mis. setoran per bulan). Tetap milik anggota; tidak dikembalikan saat anggota keluar.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Simpanan Sukarela',
    desc: 'Simpanan atas keinginan sendiri dari anggota; jumlahnya bebas. Bisa ditarik selama masih tersisa; tidak perlu dikembalikan saat keluar.',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'SHU',
    desc: 'Sisa Hasil Usaha: keuntungan koperasi dalam satu periode. Bisa dicadangkan (umum/khusus), dipakai jasa anggota, atau dibagikan; distribusinya dicatat lewat jurnal (fitur W4.4).',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Rumpun',
    desc: 'Lingkaran keluarga atau pesantren tempat anggota; pengelompokan anggota koperasi (opsional, untuk pelaporan per rumpun).',
    group: 'Akad & Bagi Hasil',
  },
  {
    term: 'Rekap per Rumpun',
    desc: 'Ringkasan saldo simpanan per rumpun (keluarga): jumlah anggota di rumpun itu + rincian simpanan pokok, wajib, sukarela, dan totalnya; baris TOTAL menjumlah semua rumpun. Anggota tanpa rumpun dikelompokkan di baris "Tanpa rumpun" (paling bawah). Huruf besar/kecil dihitung satu rumpun (label = yang pertama ditemui). Tampil di kartu "Rekap per Rumpun", tab Rekap Koperasi.',
    group: 'Koperasi & SHU',
  },
  // -- ZIS & Zakat
  {
    term: 'Zakat',
    desc: 'Kewajiban menyucikan harta: biasanya 2,5% dari harta yang telah mencapai nisab dan haul.',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Zakat Dagang',
    desc: 'Zakat atas harta perdagangan: 2,5% dari modal + laba kotor + piutang - hutang, setelah haul (1 tahun hijriah) dipenuhi.',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Nisab',
    desc: 'Ambang minimal harta agar zakat wajib dibayar.',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Haul',
    desc: 'Sudah satu tahun hijriah (12 bulan qamariyah) memegang harta secara terus-menerus.',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Infak',
    desc: 'Sumbangan sukarela tanpa syarat; tidak wajib.',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Sedekah',
    desc: 'Memberikan harta secara sukarela; tidak wajib; bisa berupa uang atau barang.',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Wakaf',
    desc: 'Menahan harta/aset untuk kemanfaatan umum; modal asal tidak habis (dipakai hasilnya).',
    group: 'ZIS & Zakat',
  },
  {
    term: 'Tashih',
    desc: 'Pemeriksaan dan pengesahan perhitungan zakat oleh ulama, sebelum keputusan pembayaran diambil.',
    group: 'ZIS & Zakat',
  },
  // -- Laporan & Buku
  {
    term: 'GL',
    desc: 'General Ledger: buku besar yang memuat semua akun buku dan mutasinya. Di aplikasi ini setiap transaksi penting bisa auto-jurnal.',
    group: 'Laporan & Buku',
  },
  {
    term: 'Jurnal',
    desc: 'Catatan transaksi keuangan berurutan (debit/kredit). Data bersifat tetap (immutable); koreksi dilakukan lewat jurnal pembalik, bukan hapus.',
    group: 'Laporan & Buku',
  },
  {
    term: 'Jurnal Pembalik',
    desc: 'Koreksi tanpa menghapus: dicatatkan entri berlawanan. Bukti asal tetap ada untuk audit.',
    group: 'Laporan & Buku',
  },
  {
    term: 'Neraca',
    desc: 'Laporan posisi harta (aset) dan kewajiban (utang) per tanggal tertentu. Potret kekayaan toko.',
    group: 'Laporan & Buku',
  },
  {
    term: 'LKA',
    desc: 'Laporan Laba-Rugi formal: pendapatan dan beban dalam periode; selisihnya = laba/rugi bersih.',
    group: 'Laporan & Buku',
  },
  {
    term: 'LPE',
    desc: 'Laporan Perubahan Ekuitas: apa yang menambah atau mengurangi cadangan/modal selama periode.',
    group: 'Laporan & Buku',
  },
  {
    term: 'CALK',
    desc: 'Catatan Atas Laporan Keuangan: penjelasan kebijakan dan rincian di balik angka laporan (zakat, konsinyasi, wakaf, dll).',
    group: 'Laporan & Buku',
  },
  {
    term: 'COA',
    desc: 'Chart of Accounts: daftar kode akun buku (grup SAK-EP) yang dipakai aplikasi untuk pencatatan.',
    group: 'Laporan & Buku',
  },
  {
    term: 'D=K',
    desc: 'Debit harus sama dengan Kredit. Setiap buku harus seimbang; bila tidak, ada pencatatan yang salah dan perlu diperiksa.',
    group: 'Laporan & Buku',
  },
  {
    term: 'Mutasi',
    desc: 'Perubahan saldo akun dalam periode (daftar masuk-keluar).',
    group: 'Laporan & Buku',
  },
  {
    term: 'Rekonsiliasi',
    desc: 'Membandingkan dua sumber buku (mis. GL vs laporan) untuk menemukan dan menangani selisih.',
    group: 'Laporan & Buku',
  },
  // -- Member & Reward
  {
    term: 'Poin',
    desc: 'Poin loyalitas yang didapat member saat berbelanja; dapat ditebus sesuai nilai poin dan pengaturan.',
    group: 'Member & Reward',
  },
  {
    term: 'Cashback',
    desc: 'Diskon yang dikreditkan ke saldo member setelah transaksi; dipakai untuk pembayaran transaksi berikutnya.',
    group: 'Member & Reward',
  },
  {
    term: 'Saldo Reward',
    desc: 'Akumulasi cashback di akun member yang bisa dipakai sebagai pembayaran.',
    group: 'Member & Reward',
  },
  {
    term: 'Diskon Member',
    desc: 'Potongan otomatis untuk transaksi atas nama member terdaftar.',
    group: 'Member & Reward',
  },
  {
    term: 'Tier Loyalty',
    desc: 'Level member berdasarkan total belanja kumulatif (mis. Silver, Gold); level lebih tinggi mendapat keuntungan lebih besar.',
    group: 'Member & Reward',
  },
  // -- Koperasi & SHU (W4.4)
  {
    term: 'SHU',
    desc: 'Sisa Hasil Usaha: hasil usaha koperasi dalam satu periode (laba/rugi) setelah semua beban. Di aplikasi dihitung dari input admin plus rasio alokasi, lalu dicatat sebagai jurnal alokasi (W4.4); pembagian jasa per anggota dan pencairan tunai = W4.5b.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'Cadangan Umum',
    desc: 'Sebagian SHU yang ditahan untuk cadangan umum koperasi (akun 3030), memperkuat permodalan; tidak dibagikan ke anggota.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'Cadangan Khusus',
    desc: 'Sebagian SHU untuk cadangan khusus koperasi (akun 3040), ditahan untuk kebutuhan tertentu koperasi.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'Jasa Anggota',
    desc: 'Sebagian SHU sebagai imbal jasa/modal anggota (akun 3050). W4.5b: dibagikan per anggota dengan rata-rata (floor + sisa ke urutan nama; konservatif, bukan bunga); satu distribusi per periode, jurnal agregat D3050 -> K2070 saat GL aktif.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'SHU Dibagi',
    desc: 'Sebagian SHU yang dibagikan kepada anggota (akun 3060). W4.5b: pencairan tunai/transfer = jurnal D3060 -> kas (1010) atau bank/transfer (1020); akun 5080 (label "Distribusi SHU") tidak dipakai jurnal. Satu pencairan per periode; nominal tidak melebihi saldo 3060.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'Rasio Alokasi',
    desc: 'Persentase pembagian SHU (cadangan umum / cadangan khusus / jasa / dibagi). Diisi admin per periode; aplikasi tidak menyediakan angka default. Porsi "dibagi" dihitung sebagai sisa agar total pas.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'Modal',
    desc: 'Uang yang dititipkan anggota sebagai kekuatan kooperasi (akun 3010). Bukan simpanan dan bukan pinjaman: tidak bisa dibagikan sebagai keuntungan dan tidak kembali per anggota saat keluar.',
    group: 'Koperasi & SHU',
  },
  {
    term: 'Jurnal Closing',
    desc: 'Jurnal akhir periode yang menol-kan net akun laba-rugi (omzet, HPP, beban, dst) ke 3020 SHU Ditahan: laba menambah 3020, rugi mengurangi 3020 (3020 boleh negatif). Satu closing per periode.',
    group: 'Koperasi & SHU',
  },
];

/** Cari definisi dari kamus (untuk TermTip konteks; fallback = tip lokal). */
export function tipFor(term: string): string | undefined {
  return GLOSSARY.find((g) => g.term.toLowerCase() === term.toLowerCase())?.desc;
}
