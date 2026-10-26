// W15 P2a (OmniSearch, 26 Okt 2026): KALKULATOR AMAN -- TANPA eval/Function.
// Command palette mendeteksi ekspresi aritmetika di kotak cari (mis.
// "25000 * 12") dan menghitungnya lokal, tanpa fetch /api/search.
// Didukung: + - * /, kurung, persen (10% = 0.1), desimal, unary minus.
// Modul PURE: 0 import, boleh dipakai di klien, server, dan test node.

/** Panjang ekspresi maksimal (anti overload input). */
export const CALC_MAX_LEN = 64;

/** Kedalaman kurung maksimal. */
const MAX_DEPTH = 12;

/**
 * Detektor "ini ekspresi kalkulator?" -- hanya digit, spasi, operator
 * + - * / ( ), titik, persen; minimal 1 digit DAN 1 operator.
 * "sari" -> false; "25000 * 12" -> true; "5" -> false (masih bisa
 * dicari sebagai kata kunci, biarkan live-search).
 */
export function isCalcExpr(expr: string): boolean {
  const s = expr.trim();
  if (!s || s.length > CALC_MAX_LEN) return false;
  if (!/^[0-9\s+\-*/().%]+$/.test(s)) return false;
  if (!/\d/.test(s)) return false;
  return /[+\-*/%]/.test(s);
}

/**
 * Evaluasi aman (shunting-yard, tanpa eval). Return:
 * - angka (dibulatkan maks 4 desimal) bila ekspresi valid;
 * - null bila tidak valid / belum lengkap / divide by zero / overflow.
 */
export function safeCalc(expr: string): number | null {
  const s = expr.replace(/\s+/g, '').slice(0, CALC_MAX_LEN);
  if (!isCalcExpr(s)) return null;

  // ---- Tokenizer -------------------------------------------------
  type Tok =
    | { k: 'num'; v: number }
    | { k: 'op'; v: '+' | '-' | '*' | '/' }
    | { k: 'up' }
    | { k: 'lp' }
    | { k: 'rp' };
  const toks: Tok[] = [];
  let i = 0;
  let guard = 0;
  // flag: token sebelumnya = angka / ')' (false setelah operator / '(' /
  // awal) -- utk membedakan unary minus ("-2", "3*-2") dari biner ("5-3").
  let prevNumOrRparen = false;
  while (i < s.length) {
    // jangkar: setiap iterasi i TETAP maju; > panjang = tak mungkin valid.
    if (++guard > s.length + 2) return null;
    const c = s[i];
    if ((c >= '0' && c <= '9') || c === '.') {
      let num = '';
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) {
        num += s[i];
        i++;
      }
      if (num === '.' || (num.match(/\./g) || []).length > 1) return null;
      let val = parseFloat(num);
      if (!isFinite(val)) return null;
      if (s[i] === '%') {
        val = val / 100;
        i++;
      }
      toks.push({ k: 'num', v: val });
      prevNumOrRparen = true;
      continue;
    }
    if (c === '(') {
      toks.push({ k: 'lp' });
      prevNumOrRparen = false;
      i++;
      continue;
    }
    if (c === ')') {
      toks.push({ k: 'rp' });
      prevNumOrRparen = true;
      i++;
      continue;
    }
    if ('+-*/'.includes(c)) {
      if (c === '-' && !prevNumOrRparen) {
        toks.push({ k: 'up' }); // unary minus
      } else if (c === '+') {
        if (!prevNumOrRparen) {
          // unary plus = identitas; lewati karakternya (i tetap maju).
          i++;
          continue;
        }
        toks.push({ k: 'op', v: '+' });
      } else {
        toks.push({ k: 'op', v: c as '*' | '/' | '-' });
      }
      prevNumOrRparen = false;
      i++;
      continue;
    }
    if (c === '%') return null; // % posisi tak valid
    return null; // karakter tak dikenal
  }

  // ---- Shunting-yard -> RPN --------------------------------------
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const out: Array<{ k: 'num'; v: number } | { k: 'up' } | { k: 'op'; v: string }> = [];
  const ops: Array<'+' | '-' | '*' | '/' | 'up' | '('> = [];
  let depth = 0;
  let lastNumOrRparen = toks[toks.length - 1].k === 'num';
  for (const tk of toks) {
    if (tk.k === 'num') {
      out.push({ k: 'num', v: tk.v });
      lastNumOrRparen = true;
      continue;
    }
    if (tk.k === 'up') {
      // up setelah angka/kurung tanpa operator = rumpang ("3 " sudah
      // ditangani di bawah); up berantai ("--5") legal (negasi dobel).
      ops.push('up');
      lastNumOrRparen = false;
      continue;
    }
    if (tk.k === 'lp') {
      ops.push('(');
      depth++;
      if (depth > MAX_DEPTH) return null;
      lastNumOrRparen = false;
      continue;
    }
    if (tk.k === 'rp') {
      // keluarkan operator di dalam kurung s.d. '(' (top BUKAN langsung
      // '(' bila ada operator di dalam kurung)
      while (ops.length && ops[ops.length - 1] !== '(') {
        const popT = ops.pop() as string;
        out.push(popT === 'up' ? { k: 'up' } : { k: 'op', v: popT });
      }
      if (!ops.length || ops[ops.length - 1] !== '(') return null; // '(' tak ada
      ops.pop();
      lastNumOrRparen = true;
      continue;
    }
    // operator biner: harus punya operand kiri
    if (!lastNumOrRparen) return null;
    lastNumOrRparen = false;
    while (
      ops.length &&
      ops[ops.length - 1] !== '(' &&
      (ops[ops.length - 1] === 'up' || prec[ops[ops.length - 1]] >= prec[tk.v])
    ) {
      const popT = ops.pop() as string;
      out.push(popT === 'up' ? { k: 'up' } : { k: 'op', v: popT });
    }
    ops.push(tk.v);
  }
  if (!lastNumOrRparen) return null; // akhir = operator ("5 +")
  while (ops.length) {
    const top = ops.pop() as string;
    if (top === '(') return null; // kurung tak seimbang
    out.push(top === 'up' ? { k: 'up' } : { k: 'op', v: top });
  }

  // ---- Evaluasi RPN -----------------------------------------------
  const st: number[] = [];
  for (const t of out) {
    if (t.k === 'num') {
      st.push(t.v);
      continue;
    }
    if (t.k === 'up') {
      if (st.length < 1) return null;
      st.push(-(st.pop() as number));
      continue;
    }
    const a = st.pop(); // operand KANAN (pop pertama)
    const b = st.pop(); // operand KIRI
    if (a === undefined || b === undefined) return null;
    if (t.v === '+') st.push(a + b);
    else if (t.v === '-') st.push(b - a);
    else if (t.v === '*') st.push(a * b);
    else {
      if (a === 0) return null; // divide by zero (penyebut = operand kanan)
      st.push(b / a);
    }
  }
  if (st.length !== 1) return null;
  const r = st[0];
  if (!isFinite(r) || Math.abs(r) > 1e12) return null;
  return Math.round(r * 10000) / 10000; // maks 4 desimal (stabil utk tampilan)
}

/** Format hasil kalkulator utk tampilan (id-ID: 300000 -> "300.000"). */
export function formatCalcResult(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}