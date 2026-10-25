/**
 * W14-2 (Member Glass Card): helper PURE utk kartu glassmorphic
 * (src/components/member-glass-card.tsx). Tanpa React/DOM agar bisa
 * diuji di node (suite #43): matematika tilt 3D, badge tier, nilai
 * salin "nomor kartu".
 */

export type GlassTiltInput = {
  /** Posisi kursor relatif utk elemen kartu (px, kiri-atas). */
  x: number;
  y: number;
  /** Ukuran elemen (px). */
  w: number;
  h: number;
  /** Sudut maksimum (deg); kecil = halus. */
  maxDeg: number;
};

/** Clamp -1..1 (kursor bisa di luar area elemen saat cepat). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

/**
 * Tilt 3D dari posisi kursor: pusat kartu -> 0/0; tepi kanan ->
 * rotateY +max; tepi atas -> rotateX +max. w/h <= 0 -> 0 (guard).
 * Deterministik (hasil bisa di-assert test).
 */
export function glassTiltDeg(inp: GlassTiltInput): { rx: number; ry: number } {
  if (inp.w <= 0 || inp.h <= 0 || !Number.isFinite(inp.maxDeg)) {
    return { rx: 0, ry: 0 };
  }
  const px = clamp01((inp.x - inp.w / 2) / (inp.w / 2));
  const py = clamp01((inp.y - inp.h / 2) / (inp.h / 2));
  const rx = round1(-py * inp.maxDeg);
  const ry = round1(px * inp.maxDeg);
  return { rx, ry };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * CSS transform utk kartu: di pusat = "none" (tanpa perspective,
 * rendering lebih murah); selain itu perspective + rotasi.
 */
export function glassTiltTransform(rx: number, ry: number): string {
  if (rx === 0 && ry === 0) return 'none';
  return 'perspective(700px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
}

export type GlassTierBadge = { label: string; cls: string };

/**
 * Badge tier: 'gold' -> GOLD (amber, sbb MemberQrBadge), 'silver' ->
 * SILVER (slate). Kosong/tak dikenal -> null (tanpa badge, tidak
 * crash -- pola "graceful").
 */
export function glassTierBadge(tier: string): GlassTierBadge | null {
  const t = (tier || '').toLowerCase();
  if (t === 'gold') return { label: 'GOLD', cls: 'bg-amber-400 text-amber-950' };
  if (t === 'silver') return { label: 'SILVER', cls: 'bg-slate-300 text-slate-800' };
  return null;
}

export type GlassCardMemberLike = {
  id: number;
  qr_code?: string;
};

/**
 * Nilai "Salin Nomor": token QR bila sudah ada (karena itulah yg
 * dipindai kasir); bila belum -> nomor member (id) sgt.
 */
export function glassCardCopyValue(member: GlassCardMemberLike): string {
  return member.qr_code ? member.qr_code : String(member.id);
}
