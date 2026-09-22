'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, Badge, Modal, Toast, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { strukWaText, shareWa } from '@/lib/rekap';

/**
 * Cetak struk thermal 58mm: sementara switch @page jadi 58mm/0mm
 * (default global @page adalah A4 utk laporan penuh .print-area), lalu
 * kembalikan setelah dialog print ditutup. Dipakai semua jalur cetak struk
 * POS: auto-print, hotkey F5, dan tombol "Cetak Struk".
 */
let receipt58Seq = 0;
function printReceipt() {
  const id = '__kopontren_receipt58__' + ++receipt58Seq;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = '@page { size: 58mm auto; margin: 0; }';
  document.head.appendChild(style);
  const remove = () => {
    const el = document.getElementById(id);
    if (el) el.remove();
  };
  window.addEventListener('afterprint', remove, { once: true });
  setTimeout(remove, 4000); // fallback bila afterprint tak ber-fires
  window.print();
}

type QueuedSale = {
  ref: string;
  at: string;
  payload: {
    customer: string;
    pay_method: string;
    note: string;
    member_id?: number;
    discount?: number;
    redeem?: number;
    amount_paid: number;
    change: number;
    pay_split?: { m: string; a: number }[];
    client_ref: string;
    items: { product_id: number; qty: number; unit_price: number }[];
  };
};

const OFFLINE_QUEUE_KEY = 'kopontren_pos_queue_v1';

function loadQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const arr = raw ? (JSON.parse(raw) as QueuedSale[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Skor pencarian fuzzy: subsequence + bonus beruntun/posisi awal. */
function fuzzyScore(term: string, text: string): number {
  const t = term.toLowerCase();
  const s = text.toLowerCase();
  let ti = 0;
  let score = 0;
  for (let i = 0; i < s.length && ti < t.length; i++) {
    if (s[i] === t[ti]) {
      score += 2 + Math.max(0, 8 - i * 0.25);
      ti++;
    }
  }
  if (ti !== t.length) return 0;
  score += 40;
  return Math.min(90, Math.round(score));
}

type Product = {
  id: number;
  name: string;
  category: string;
  unit: string;
  base_price: number;
  stock: number;
  barcode?: string;
};
type CartLine = { product: Product; qty: number; price: number };

type ShiftInfo = {
  id: number;
  kasir_id: number;
  kasir_name?: string;
  label: string;
  status: string;
  start_time: string;
  sales_count: number;
  sales_total: number;
  cash_total: number;
  by_method?: Record<string, number>;
};

type SaleResp = {
  sale?: {
    id: number;
    total: number;
    status: string;
    created_at?: string;
    points?: number;
    member_discount?: number;
    cashback?: number;
    redeem?: number;
    pay_split?: { m: string; a: number }[];
    tier?: string;
    member_name?: string;
  };
  deduped?: boolean;
  error?: string;
};
type ProductsResp = { products: Product[]; categories: string[] };
type Member = {
  id: number;
  name: string;
  phone: string;
  points: number;
  birth_date?: string;
  tier?: string;
  cashback_balance?: number;
};
type MembersResp = { members: Member[] };

const PAY_LABEL: Record<string, string> = {
  cash: 'Tunai',
  tf: 'Transfer Bank',
  wa: 'QRIS / Non-Tunai',
};

/**
 * Tanggal hari ini (YYYY-MM-DD) zona Asia/Jakarta — dipakai cek ulang
 * tahun. Server jalan UTC (Vercel), jadi match zona sama agar tidak
 * meleset sehari di sekitar tengah malam.
 */
function jktToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

type Receipt = {
  sale: SaleResp['sale'];
  items: CartLine[];
  customer: string;
  pay: string;
  paySplit?: { m: string; a: number }[];
  received: number | null;
  change: number;
  at: string;
  cashier: string;
  memberName: string;
  memberPhone?: string;
  points: number;
  disc: number;
  memberDiscount: number;
  redeem: number;
  cashback: number;
  tier?: string;
};

export function PosClient({ admin, cashier }: { admin: boolean; cashier?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  // Search debounce 300ms: grid produk memakai qDeb supaya re-render tidak
  // terjadi setiap ketikan; handler Enter (barcode scanner) tetap live.
  const [qDeb, setQDeb] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState('');
  const [pay, setPay] = useState<'cash' | 'tf' | 'wa'>('cash');
  const [note, setNote] = useState('');
  const [received, setReceived] = useState('');
  // Split pembayaran (fitur 3): nominal per metode, Σ harus = total.
  const [mix, setMix] = useState(false);
  const [mixCash, setMixCash] = useState('');
  const [mixTf, setMixTf] = useState('');
  const [mixWa, setMixWa] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [mq, setMq] = useState('');
  const [disc, setDisc] = useState('');
  const [redeemInput, setRedeemInput] = useState('');
  const [memberModal, setMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', phone: '', address: '' });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qrisModal, setQrisModal] = useState(false);
  const [scanModal, setScanModal] = useState(false);
  // Hotkey F4 / auto-cetak struk / antrean offline
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kopontren_pos_autoprint') !== 'off';
    } catch {
      return true;
    }
  });
  const [offlineQueue, setOfflineQueue] = useState<QueuedSale[]>(() => loadQueue());
  const [flushing, setFlushing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const customerRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueuedSale[]>(offlineQueue);
  queueRef.current = offlineQueue;
  const [toast, showToast] = useToast();

  // Shift states
  const [currentShift, setCurrentShift] = useState<ShiftInfo | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftModalType, setShiftModalType] = useState<'open' | 'close'>('open');
  const [shiftLabel, setShiftLabel] = useState('');
  const [closingSummary, setClosingSummary] = useState<ShiftInfo | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  // Redemsi harus di-reset tiap ganti/kosongkan member: nominal yang
  // dipreview milik member sebelumnya tidak boleh ikut checkout baru.
  useEffect(() => setRedeemInput(''), [memberId]);

  const load = useCallback(async () => {
    const r = await api<ProductsResp>('/api/products?live=1');
    if (r.ok && r.data) {
      setProducts(r.data.products);
      setCategories(r.data.categories || []);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    const r = await api<MembersResp>('/api/members');
    if (r.ok && r.data) setMembers(r.data.members || []);
  }, []);

  // Pengaturan member (poin, diskon, cashback, ultah, tier) diambil dari
  // /api/member-settings — admin ubah di /admin/pengaturan-member. POS
  // memakai rumus yang sama dengan server (POST /api/sales) untuk preview
  // perk; server tetap sumber kebenaran saat transaksi disimpan.
  const [memberSettings, setMemberSettings] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    api<{ settings: Record<string, string> }>('/api/member-settings').then((r) => {
      if (r.ok && r.data?.settings) setMemberSettings(r.data.settings);
    });
  }, []);
  const pointsEvery = Math.max(1000, Math.floor(Number(memberSettings?.points_every) || 10000));
  const numSetting = (k: string) => {
    const v = Math.floor(Number(memberSettings?.[k]));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  const loadShift = useCallback(async () => {
    const r = await api<{ open: ShiftInfo | null }>('/api/shifts?current=1');
    if (r.ok && r.data) {
      setCurrentShift(r.data.open);
    }
  }, []);

  useEffect(() => {
    load();
    loadMembers();
    loadShift();
  }, [load, loadMembers, loadShift]);

  const visible = useMemo(() => {
    const term = qDeb.trim().toLowerCase();
    if (!term) return cat ? products.filter((p) => p.category === cat) : products;
    // Pencarian cerdas: ranking (exact > prefix > includes > fuzzy) +
    // filter kategori aktif. Hasil fuzzy dibatasi 40 baris teratas.
    type Scored = { p: Product; s: number };
    const scored: Scored[] = [];
    for (const p of products) {
      if (cat && p.category !== cat) continue;
      const n = p.name.toLowerCase();
      const b = (p.barcode || '').toLowerCase();
      let s: number;
      if (n === term) s = 120;
      else if (b === term) s = 115;
      else if (n.startsWith(term)) s = 100;
      else if (b.startsWith(term)) s = 95;
      else if (n.includes(term) || b.includes(term)) s = 80;
      else s = fuzzyScore(term, p.name) * 0.5; // ketik salah / ejaan mirip -> fuzzy
      if (s >= 30) scored.push({ p, s });
    }
    if (scored.length === 0) return [];
    const exactOnly = scored.every((x) => x.s >= 80);
    if (exactOnly) {
      // Urutan katalog (stabil & familiar) utk kecocokan non-fuzzy.
      const ids = new Set(scored.filter((x) => x.s >= 80).map((x) => x.p.id));
      return products.filter((p) => ids.has(p.id));
    }
    scored.sort((a, b2) => b2.s - a.s);
    return scored.slice(0, 40).map((x) => x.p);
  }, [products, cat, qDeb]);

  function add(p: Product) {
    if (p.stock <= 0) {
      showToast('Stok produk habis: ' + p.name);
      return;
    }
    setCart((c) => {
      const ex = c.find((l) => l.product.id === p.id);
      if (ex) {
        if (ex.qty >= p.stock) {
          showToast('Jumlah melebihi sisa stok (' + p.stock + ')');
          return c;
        }
        return c.map((l) =>
          l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...c, { product: p, qty: 1, price: p.base_price }];
    });
  }

  /** Tambah produk hasil scan barcode (scanner USB / kamera). */
  function addByBarcode(code: string) {
    const c = code.trim().toLowerCase();
    if (!c) return;
    const hit = products.find((p) => (p.barcode || '').toLowerCase() === c);
    if (hit) {
      add(hit);
      showToast('Ditambahkan: ' + hit.name);
      return;
    }
    showToast('Produk dengan barcode "' + code + '" tidak ditemukan.');
  }

  // Handle barcode scanner Enter press
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && q.trim()) {
      e.preventDefault();
      const term = q.trim().toLowerCase();
      // Look for exact barcode match first
      const exactBarcode = products.find(
        (p) => (p.barcode || '').toLowerCase() === term
      );
      if (exactBarcode) {
        add(exactBarcode);
        showToast('Ditambahkan: ' + exactBarcode.name);
        setQ('');
        return;
      }
      // Cocokkan langsung dari input live (bukan qDeb) agar Enter dari
      // barcode scanner tidak tertunda oleh debounce.
      const liveMatches = products.filter((p) => {
        if (cat && p.category !== cat) return false;
        return p.name.toLowerCase().includes(term) || (p.barcode || '').toLowerCase().includes(term);
      });
      if (liveMatches.length === 1) {
        add(liveMatches[0]);
        showToast('Ditambahkan: ' + liveMatches[0].name);
        setQ('');
        setQDeb('');
        return;
      }
      if (liveMatches.length === 0) {
        // Fuzzy: ejaan mirip / typo ringan (mis. "madu satchet" -> "Madu Sachet").
        let best: Product | null = null;
        let bestScore = 55;
        for (const p of products) {
          if (cat && p.category !== cat) continue;
          const s = fuzzyScore(term, p.name) * 0.5;
          if (s > bestScore) {
            bestScore = s;
            best = p;
          }
        }
        if (best) {
          add(best);
          showToast('Ditambahkan (tebakan terdekat): ' + best.name);
          setQ('');
          setQDeb('');
          return;
        }
        showToast('Produk dengan barcode/kode "' + q.trim() + '" tidak ditemukan.');
      }
    }
  }

  function setQty(id: number, qty: number) {
    setCart((c) =>
      c
        .map((l) =>
          l.product.id === id ? { ...l, qty: Math.max(0, Math.min(qty, l.product.stock)) } : l
        )
        .filter((l) => l.qty > 0)
    );
  }

  function setPrice(id: number, price: number) {
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, price } : l)));
  }

  function remove(id: number) {
    setCart((c) => c.filter((l) => l.product.id !== id));
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const discNum = admin ? Math.min(Number(disc.replace(/[^\d]/g, '')) || 0, subtotal) : 0;
  const receivedNum = received.trim() === '' ? 0 : Number(received.replace(/[^\d]/g, '')) || 0;
  const mixAmt = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
  const mixSum = mix ? mixAmt(mixCash) + mixAmt(mixTf) + mixAmt(mixWa) : 0;

  const selectedMember = useMemo(
    () => members.find((m) => m.id === Number(memberId)),
    [members, memberId]
  );

  // Preview perk member — rumus identik dengan server (POST /api/sales):
  // diskon base = member_discount%; saat hari ulang tahun (MM-DD
  // birth_date vs tanggal hari ini zona Asia/Jakarta) & birthday_active,
  // pakai MAKS(birthday_discount, base). Cap 90%. Cashback = % dari total
  // setelah perk, masuk saldo member (redemisi menyusul).
  const bd = selectedMember?.birth_date;
  const isBday =
    Boolean(bd && bd.length === 10 && bd.slice(5) === jktToday().slice(5)) &&
    memberSettings?.birthday_active === '1';
  let perkPct = selectedMember ? numSetting('member_discount') : 0;
  if (isBday) perkPct = Math.max(perkPct, numSetting('birthday_discount'));
  perkPct = Math.min(90, perkPct);
  const baseForPerk = Math.max(0, subtotal - discNum);
  const perkAmt = selectedMember ? Math.floor((baseForPerk * perkPct) / 100) : 0;
  const totalPerk = Math.max(0, baseForPerk - perkAmt);
  // Preview redemsi (fitur 2): sumber = poin member (× nilai point_value,
  // dipakai dulu) lalu cashback_balance; cap di total setelah perk —
  // identik dengan rumus server POST /api/sales.
  const pointValue = numSetting('point_value');
  const redeemMax = selectedMember
    ? Math.min(
        (selectedMember.points || 0) * pointValue + (selectedMember.cashback_balance || 0),
        totalPerk
      )
    : 0;
  // Follow-up (a): kasir input nominal tebus (Rp), bukan auto-max. Nominal
  // di-clamp ke redeemMax (ketersediaan saldo & plafon total). Server memakai
  // rumus SAMA (perks.ts): poin dipakai dulu, sisanya saldo cashback.
  const redeemInputNum = Math.max(0, Math.floor(Number(redeemInput.replace(/[^\d]/g, '')) || 0));
  const redeemAmt = selectedMember ? Math.min(redeemInputNum, redeemMax) : 0;
  const total = selectedMember ? Math.max(0, totalPerk - redeemAmt) : totalPerk;
  // Breakdown preview (rumus identik server): N poin dulu, sisanya cashback.
  const availPts = selectedMember?.points || 0;
  const availCb = selectedMember?.cashback_balance || 0;
  const redeemPts = pointValue > 0 ? Math.min(Math.floor(redeemAmt / pointValue), availPts) : 0;
  const redeemCb = Math.min(redeemAmt - redeemPts * pointValue, availCb);
  const cbPreview = selectedMember ? Math.floor((total * numSetting('cashback')) / 100) : 0;
  const change = Math.max(0, receivedNum - total);

  async function saveMember() {
    if (!memberForm.name.trim()) {
      showToast('Nama member wajib diisi');
      return;
    }
    const r = await api<{ ok: boolean; id?: number }>('/api/members', {
      method: 'POST',
      body: JSON.stringify(memberForm),
    });
    if (r.ok) {
      showToast('Member ' + memberForm.name + ' ditambahkan');
      setMemberModal(false);
      setMemberForm({ name: '', phone: '', address: '' });
      await loadMembers();
      if (r.data?.id) setMemberId(String(r.data.id));
    } else showToast(r.error || 'Gagal menambah member');
  }

  async function checkout() {
    if (cart.length === 0) return;
    if (!mix && pay === 'cash' && received.trim() !== '' && receivedNum < total) {
      showToast(
        'Uang diterima kurang, kekurangan Rp ' +
          (total - receivedNum).toLocaleString('id-ID') +
          '. Silakan periksa kembali nominal.'
      );
      return;
    }
    if (mix && mixSum !== total) {
      showToast(
        'Split belum sama dengan total — selisih Rp ' +
          Math.abs(total - mixSum).toLocaleString('id-ID') +
          (mixSum < total ? ' (kurang)' : ' (lebih)') +
          '. Lengkapi nominal tiap metode.'
      );
      return;
    }
    setBusy(true);
    const cashReceived = !mix && pay === 'cash' && received.trim() !== '';
    // Split (fitur 3): bagian per metode (hanya nominal > 0); metode
    // dominan (bagian terbesar) dikirim sebagai pay_method legacy.
    const mixParts = mix
      ? ([
          { m: 'cash', a: mixAmt(mixCash) },
          { m: 'tf', a: mixAmt(mixTf) },
          { m: 'wa', a: mixAmt(mixWa) },
        ].filter((p) => p.a > 0) as { m: string; a: number }[])
      : [];
    const payMethod = mixParts.length > 0 ? mixParts.reduce((x, y) => (y.a > x.a ? y : x)).m : pay;
    const clientRef =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'ref-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const payload: QueuedSale['payload'] = {
      customer: customer || (selectedMember ? selectedMember.name : ''),
      pay_method: payMethod,
      note,
      member_id: memberId ? Number(memberId) : undefined,
      discount: discNum || undefined,
      redeem: redeemAmt > 0 ? redeemAmt : undefined,
      amount_paid: cashReceived ? receivedNum : total,
      change: cashReceived ? change : 0,
      pay_split: mixParts.length > 0 ? mixParts : undefined,
      client_ref: clientRef,
      items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_price: l.price })),
    };
    const r = await api<SaleResp>('/api/sales', { method: 'POST', body: JSON.stringify(payload) });
    setBusy(false);
    if (!r.ok) {
      // Kesalahan jaringan (offline) -> simpan ke antrean offline; stok
      // lokal sudah dipotong, transaksi akan tersinkron otomatis saat online.
      if (r.error === 'Kesalahan jaringan.') {
        const entry: QueuedSale = { ref: clientRef, at: new Date().toISOString(), payload };
        setOfflineQueue((q) => {
          const next = [...q, entry];
          try {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
          } catch {
            /* penyimpanan penuh: transaksi tetap di memori */
          }
          return next;
        });
        showToast('⚡ Offline — transaksi tercatat, akan otomatis tersinkron saat internet pulih.');
      } else {
        // Hint UX (review Fitur 3 🟡): server menolak split bila Σ ≠ total
        // final (total bisa bergeser oleh perk member/redemsi) — arahkan
        // kasir memperbarui nominal campur.
        const hint =
          mix && r.error && r.error.startsWith('Pembayaran campur belum lunas')
            ? ' — Total bisa berubah (diskon/poin). Perbarui nominal campur, lalu coba lagi.'
            : '';
        showToast((r.error || 'Gagal menyimpan transaksi.') + hint);
      }
      return;
    }
    if (r.data.deduped) showToast('Transaksi sudah tersinkron sebelumnya (tanpa duplikat).');
    const saved = r.data.sale;
    if (saved) {
      setReceipt({
        sale: saved,
        items: [...cart],
        customer: customer || (selectedMember ? selectedMember.name : ''),
        pay: payMethod,
        paySplit: mixParts.length > 0 ? mixParts : saved.pay_split,
        received: cashReceived ? receivedNum : total,
        change: cashReceived ? change : 0,
        at: saved.created_at || new Date().toISOString(),
        cashier: cashier || 'Kasir',
        memberName: saved.member_name || (selectedMember?.name ?? ''),
        memberPhone: selectedMember?.phone ?? '',
        points: saved.points || 0,
        disc: discNum,
        memberDiscount: saved.member_discount || 0,
        cashback: saved.cashback || 0,
        redeem: saved.redeem || 0,
        tier: saved.tier,
      });
    }
    setCart([]);
    setCustomer('');
    setNote('');
    setReceived('');
    setMix(false);
    setMixCash('');
    setMixTf('');
    setMixWa('');
    setDisc('');
    setMemberId('');
    load();
    loadShift();
    // Auto-cetak struk setelah transaksi (bisa dimatikan di modal struk).
    if (r.data.sale && !r.data.deduped && autoPrint) setTimeout(() => printReceipt(), 900);
  }

  /** Sinkronkan antrean transaksi offline (dipanggil otomatis saat online). */
  async function flushQueue() {
    const q = queueRef.current;
    if (q.length === 0 || flushing) return;
    setFlushing(true);
    let remaining = q;
    for (const item of remaining) {
      const r = await api<SaleResp>('/api/sales', {
        method: 'POST',
        body: JSON.stringify(item.payload),
      });
      if (r.ok) remaining = remaining.filter((x) => x.ref !== item.ref);
      else break; // masih offline / error: sisanya ditangani retry berikutnya
    }
    setOfflineQueue((cur) => {
      const next = cur.filter((x) => remaining.some((r2) => r2.ref === x.ref));
      try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
    setFlushing(false);
    load();
    loadShift();
    if (remaining.length === 0 && q.length > 0)
      showToast('Semua transaksi offline berhasil tersinkron ✔');
  }

  // Deteksi offline/online: sinkron otomatis saat internet pulih.
  useEffect(() => {
    const onOn = () => {
      setIsOnline(true);
      void flushQueue();
    };
    const onOff = () => setIsOnline(false);
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    const onlineNow = typeof navigator === 'undefined' || navigator.onLine;
    setIsOnline(onlineNow);
    if (onlineNow && queueRef.current.length > 0) void flushQueue();
    return () => {
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hotkey kasir: F1 cari · F2 pembeli · F3 bayar · F4 simpan · F5 cetak · ESC batal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F2') {
        e.preventDefault();
        customerRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (!mix && pay === 'cash' && total > 0) receivedRef.current?.focus();
        else customerRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (!busy && cart.length > 0) void checkout();
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (receipt) printReceipt();
      } else if (e.key === 'Escape') {
        if (scanModal) {
          setScanModal(false);
        } else if (qrisModal) {
          setQrisModal(false);
        } else if (shiftModalOpen) {
          setShiftModalOpen(false);
        } else if (memberModal) {
          setMemberModal(false);
        } else if (receipt) {
          setReceipt(null);
        } else {
          setQ('');
          setQDeb('');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    busy,
    cart.length,
    pay,
    total,
    receipt,
    scanModal,
    qrisModal,
    shiftModalOpen,
    memberModal,
    checkout,
  ]);

  // Shift Management
  async function handleOpenShift() {
    const r = await api<{ ok: boolean; id: number }>('/api/shifts', {
      method: 'POST',
      body: JSON.stringify({ label: shiftLabel || 'Shift Pagi/Siang' }),
    });
    if (r.ok) {
      showToast('Shift kasir berhasil dibuka');
      setShiftModalOpen(false);
      setShiftLabel('');
      loadShift();
    } else {
      showToast(r.error || 'Gagal membuka shift');
    }
  }

  async function handleCloseShift() {
    if (!currentShift) return;
    const r = await api<{ ok: boolean; summary: ShiftInfo }>('/api/shifts', {
      method: 'PATCH',
      body: JSON.stringify({ id: currentShift.id }),
    });
    if (r.ok && r.data?.summary) {
      setClosingSummary(r.data.summary);
      setCurrentShift(null);
      showToast('Shift berhasil ditutup & direkap');
    } else {
      showToast(r.error || 'Gagal menutup shift');
    }
  }

  function printStruk() {
    printReceipt();
  }

  function handleSendWaStruk() {
    if (!receipt) return;
    const items = receipt.items.map((it) => ({
      qty: it.qty,
      unit: it.product.unit,
      name: it.product.name,
      total: it.qty * it.price,
    }));
    const text = strukWaText({
      no: '#' + receipt.sale?.id,
      kasir: receipt.cashier,
      tgl: fmtDateTime(receipt.at),
      items,
      customer: receipt.customer,
      member: receipt.memberName,
      discount: receipt.disc,
      memberDiscount: receipt.memberDiscount,
      redeem: receipt.redeem,
      cashback: receipt.cashback,
      tier: receipt.tier,
      total: receipt.sale?.total ?? 0,
      pay: receipt.pay,
      paySplit: receipt.paySplit,
      received: receipt.received,
      change: receipt.change,
    });
    shareWa(text, receipt.memberPhone);
  }

  function copyStrukText() {
    if (!receipt) return;
    const items = receipt.items.map((it) => ({
      qty: it.qty,
      unit: it.product.unit,
      name: it.product.name,
      total: it.qty * it.price,
    }));
    const text = strukWaText({
      no: '#' + receipt.sale?.id,
      kasir: receipt.cashier,
      tgl: fmtDateTime(receipt.at),
      items,
      customer: receipt.customer,
      member: receipt.memberName,
      discount: receipt.disc,
      memberDiscount: receipt.memberDiscount,
      redeem: receipt.redeem,
      cashback: receipt.cashback,
      tier: receipt.tier,
      total: receipt.sale?.total ?? 0,
      pay: receipt.pay,
      paySplit: receipt.paySplit,
      received: receipt.received,
      change: receipt.change,
    });
    navigator.clipboard.writeText(text);
    showToast('Teks struk berhasil disalin ke clipboard');
  }

  return (
    <div className="space-y-4">
      {/* Shift Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 p-3 text-xs shadow-sm backdrop-blur dark:border-navy-700 dark:bg-navy-900/80">
        <div className="flex items-center gap-2">
          {currentShift ? (
            <>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Shift Aktif: {currentShift.label || 'Sesi Kasir'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 dark:text-slate-400">
                Mulai: {fmtDateTime(currentShift.start_time).split(' ')[1] || currentShift.start_time}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {currentShift.sales_count} Transaksi ({rp(currentShift.sales_total)})
              </span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
              <span className="text-slate-600 dark:text-slate-400">
                Belum ada shift kasir yang dibuka hari ini.
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentShift ? (
            <button
              onClick={() => {
                setShiftModalType('close');
                setShiftModalOpen(true);
              }}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-bold text-amber-600 hover:bg-amber-500/20 dark:text-amber-300"
            >
              Tutup Shift & Rekap
            </button>
          ) : (
            <button
              onClick={() => {
                setShiftModalType('open');
                setShiftModalOpen(true);
              }}
              className="btn-primary px-3 py-1 text-xs"
            >
              + Buka Shift Kasir
            </button>
          )}
        </div>
      </div>

      {/* Antrean transaksi offline: sinkron otomatis saat internet pulih */}
      {!isOnline && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs font-semibold text-sky-600 dark:text-sky-300">
          📡 Mode offline — POS tetap berjalan. Transaksi akan tersimpan & tersinkron otomatis.
        </div>
      )}
      {offlineQueue.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <span>
            ⚡ {offlineQueue.length} transaksi offline menunggu sinkronisasi…
          </span>
          <button
            onClick={() => void flushQueue()}
            disabled={flushing || !isOnline}
            className="btn-amber px-3 py-1 text-[11px]"
          >
            {flushing ? 'Sinkronisasi…' : 'Sinkronkan Sekarang'}
          </button>
        </div>
      )}

      {/* Main POS layout */}
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        {/* Left Column: Product catalog & Search */}
        <div>
          {/* Search bar & Barcode input */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                🔍
              </span>
              <input
                ref={searchInputRef}
                className="input pl-9"
                placeholder="Ketik nama / scan barcode — Enter utk auto-add (F1)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                autoFocus
              />
              {q && (
                <button
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => setQ('')}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scan barcode via kamera (jsQR) — fallback utk HP tanpa scanner */}
            <button
              type="button"
              onClick={() => setScanModal(true)}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98] dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-700"
              title="Arahkan kamera ke barcode produk"
            >
              📷 Scan Barcode
            </button>

            {/* Category pills */}
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setCat('')}
                className={
                  'rounded-full px-3 py-1 text-xs font-bold transition ' +
                  (!cat
                    ? 'bg-accent-500 text-white shadow-sm'
                    : 'border border-slate-300 text-slate-600 hover:border-slate-400 dark:border-navy-600 dark:text-slate-300')
                }
              >
                Semua
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={
                    'rounded-full px-3 py-1 text-xs font-bold transition ' +
                    (cat === c
                      ? 'bg-accent-500 text-white shadow-sm'
                      : 'border border-slate-300 text-slate-600 hover:border-slate-400 dark:border-navy-600 dark:text-slate-300')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Product cards grid */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((p) => {
              const inCart = cart.find((l) => l.product.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={p.stock <= 0}
                  className={
                    'card relative p-3 text-left transition hover:border-accent-400 active:scale-[0.98] disabled:opacity-40 ' +
                    (inCart ? 'border-accent-500/60 ring-2 ring-accent-500/20' : '')
                  }
                >
                  {inCart && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-white shadow">
                      {inCart.qty}
                    </span>
                  )}
                  <p className="line-clamp-2 text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
                    {p.name}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{p.category || 'Umum'}</span>
                    {p.barcode && <span className="font-mono text-[10px]">#{p.barcode}</span>}
                  </div>
                  <div className="mt-2.5 flex items-end justify-between">
                    <p className="text-sm font-extrabold text-accent-500 dark:text-accent-300">
                      {rp(p.base_price)}
                    </p>
                    <Badge tone={p.stock <= 0 ? 'red' : p.stock < 5 ? 'amber' : 'gray'}>
                      {p.stock} {p.unit}
                    </Badge>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className="col-span-full py-12 text-center text-sm text-slate-500">
                <p className="text-2xl mb-1">📦</p>
                <p>Tidak ada produk yang cocok dengan pencarian.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Cart & Payment */}
        <div className="card h-fit p-4 lg:sticky lg:top-24">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              Keranjang Kasir
              {cart.length > 0 && <Badge tone="blue">{cart.length} item</Badge>}
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-rose-500 hover:underline"
              >
                Kosongkan
              </button>
            )}
          </div>

          {/* Cart items list */}
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {cart.map((l) => (
              <div
                key={l.product.id}
                className="rounded-lg border border-slate-200 p-2.5 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-900/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold leading-tight text-slate-800 dark:text-slate-200">
                    {l.product.name}
                  </p>
                  <button
                    onClick={() => remove(l.product.id)}
                    className="text-[11px] text-slate-400 hover:text-rose-500"
                    title="Hapus item"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-navy-600 bg-white dark:bg-navy-800">
                    <button
                      className="px-2 py-0.5 text-xs font-bold hover:bg-slate-100 dark:hover:bg-navy-700 rounded-l"
                      onClick={() => setQty(l.product.id, l.qty - 1)}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-xs font-bold">
                      {l.qty}
                    </span>
                    <button
                      className="px-2 py-0.5 text-xs font-bold hover:bg-slate-100 dark:hover:bg-navy-700 rounded-r"
                      onClick={() => setQty(l.product.id, l.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {rp(l.qty * l.price)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      @{rp(l.price)}/{l.product.unit}
                    </p>
                  </div>
                </div>
                {admin && (
                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-500">
                    <span>Ubah harga: Rp</span>
                    <input
                      className="input w-20 px-1.5 py-0.5 text-right text-xs"
                      type="number"
                      value={l.price}
                      onChange={(e) => setPrice(l.product.id, Number(e.target.value) || 0)}
                    />
                  </div>
                )}
              </div>
            ))}
            {cart.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                <p className="text-xl mb-1">🛒</p>
                Pilih produk di sebelah kiri atau scan barcode.
              </div>
            )}
          </div>

          {/* Member & Customer Selection */}
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-navy-700">
            <div>
              <div className="flex gap-1.5">
                <select
                  className="input flex-1 text-xs"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                >
                  <option value="">Santri / Member (opsional)</option>
                  {members
                    .filter((m) => {
                      const s = mq.trim().toLowerCase();
                      return !s || m.name.toLowerCase().includes(s) || m.phone.includes(s);
                    })
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.phone ? `(${m.phone})` : ''} · {m.points} poin
                        {m.tier ? ` · ${m.tier === 'gold' ? 'Gold' : 'Silver'}` : ''}
                      </option>
                    ))}
                </select>
                <button
                  className="btn-ghost px-2.5 py-1 text-xs whitespace-nowrap"
                  onClick={() => setMemberModal(true)}
                  title="Tambah member baru"
                >
                  + Baru
                </button>
              </div>
              {selectedMember && (
                <div className="mt-1 space-y-0.5 rounded bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                  <div className="flex items-center justify-between">
                    <span>★ Member: {selectedMember.name}</span>
                    <span>
                      {selectedMember.tier
                        ? selectedMember.tier === 'gold'
                          ? '🏆 Gold'
                          : '🥈 Silver'
                        : ''}
                    </span>
                  </div>
                  <div>
                    {selectedMember.points} poin (+{Math.floor(total / pointsEvery)} poin)
                    {perkAmt > 0 ? ` · Diskon member −${rp(perkAmt)}${isBday ? ' (ultah 🎉)' : ''}` : ''}
                    {cbPreview > 0 ? ` · Cashback +${rp(cbPreview)} ke saldo` : ''}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={redeemMax <= 0 ? 'text-slate-400 dark:text-slate-500' : ''}>
                      Tebus poin/saldo
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input w-24 text-xs"
                      placeholder="Rp 0"
                      value={redeemInput}
                      disabled={redeemMax <= 0}
                      onChange={(e) => setRedeemInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-ghost px-1.5 py-0.5 text-[11px]"
                      disabled={redeemMax <= 0}
                      onClick={() => setRedeemInput(String(redeemMax))}
                      title="Tebus semua (maksimal)"
                    >
                      Maks
                    </button>
                  </div>
                  <div
                    className={
                      redeemAmt > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }
                  >
                    {redeemMax <= 0
                      ? 'Tidak tersedia (saldo poin & cashback habis)'
                      : redeemAmt > 0
                        ? `Tebus −${rp(redeemAmt)} (${redeemPts} poin + Rp ${rp(redeemCb)} cashback)`
                        : `Saldo: ${selectedMember.points} poin${
                            pointValue > 0 ? ` × ${rp(pointValue)}` : ''
                          } · cashback ${rp(selectedMember.cashback_balance || 0)} · maks ${rp(redeemMax)}`}
                  </div>
                  {redeemInputNum > redeemMax && redeemMax > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">
                      Nominal melebihi saldo — ditinjau ke maksimal {rp(redeemMax)}.
                    </div>
                  )}
                </div>
              )}
            </div>

            <input
              ref={customerRef}
              className="input text-xs"
              placeholder="Nama pembeli umum (opsional)"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />

            {/* Payment Method Selector */}
            <div className="flex gap-1.5">
              {(
                [
                  ['cash', '💵 Tunai'],
                  ['wa', '📱 QRIS / Non-Tunai'],
                  ['tf', '🏦 Transfer'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setPay(v);
                    setMix(false);
                  }}
                  className={
                    'flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ' +
                    (pay === v && !mix
                      ? 'bg-accent-500 text-white shadow-sm'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800')
                  }
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMix(true);
                  setReceived('');
                }}
                title="Pembayaran campur (split) tunai/transfer/QRIS"
                className={
                  'flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ' +
                  (mix
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800')
                }
              >
                🔀 Campur
              </button>
            </div>

            {/* Split pembayaran (fitur 3): nominal tiap metode, Σ = total */}
            {mix && total > 0 && (
              <div className="space-y-1.5 rounded-lg bg-amber-500/10 p-2 text-xs">
                <p className="font-bold text-amber-700 dark:text-amber-300">
                  Split pembayaran — total {rp(total)} (lunas, tanpa piutang)
                </p>
                <div className="flex gap-1.5">
                  <input
                    className="input text-xs"
                    inputMode="numeric"
                    placeholder="Tunai (Rp)"
                    value={mixCash}
                    onChange={(e) => setMixCash(e.target.value)}
                  />
                  <input
                    className="input text-xs"
                    inputMode="numeric"
                    placeholder="Transfer (Rp)"
                    value={mixTf}
                    onChange={(e) => setMixTf(e.target.value)}
                  />
                  <input
                    className="input text-xs"
                    inputMode="numeric"
                    placeholder="QRIS/WA (Rp)"
                    value={mixWa}
                    onChange={(e) => setMixWa(e.target.value)}
                  />
                </div>
                <div
                  className={
                    'flex items-center justify-between font-bold ' +
                    (mixSum === total
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-500 dark:text-rose-400')
                  }
                >
                  <span>
                    {mixSum === total
                      ? 'Lunas ✔'
                      : 'Selisih ' +
                        (mixSum < total ? 'kurang' : 'lebih') +
                        ' ' +
                        rp(Math.abs(total - mixSum))}
                  </span>
                  <span>
                    {rp(mixSum)} / {rp(total)}
                  </span>
                </div>
              </div>
            )}

            {/* Cash nominal buttons & input */}
            {pay === 'cash' && (
              <div className="space-y-1.5">
                <input
                  ref={receivedRef}
                  className="input text-sm font-bold"
                  inputMode="numeric"
                  placeholder="Uang diterima (Rp) · F3"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                />
                {total > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setReceived(String(total))}
                      className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold hover:bg-slate-200 dark:bg-navy-800 dark:text-slate-200"
                    >
                      Uang Pas
                    </button>
                    {[10000, 20000, 50000, 100000].map((nom) => (
                      <button
                        key={nom}
                        type="button"
                        onClick={() => setReceived(String(nom))}
                        className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold hover:bg-slate-200 dark:bg-navy-800 dark:text-slate-200"
                      >
                        {nom >= 1000 ? nom / 1000 + 'k' : nom}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {pay === 'wa' && (
              <div className="flex items-center justify-between rounded-lg bg-blue-500/10 p-2 text-xs text-blue-600 dark:text-blue-300 font-semibold">
                <span>Pembayaran QRIS Santri / Umum</span>
                <button
                  type="button"
                  onClick={() => setQrisModal(true)}
                  className="rounded bg-blue-500 px-2 py-0.5 text-white hover:bg-blue-600"
                >
                  Lihat QRIS
                </button>
              </div>
            )}

            {/* Admin discount */}
            {admin && (
              <input
                className="input text-xs"
                inputMode="numeric"
                placeholder="Diskon khusus pengurus (Rp)"
                value={disc}
                onChange={(e) => setDisc(e.target.value)}
              />
            )}

            {/* Totals & Change */}
            <div className="space-y-1 border-t border-slate-200 pt-2 text-xs dark:border-navy-700">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal</span>
                <span>{rp(subtotal)}</span>
              </div>
              {discNum > 0 && (
                <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Diskon</span>
                  <span>-{rp(discNum)}</span>
                </div>
              )}
              {perkAmt > 0 && (
                <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Diskon member{isBday ? ' (ultah 🎉)' : ''}</span>
                  <span>-{rp(perkAmt)}</span>
                </div>
              )}
              {redeemAmt > 0 && (
                <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Tebus poin/saldo</span>
                  <span>-{rp(redeemAmt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-extrabold text-slate-900 dark:text-slate-100">
                <span>Total Belanja</span>
                <span className="text-accent-500 dark:text-accent-300">{rp(total)}</span>
              </div>
              {!mix && pay === 'cash' && received.trim() !== '' && (
                <div
                  className={
                    'flex items-center justify-between text-sm font-bold ' +
                    (receivedNum < total ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')
                  }
                >
                  <span>{receivedNum < total ? 'Kekurangan' : 'Kembalian'}</span>
                  <span>{rp(Math.abs(receivedNum - total))}</span>
                </div>
              )}
            </div>

            {/* Petunjuk hotkey (desktop) */}
            <p className="hidden text-[10px] font-medium text-slate-400 lg:block dark:text-slate-500">
              F1 Cari · F2 Pembeli · F3 Bayar · F4 Simpan · F5 Cetak · ESC Batal
            </p>

            {/* Checkout Button */}
            <button
              onClick={checkout}
              disabled={busy || cart.length === 0}
              className="btn-primary w-full py-2.5 text-sm font-bold shadow-md active:scale-[0.98]"
            >
              {busy ? 'Menyimpan Transaksi…' : `Bayar ${rp(total)} (F4)`}
            </button>
          </div>
        </div>
      </div>

      {/* Modern Thermal Receipt Modal */}
      <Modal
        open={!!receipt}
        title="Transaksi Berhasil Disimpan"
        onClose={() => setReceipt(null)}
        footer={
          <div className="w-full space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="btn-ghost text-xs" onClick={copyStrukText}>
                📋 Salin Struk
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button className="btn-ghost text-xs font-bold" onClick={handleSendWaStruk}>
                  💬 Kirim WA
                </button>
                <button className="btn-primary text-xs font-bold" onClick={printStruk}>
                  🖨️ Cetak Struk (F5)
                </button>
                <button className="btn-ghost text-xs" onClick={() => setReceipt(null)}>
                  Tutup
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => {
                  setAutoPrint(e.target.checked);
                  try {
                    localStorage.setItem(
                      'kopontren_pos_autoprint',
                      e.target.checked ? 'on' : 'off'
                    );
                  } catch {
                    /* private mode */
                  }
                }}
              />
              Auto-cetak struk setelah transaksi
            </label>
          </div>
        }
      >
        {receipt && (
          <div className="space-y-3">
            {/* Visual Receipt Card */}
            <div className="mx-auto max-w-sm rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 font-mono text-xs text-slate-800 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-200">
              <div className="text-center">
                <p className="text-base font-extrabold tracking-tight">KOPONTREN AL ITTIHAD</p>
                <p className="text-[11px] text-slate-500">Kasir & Pembukuan Pondok Pesantren</p>
                <p className="text-[10px] text-slate-400">================================</p>
              </div>
              <div className="mt-2 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>No. Transaksi</span>
                  <span className="font-bold">#{receipt.sale?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal</span>
                  <span>{fmtDateTime(receipt.at)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kasir</span>
                  <span>{receipt.cashier}</span>
                </div>
                {receipt.customer && (
                  <div className="flex justify-between">
                    <span>Pembeli</span>
                    <span>{receipt.customer}</span>
                  </div>
                )}
                {receipt.memberName && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Member</span>
                    <span>{receipt.memberName}</span>
                  </div>
                )}
              </div>
              <div className="my-2 border-t border-dashed border-slate-300 dark:border-navy-600"></div>
              {/* Items */}
              <div className="space-y-1">
                {receipt.items.map((it, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between font-semibold">
                      <span>{it.product.name}</span>
                      <span>{rp(it.qty * it.price)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {it.qty} {it.product.unit} x {rp(it.price)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="my-2 border-t border-dashed border-slate-300 dark:border-navy-600"></div>
              {/* Totals */}
              <div className="space-y-0.5 text-[11px]">
                {receipt.disc > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Diskon</span>
                    <span>-{rp(receipt.disc)}</span>
                  </div>
                )}
                {receipt.memberDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Diskon member</span>
                    <span>-{rp(receipt.memberDiscount)}</span>
                  </div>
                )}
                {receipt.redeem > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Tebus poin/saldo</span>
                    <span>-{rp(receipt.redeem)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm">
                  <span>TOTAL</span>
                  <span>{rp(receipt.sale?.total ?? 0)}</span>
                </div>
                {receipt.cashback > 0 && (
                  <div className="flex justify-between">
                    <span>Cashback (saldo)</span>
                    <span>+{rp(receipt.cashback)}</span>
                  </div>
                )}
                {receipt.tier && (
                  <div className="flex justify-between font-bold text-amber-600 dark:text-amber-400">
                    <span>Tier member</span>
                    <span>{receipt.tier === 'gold' ? 'Gold 🏆' : 'Silver 🥈'}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Metode Bayar</span>
                  <span>
                    {receipt.paySplit && receipt.paySplit.length > 0
                      ? 'Campur'
                      : PAY_LABEL[receipt.pay] || receipt.pay}
                  </span>
                </div>
                {receipt.paySplit && receipt.paySplit.length > 0 ? (
                  receipt.paySplit.map((p) => (
                    <div key={p.m} className="flex justify-between">
                      <span>{PAY_LABEL[p.m] || p.m}</span>
                      <span>{rp(p.a)}</span>
                    </div>
                  ))
                ) : receipt.pay === 'cash' && receipt.received != null ? (
                  <>
                    <div className="flex justify-between">
                      <span>Diterima</span>
                      <span>{rp(receipt.received)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>Kembali</span>
                      <span>{rp(receipt.change)}</span>
                    </div>
                  </>
                ) : null}
                {receipt.points > 0 && (
                  <div className="mt-1 flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Poin Didapat</span>
                    <span>+{receipt.points} Poin</span>
                  </div>
                )}
              </div>
              <div className="mt-3 text-center text-[10px] text-slate-500">
                <p>Jazakumullah Khairan Katsiran</p>
                <p>Barang yang sudah dibeli tidak dapat ditukar</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Hidden Print Slip */}
      {receipt && (
        <div className="receipt-print">
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>KOPONTREN AL ITTIHAD</div>
            <div style={{ fontSize: '11px' }}>Kasir & Pembukuan</div>
            <div>================================</div>
          </div>
          <div style={{ fontSize: '11px', marginBottom: '6px' }}>
            <div>No. : #{receipt.sale?.id}</div>
            <div>Tgl : {fmtDateTime(receipt.at)}</div>
            <div>Kasir : {receipt.cashier}</div>
            {receipt.customer && <div>Pembeli : {receipt.customer}</div>}
            {receipt.memberName && <div>Member : {receipt.memberName}</div>}
          </div>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
          {receipt.items.map((it, idx) => (
            <div key={idx} style={{ marginBottom: '3px' }}>
              <div>{it.product.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{it.qty} {it.product.unit} x {it.price.toLocaleString('id-ID')}</span>
                <span>{(it.qty * it.price).toLocaleString('id-ID')}</span>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
          {receipt.disc > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Diskon</span>
              <span>-{receipt.disc.toLocaleString('id-ID')}</span>
            </div>
          )}
          {receipt.memberDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Diskon member</span>
              <span>-{receipt.memberDiscount.toLocaleString('id-ID')}</span>
            </div>
          )}
          {receipt.redeem > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tebus poin/saldo</span>
              <span>-{receipt.redeem.toLocaleString('id-ID')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
            <span>TOTAL</span>
            <span>Rp {(receipt.sale?.total ?? 0).toLocaleString('id-ID')}</span>
          </div>
          {receipt.cashback > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Cashback (saldo)</span>
              <span>+Rp {receipt.cashback.toLocaleString('id-ID')}</span>
            </div>
          )}
          {receipt.tier && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Tier</span>
              <span>{receipt.tier === 'gold' ? 'Gold' : 'Silver'}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              Bayar ({receipt.paySplit && receipt.paySplit.length > 0 ? 'campur' : PAY_LABEL[receipt.pay] || receipt.pay})
            </span>
            <span>Rp {(receipt.received ?? receipt.sale?.total ?? 0).toLocaleString('id-ID')}</span>
          </div>
          {receipt.paySplit && receipt.paySplit.length > 0 ? (
            receipt.paySplit.map((p) => (
              <div key={p.m} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>├ {PAY_LABEL[p.m] || p.m}</span>
                <span>Rp {p.a.toLocaleString('id-ID')}</span>
              </div>
            ))
          ) : receipt.pay === 'cash' && receipt.received != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Kembali</span>
              <span>Rp {receipt.change.toLocaleString('id-ID')}</span>
            </div>
          ) : null}
          {receipt.points > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Poin Didapat</span>
              <span>+{receipt.points} Poin</span>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px' }}>
            <div>Jazakumullah Khairan Katsiran</div>
            <div>Mohon maaf atas segala kekurangan</div>
          </div>
        </div>
      )}

      {/* Modal Scan Barcode Kamera */}
      <Modal
        open={scanModal}
        title="Scan Barcode dengan Kamera"
        onClose={() => setScanModal(false)}
        footer={
          <button className="btn-ghost" onClick={() => setScanModal(false)}>
            Tutup
          </button>
        }
      >
        <CameraScan
          onCode={(code) => {
            setScanModal(false);
            addByBarcode(code);
          }}
          onClose={() => setScanModal(false)}
        />
      </Modal>

      {/* QRIS Modal */}
      <Modal
        open={qrisModal}
        title="Pembayaran QRIS Kopontren"
        onClose={() => setQrisModal(false)}
        footer={
          <button className="btn-primary" onClick={() => setQrisModal(false)}>
            Tutup
          </button>
        }
      >
        <div className="text-center space-y-3 p-2">
          <div className="mx-auto w-48 h-48 bg-white p-3 rounded-xl border border-slate-300 shadow flex flex-col items-center justify-center">
            {/* Mock QRIS code SVG for Kopontren */}
            <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
              <rect width="100" height="100" fill="white" />
              <path d="M10 10h30v30h-30z M60 10h30v30h-30z M10 60h30v30h-30z" fill="#170a0e" />
              <path d="M15 15h20v20h-20z M65 15h20v20h-20z M15 65h20v20h-20z" fill="white" />
              <path d="M20 20h10v10h-10z M70 20h10v10h-10z M20 70h10v10h-10z" fill="#8a1538" />
              <path d="M45 15h10v10h-10z M45 35h10v20h-10z M60 55h15v10h-15z M60 75h10v15h-10z M75 65h15v25h-15z M35 60h10v10h-10z" fill="#170a0e" />
              <circle cx="50" cy="50" r="8" fill="#8a1538" />
            </svg>
          </div>
          <div>
            <p className="font-extrabold text-lg text-accent-500 dark:text-accent-300">
              {rp(total)}
            </p>
            <p className="text-xs text-slate-500">
              NMID: ID102003004050 · KOPONTREN AL ITTIHAD
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Dapat discan menggunakan BCA, Mandiri, BSI, GoPay, OVO, Dana, ShopeePay
            </p>
          </div>
        </div>
      </Modal>

      {/* Shift Modal */}
      <Modal
        open={shiftModalOpen}
        title={shiftModalType === 'open' ? 'Buka Shift Kasir Baru' : 'Tutup Shift & Rekap Kasir'}
        onClose={() => setShiftModalOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShiftModalOpen(false)}>
              Batal
            </button>
            {shiftModalType === 'open' ? (
              <button className="btn-primary" onClick={handleOpenShift}>
                Buka Shift Sekarang
              </button>
            ) : (
              <button className="btn-danger" onClick={handleCloseShift}>
                Konfirmasi Tutup Shift
              </button>
            )}
          </>
        }
      >
        {shiftModalType === 'open' ? (
          <div className="space-y-3">
            <div>
              <label className="label">Nama / Label Sesi Shift</label>
              <input
                className="input"
                placeholder="Contoh: Shift Pagi (08:00 - 15:00)"
                value={shiftLabel}
                onChange={(e) => setShiftLabel(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Membuka shift akan mulai mencatat waktu operasional dan mengelompokkan transaksi penjualan Anda sampai shift ditutup.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Apakah Anda yakin ingin mengakhiri sesi shift ini?
            </p>
            {currentShift && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-navy-700 dark:bg-navy-900 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Transaksi</span>
                  <span className="font-bold">{currentShift.sales_count} transaksi</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Penjualan</span>
                  <span className="font-bold text-accent-500 dark:text-accent-300">
                    {rp(currentShift.sales_total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Uang Kas Masuk (Tunai)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {rp(currentShift.cash_total)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Closing Shift Summary Modal */}
      <Modal
        open={!!closingSummary}
        title="Rekap Shift Berhasil Ditutup"
        onClose={() => setClosingSummary(null)}
        footer={
          <button className="btn-primary" onClick={() => setClosingSummary(null)}>
            Selesai
          </button>
        }
      >
        {closingSummary && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              ✓ Shift <b>{closingSummary.label || '#' + closingSummary.id}</b> telah ditutup dan siap untuk serah terima kasir.
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Kasir</span>
                <b>{closingSummary.kasir_name || cashier || 'Kasir'}</b>
              </div>
              <div className="flex justify-between">
                <span>Total Penjualan</span>
                <b>{rp(closingSummary.sales_total)}</b>
              </div>
              <div className="flex justify-between">
                <span>Uang Tunai Diserahkan</span>
                <b className="text-emerald-600">{rp(closingSummary.cash_total)}</b>
              </div>
              <div className="flex justify-between">
                <span>Jumlah Transaksi</span>
                <b>{closingSummary.sales_count}</b>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Member Modal */}
      <Modal
        open={memberModal}
        title="Daftar Member / Santri Baru"
        onClose={() => setMemberModal(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setMemberModal(false)}>
              Batal
            </button>
            <button className="btn-primary" onClick={saveMember}>
              Simpan Member
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <input
            className="input"
            placeholder="Nama santri / pelanggan *"
            value={memberForm.name}
            onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
            autoFocus
          />
          <input
            className="input"
            placeholder="No. WhatsApp / HP (opsional)"
            value={memberForm.phone}
            onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
          />
          <input
            className="input"
            placeholder="Alamat / Asrama (opsional)"
            value={memberForm.address}
            onChange={(e) => setMemberForm({ ...memberForm, address: e.target.value })}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Setiap kelipatan Rp 10.000 belanja otomatis mendapat 1 poin loyalitas.
          </p>
        </div>
      </Modal>

      <Toast msg={toast} onClose={() => showToast('')} />
    </div>
  );
}

/**
 * Scanner barcode berbasis kamera (jsQR: QR, Code128, EAN-13, dsb.).
 * Dipakai utk HP tanpa scanner fisik. Kamera berhenti otomatis saat modal
 * ditutup (cleanup effect) / setelah kode berhasil terbaca.
 */
function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unavailable'>(
    'starting'
  );
  const doneRef = useRef(false);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    doneRef.current = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    function decode(video: HTMLVideoElement) {
      if (doneRef.current || !ctx) return;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const found = jsQR(data.data, w, h);
      if (found && found.data) {
        doneRef.current = true;
        onCodeRef.current(found.data);
        return;
      }
      raf = requestAnimationFrame(() => decode(video));
    }

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        setStatus('scanning');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          raf = requestAnimationFrame(() => {
            if (videoRef.current) decode(videoRef.current);
          });
        }
      } catch {
        setStatus('denied');
      }
    }
    void start();

    return () => {
      doneRef.current = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (status === 'denied' || status === 'unavailable') {
    return (
      <div className="py-6 text-center text-sm">
        <p className="text-xl mb-2">📵</p>
        <p className="font-semibold text-slate-700 dark:text-slate-200">
          {status === 'denied'
            ? 'Izin kamera ditolak. Buka izin kamera di browser, lalu coba lagi.'
            : 'Kamera tidak tersedia di perangkat ini.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Alternatif: ketik nomor barcode di kolom pencarian, lalu tekan Enter.
        </p>
        <button className="btn-ghost mt-3" onClick={onClose}>
          Tutup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-2/3 rounded-lg border-2 border-white/80 bg-white/5" />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{status === 'starting' ? 'Menyalakan kamera…' : 'Arahkan barcode ke dalam bingkai'}</span>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onClose}>
          Batal (ESC)
        </button>
      </div>
    </div>
  );
}
