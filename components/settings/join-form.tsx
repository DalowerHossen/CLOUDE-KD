// path: components/settings/join-form.tsx
'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Turnstile } from '@/app/(auth)/_components/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPublicEnv } from '@/lib/env/public';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** Account form of an invited person: name and password, then the browser goes to the sign-in page. */
export function JoinForm({ token }: { token: string }): JSX.Element {
  const siteKey = getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [turnstile, setTurnstile] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!turnstile) {
      setError(t('s07Company.join.check'));
      return;
    }
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/team/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          fullName: String(form.get('fullName') ?? ''),
          password: String(form.get('password') ?? ''),
          turnstileToken: turnstile,
          website: String(form.get('website') ?? ''),
        }),
      });
      if (response.ok) {
        setState('done');
        return;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setError(parsed.success ? parsed.data.error.message : t('s07Company.join.error'));
    } catch {
      setError(t('s07Company.join.error'));
    }
    setState('idle');
    setTurnstile(null);
    setResetKey((k) => k + 1);
  }

  if (state === 'done')
    return (
      <p role="status" className="rounded-md border p-sp-12 text-sm">
        {t('s07Company.join.done')}{' '}
        <Link className="underline" href="/login">
          {t('s07Company.join.signIn')}
        </Link>
      </p>
    );
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12">
      <label className="block space-y-1 text-sm">
        <span>{t('s07Company.join.name')}</span>
        <Input name="fullName" required maxLength={200} autoComplete="name" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t('s07Company.join.password')}</span>
        <Input
          name="password"
          type="password"
          required
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Turnstile siteKey={siteKey} onToken={setTurnstile} resetKey={resetKey} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={state === 'busy'}>
        {t('s07Company.join.submit')}
      </Button>
    </form>
  );
}
