// path: components/payment/embed-origins-manager.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import type { EmbedOriginView } from '@/services/payment/embed-origins';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** The merchant's list of web sites that may show its payment links in the embedded checkout. */
export function EmbedOriginsManager({
  origins,
  canManage,
}: {
  origins: EmbedOriginView[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(
    url: string,
    method: 'POST' | 'DELETE',
    body: unknown,
    ok: string,
  ): Promise<boolean> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) {
        setNote({ ok: true, text: ok });
        router.refresh();
        return true;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setNote({
        ok: false,
        text: err.success ? err.data.error.message : t('s10Payments.embed.failed'),
      });
    } catch {
      setNote({ ok: false, text: t('s10Payments.embed.failed') });
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const origin = String(new FormData(form).get('origin') ?? '').trim();
    if (
      await send(
        '/api/payment-links/embed-origins',
        'POST',
        { origin },
        t('s10Payments.embed.added'),
      )
    )
      form.reset();
  }

  return (
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
      aria-labelledby="embed-title"
    >
      <h2 id="embed-title" className="text-h4 font-semibold">
        {t('s10Payments.embed.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('s10Payments.embed.help')}</p>
      {origins.length === 0 ? (
        <p className="text-sm">{t('s10Payments.embed.none')}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {origins.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <span className="break-all">{o.origin}</span>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      `/api/payment-links/embed-origins/${o.id}`,
                      'DELETE',
                      null,
                      t('s10Payments.embed.removed'),
                    )
                  }
                >
                  {t('s10Payments.embed.remove')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="embed-origin">{t('s10Payments.embed.label')}</Label>
            <Input
              id="embed-origin"
              name="origin"
              type="url"
              required
              maxLength={200}
              placeholder="https://shop.example.com"
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {t('s10Payments.embed.add')}
          </Button>
        </form>
      ) : null}
      {note ? <Alert variant={note.ok ? 'success' : 'destructive'}>{note.text}</Alert> : null}
      <p className="text-xs text-muted-foreground">{t('s10Payments.embed.guide')}</p>
    </section>
  );
}
