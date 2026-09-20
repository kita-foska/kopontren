"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export type MemberQrMember = {
  id: number;
  name: string;
  phone: string;
  points: number;
  qr_code: string;
};

/**
 * Printable member QR badge. The QR payload is the raw `qr_code` token —
 * the POS scanner looks members up with `GET /api/members?code=<qr_code>`.
 */
export function MemberQrBadge({
  member,
  onClose,
}: {
  member: MemberQrMember;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(member.qr_code, {
      width: 480,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((u) => {
        if (mounted) setDataUrl(u);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [member.qr_code]);

  function printBadge() {
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(
      `<html><head><title>Badge QR - ${member.name}</title><style>
        body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff}
        .b{border:3px solid #0f172a;border-radius:14px;padding:18px 26px;text-align:center}
        .b h1{font-size:15px;margin:0 0 2px;color:#0f172a}
        .b h2{font-size:20px;margin:0 0 10px}
        .b img{width:220px;height:220px}
        .b p{font-size:12px;color:#475569;margin:8px 0 0}
        .b small{display:block;margin-top:12px;font-size:11px;color:#64748b}
      </style></head><body>
      <div class="b">
        <h1>KOPONTREN AL ITTIHAD</h1>
        <h2>${member.name}</h2>
        <img src="${dataUrl}" alt="QR"/>
        <p>${member.phone || "Tanpa nomor"}</p>
        <small>Barcode member - tunjukkan saat berbelanja di koperasi</small>
      </div></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Badge QR Member
        </p>
        <h3 className="mt-1 text-lg font-extrabold text-slate-900">{member.name}</h3>
        <p className="text-xs text-slate-500">{member.phone || "Tanpa nomor"}</p>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR member"
            className="mx-auto mt-3 w-56 rounded-lg border-2 border-slate-800"
          />
        ) : (
          <div className="mx-auto mt-3 h-56 w-56 animate-pulse rounded-lg bg-slate-100" />
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Kasir memindai barcode ini di aplikasi kasir untuk mengenali member.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            onClick={printBadge}
            disabled={!dataUrl}
          >
            Cetak Badge
          </button>
          <button
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300"
            onClick={onClose}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
