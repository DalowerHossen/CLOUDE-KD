// path: components/client/invoice-actions.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

interface InvoiceActionsProps {
  token: string;
  canPay: boolean;
  /** `mailto:` address of the seller, or an empty text. */
  contactEmail: string;
  invoiceNumber: string;
}

type Failure = 'pay' | 'download' | null;

/** Pay now, download and print. The link goes in the request body, never in an address. */
export function InvoiceActions({
  token,
  canPay,
  contactEmail,
  invoiceNumber,
}: InvoiceActionsProps): JSX.Element {
  const [busy, setBusy] = useState<'pay' | 'download' | null>(null);
  const [failure, setFailure] = useState<Failure>(null);

  async function post(path: string): Promise<Response> {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  }

  async function pay(): Promise<void> {
    setBusy('pay');
    setFailure(null);
    try {
      const response = await post('/api/portal/pay-link');
      const json: unknown = await response.json();
      const path = (json as { data?: { path?: unknown } }).data?.path;
      if (response.ok && typeof path === 'string' && /^\/pay\/[A-Za-z0-9_.-]+$/.test(path)) {
        window.location.assign(path);
        return;
      }
      setFailure('pay');
    } catch {
      setFailure('pay');
    }
    setBusy(null);
  }

  async function download(): Promise<void> {
    setBusy('download');
    setFailure(null);
    try {
      const response = await post('/api/portal/pdf');
      if (!response.ok) throw new Error('download');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_') || 'invoice'}.pdf`;
      link.rel = 'noopener noreferrer';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailure('download');
    }
    setBusy(null);
  }

  return (
    <div className="space-y-sp-12 print:hidden">
      {failure === 'pay' ? (
        <Alert variant="destructive">{t('s13Portal.invoice.payFailed')}</Alert>
      ) : null}
      {failure === 'download' ? (
        <Alert variant="destructive">{t('s13Portal.invoice.downloadFailed')}</Alert>
      ) : null}
      <div className="flex flex-col gap-sp-8 sm:flex-row">
        {canPay ? (
          <Button
            type="button"
            size="lg"
            className="sm:flex-1"
            disabled={busy !== null}
            onClick={() => void pay()}
          >
            {busy === 'pay' ? t('s13Portal.invoice.paying') : t('s13Portal.invoice.pay')}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void download()}
        >
          {t('s13Portal.invoice.download')}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          {t('s13Portal.invoice.print')}
        </Button>
        {contactEmail ? (
          <Button asChild variant="ghost">
            <a href={`mailto:${contactEmail}`} rel="noopener noreferrer">
              {t('s13Portal.invoice.contact')}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
