"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { T } from "@/lib/tokens";
import { Toast, useConfirm, useToast } from "@/components/ui";
import { rp, fmtDateTime } from "@/lib/format";

export type MemberQrMember = {
  id: number;
  name: string;
  phone: string;
  points: number;
  qr_code?: string;
  tier?: string; // '' | 'silver' | 'gold' (dihitung server dari total_spent)
  cashback_balance?: number;
  total_spent?: number;
  created_at?: string;
};

type QrPatchResp = { ok?: boolean; qr_code?: string; error?: string };

/**
 * Modal kartu membership: identitas + tier + poin/cashback + QR, siap cetak.
 * - Token masih kosong → saat pertama kali dibuka, otomatis PATCH
 *   {regenerate_qr} (endpoint khusus admin; role lain dapat 403 → hint).
 * - "Perbarui QR" → dialog konfirmasi (kartu lama tidak berlaku lagi).
 * - Cetak: window terpisah landscape (maroon, font sistem, selalu terang).
 */
export function MemberQrBadge({
  member,
  onClose,
  onQrChanged,
}: {
  member: MemberQrMember;
  onClose: () => void;
  /** Token baru (setelah auto-generate / perbarui) → sinkronkan baris daftar. */
  onQrChanged?: (token: string) => void;
}) {
  const [qr, setQr] = useState(member.qr_code || "");
  const [dataUrl, setDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const bootRef = useRef(false);
  const [toast, showToast] = useToast();
  const { ask, host: confirmHost } = useConfirm();

  // Gambar QR dari token (data URL, tanpa dependensi runtime).
  useEffect(() => {
    if (!qr) {
      setDataUrl("");
      return;
    }
    let mounted = true;
    QRCode.toDataURL(qr, {
      width: 480,
      margin: 2,
      color: { dark: T.slate900, light: T.white },
      errorCorrectionLevel: "M",
    })
      .then((u) => {
        if (mounted) setDataUrl(u);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [qr]);

  // Token kosong → auto-generate sekali saat modal dibuka (peran admin;
  // peran non-admin memperoleh 403 → hint, QR tampil "belum dibuat").
  useEffect(() => {
    if (bootRef.current || (member.qr_code ?? "") !== "") return;
    bootRef.current = true;
    setBusy(true);
    fetch("/api/members/" + member.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate_qr: true }),
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as QrPatchResp | null;
        if (res.ok && j?.qr_code) {
          setQr(j.qr_code);
          onQrChanged?.(j.qr_code);
          showToast("QR kartu dibuat");
        } else {
          setHint("QR belum dibuat — pembuatan QR khusus admin (kartu tetap dapat dibuka).");
        }
        setBusy(false);
      })
      .catch(() => setBusy(false));
  }, [member, onQrChanged, showToast]);

  function perbarui() {
    ask({
      title: "Perbarui QR?",
      message:
        "Token baru akan dibuat dan semua kartu lama dengan QR lama tidak akan berlaku lagi. Lanjutkan?",
      confirmLabel: "Perbarui QR",
      proceed: async () => {
        setBusy(true);
        const res = await fetch("/api/members/" + member.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate_qr: true }),
        }).catch(() => null);
        if (!res) {
          setBusy(false);
          showToast("Gagal membarui QR (koneksi terputus)");
          return;
        }
        const j = (await res.json().catch(() => null)) as QrPatchResp | null;
        if (res.ok && j?.qr_code) {
          setQr(j.qr_code);
          onQrChanged?.(j.qr_code);
          showToast("QR diperbarui — kartu lama tidak berlaku lagi");
        } else {
          showToast(j?.error || "Gagal membarui QR");
        }
        setBusy(false);
      },
    });
  }

  function cetak() {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=880,height=560");
    if (!w) {
      showToast("Popup diblokir browser — izinkan popup untuk mencetak.");
      return;
    }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const name = esc(member.name);
    const phone = esc(member.phone || "—");
    const regis = member.created_at ? fmtDateTime(member.created_at) : "—";
    const cb = rp(member.cashback_balance ?? 0);
    const spent = rp(member.total_spent ?? 0);
    const tierHtml =
      member.tier === "gold"
        ? `<span class="tb" style="background:${T.amber500};color:${T.amber950}">GOLD</span>`
        : member.tier === "silver"
          ? `<span class="tb" style="background:${T.slate300};color:${T.slate800}">SILVER</span>`
          : "";
    w.document.write(
      `<html><head><title>Kartu Member - ${name}</title><style>
        @page { size: landscape; margin: 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: ${T.slate900}; background: ${T.white}; }
        .card { width: 700px; margin: 12px auto; border: 3px solid ${T.slate900}; border-radius: 14px; overflow: hidden; }
        .head { background: ${T.wine700}; color: ${T.white}; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; }
        .head b { letter-spacing: .05em; font-size: 15px; }
        .head .sub { display: block; font-size: 11px; color: ${T.rose200}; margin-top: 2px; }
        .head .tb { padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
        .body { display: flex; gap: 20px; padding: 18px; align-items: center; }
        .info { flex: 1; font-size: 14px; }
        .info .n { font-size: 20px; font-weight: 700; }
        .info .s { font-size: 12px; color: ${T.slate600}; margin-top: 4px; }
        .stats { display: flex; gap: 26px; margin-top: 14px; font-size: 12px; color: ${T.slate700}; }
        .stats b { display: block; font-size: 15px; color: ${T.slate900}; }
        .qr { width: 170px; height: 170px; padding: 8px; border: 1px solid ${T.slate300}; border-radius: 10px; background: ${T.white}; }
        .foot { padding: 9px 18px; font-size: 10px; color: ${T.slate500}; border-top: 1px solid ${T.slate200}; }
      </style></head><body>
        <div class="card">
          <div class="head">
            <div><b>KOPONTREN AL ITTIHAD</b><span class="sub">KARTU ANGGOTA MEMBER</span></div>
            ${tierHtml}
          </div>
          <div class="body">
            <div class="info">
              <div class="n">${name}</div>
              <div class="s">No. HP: ${phone}</div>
              <div class="s">Terdaftar: ${regis}</div>
              <div class="stats">
                <div>Poin<b>${member.points}</b></div>
                <div>Cashback<b>Rp ${cb}</b></div>
                <div>Total Belanja<b>Rp ${spent}</b></div>
              </div>
            </div>
            <img class="qr" src="${dataUrl}" alt="QR"/>
          </div>
          <div class="foot">Tunjukkan kartu ini saat berbelanja — poin &amp; cashback (uang kembali) diterapkan otomatis oleh sistem.</div>
        </div>
      </body></html>`
    );
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        // abaikan
      }
    }, 450);
  }

  const tier = member.tier || "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-navy-900 dark:text-navy-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Kartu Anggota Member
          </p>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Pratinjau kartu landscape (sama dengan hasil cetak) */}
        <div className="mt-3 overflow-hidden rounded-xl border-2 border-slate-900 bg-white">
          <div className="flex items-center justify-between bg-wine-700 px-4 py-2.5">
            <div>
              <p className="text-[11px] font-extrabold tracking-widest text-white">
                KOPONTREN AL ITTIHAD
              </p>
              <p className="text-[10px] text-rose-100">KARTU ANGGOTA MEMBER</p>
            </div>
            {tier !== "" && (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${
                  tier === "gold"
                    ? "bg-amber-400 text-amber-950"
                    : "bg-slate-300 text-slate-800"
                }`}
              >
                {tier === "gold" ? "GOLD" : "SILVER"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-lg font-bold text-slate-900">{member.name}</p>
              <p className="text-xs text-slate-500">{member.phone || "—"}</p>
              {member.created_at && (
                <p className="text-[11px] text-slate-500">
                  Terdaftar {fmtDateTime(member.created_at)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>
                  Poin <b className="text-slate-900">{member.points}</b>
                </span>
                <span>
                  Cashback <b className="text-slate-900">{rp(member.cashback_balance ?? 0)}</b>
                </span>
                <span>
                  Belanja <b className="text-slate-900">{rp(member.total_spent ?? 0)}</b>
                </span>
              </div>
            </div>
            {dataUrl ? (
              <img
                src={dataUrl}
                alt={"QR " + member.name}
                className="h-24 w-24 shrink-0 rounded-md"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-slate-100 text-center text-[10px] text-slate-500">
                {busy ? "Membuat QR…" : member.qr_code ? "Menggambar…" : "QR belum dibuat"}
              </div>
            )}
          </div>
          <p className="border-t border-slate-200 px-4 py-2 text-[10px] text-slate-500">
            Tunjukkan kartu ini saat berbelanja — poin &amp; cashback (uang kembali) diterapkan
            otomatis.
          </p>
        </div>

        {hint && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{hint}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={!dataUrl || busy}
            onClick={cetak}
          >
            Cetak Kartu
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={perbarui}>
            Perbarui QR
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
      <Toast msg={toast} onClose={() => showToast('')} />
      {confirmHost}
    </div>
  );
}
