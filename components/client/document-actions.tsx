// path: components/client/document-actions.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/** Download and print for an estimate or a receipt. The link goes in the request body, never in an address. */
export function DocumentActions({
  token,
  fileName,
}: {
  token: string;
  fileName: string;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('/api/portal/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('download');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'document'}.pdf`;
      link.rel = 'noopener noreferrer';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8 print:hidden">
      {failed ? <Alert variant="destructive">{t('s13Portal.invoice.downloadFailed')}</Alert> : null}
      <div className="flex flex-col gap-sp-8 sm:flex-row">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void download()}>
          {t('s13Portal.invoice.download')}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          {t('s13Portal.invoice.print')}
        </Button>
      </div>
    </div>
  );
}
