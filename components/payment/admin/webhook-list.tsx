// path: components/payment/admin/webhook-list.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';
import type { WebhookListItem } from '@/services/payment/webhook-core';

const errorBody = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});
const retryBody = z.object({ data: z.object({ status: z.string() }) });
const FILTERS = ['received', 'processed', 'failed', 'dead_letter', 'ignored'] as const;

function statusLabel(status: string): string {
  const key = `s10Payments.webhooks.statuses.${status}` as StringKey;
  const text = t(key);
  return text === key ? status : text;
}

export function WebhookList({
  items,
  active,
}: {
  items: WebhookListItem[];
  active: string | null;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function retry(id: string): Promise<void> {
    setBusy(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/payments/webhooks/${id}/retry`, { method: 'POST' });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setFeedback({
          ok: false,
          text:
            parsed.success && parsed.data.error.code === 'step_up_required'
              ? t('s10Payments.webhooks.needStepUp')
              : parsed.success
                ? parsed.data.error.message
                : t('s10Payments.webhooks.failed'),
        });
        return;
      }
      const parsed = retryBody.safeParse(json);
      setFeedback({
        ok: true,
        text: t('s10Payments.webhooks.retried', {
          status: parsed.success ? statusLabel(parsed.data.data.status) : '',
        }),
      });
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('s10Payments.webhooks.failed') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-sp-16">
      <nav className="flex flex-wrap gap-2" aria-label={t('s10Payments.webhooks.title')}>
        <Button asChild size="sm" variant={active === null ? 'default' : 'outline'}>
          <Link href="/admin/payments/webhooks">{t('s10Payments.webhooks.filterAll')}</Link>
        </Button>
        {FILTERS.map((f) => (
          <Button key={f} asChild size="sm" variant={active === f ? 'default' : 'outline'}>
            <Link href={`/admin/payments/webhooks?status=${f}`}>{statusLabel(f)}</Link>
          </Button>
        ))}
      </nav>
      {feedback ? (
        <Alert variant={feedback.ok ? 'success' : 'destructive'}>{feedback.text}</Alert>
      ) : null}
      <ul className="space-y-sp-8">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 rounded-md border p-sp-12 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">
                {item.processorId} - {item.eventType}{' '}
                <Badge
                  variant={
                    item.status === 'processed'
                      ? 'success'
                      : item.status === 'dead_letter'
                        ? 'destructive'
                        : item.status === 'failed'
                          ? 'warning'
                          : 'secondary'
                  }
                >
                  {statusLabel(item.status)}
                </Badge>
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {item.createdAt.replace('T', ' ').slice(0, 19)} UTC -{' '}
                {t('s10Payments.webhooks.columns.attempts')}: {item.attempts}
                {item.error ? ` - ${item.error}` : ''}
              </p>
            </div>
            {item.status === 'failed' || item.status === 'dead_letter' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy === item.id}
                onClick={() => void retry(item.id)}
              >
                {t('s10Payments.webhooks.retry')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
