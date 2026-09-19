'use client';

/** Baris dot untuk menampilkan jumlah digit PIN yang sudah diketik. */
export function PinDots({
  value,
  maxLength,
  error,
}: {
  value: string;
  maxLength: number;
  error?: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-center gap-3">
      {Array.from({ length: maxLength }).map((_, i) => (
        <span
          key={i}
          className={
            'h-3.5 w-3.5 rounded-full transition ' +
            (i < value.length
              ? error
                ? 'bg-rose-500'
                : 'bg-accent-500'
              : 'border-2 border-slate-300 dark:border-navy-600')
          }
        />
      ))}
    </div>
  );
}

/**
 * Keypad numerik utk input PIN (mobile friendly). Halaman pemanggil
 * menyimpan `value` sendiri & mengontrol submit.
 */
export function PinPad({
  onKey,
  onBackspace,
  onClear,
  disabled,
}: {
  onKey: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  return (
    <div className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (k === 'C') onClear();
            else if (k === '⌫') onBackspace();
            else onKey(k);
          }}
          className="input h-12 rounded-xl text-center text-lg font-bold"
        >
          {k}
        </button>
      ))}
    </div>
  );
}
