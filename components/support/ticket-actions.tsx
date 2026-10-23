// path: components/support/ticket-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function TicketActions({
  id,
  status,
  rating,
}: {
  id: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  rating: number | null;
}): JSX.Element {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(payload: Record<string, unknown>, after?: () => void): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/support/tickets/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        after?.();
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setError(err.success ? err.data.error.message : t('s07Company.support.error'));
      }
    } catch {
      setError(t('s07Company.support.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-sp-12">
      {status === 'closed' ? (
        <p className="text-sm text-muted-foreground">{t('s07Company.support.closedNote')}</p>
      ) : (
        <div className="space-y-sp-8">
          <label className="block text-sm font-medium" htmlFor="ticket-reply">
            {t('s07Company.support.reply')}
          </label>
          <Textarea
            id="ticket-reply"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            type="button"
            disabled={busy || body.trim() === ''}
            onClick={() => void send({ action: 'reply', body }, () => setBody(''))}
          >
            {t('s07Company.support.send')}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-sp-8">
        {status !== 'closed' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void send({ action: 'close' })}
          >
            {t('s07Company.support.close')}
          </Button>
        ) : null}
        {status === 'closed' || status === 'resolved' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void send({ action: 'reopen' })}
          >
            {t('s07Company.support.reopen')}
          </Button>
        ) : null}
      </div>
      {(status === 'resolved' || status === 'closed') && rating === null ? (
        <div className="space-y-sp-8">
          <p className="text-sm font-medium">{t('s07Company.support.rate')}</p>
          <div className="flex gap-sp-8">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void send({ action: 'rate', rating: n })}
                aria-label={`${n} / 5`}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {rating !== null ? <p className="text-sm">{t('s07Company.support.rated')}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
