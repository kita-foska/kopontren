'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, Badge, Modal, Toast, useToast } from '@/components/ui';
import { rp, fmtDateTime } from '@/lib/format';
import { strukWaText, shareWa } from '@/lib/rekap';

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
    redeem_points?: number;
    redeem_value?: number;
    member_name?: string;
    member_discount?: number;
    cashback?: number;
  };
  error?: string;
};
type ProductsResp = { products: Product[]; categories: string[] };
type Member = {
  id: number;
  name: string;
  phone: string;
  points: number;
  total_spent?: number;
  qr_code?: string;
  tier?: string;
};
type MembersResp = { members: Member[] };

/** normalize a typed/normalized phone locally (digits, canonical 08… form) */
function canonPhoneLocal(raw: string): string {
  let s = String(raw || '')
    .replace(/\D/g, '')
    .replace(/^62(?=0?8)/, '');
  if (s && !s.startsWith('0')) s = '0' + s;
  return s;
}

const PAY_LABEL: Record<string, string> = {
  cash: 'Tunai',
  tf: 'Transfer Bank',
  wa: 'QRIS / Non-Tunai',
};

type Receipt = {
  sale: SaleResp['sale'];
  items: CartLine[];
  customer: string;
  pay: string;
  received: number | null;
  change: number;
  at: string;
  cashier: string;
  memberName: string;
  memberPhone?: string;
  points: number;
  memberDiscount?: number;
  cashback?: number;
  redeemValue?: number;
  disc: number;
};

export function PosClient({ admin, cashier }: { admin: boolean; cashier?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState('');
  const [pay, setPay] = useState<'cash' | 'tf' | 'wa'>('cash');
  const [note, setNote] = useState('');
  const [received, setReceived] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [mq, setMq] = useState('');
  const [disc, setDisc] = useState('');
  const [redeem, setRedeem] = useState('');
  const [memberSettings, setMemberSettings] = useState<Record<string, string> | null>(null);
  const [memberModal, setMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', phone: '', address: '' });
  const [busy, setBusy] = useState(false);
  // member phone lookup (search-on-type, QR scan, add-member)
  const [phoneQ, setPhoneQ] = useState('');
  const [phoneResults, setPhoneResults] = useState<Member[] | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [qrStatus, setQrStatus] = useState('');
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qrisModal, setQrisModal] = useState(false);
  const [toast, showToast] = useToast();

  // Shift states
  const [currentShift, setCurrentShift] = useState<ShiftInfo | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftModalType, setShiftModalType] = useState<'open' | 'close'>('open');
  const [shiftLabel, setShiftLabel] = useState('');
  const [closingSummary, setClosingSummary] = useState<ShiftInfo | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Member loyalty settings (points_every, point_value) drive the redeem UI.
  useEffect(() => {
    (async () => {
      const r = await api<{ settings: Record<string, string> }>('/api/member-settings');
      if (r.ok && r.data) setMemberSettings(r.data.settings);
    })();
  }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (!term) return true;
      const matchName = p.name.toLowerCase().includes(term);
      const matchBarcode = (p.barcode || '').toLowerCase().includes(term);
      return matchName || matchBarcode;
    });
  }, [products, cat, q]);

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
      // If visible has exactly 1 match
      if (visible.length === 1) {
        add(visible[0]);
        showToast('Ditambahkan: ' + visible[0].name);
        setQ('');
        return;
      }
      if (visible.length === 0) {
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

  const selectedMember = useMemo(
    () => members.find((m) => m.id === Number(memberId)),
    [members, memberId]
  );

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const discNum = admin ? Math.min(Number(disc.replace(/[^\d]/g, '')) || 0, subtotal) : 0;
  const total = Math.max(0, subtotal - discNum);
  const receivedNum = received.trim() === '' ? 0 : Number(received.replace(/[^\d]/g, '')) || 0;
  const change = Math.max(0, receivedNum - total);
  // Loyalty settings (fallback matches server defaults)
  const pointsEvery = Math.max(1, Math.floor(Number(memberSettings?.points_every) || 10000));
  const pointValue = Math.max(0, Math.floor(Number(memberSettings?.point_value) || 100));
  // Redeem points capped by the member's balance
  const redeemNum = selectedMember
    ? Math.min(
        Math.floor(Number(redeem.replace(/[^\d]/g, '')) || 0),
        Math.max(0, selectedMember.points || 0)
      )
    : 0;
  const redeemValue = redeemNum * pointValue;

  async function saveMember() {
    if (!memberForm.name.trim()) {
      showToast('Nama member wajib diisi');
      return;
    }
    const r = await api<{ ok: boolean; id?: number; exists?: boolean; error?: string }>(
      '/api/members',
      {
        method: 'POST',
        body: JSON.stringify(memberForm),
      }
    );
    if (r.ok) {
      if (r.data?.exists) {
        showToast('Nomor sudah terdaftar — memakai member yang ada');
      } else {
        showToast('Member ' + memberForm.name + ' ditambahkan');
      }
      setMemberModal(false);
      setMemberForm({ name: '', phone: '', address: '' });
      await loadMembers();
      if (r.data?.id) {
        setMemberId(String(r.data.id));
        setPhoneResults(null);
      }
    } else showToast(r.error || r.data?.error || 'Gagal menambah member');
  }

  // ── member phone lookup ────────────────────────────────────────────────
  function selectFromPhone(m: Member) {
    setMemberId(String(m.id));
    setCustomer(m.name);
    setPhoneQ(m.phone || '');
    setPhoneResults(null);
  }

  async function searchMemberPhone(raw?: string) {
    const val = raw !== undefined ? raw : phoneQ;
    const digits = canonPhoneLocal(val);
    if (!digits) {
      setPhoneResults(null);
      return;
    }
    setPhoneBusy(true);
    const r = await api<MembersResp>(
      '/api/members?phone=' + encodeURIComponent(digits)
    );
    setPhoneBusy(false);
    if (!r.ok) {
      setPhoneResults(null);
      return;
    }
    const found = r.data?.members || [];
    setPhoneResults(found);
    if (found.length === 1) {
      // auto-select the single match (guard: skip when input already equals the
      // match's phone to avoid a re-trigger loop)
      if (canonPhoneLocal(val) !== canonPhoneLocal(found[0].phone)) {
        selectFromPhone(found[0]);
        showToast('Member ditemukan: ' + found[0].name);
      }
    }
  }

  // debounce: search 450ms after typing stops
  const phoneQRef = useRef(phoneQ);
  phoneQRef.current = phoneQ;
  useEffect(() => {
    const t = setTimeout(() => {
      void searchMemberPhone(phoneQRef.current);
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneQ]);

  function openAddMember(prefillPhone?: string) {
    setMemberForm({
      name: '',
      phone: prefillPhone !== undefined ? canonPhoneLocal(prefillPhone) : memberForm.phone,
      address: '',
    });
    setMemberModal(true);
  }

  // ── QR scan (member badge) ────────────────────────────────────────────
  function stopQrStream() {
    const v = qrVideoRef.current;
    if (v?.srcObject) (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
  }

  // release the camera whenever the scan modal closes
  useEffect(() => {
    if (!qrModal) stopQrStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrModal]);

  async function startQrScan() {
    setQrModal(true);
    setQrStatus('Menyambungkan kamera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        await qrVideoRef.current.play();
      }
      setQrStatus('Arahkan kamera ke QR member…');
      const tick = () => {
        const v = qrVideoRef.current;
        if (!v || !qrModal) return;
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 320;
        c.height = v.videoHeight || 240;
        const ctx = c.getContext('2d');
        if (ctx && v.readyState === 4) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const code = jsQR(img.data, c.width, c.height)?.data;
          if (code) handleQrCode(code);
          else setTimeout(tick, 250);
        } else setTimeout(tick, 500);
      };
      tick();
    } catch {
      setQrStatus('Kamera tidak tersedia / izin ditolak');
    }
  }

  function handleQrCode(code: string) {
    stopQrStream();
    setQrModal(false);
    const m = members.find((x) => (x.qr_code || '') === code);
    if (m) {
      selectFromPhone(m);
      showToast('Member QR: ' + m.name);
      return;
    }
    // maybe a raw phone number
    const digits = canonPhoneLocal(code);
    if (digits.length >= 10 && digits.length <= 15) {
      setPhoneQ(digits);
      void searchMemberPhone(digits);
      return;
    }
    showToast('QR tidak dikenal — tambahkan member baru?');
    openAddMember();
  }

  async function checkout() {
    if (cart.length === 0) return;
    if (pay === 'cash' && received.trim() !== '' && receivedNum < total) {
      showToast(
        'Uang diterima kurang, kekurangan Rp ' +
          (total - receivedNum).toLocaleString('id-ID') +
          '. Silakan periksa kembali nominal.'
      );
      return;
    }
    setBusy(true);
    const cashReceived = pay === 'cash' && received.trim() !== '';
    const r = await api<SaleResp>('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        customer: customer || (selectedMember ? selectedMember.name : ''),
        pay_method: pay,
        note,
        member_id: memberId ? Number(memberId) : undefined,
        discount: discNum || undefined,
        redeem_points: redeemNum || undefined,
        amount_paid: cashReceived ? receivedNum : total,
        change: cashReceived ? change : 0,
        items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_price: l.price })),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.error || 'Gagal menyimpan transaksi.');
      return;
    }
    const saved = r.data.sale;
    if (saved) {
      setReceipt({
        sale: saved,
        items: [...cart],
        customer: customer || (selectedMember ? selectedMember.name : ''),
        pay,
        received: cashReceived ? receivedNum : total,
        change: cashReceived ? change : 0,
        at: saved.created_at || new Date().toISOString(),
        cashier: cashier || 'Kasir',
        memberName: saved.member_name || (selectedMember?.name ?? ''),
        memberPhone: selectedMember?.phone ?? '',
        points: saved.points || 0,
        memberDiscount: saved.member_discount || 0,
        cashback: saved.cashback || 0,
        redeemValue: saved.redeem_value || 0,
        disc: discNum,
      });
    }
    setCart([]);
    setCustomer('');
    setNote('');
    setReceived('');
    setDisc('');
    setRedeem('');
    setMemberId('');
    setPhoneQ('');
    setPhoneResults(null);
    load();
    loadShift();
  }

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
    window.print();
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
      cashback: receipt.cashback,
      points: receipt.points,
      redeemValue: receipt.redeemValue,
      total: receipt.sale?.total ?? 0,
      pay: receipt.pay,
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
      cashback: receipt.cashback,
      points: receipt.points,
      redeemValue: receipt.redeemValue,
      total: receipt.sale?.total ?? 0,
      pay: receipt.pay,
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
                placeholder="Ketik nama atau scan barcode (tekan Enter untuk auto-add)…"
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
              {/* Phone search + QR scan (above the customer-name field) */}
              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-xs">
                    📱
                  </span>
                  <input
                    className="input pl-7 text-xs"
                    inputMode="tel"
                    placeholder="Nomor HP member / santri (08…)"
                    value={phoneQ}
                    onChange={(e) => setPhoneQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void searchMemberPhone();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn-ghost whitespace-nowrap px-2 py-1 text-xs"
                  title="Scan QR member"
                  onClick={() => void startQrScan()}
                >
                  ⛶ Scan QR
                </button>
                <button
                  type="button"
                  className="btn-ghost whitespace-nowrap px-2 py-1 text-xs"
                  title="Tambah member baru"
                  onClick={() => openAddMember(phoneQ || undefined)}
                >
                  + Tambah Member
                </button>
              </div>

              {/* search results (only while no member is selected) */}
              {!selectedMember && phoneResults !== null && phoneResults.length === 0 && (
                <div className="mb-1.5 flex items-center justify-between rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                  <span>
                    {phoneQ ? 'Tidak ada member untuk ' + canonPhoneLocal(phoneQ) : 'Belum ada member dengan nomor ini'}
                  </span>
                  <button
                    type="button"
                    className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white"
                    onClick={() => openAddMember(phoneQ || undefined)}
                  >
                    + Tambah Member
                  </button>
                </div>
              )}
              {!selectedMember && phoneResults !== null && phoneResults.length > 1 && (
                <div className="mb-1.5 space-y-1">
                  {phoneResults.slice(0, 5).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectFromPhone(m)}
                      className="flex w-full items-center justify-between rounded-lg bg-emerald-500/10 px-2 py-1.5 text-left text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                    >
                      <span>
                        {m.name} {m.phone ? `(${m.phone})` : ''}
                      </span>
                      <span>{m.points} poin</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-1.5">
                <select
                  className="input flex-1 text-xs"
                  value={memberId}
                  onChange={(e) => {
                    setMemberId(e.target.value);
                    setPhoneResults(null);
                  }}
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
                      </option>
                    ))}
                </select>
                <button
                  className="btn-ghost whitespace-nowrap px-2.5 py-1 text-xs"
                  onClick={() => openAddMember(phoneQ || undefined)}
                  title="Tambah member baru"
                >
                  + Baru
                </button>
              </div>
              {selectedMember && (
                <div className="mt-1 flex items-center justify-between rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-300 font-semibold">
                  <span>★ Member: {selectedMember.name}</span>
                  <span>
                    {selectedMember.points} poin (+{Math.floor(total / pointsEvery)} poin)
                  </span>
                </div>
              )}
              {phoneBusy && !selectedMember && (
                <p className="mt-1 text-[10px] text-slate-400">Mencari member…</p>
              )}
            </div>

            <input
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
                  onClick={() => setPay(v)}
                  className={
                    'flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ' +
                    (pay === v
                      ? 'bg-accent-500 text-white shadow-sm'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-800')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Cash nominal buttons & input */}
            {pay === 'cash' && (
              <div className="space-y-1.5">
                <input
                  className="input text-sm font-bold"
                  inputMode="numeric"
                  placeholder="Uang diterima (Rp)"
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

            {/* Redeem member points (kasir) */}
            {selectedMember && (selectedMember.points || 0) > 0 && (
              <div className="space-y-1 rounded-lg bg-violet-500/10 p-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-violet-600 dark:text-violet-300">
                  <span>
                    Redeem Poin ({selectedMember.points} poin · 1 poin = {rp(pointValue)})
                  </span>
                  <button
                    type="button"
                    className="rounded bg-violet-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-violet-600"
                    onClick={() => setRedeem(String(selectedMember.points || 0))}
                  >
                    Maks
                  </button>
                </div>
                <input
                  className="input text-xs"
                  inputMode="numeric"
                  placeholder="Jumlah poin dipakai (opsional)"
                  value={redeem}
                  onChange={(e) => setRedeem(e.target.value)}
                />
                {redeemNum > 0 && (
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Potongan poin: -{rp(redeemValue)}
                  </p>
                )}
              </div>
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
              <div className="flex items-center justify-between text-base font-extrabold text-slate-900 dark:text-slate-100">
                <span>Total Belanja</span>
                <span className="text-accent-500 dark:text-accent-300">{rp(total)}</span>
              </div>
              {pay === 'cash' && received.trim() !== '' && (
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

            {/* Checkout Button */}
            <button
              onClick={checkout}
              disabled={busy || cart.length === 0}
              className="btn-primary w-full py-2.5 text-sm font-bold shadow-md active:scale-[0.98]"
            >
              {busy ? 'Menyimpan Transaksi…' : `Bayar ${rp(total)}`}
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
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <button className="btn-ghost text-xs" onClick={copyStrukText}>
              📋 Salin Struk
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button className="btn-ghost text-xs font-bold" onClick={handleSendWaStruk}>
                💬 Kirim WA
              </button>
              <button className="btn-primary text-xs font-bold" onClick={printStruk}>
                🖨️ Cetak Struk
              </button>
              <button className="btn-ghost text-xs" onClick={() => setReceipt(null)}>
                Tutup
              </button>
            </div>
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
                <div className="flex justify-between font-extrabold text-sm">
                  <span>TOTAL</span>
                  <span>{rp(receipt.sale?.total ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Metode Bayar</span>
                  <span>{PAY_LABEL[receipt.pay] || receipt.pay}</span>
                </div>
                {receipt.pay === 'cash' && receipt.received != null && (
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
                )}
                {receipt.points > 0 && (
                  <div className="mt-1 flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Poin Didapat</span>
                    <span>+{receipt.points} Poin</span>
                  </div>
                )}
                {(receipt.redeemValue ?? 0) > 0 && (
                  <div className="mt-1 flex justify-between font-bold text-violet-600 dark:text-violet-400">
                    <span>Poin Redeem</span>
                    <span>-{rp(receipt.redeemValue ?? 0)}</span>
                  </div>
                )}
                {(receipt.memberDiscount ?? 0) > 0 && (
                  <div className="mt-1 flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Diskon Member</span>
                    <span>-{rp(receipt.memberDiscount ?? 0)}</span>
                  </div>
                )}
                {(receipt.cashback ?? 0) > 0 && (
                  <div className="mt-1 flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Cashback (saldo member)</span>
                    <span>+{rp(receipt.cashback ?? 0)}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
            <span>TOTAL</span>
            <span>Rp {(receipt.sale?.total ?? 0).toLocaleString('id-ID')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Bayar ({PAY_LABEL[receipt.pay] || receipt.pay})</span>
            <span>Rp {(receipt.received ?? receipt.sale?.total ?? 0).toLocaleString('id-ID')}</span>
          </div>
          {receipt.pay === 'cash' && receipt.received != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Kembali</span>
              <span>Rp {receipt.change.toLocaleString('id-ID')}</span>
            </div>
          )}
          {receipt.points > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Poin Didapat</span>
              <span>+{receipt.points} Poin</span>
            </div>
          )}
          {(receipt.redeemValue ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Poin Redeem</span>
              <span>-{(receipt.redeemValue ?? 0).toLocaleString('id-ID')}</span>
            </div>
          )}
          {(receipt.memberDiscount ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Diskon Member</span>
              <span>-{(receipt.memberDiscount ?? 0).toLocaleString('id-ID')}</span>
            </div>
          )}
          {(receipt.cashback ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Cashback (saldo member)</span>
              <span>+{(receipt.cashback ?? 0).toLocaleString('id-ID')}</span>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px' }}>
            <div>Jazakumullah Khairan Katsiran</div>
            <div>Mohon maaf atas segala kekurangan</div>
          </div>
        </div>
      )}

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

      {/* QR Member Scan Modal */}
      <Modal
        open={qrModal}
        title="Scan QR Member"
        onClose={() => setQrModal(false)}
        footer={
          <button className="btn-primary" onClick={() => setQrModal(false)}>
            Tutup
          </button>
        }
      >
        <div className="space-y-2">
          <div className="relative mx-auto w-64 h-48 overflow-hidden rounded-xl border-2 border-accent-500 bg-black">
            <video ref={qrVideoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-4 rounded-lg border border-emerald-400/60" />
          </div>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">{qrStatus}</p>
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
