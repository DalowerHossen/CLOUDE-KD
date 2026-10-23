// path: app/(dashboard)/wallet/_components/action-button.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

interface ActionButtonProps {
  endpoint: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  label: string;
  doneText: string;
  variant?: 'default' | 'outline' | 'destructive';
}

/** One button that sends one request (cancel a payout, remove a method, make a method the default). */
export function ActionButton({
  endpoint,
  method = 'POST',
  body,
  label,
  doneText,
  variant = 'outline',
}: ActionButtonProps): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s14Wallet.common.failed'));
      setNotice({ ok: true, text: doneText });
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s14Wallet.common.failed'),
      });
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant={variant} disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {notice && !notice.ok ? <Alert variant="destructive">{notice.text}</Alert> : null}
    </span>
  );
}
