'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * W18-A (UI/UX High Polish): TableScroll -- pembungkus tabel
 * responsif: scroll horizontal + fade kanan halus (indikator
 * "masih ada konten ke kanan"). Fade = CSS murni
 * (.table-scroll-fade, globals.css); JS hanya deteksi overflow
 * (event scroll + ResizeObserver) utk menampakkan/menyembunyikan
 * fade. Pengganti <div className="overflow-x-auto"> eksisting --
 * rendering scroll identik, plus indikator fade.
 *
 * Contoh: <TableScroll> <Table minW="min-w-[22rem]"> ... </Table>
 * </TableScroll>
 */
export function TableScroll({
  children,
  className = '',
}: {
  children: ReactNode;
  /** className tambahan utk pembungkus luar (mis. 'mt-3'). */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  // Anak berubah (data baru tiba / periode diganti) -> hitung ulang.
  useEffect(() => {
    update();
  }, [children, update]);

  return (
    <div className={'table-scroll' + (className ? ' ' + className : '')}>
      <div ref={ref} className="table-scroll-inner" onScroll={update}>
        {children}
      </div>
      {canRight && <div className="table-scroll-fade" aria-hidden="true" />}
    </div>
  );
}