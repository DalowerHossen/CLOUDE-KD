// path: components/invoice/client-search.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

const body = z.object({
  data: z.object({ rows: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

/** Finds a client by name (through the client list API) and links to the client's tax page. */
export function ClientSearch(): JSX.Element {
  const [hits, setHits] = useState<{ id: string; name: string }[] | null>(null);

  async function search(text: string): Promise<void> {
    if (text.trim().length < 2) return setHits(null);
    try {
      const response = await fetch(
        `/api/clients?${new URLSearchParams({ q: text.trim() }).toString()}`,
      );
      const parsed = body.safeParse(await response.json().catch(() => null));
      setHits(parsed.success ? parsed.data.data.rows.slice(0, 8) : []);
    } catch {
      setHits([]);
    }
  }

  return (
    <div className="space-y-sp-8 text-sm">
      <label className="block">
        <span className="sr-only">{t('s09Invoicing.tax.clientSearch')}</span>
        <Input
          maxLength={80}
          placeholder={t('s09Invoicing.tax.clientSearch')}
          onChange={(e) => void search(e.target.value)}
        />
      </label>
      {hits === null ? null : hits.length === 0 ? (
        <p>{t('s09Invoicing.tax.clientNone')}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between p-sp-8">
              <span>{h.name}</span>
              <Link className="underline" href={`/invoices/tax/clients/${h.id}`}>
                {t('s09Invoicing.tax.open')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
