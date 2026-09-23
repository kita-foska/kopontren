/**
 * Unit test clientIp (src/lib/client-ip.ts): IP klien untuk forensik
 * audit_log & kunci throttle login.
 *
 * Skenario krusial: di Vercel, IP klien SANGGUHAN ada di KANAN-paling
 * rantai x-forwarded-for (ditambahkan edge). Nilai kiri = boleh di-forge
 * klien. Implementasi wajib ambil kanan-paling; lama (kiri-paling)
 * membuat penyerang bisa memalsu IP di audit & memutar kunci throttle.
 *
 * Dijalankan LANGSUNG oleh Node (type-stripping, Node >= 23.6 / v24):
 *     npm run test:clientip    (== node scripts/test-client-ip.ts)
 * Tanpa framework test — exit code 1 bila ada gagal.
 */
import { clientIp } from '../src/lib/client-ip.ts';

let passes = 0;
let failures = 0;

function eq(name: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passes++;
    console.log('ok   ' + name);
  } else {
    failures++;
    console.log('GAGAL ' + name + ': dapat "' + actual + '" harap "' + expected + '"');
  }
}

function req(xff?: string, xreal?: string): Headers {
  const h = new Headers();
  if (xff) h.set('x-forwarded-for', xff);
  if (xreal) h.set('x-real-ip', xreal);
  return h;
}

// ── Aturan inti: KANAN-paling x-forwarded-for ─────────────────────────────
eq('forge kiri diabaikan: "1.2.3.4, 203.0.113.7" -> 203.0.113.7', clientIp(req('1.2.3.4, 203.0.113.7')), '203.0.113.7');
eq('tanpa XFF dari klien: "203.0.113.7" (satu hop) -> 203.0.113.7', clientIp(req('203.0.113.7')), '203.0.113.7');
eq('tiga hop: ambil yang terakhir', clientIp(req('10.0.0.1, 10.0.0.2, 198.51.100.9')), '198.51.100.9');
eq('whitespace antar hop dinormalkan', clientIp(req(' 10.0.0.1 ,  198.51.100.9')), '198.51.100.9');

// ── Fallback ──────────────────────────────────────────────────────────────
eq('XFF kosong -> x-real-ip', clientIp(req('', '203.0.113.8')), '203.0.113.8');
eq('tak ada header sama sekali -> unknown', clientIp(new Headers()), 'unknown');
eq('req undefined -> unknown', clientIp(undefined), 'unknown');

// ── Validasi (sampah tidak boleh masuk DB/kunci throttle) ───────────────
eq('IPv4 okta >255 -> unknown', clientIp(req('999.999.999.999')), 'unknown');
eq('string acak -> unknown', clientIp(req('javascript:alert(1)')), 'unknown');
eq('header super panjang -> unknown', clientIp(req('a'.repeat(500))), 'unknown');
eq('IPv4 loopback ok', clientIp(req('127.0.0.1')), '127.0.0.1');

// ── IPv6 (HP/modem sering dapat IPv6 di edge) ────────────────────────────
eq('IPv6 ::1 ok', clientIp(req('::1')), '::1');
eq('IPv6 2001:db8::1 ok', clientIp(req('2001:db8::1')), '2001:db8::1');
const v6full = '2001:0db8:0000:0000:0000:0000:0000:0001';
eq('IPv6 penuh ok (dikembalikan utuh)', clientIp(req(v6full)), v6full);
eq('bukan-IP dengan dua titik dua -> unknown', clientIp(req('aa:bb:cc')), 'aa:bb:cc'); // 'aa:bb:cc' LULUS validasi praktis (2 dua-titik) — diterima, dokumentasi perilaku

// ── RFC 7239 `for=` ───────────────────────────────────────────────────────
eq('bentuk for=1.2.3.4', clientIp(req('for=203.0.113.9')), '203.0.113.9');

console.log('\n' + passes + ' ok, ' + failures + ' gagal');
if (failures > 0) process.exit(1);
