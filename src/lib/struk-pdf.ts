// Plain-ASCII 58mm receipt (struk) HTML generator -- jalur "Struk PDF" &
// "Share WA (PDF)" POS (pos-client.tsx). Tanpa dependency: HTML + CSS
// @page 58mm; user mencetak ke printer thermal 58mm ATAU "Save as PDF" di
// dialog print browser. Pola print-window mengikuti ProductBarcodeLabel
// (src/components/admin/product-label.tsx): jendela enggal + @page.
//
// CONSTRAINT (dijaga scripts/test-strukpdf.ts):
//  - seluruh output ASCII murni (tanpa emoji/unicode)
//  - tanpa gambar/base64 (file kecil, aman utk share)
//  - field order: item -> TOTAL -> Bayar -> Kembali -> Poin
//  - escaping XSS utk semua field (sama dgn .receipt-print auto-escape)
import { rp, rpShort } from './format.ts';
import { payMethodLabel } from './pay-methods.ts';

export type StrukPdfItem = {
  qty: number;
  unit: string;
  name: string;
  /** Harga satuan -- opsional; bila ada, baris item tampil "qty unit x harga". */
  price?: number;
  total: number;
};

/**
 * Argumen struk PDF -- bentuk input sama dgn strukWaText (lib/rekap.ts)
 * ditambah `points` (poin didapat) & `price` per item, agar tampilan PDF
 * selaras dgn struk WA dan blok .receipt-print.
 */
export type StrukPdfOpts = {
  no: string;
  kasir: string;
  tgl: string;
  items: StrukPdfItem[];
  customer?: string;
  member?: string;
  discount?: number;
  memberDiscount?: number;
  redeem?: number;
  cashback?: number;
  tier?: string;
  points?: number;
  total: number;
  pay: string;
  paySplit?: { m: string; a: number }[];
  received?: number | null;
  change?: number;
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Baris kunci..nilai thermal style (rata kiri / rata kanan). */
function row(label: string, value: string, cls = ''): string {
  return (
    '<div class="kv' +
    (cls ? ' ' + cls : '') +
    '"><span>' +
    esc(label) +
    '</span><span class="v">' +
    esc(value) +
    '</span></div>'
  );
}

const SEP = '<div class="s"></div>';

/**
 * Bangun dokumen HTML 58mm lengkap utk struk penjualan. Output = satu
 * string dokumen (dipakai `document.write` di jendela enggal, atau
 * diunduh/dibagikan sebagai file).
 */
export function strukPdfHtml(o: StrukPdfOpts): string {
  const parts: string[] = [];
  // Header (centered, gaya thermal).
  parts.push(
    '<div class="hd">' +
      '<div class="t1">KOPONTREN AL ITTIHAD</div>' +
      '<div class="t2">Kasir &amp; Pembukuan Pondok Pesantren</div>' +
      '<div class="eq">================================</div>' +
      '</div>'
  );
  // Meta.
  parts.push(
    '<div class="meta">' +
      row('No.', o.no) +
      row('Tgl', o.tgl) +
      row('Kasir', o.kasir) +
      (o.customer ? row('Pembeli', o.customer) : '') +
      (o.member ? row('Member', o.member) : '') +
      '</div>'
  );
  parts.push(SEP);
  // Item (nama tebal, baris kedua: qty unit [x harga] = subtotal).
  parts.push(
    o.items
      .map((it) => {
        const left =
          it.qty +
          ' ' +
          it.unit +
          (it.price != null ? ' x ' + rpShort(it.price) : '');
        return (
          '<div class="it"><div class="n">' +
          esc(it.name) +
          '</div>' +
          row(left, rpShort(it.total), 'i') +
          '</div>'
        );
      })
      .join('')
  );
  parts.push(SEP);
  // Diskon / konversi saldo (kondisional).
  if (o.discount && o.discount > 0)
    parts.push(row('Diskon', '-' + rp(o.discount)));
  if (o.memberDiscount && o.memberDiscount > 0)
    parts.push(row('Diskon member', '-' + rp(o.memberDiscount)));
  if (o.redeem && o.redeem > 0)
    parts.push(row('Tebus poin/saldo', '-' + rp(o.redeem)));
  // TOTAL.
  parts.push(row('TOTAL', rp(o.total), 'tot'));
  if (o.cashback && o.cashback > 0)
    parts.push(row('Saldo Reward', '+' + rp(o.cashback)));
  if (o.tier)
    parts.push(row('Tier', o.tier === 'gold' ? 'Gold' : 'Silver', 'b'));
  // Bayar: split penuh per bagian, atau metode tunggal (+diterima/kembali
  // utk cash) -- logika identik dgn strukWaText & .receipt-print.
  if (o.paySplit && o.paySplit.length > 0) {
    parts.push(row('Bayar', 'campur'));
    for (const p of o.paySplit)
      parts.push(row('- ' + payMethodLabel(p.m), rp(p.a)));
  } else {
    parts.push(row('Bayar', payMethodLabel(o.pay)));
    if (o.pay === 'cash' && o.received != null) {
      parts.push(row('Diterima', rp(o.received)));
      parts.push(row('Kembali', rp(o.change ?? 0)));
    }
  }
  // Poin (kondisional).
  if (o.points && o.points > 0)
    parts.push(row('Poin Didapat', '+' + o.points + ' Poin'));
  parts.push(SEP);
  // Footer.
  parts.push(
    '<div class="ft"><div>Jazakumullah Khairan Katsiran</div>' +
      '<div>Mohon maaf atas segala kekurangan</div></div>'
  );

  return (
    '<!doctype html>\n' +
    '<html lang="id">\n' +
    '<head>\n' +
    '<meta charset="utf-8"/>\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
    '<title>Struk Kopontren ' +
    esc(o.no) +
    '</title>\n' +
    '<style>\n' +
    '/* 58mm thermal: height auto -- panjang menyesuaikan isi. */\n' +
    '@page{size:58mm auto;margin:3mm}\n' +
    'html,body{margin:0;padding:0;background:#fff}\n' +
    'body{width:58mm}\n' +
    '.rcp{font-family:"Courier New",Consolas,monospace;color:#000;font-size:10px;line-height:1.4;width:58mm}\n' +
    '.hd{text-align:center;margin-bottom:5px}\n' +
    '.hd .t1{font-weight:bold;font-size:13px;letter-spacing:1px}\n' +
    '.hd .t2{font-size:9px}\n' +
    '.hd .eq{font-size:8px}\n' +
    '.kv{display:flex;justify-content:space-between;gap:4px}\n' +
    '.kv.tot{font-weight:bold;font-size:12px;margin-top:2px}\n' +
    '.kv.b{font-weight:bold}\n' +
    '.it{margin-bottom:3px}\n' +
    '.it .n{font-weight:bold}\n' +
    '.it .kv .v{font-weight:bold}\n' +
    '.s{border-top:1px dashed #000;margin:4px 0}\n' +
    '.ft{text-align:center;font-size:9px;margin-top:7px}\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div class="rcp">\n' +
    parts.join('\n') +
    '\n</div>\n' +
    '</body>\n' +
    '</html>\n'
  );
}
