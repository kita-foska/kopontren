'use client';

/**
 * UX-1 (E37/E39) -- daftar glosarium (src/lib/glossary.ts): grup + cari
 * (filter istilah/definisi, tanpa debounce: data statis lokal).
 * Responsif + dark mode (kelas standar kartu .card / .input).
 */
import { useMemo, useState } from 'react';
import { Empty } from '@/components/ui';
import { GLOSSARY } from '@/lib/glossary';

const GROUP_ORDER = [
  'Toko & Transaksi',
  'Akad & Bagi Hasil',
  'ZIS & Zakat',
  'Laporan & Buku',
  'Member & Reward',
  'Koperasi & SHU',
];

export function GlosariumClient() {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const items = query
      ? GLOSSARY.filter(
          (g) =>
            g.term.toLowerCase().includes(query) || g.desc.toLowerCase().includes(query)
        )
      : GLOSSARY;
    const map = new Map<string, typeof GLOSSARY>();
    for (const g of items) {
      const list = map.get(g.group) ?? [];
      list.push(g);
      map.set(g.group, list);
    }
    return GROUP_ORDER.filter((grp) => map.has(grp)).map((grp) => [grp, map.get(grp)!] as const);
  }, [q]);

  const total = GLOSSARY.length;

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <label className="label mb-1 block">Cari istilah</label>
        <input
          className="input"
          placeholder="mis. nisbah, zakat, komisi, D=K"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {q.trim() ? groups.length + ' grup / ' : ''}
          {total} istilah resmi aplikasi
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="card p-4">
          <Empty compact text={'Tidak ketemu "' + q.trim() + '". Coba kata lain (mis. komisi, jasa, laporan).'} />
        </div>
      ) : (
        groups.map(([grp, items]) => (
          <div key={grp} className="card p-4">
            <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">{grp}</h2>
            <dl className="space-y-2">
              {items.map((g) => (
                <div key={g.term} className="text-sm">
                  <dt className="font-bold text-accent-700 dark:text-accent-300">{g.term}</dt>
                  <dd className="mt-0.5 text-slate-600 dark:text-slate-300">{g.desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </div>
  );
}
