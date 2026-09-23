export function rp(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return 'Rp ' + v.toLocaleString('id-ID');
}

export function rpShort(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('id-ID');
}

const tz = { timeZone: 'Asia/Jakarta', hour12: false };

function toDate(v: string | number | Date): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  let s = String(v).trim();
  // Legacy SQLite 'YYYY-MM-DD HH:MM:SS' (UTC, space-separated) -> ISO
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T') + 'Z';
  // 'T' but no timezone designator -> stored as UTC
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) s += 'Z';
  return new Date(s);
}

export function fmtDateTime(utc: string | number | Date): string {
  const d = toDate(utc);
  if (isNaN(d.getTime())) return String(utc ?? '');
  return new Intl.DateTimeFormat('id-ID', {
    ...tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function fmtDate(utc: string | number | Date): string {
  const d = toDate(utc);
  if (isNaN(d.getTime())) return String(utc ?? '');
  return new Intl.DateTimeFormat('id-ID', { ...tz, day: '2-digit', month: 'short', year: 'numeric' })
    .format(d);
}

export function fmtTime(utc: string | number | Date): string {
  const d = toDate(utc);
  if (isNaN(d.getTime())) return String(utc ?? '');
  return new Intl.DateTimeFormat('id-ID', { ...tz, hour: '2-digit', minute: '2-digit' }).format(d) +
    ' WIB';
}

/**
 * Midnight of the target Jakarta day as an ISO-8601 UTC string
 * (matches the storage format of every created_at / reported_at / settled_at:
 *  'YYYY-MM-DDTHH:MM:SS.sssZ'). Pure UTC arithmetic - independent of the
 * machine's local timezone.
 */
export function startOfDayJakarta(offsetDays = 0): string {
  const nowUtc = Date.now();
  // Render current instant on the WIB wall clock (WIB = UTC+7, fixed offset)
  const wibParts = new Date(nowUtc + 7 * 3600 * 1000);
  // "Fake UTC" of the WIB wall-clock midnight
  const fakeMidnightMs = Date.UTC(
    wibParts.getUTCFullYear(),
    wibParts.getUTCMonth(),
    wibParts.getUTCDate()
  );
  // WIB wall clock -> real UTC: subtract 7h (WIB = UTC+7). offsetDays <= 0 goes back.
  return new Date(fakeMidnightMs + offsetDays * 86400000 - 7 * 3600 * 1000).toISOString();
}

/**
 * Today's WIB calendar day as 'YYYY-MM-DD' (pure UTC arithmetic -
 * independent of the device's timezone). Jatuh tempo / tunggak memakai
 * hari kalender WIB sebagai acuan tunggal: server (payables) dan
 * klien (piutang/hutang) harus sama, device di zona waktu mana pun.
 */
export function todayWibStr(): string {
  return startOfDayJakarta(0).slice(0, 10);
}
