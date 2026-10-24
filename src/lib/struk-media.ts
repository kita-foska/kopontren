// 58mm thermal-style struk media generator (PDF + JPEG) -- tombol
// "Unduh PDF" & "Unduh Foto" POS (pos-client.tsx). Gaya: bg putih,
// teks hitam MONOSPACE (kesan printer thermal), logo Kopontren atas
// tengah, garis putus, TOTAL tegas. 58mm = 219px @96dpi.
// Layout resmi (W10 struk Option A, 24 Okt): judul STRUK PEMBELIAN,
// Tgl + zona WIB, alamat 2 baris, garis ganda ASCII (=), footer
// "Terima kasih ... Barokallahu fiikum." (garis unicode box-drawing
// diganti '=' -- gate 0 non-ASCII, precedent repo).
//
// Beda dgn jalur thermal lama (struk-pdf.ts, TIDAK diubah):
//  - jspdf & html2canvas pakai DYNAMIC import (chunk POS tetap ringan;
//    library baru dibundel saat tombol ditekan, bukan saat load POS).
//  - logo EMBED di HTML (<img> data-URI di slot .mb-logo) sehingga
//    html2canvas merendernya langsung -- deterministik; composite
//    pasca-canvas ditiadakan (fetch gagal = slot kosong, graceful).
//  - teks field semua ASCII (gate 0 non-ASCII); logo = binary gambar
//    (kecuali teks -- bukan bagian field).
//
// Test hermetis: scripts/test-struk-media.ts (struktur strukMbankingHtml;
// generateStrukPdf/Jpeg butuh DOM/canvas -- hanya jalan di browser).
import { type StrukPdfOpts } from './struk-pdf.ts';
import { rp, rpShort } from './format.ts';
import { payMethodLabel } from './pay-methods.ts';

/** Lebar fisik struk (mm) -- sama dgn jalur thermal. */
export const STRUK_W_MM = 58;
/** Lebar px @96dpi (58mm = 219px) -- basis render html2canvas. */
export const STRUK_W_PX = 219;
/** Tinggi slot logo cadangan (px) di header m-banking. */
export const LOGO_SLOT_PX = 64;
/** Skala render -- 3x utk teks tajam di PDF (657px lebar efektif). */
export const STRUK_SCALE = 3;

/**
 * Garis ganda ASCII (Option A resmi) -- 30 char '=' (baris lebar
 * struk ~30 char monospace @11px). Unicode box-drawing (U+2550)
 * TIDAK dipakai: gate 0 non-ASCII + precedent repo (W10-4:
 * box-drawing diganti '-').
 */
const LINE_DBL: string = '='.repeat(30);

/** Blok alamat 2 baris (Option A resmi) -- statis; sumber data
 * (settings) tunggu ruling Gus Fi (residual). */
const STRUK_ADDR: string[] = ['Jl. Perintis Kemerdekaan, Jurang,', 'Temanggung'];

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Baris kunci..nilai (rata kiri / rata kanan) -- sama pola struk-pdf. */
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
 * Bangun HTML struk thermal 58mm -- fragment (tanpa doctype),
 * dipakai html2canvas di renderStrukCanvas. Slot logo = div.mb-logo;
 * bila logoUri diberikan, logo di-embed sebagai <img> data-URI
 * (html2canvas merender langsung, lebih deterministik). Tanpa
 * logoUri slot tetap kosong (graceful -- struk tanpa logo).
 * Data-URI hanya di slot gambar -- bukan bagian field teks.
 */
export function strukMbankingHtml(o: StrukPdfOpts, logoUri?: string): string {
  const parts: string[] = [];
  const dbl = '<div class="ln">' + LINE_DBL + '</div>';
  // Header: slot logo + nama toko + tagline + alamat 2 baris
  // (Option A resmi; centered, gaya thermal).
  parts.push(
    '<div class="mb-logo" style="height:' +
      LOGO_SLOT_PX +
      'px">' +
      (logoUri
        ? '<img src="' + logoUri + '" width="48" height="48" alt="">'
        : '') +
      '</div>' +
      '<div class="hd"><div class="t1">KOPONTREN AL ITTIHAD</div>' +
      '<div class="t2">Kasir &amp; Pembukuan Pondok Pesantren</div>' +
      STRUK_ADDR.map((l) => '<div class="ad">' + esc(l) + '</div>').join('') +
      '</div>'
  );
  // Judul resmi -- garis ganda di atas & bawah (Option A).
  parts.push(dbl);
  parts.push('<div class="ttl">STRUK PEMBELIAN</div>');
  parts.push(dbl);
  // Meta (Tgl + zona WIB -- transparan, Option A).
  parts.push(
    '<div class="meta">' +
      row('No.', o.no) +
      row('Tgl', o.tgl + ' WIB') +
      row('Kasir', o.kasir) +
      (o.customer ? row('Pembeli', o.customer) : '') +
      (o.member ? row('Member', o.member) : '') +
      '</div>'
  );
  // Item (label ITEM + baris tunggal -- Option A).
  parts.push(dbl);
  parts.push('<div class="itmh">ITEM</div>');
  parts.push(SEP);
  // Item (nama tebal, baris kedua: qty unit [x harga] = subtotal).
  parts.push(
    o.items
      .map((it) => {
        const left =
          it.qty + ' ' + it.unit + (it.price != null ? ' x ' + rpShort(it.price) : '');
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
  // Diskon / konversi saldo (kondisional -- logika identik struk-pdf).
  if (o.discount && o.discount > 0) parts.push(row('Diskon', '-' + rp(o.discount)));
  if (o.memberDiscount && o.memberDiscount > 0)
    parts.push(row('Diskon member', '-' + rp(o.memberDiscount)));
  if (o.redeem && o.redeem > 0)
    parts.push(row('Tebus poin/saldo', '-' + rp(o.redeem)));
  // TOTAL (tegas -- font besar).
  parts.push(
    '<div class="tot"><span>TOTAL</span><span class="v">' + rp(o.total) + '</span></div>'
  );
  if (o.cashback && o.cashback > 0)
    parts.push(row('Saldo Reward', '+' + rp(o.cashback)));
  if (o.tier) parts.push(row('Tier', o.tier === 'gold' ? 'Gold' : 'Silver', 'b'));
  // Bayar: split penuh per bagian, atau metode tunggal (+diterima/kembali).
  parts.push(dbl);
  if (o.paySplit && o.paySplit.length > 0) {
    parts.push(row('Bayar', 'campur'));
    for (const p of o.paySplit) parts.push(row('- ' + payMethodLabel(p.m), rp(p.a)));
  } else {
    parts.push(row('Bayar', payMethodLabel(o.pay)));
    if (o.pay === 'cash' && o.received != null) {
      parts.push(row('Diterima', rp(o.received)));
      parts.push(row('Kembali', rp(o.change ?? 0)));
    }
  }
  // Poin (kondisional).
  if (o.points && o.points > 0) parts.push(row('Poin Didapat', '+' + o.points + ' Poin'));
  // Footer: terima kasih + doa (Option A) -- garis ganda di atas
  // & bawah; lalu footer Jazakumullah.
  parts.push(dbl);
  parts.push(
    '<div class="ft"><div>Terima kasih atas kunjungan Anda.</div>' +
      '<div>Barokallahu fiikum.</div></div>'
  );
  parts.push(dbl);
  parts.push(
    '<div class="ft"><div>Jazakumullah Khairan Katsiran</div>' +
      '<div>Mohon maaf atas segala kekurangan</div></div>'
  );

  const style =
    '.mb{background:#fff;color:#111;font-family:\'Courier New\',Consolas,monospace;font-size:11px;line-height:1.45;padding:8px;box-sizing:border-box}' +
    '.mb-logo{display:flex;align-items:center;justify-content:center;margin-bottom:2px}' +
    '.hd{text-align:center;margin-bottom:4px}' +
    '.hd .t1{font-weight:bold;font-size:13px;letter-spacing:0.5px}' +
    '.hd .t2{font-size:9px;color:#444}' +
    '.hd .ad{font-size:9px;color:#444;line-height:1.3}' +
    '.ttl{text-align:center;font-weight:bold;font-size:12px;letter-spacing:1px;margin:4px 0}' +
    '.ln{text-align:center;font-size:10px;line-height:1;margin:2px 0;overflow:hidden;white-space:nowrap}' +
    '.itmh{text-align:center;font-weight:bold;font-size:10px;letter-spacing:1px;margin:2px 0}' +
    '.kv{display:flex;justify-content:space-between;gap:6px}' +
    '.kv .v{font-weight:bold}' +
    '.kv.b{font-weight:bold}' +
    '.it{margin-bottom:3px}' +
    '.it .n{font-weight:bold}' +
    '.tot{display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin:3px 0}' +
    '.s{border-top:1px dashed #333;margin:4px 0}' +
    '.ft{text-align:center;font-size:9px;color:#444;margin-top:6px}';

  return (
    '<style>' +
    style +
    '</style>' +
    '<div class="mb" style="width:' +
    STRUK_W_PX +
    'px">' +
    parts.join('\n') +
    '</div>'
  );
}

/**
 * Ambil logo Kopontren sebagai data URI -- SVG dulu (ringan, self-
 * contained di public/), fallback PNG (raster, pasti bisa didraw).
 * Return undefined bila kedua-duanya gagal (struk tetap jalan tanpa
 * logo -- slot kosong).
 */
export async function resolveLogoUri(): Promise<string | undefined> {
  try {
    const r = await fetch('/logo-kopontren.svg');
    if (r.ok) {
      const txt = await r.text();
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt);
    }
  } catch {
    /* lanjut fallback PNG */
  }
  try {
    const r = await fetch('/logo-kopontren.png');
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
    }
    return 'data:image/png;base64,' + btoa(bin);
  } catch {
    return undefined;
  }
}

/**
 * Render struk thermal ke canvas (white bg, scale 3x). Dipakai
 * generateStrukPdf & generateStrukJpeg (1x render, 2 output).
 * Logo di-embed di HTML (<img> data-URI) -- html2canvas merender
 * langsung, tanpa composite pasca-canvas.
 */
async function renderStrukCanvas(o: StrukPdfOpts): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas');
  const logoUri = await resolveLogoUri();
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-9999px;top:0;width:' + STRUK_W_PX + 'px;background:#fff';
  host.innerHTML = strukMbankingHtml(o, logoUri);
  document.body.appendChild(host);
  const el = host.querySelector('.mb') as HTMLElement;
  const canvas = await html2canvas(el, {
    scale: STRUK_SCALE,
    backgroundColor: '#ffffff',
    width: STRUK_W_PX,
  });
  host.remove();
  return canvas;
}

function strukFileName(no: string, ext: string): string {
  return 'struk-' + no.replace(/[^0-9A-Za-z-]/g, '') + '.' + ext;
}

/**
 * Struk -> File PDF (58mm lebar, tinggi sesuai rasio canvas). jsPDF
 * dynamic import -- library hanya terbundel saat tombol ditekan.
 */
export async function generateStrukPdf(o: StrukPdfOpts): Promise<File> {
  const canvas = await renderStrukCanvas(o);
  const { jsPDF } = await import('jspdf');
  const jpeg = canvas.toDataURL('image/jpeg', 0.92);
  const h = STRUK_W_MM * (canvas.height / canvas.width);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [STRUK_W_MM, h] });
  doc.addImage(jpeg, 'JPEG', 0, 0, STRUK_W_MM, h);
  return new File([doc.output('blob')], strukFileName(o.no, 'pdf'), {
    type: 'application/pdf',
  });
}

/** Struk -> File JPEG (foto struk 58mm, utk WA/chat). */
export async function generateStrukJpeg(o: StrukPdfOpts): Promise<File> {
  const canvas = await renderStrukCanvas(o);
  const blob: Blob = await new Promise((res, rej) => {
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error('toBlob gagal'))),
      'image/jpeg',
      0.92
    );
  });
  return new File([blob], strukFileName(o.no, 'jpg'), { type: 'image/jpeg' });
}
