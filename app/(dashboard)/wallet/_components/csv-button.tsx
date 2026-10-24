// path: app/(dashboard)/wallet/_components/csv-button.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/** Downloads the ledger of a period as a CSV file made by the server. */
export function CsvButton({ from, to }: { from: string; to: string }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/wallet/ledger?from=${from}&to=${to}&format=csv`, {
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { csv?: string; filename?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data?.csv)
        throw new Error(json?.error?.message ?? t('s14Wallet.common.failed'));
      const url = URL.createObjectURL(
        new Blob([json.data.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = json.data.filename ?? 'ledger.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t('s14Wallet.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
        {t('s14Wallet.ledger.download')}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}
