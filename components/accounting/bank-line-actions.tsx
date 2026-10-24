// path: components/accounting/bank-line-actions.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

interface Props {
  txnId: string;
  accounts: readonly { id: string; label: string }[];
}

async function send(url: string, body: Record<string, unknown>, key: boolean): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': `ui-${crypto.randomUUID()}` } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
}

/** Book an unmatched bank line to an account (fee, interest) or ignore it. */
export function BankLineActions({ txnId, accounts }: Props): JSX.Element {
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(url: string, body: Record<string, unknown>, key: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await send(url, body, key);
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t('s15Accounting.common.failed'));
    }
    setBusy(false);
  }
  return (
    <div className="space-y-1">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap items-end gap-2">
        <NativeSelect
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label={t('s15Accounting.reconciliation.bookAccount')}
          className="min-w-40"
        >
          <option value="">{t('s15Accounting.reconciliation.bookTitle')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </NativeSelect>
        <Input
          value={memo}
          maxLength={200}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={t('s15Accounting.reconciliation.bookMemo')}
          aria-label={t('s15Accounting.reconciliation.bookMemo')}
          autoComplete="off"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || accountId === ''}
          onClick={() =>
            void run(
              `/api/accounting/reconciliation/transactions/${txnId}/categorize`,
              { accountId, memo },
              true,
            )
          }
        >
          {t('s15Accounting.reconciliation.book')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(
              `/api/accounting/reconciliation/transactions/${txnId}/ignore`,
              { ignored: true },
              false,
            )
          }
        >
          {t('s15Accounting.reconciliation.ignore')}
        </Button>
      </div>
    </div>
  );
}
