'use client';

export function ThemeToggle() {
  function toggle() {
    const el = document.documentElement;
    const next = el.classList.contains('dark') ? 'light' : 'dark';
    el.classList.toggle('dark', next === 'dark');
    document.cookie = 'theme=' + next + '; path=/; max-age=31536000; samesite=lax';
  }
  return (
    <button
      onClick={toggle}
      title="Ganti tema"
      className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-base dark:border-navy-600"
    >
      <span className="hidden dark:inline">☾</span>
      <span className="dark:hidden">☀</span>
    </button>
  );
}
