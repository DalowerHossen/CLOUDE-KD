// path: components/marketing/tools/lead-box.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Turnstile } from '@/app/(auth)/_components/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPublicEnv } from '@/lib/env/public';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** E-mail box of the free tools and the newsletter. The agreement box starts unchecked; nothing is sent without it. */
export function LeadBox({
  source,
}: {
  source: 'newsletter' | 'invoice_generator' | 'calculator' | 'template';
}): JSX.Element {
  const siteKey = getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!token) {
      setError(t('s06Public.contact.checkFirst'));
      return;
    }
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/public-site/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          name: String(form.get('name') ?? ''),
          source,
          marketingOk: form.get('agree') === 'on',
          website: String(form.get('website') ?? ''),
          turnstileToken: token,
        }),
      });
      if (response.ok) {
        setState('done');
        return;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setError(parsed.success ? parsed.data.error.message : t('s06Public.tools.leadError'));
    } catch {
      setError(t('s06Public.tools.leadError'));
    }
    setState('idle');
    setToken(null);
    setResetKey((k) => k + 1);
  }

  if (state === 'done')
    return (
      <p role="status" className="rounded-lg border bg-card p-sp-16">
        {t('s06Public.tools.leadThanks')}
      </p>
    );
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16"
      aria-label={t('s06Public.tools.leadTitle')}
    >
      <h2 className="text-h4 font-semibold">{t('s06Public.tools.leadTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('s06Public.tools.leadText')}</p>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>{t('s06Public.contact.name')}</span>
          <Input name="name" maxLength={100} autoComplete="name" />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('s06Public.contact.email')}</span>
          <Input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
      </div>
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" className="mt-1" />
        <span>{t('s06Public.tools.leadAgree')}</span>
      </label>
      <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={state === 'busy'}>
        {t('s06Public.tools.leadButton')}
      </Button>
    </form>
  );
}
