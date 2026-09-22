import { useEffect, useRef } from 'react';

/**
 * Hook hotkey global (window keydown) dengan map handler STABIL via useRef:
 * listener hanya didaftarkan sekali (tidak re-subscribe tiap render),
 * sementara isi map diperbarui tiap render — bebas closure stale.
 *
 * Kunci combo (kecil semua): 'f6', 'arrowup', '+', 'delete', '?', 'ctrl+p',
 * dst. (Ctrl/Meta di-prefix 'ctrl+'). Handler sendiri yang memutuskan
 * e.preventDefault() — sehingga di luar aksi, input teks & shortcut browser
 * tetap berperilaku normal.
 */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey ? 'ctrl+' : '') + e.key.toLowerCase();
      const fn = mapRef.current[combo];
      if (fn) fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
