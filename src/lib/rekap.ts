// Plain-ASCII WhatsApp rekap builder (safe on every WA version: no emoji, no Unicode).
export type RekapItem = {
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal: number;
};
export type RekapSale = {
  id: number;
  customer: string;
  pay_method: string;
  total: number;
  created_at: string;
  items: RekapItem[];
};

const PAY_LABEL: Record<string, string> = {
  cash: 'CASH',
  tf: 'TRANSFER',
  wa: 'WA',
};

function shortDate(utcIso: string): string {
  try {
    const d = new Date(utcIso);
    const day = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
    }).format(d);
    const rest = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
    return `${day}, ${rest}`;
  } catch {
    return '';
  }
}

function cleanName(s: string): string {
  return (s || 'Umum').trim().replace(/\s+/g, ' ');
}

export function buildRekapMsg(sales: RekapSale[], title = 'LAPORAN PENJUALAN KOPONTREN'): string {
  const lines: string[] = [];
  const latest = sales.length ? sales[sales.length - 1].created_at : new Date().toISOString();
  lines.push('*' + title + '*');
  lines.push('Al Ittihad - ' + shortDate(latest));
  lines.push('===========================');
  let grand = 0;
  let itemCount = 0;
  sales.forEach((s, i) => {
    const method = PAY_LABEL[s.pay_method] || s.pay_method.toUpperCase();
    lines.push('');
    lines.push('*' + (i + 1) + '. ' + cleanName(s.customer) + '*');
    lines.push('Bayar: ' + method);
    let sub = 0;
    for (const it of s.items) {
      sub += it.subtotal;
      itemCount++;
      lines.push('  - ' + it.product_name);
      lines.push(
        '    ' +
          it.qty +
          it.unit +
          ' x ' +
          it.unit_price.toLocaleString('id-ID') +
          ' = ' +
          it.subtotal.toLocaleString('id-ID')
      );
    }
    if (sub !== s.total) {
      lines.push('    = ' + s.total.toLocaleString('id-ID'));
    }
    lines.push('  Subtotal: ' + s.total.toLocaleString('id-ID'));
    grand += s.total;
  });
  lines.push('');
  lines.push('===========================');
  lines.push('*TOTAL BELUM DILAPORKAN*');
  lines.push('Rp ' + grand.toLocaleString('id-ID') + ' (' + sales.length + ' transaksi, ' + itemCount + ' item)');
  return lines.join('\n');
}

export async function shareRekap(text: string) {
  const enc = encodeURIComponent(text);
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {
    // user cancelled share sheet -> fall through to wa.me
  }
  window.open('https://wa.me/?text=' + enc, '_blank');
}

/** Plain-ASCII receipt (struk) text for WhatsApp, 1 line per item. */
export function strukWaText(o: {
  no: string;
  kasir: string;
  tgl: string;
  items: { qty: number; unit: string; name: string; total: number }[];
  customer?: string;
  member?: string;
  discount?: number;
  memberDiscount?: number;
  cashback?: number;
  points?: number;
  total: number;
  pay: string;
  received?: number | null;
  change?: number;
}): string {
  const lines: string[] = [];
  lines.push('*STRUK KOPONTREN AL ITTIHAD*');
  lines.push('No: ' + o.no + '  Tgl: ' + o.tgl);
  lines.push('Kasir: ' + o.kasir);
  if (o.customer) lines.push('Pembeli: ' + o.customer);
  if (o.member) lines.push('Member: ' + o.member);
  lines.push('--------------------------------');
  for (const it of o.items) {
    lines.push(
      it.qty + ' ' + it.unit + ' ' + it.name + ': Rp ' + it.total.toLocaleString('id-ID')
    );
  }
  if (o.discount && o.discount > 0) {
    lines.push('Diskon: -Rp ' + o.discount.toLocaleString('id-ID'));
  }
  if ((o.memberDiscount ?? 0) > 0) {
    lines.push('Diskon Member: -Rp ' + (o.memberDiscount ?? 0).toLocaleString('id-ID'));
  }
  lines.push('--------------------------------');
  lines.push('*TOTAL: Rp ' + o.total.toLocaleString('id-ID') + '*');
  lines.push('Bayar: ' + (PAY_LABEL[o.pay] || o.pay));
  if (o.pay === 'cash' && o.received != null) {
    lines.push('Diterima: Rp ' + o.received.toLocaleString('id-ID'));
    lines.push('Kembali: Rp ' + (o.change ?? 0).toLocaleString('id-ID'));
  }
  if ((o.cashback ?? 0) > 0) {
    lines.push('Cashback: +Rp ' + (o.cashback ?? 0).toLocaleString('id-ID') + ' (saldo member)');
  }
  if ((o.points ?? 0) > 0) {
    lines.push('Poin Didapat: +' + (o.points ?? 0) + ' Poin');
  }
  lines.push('--------------------------------');
  lines.push('Terima kasih. Mohon maaf atas ketidaknyamanannya.');
  return lines.join('\n');
}

/** Open WhatsApp with pre-filled text (optionally addressed to a phone). */
export function shareWa(text: string, phone?: string) {
  const enc = encodeURIComponent(text);
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits) {
    const intl = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
    window.open('https://wa.me/' + intl + '?text=' + enc, '_blank');
    return;
  }
  try {
    if (navigator.share) {
      void navigator.share({ text });
      return;
    }
  } catch {
    /* cancelled */
  }
  window.open('https://wa.me/?text=' + enc, '_blank');
}
