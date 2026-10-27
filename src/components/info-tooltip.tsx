'use client';

/**
 * W18-A (UI/UX High Polish): InfoTooltip -- gelembur penjelasan
 * ringkas di samping field form yang membingungkan (glyph "?"
 * kecil, SVG inline). Buka = murni CSS (:hover/:focus-within,
 * lihat .info-tip* di globals.css) -- 0 state React.
 * A11y: trigger = <button aria-label> (keyboard-focusable);
 * gelembur = role="tooltip". Token desain: --radius-sm +
 * --shadow-md (globals.css).
 * Catatan: jangan menaruh komponen ini DI DALAM <label> (element
 * interaktif tak valid di dalam label) -- letakkan sebagai
 * sibling di samping label (wrapper flex gap-1).
 */
export function InfoTooltip({ text, label }: { text: string; label: string }) {
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-trigger" aria-label={label}>
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </button>
      <span role="tooltip" className="info-tip-bubble">
        {text}
      </span>
    </span>
  );
}