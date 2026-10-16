// path: components/marketing/contact-form.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Turnstile } from '@/app/(auth)/_components/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getPublicEnv } from '@/lib/env/public';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const TOPICS = ['sales', 'support', 'security', 'partnership', 'other'] as const;

export function ContactForm({ email }: { email?: string }): JSX.Element {
  const siteKey = getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      setError(t('s06Public.contact.checkFirst'));
      return;
    }
    setBusy(true);
    setError(null);
    const d = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/public-site/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(d.get('name') ?? ''),
          email: String(d.get('email') ?? ''),
          company: String(d.get('company') ?? ''),
          topic: String(d.get('topic') ?? 'other'),
          message: String(d.get('message') ?? ''),
          website: String(d.get('website') ?? ''),
          turnstileToken: token,
        }),
      });
      if (response.ok) {
        setDone(true);
      } else {
        const parsed = errorBody.safeParse(await response.json().catch(() => null));
        setError(parsed.success ? parsed.data.error.message : t('s06Public.contact.error'));
        setResetKey((k) => k + 1);
      }
    } catch {
      setError(t('s06Public.contact.error'));
      setResetKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="max-w-2xl rounded-lg border bg-card p-sp-24">
        <h3 className="text-h4 font-semibold">{t('s06Public.contact.thanksTitle')}</h3>
        <p className="text-muted-foreground">{t('s06Public.contact.thanks')}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-sp-32 lg:grid-cols-[2fr_1fr]">
      <form
        onSubmit={submit}
        className="space-y-sp-16"
        aria-label={t('s06Public.contact.formLabel')}
        noValidate={false}
      >
        <div className="grid gap-sp-16 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.contact.name')}</span>
            <Input name="name" required minLength={2} maxLength={100} autoComplete="name" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.contact.email')}</span>
            <Input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.contact.company')}</span>
            <Input name="company" maxLength={100} autoComplete="organization" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.contact.topic')}</span>
            <select
              name="topic"
              defaultValue="sales"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {t(`s06Public.contact.topic_${topic}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.contact.message')}</span>
          <Textarea name="message" required minLength={10} maxLength={4000} rows={6} />
        </label>
        {/* Honeypot: hidden from people and from assistive technology; bots fill it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-10000px',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          <label>
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
        <p
          aria-live="polite"
          role={error ? 'alert' : undefined}
          className="text-sm text-destructive"
        >
          {error}
        </p>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('s06Public.contact.sending') : t('s06Public.contact.send')}
        </Button>
      </form>
      <aside className="space-y-2 text-sm text-muted-foreground">
        <h3 className="text-base font-semibold text-foreground">
          {t('s06Public.contact.otherWays')}
        </h3>
        {email ? (
          <p>
            {t('s06Public.contact.writeTo')}{' '}
            <a className="text-primary hover:underline" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        ) : null}
        <p>{t('s06Public.contact.reply')}</p>
      </aside>
    </div>
  );
}
