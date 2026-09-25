"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { rp } from "@/lib/format";

export type LabelProduct = {
  id: number;
  name: string;
  unit?: string;
  base_price: number;
  barcode?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Cetak label barcode produk (rak/shelf tag) dari /admin/produk.
 * Payload QR = nilai `barcode` produk — sama persis dengan yang
 * dibaca scanner kamera POS (jsQR via addByBarcode) dan kolom
 * pencarian kasir, jadi label ini langsung bisa discan. Nomor
 * barcode juga dicetak sebagai teks monospace agar tetap bisa
 * diketik manual / dibaca scanner USB 1D (QR = 2D, tak terbaca
 * scanner 1D).
 */
export function ProductBarcodeLabel({
  product,
  onClose,
}: {
  product: LabelProduct;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [copies, setCopies] = useState(4);

  useEffect(() => {
    let mounted = true;
    if (product.barcode) {
      QRCode.toDataURL(product.barcode, {
        width: 480,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      })
        .then((u) => {
          if (mounted) setDataUrl(u);
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [product.barcode]);

  function printLabels() {
    if (!dataUrl) return;
    const name = esc(product.name);
    const unit = product.unit ? esc(product.unit) : "";
    const price = esc(rp(product.base_price));
    const code = esc(product.barcode || "");
    const n = Math.max(1, Math.min(24, copies || 4));
    let cells = "";
    for (let i = 0; i < n; i++) {
      cells +=
        '<div class="l">' +
        '<div class="t">' + name + "</div>" +
        '<img src="' + dataUrl + '" alt="QR"/>' +
        '<div class="p">' + price + (unit ? " / " + unit : "") + "</div>" +
        '<div class="c">' + code + "</div>" +
        "</div>";
    }
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>Label - ${name}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#fff;color:#000}
        .h{font-size:11px;color:#334155;padding:10px 16px 8px}
        .h b{font-size:13px;color:#0f172a}
        .g{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px}
        .l{border:2px solid #0f172a;border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:64mm;break-inside:avoid}
        .l .t{font-weight:bold;font-size:14px;text-transform:uppercase;text-align:center;line-height:1.2}
        .l img{width:100px;height:100px}
        .l .p{font-size:16px;font-weight:bold}
        .l .c{font-family:Consolas,monospace;font-size:11px;letter-spacing:1px;color:#0f172a}
        @media print{@page{margin:10mm}}
      </style></head><body>
      <div class="h"><b>KOPONTREN AL ITTIHAD</b> &mdash; label rak produk (${n} lembar)</div>
      <div class="g">${cells}</div></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  }

  const ready = Boolean(product.barcode) && dataUrl !== "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Label Barcode Produk
        </p>
        <h3 className="mt-1 text-lg font-extrabold text-slate-900">{product.name}</h3>
        <p className="text-xs text-slate-500">
          {product.barcode
            ? "Kode: " + product.barcode
            : "Barcode belum diisi — isi dulu via tombol Ubah."}
        </p>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={"QR " + product.name}
            className="mx-auto mt-3 w-52 rounded-lg border-2 border-slate-800"
          />
        ) : (
          <div className="mx-auto mt-3 h-52 w-52 animate-pulse rounded-lg bg-slate-100" />
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          QR berisi nilai barcode produk — dapat discan kamera kasir atau
          diketik manual. Tambahkan label ke produk ini.
        </p>
        {product.barcode ? (
          <div className="mt-3">
            <label className="label mb-1 block">Jumlah label</label>
            <select
              className="input mx-auto block w-32"
              value={copies}
              onChange={(e) => setCopies(Number(e.target.value))}
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={8}>8</option>
              <option value={12}>12</option>
              <option value={24}>24</option>
            </select>
          </div>
        ) : null}
        <div className="mt-4 flex justify-center gap-2">
          <button type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={printLabels}
            disabled={!ready}
          >
            Cetak Label
          </button>
          <button type="button"
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
