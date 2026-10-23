// path: components/transfer/export-button.tsx
'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const okBody = z.object({ data: z.object({ fileName: z.string(), csv: z.string() }) });

/** Downloads the list that is on the screen (same search and state) as a CSV file. */
export function ExportButton({
  target,
  q,
  status,
}: {
  target: 'clients' | 'products' | 'suppliers';
  q?: string;
  status?: string;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, ...(q ? { q } : {}), ...(status ? { status } : {}) }),
      });
      const json: unknown = await response.json().catch(() => null);
      const ok = okBody.safeParse(json);
      if (response.ok && ok.success) {
        const url = URL.createObjectURL(
          new Blob([ok.data.data.csv], { type: 'text/csv;charset=utf-8' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = ok.data.data.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const err = errorBody.safeParse(json);
        setError(err.success ? err.data.error.message : t('s08Crm.transfer.exportError'));
      }
    } catch {
      setError(t('s08Crm.transfer.exportError'));
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-sp-8">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>
        {busy ? t('s08Crm.transfer.exporting') : t('s08Crm.transfer.export')}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
