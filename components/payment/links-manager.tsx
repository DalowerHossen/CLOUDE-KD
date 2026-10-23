// path: components/payment/links-manager.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { LinkView } from '@/services/payment/links';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const createdBody = z.object({ data: z.object({ url: z.string() }) });

interface Props {
  links: LinkView[];
  invoices: { id: string; number: string; due: string }[];
  canManage: boolean;
}

export function LinksManager({ links, invoices, canManage }: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = String(data.get('amount') ?? '').trim();
    const hours = String(data.get('validHours') ?? '').trim();
    setBusy(true);
    setFeedback(null);
    setFresh(null);
    try {
      const response = await fetch('/api/payment-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoiceId: String(data.get('invoiceId') ?? ''),
          amount: amount === '' ? null : amount,
          validHours: hours === '' ? null : +hours,
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setFeedback({
          ok: false,
          text: parsed.success ? parsed.data.error.message : t('s10Payments.links.failed'),
        });
        return;
      }
      const parsed = createdBody.safeParse(json);
      if (parsed.success) setFresh(parsed.data.data.url);
      setFeedback({ ok: true, text: t('s10Payments.links.created') });
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('s10Payments.links.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/payment-links/${id}`, { method: 'DELETE' });
      setFeedback(
        response.ok
          ? { ok: true, text: t('s10Payments.links.revoked') }
          : { ok: false, text: t('s10Payments.links.failed') },
      );
      if (response.ok) router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('s10Payments.links.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ ok: true, text: t('s10Payments.links.copied') });
    } catch {
      setFeedback({ ok: false, text: t('s10Payments.links.failed') });
    }
  }

  return (
    <div className="space-y-sp-16">
      {canManage ? (
        <form
          onSubmit={(e) => void create(e)}
          className="grid gap-sp-12 rounded-lg border p-sp-16 sm:grid-cols-3"
        >
          <div className="space-y-1">
            <Label htmlFor="link-invoice">{t('s10Payments.links.invoice')}</Label>
            <NativeSelect id="link-invoice" name="invoiceId" required defaultValue="">
              <option value="" disabled>
                {t('s10Payments.links.chooseInvoice')}
              </option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} - USD {i.due}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-amount">{t('s10Payments.links.amount')}</Label>
            <Input
              id="link-amount"
              name="amount"
              inputMode="decimal"
              pattern="\d{1,14}(\.\d{1,4})?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-hours">{t('s10Payments.links.validHours')}</Label>
            <Input
              id="link-hours"
              name="validHours"
              type="number"
              min={1}
              max={720}
              inputMode="numeric"
            />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy}>
              {t('s10Payments.links.create')}
            </Button>
          </div>
        </form>
      ) : null}
      {feedback ? (
        <Alert variant={feedback.ok ? 'success' : 'destructive'}>{feedback.text}</Alert>
      ) : null}
      {fresh ? (
        <div className="flex flex-col gap-2 rounded-md border p-sp-12 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all text-xs">{fresh}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(fresh)}>
            {t('s10Payments.links.copy')}
          </Button>
        </div>
      ) : null}
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s10Payments.links.empty')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-2 rounded-md border p-sp-12 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {l.invoiceNumber}{' '}
                  <Badge variant={l.status === 'active' ? 'success' : 'secondary'}>
                    {t(`s10Payments.links.statuses.${l.status}` as StringKey)}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.amount ? `USD ${l.amount}` : t('s10Payments.links.wholeBalance')} -{' '}
                  {t('s10Payments.links.columns.expires')}{' '}
                  {l.expiresAt.replace('T', ' ').slice(0, 16)} UTC -{' '}
                  {t('s10Payments.links.columns.used')} {l.useCount}/{l.maxUses}
                </p>
              </div>
              {canManage && l.status === 'active' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void revoke(l.id)}
                >
                  {t('s10Payments.links.revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
