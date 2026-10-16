// path: components/crm/views-panel.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { SavedView } from '@/services/client/views';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function ViewsPanel({
  listKey,
  basePath,
  views,
  current,
}: {
  listKey: 'clients' | 'products' | 'suppliers' | 'purchase_orders';
  basePath: string;
  views: SavedView[];
  /** The filters of the page right now, as address parameters. */
  current: Record<string, string>;
}): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(method: 'POST' | 'DELETE', body: unknown): Promise<void> {
    setNote(null);
    try {
      const response = await fetch('/api/clients/views', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setName('');
        router.refresh();
        return;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setNote({
        ok: false,
        text: err.success ? err.data.error.message : t('s08Crm.search.viewError'),
      });
    } catch {
      setNote({ ok: false, text: t('s08Crm.search.viewError') });
    }
  }

  const href = (filters: Record<string, string>): string => {
    const sp = new URLSearchParams(filters);
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <section
      className="space-y-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
      aria-label={t('s08Crm.search.viewsTitle')}
    >
      <h2 className="font-semibold">{t('s08Crm.search.viewsTitle')}</h2>
      {views.length === 0 ? (
        <p className="text-muted-foreground">{t('s08Crm.search.noViews')}</p>
      ) : (
        <ul className="flex flex-wrap gap-sp-8">
          {views.map((v) => (
            <li key={v.id} className="flex items-center gap-1 rounded-full border px-3 py-1">
              <Link className="underline" href={href(v.filters)}>
                {v.name}
              </Link>
              <button
                type="button"
                className="text-muted-foreground"
                aria-label={`${t('s08Crm.search.deleteView')} ${v.name}`}
                onClick={() => void call('DELETE', { id: v.id })}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-sp-8"
        onSubmit={(e) => {
          e.preventDefault();
          void call('POST', { listKey, name, filters: current });
        }}
      >
        <label className="block">
          <span className="block">{t('s08Crm.search.viewName')}</span>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" variant="outline" disabled={name.trim() === ''}>
          {t('s08Crm.search.saveView')}
        </Button>
      </form>
      {note ? (
        <p role="alert" className="text-destructive">
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
