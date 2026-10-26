'use client';

/**
 * W14-1 E-STRUK: aksi tombol di halaman publik /struk/[token]
 * (gaya m-banking -- "canggih, komunikatif"): Unduh PDF / Unduh Foto
 * (reuse generateStrukPdf/Jpeg -- library hanya terbundel saat tombol
 * ditekan), Kirim WA (wa.me), Salin Teks (clipboard). Pola share/unduh
 * sama dgn POS: mobile = share sheet, desktop = unduh.
 */
import { useState } from 'react';
import { FileText, Image, Link as LinkIcon, MessageCircle } from 'lucide-react';
import { type StrukPdfOpts } from '@/lib/struk-pdf';
import { generateStrukJpeg, generateStrukPdf } from '@/lib/struk-media';
import { shareWa } from '@/lib/rekap';
import { Button, Toast, useToast } from '@/components/ui';

function fileToDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function EstructActions({
  opts,
  waText,
}: {
  opts: StrukPdfOpts;
  waText: string;
}) {
  const [busy, setBusy] = useState(false);
  const [toast, showToast, , toastTone] = useToast();

  async function shareOrDownload(file: File, label: string) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Struk Kopontren' });
        showToast(label + ' dibagikan -- pilih WhatsApp di daftar app.');
        return;
      }
    } catch {
      /* dibatalkan user -> unduh */
    }
    fileToDownload(file);
    showToast(label + ' diunduh');
  }

  async function unduhPdf() {
    if (busy) return;
    setBusy(true);
    try {
      const f = await generateStrukPdf(opts);
      await shareOrDownload(f, 'PDF struk');
    } catch (e) {
      showToast('Gagal membuat PDF: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function unduhFoto() {
    if (busy) return;
    setBusy(true);
    try {
      const f = await generateStrukJpeg(opts);
      await shareOrDownload(f, 'Foto struk');
    } catch (e) {
      showToast('Gagal membuat foto: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function salin() {
    try {
      await navigator.clipboard.writeText(waText);
      showToast('Teks struk disalin -- tempel ke WhatsApp/chat.');
    } catch {
      showToast('Gagal menyalin -- buka menu Kirim WA', 'error');
    }
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-sm">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={unduhPdf} disabled={busy}>
          Unduh PDF
        </Button>
        <Button variant="secondary" icon={<Image className="h-4 w-4" />} onClick={unduhFoto} disabled={busy}>
          Unduh Foto
        </Button>
        <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => shareWa(waText)}>
          Kirim WA
        </Button>
        <Button variant="secondary" icon={<LinkIcon className="h-4 w-4" />} onClick={salin}>
          Salin Teks
        </Button>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1 text-center text-1xs text-slate-400 dark:text-slate-400">
        <LinkIcon className="h-3 w-3" />
        Simpan halaman ini -- bisa dibuka kembali (link personal, tak mudah ditebak)
      </p>
      <Toast msg={toast} tone={toastTone} onClose={() => showToast('')} />
    </div>
  );
}