// path: components/developers/key-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { toInt } from '@/lib/reports/numbers';

interface Failure {
  error?: { code?: string; message?: string };
}

async function readFailure(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as Failure | null;
  if (json?.error?.code === 'step_up_required') return t('s16Developers.common.needStepUp');
  return json?.error?.message ?? t('s16Developers.common.failed');
}

/** The secret of a new key, shown once with a copy button. */
function SecretBox({ secret }: { secret: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Alert variant="success" className="space-y-2">
      <p>{t('s16Developers.keys.secretOnce')}</p>
      <code className="block break-all rounded bg-muted p-2 text-sm">{secret}</code>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? t('s16Developers.keys.copied') : t('s16Developers.keys.copy')}
      </Button>
    </Alert>
  );
}

/** Makes a key. The secret is in the answer once and is shown here once. */
export function CreateKeyForm({ scopes }: { scopes: readonly string[] }): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [mode, setMode] = useState('live');
  const [chosen, setChosen] = useState<string[]>([]);
  const [limit, setLimit] = useState('120');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const response = await fetch('/api/integrations/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          mode,
          scopes: chosen,
          rateLimitPerMinute: toInt(limit, 120),
          expiresInDays: days.trim() === '' ? null : toInt(days, 0),
        }),
        cache: 'no-store',
      });
      if (!response.ok) {
        setError(await readFailure(response));
      } else {
        const json = (await response.json()) as { data: { secret: string } };
        setSecret(json.data.secret);
        setName('');
        setChosen([]);
        router.refresh();
      }
    } catch {
      setError(t('s16Developers.common.failed'));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {secret ? <SecretBox secret={secret} /> : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ak-name">{t('s16Developers.keys.name')}</Label>
          <Input
            id="ak-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ak-mode">{t('s16Developers.keys.mode')}</Label>
          <NativeSelect id="ak-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="live">{t('s16Developers.keys.modes.live')}</option>
            <option value="sandbox">{t('s16Developers.keys.modes.sandbox')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ak-limit">{t('s16Developers.keys.rateLimit')}</Label>
          <Input
            id="ak-limit"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ak-days">{t('s16Developers.keys.expiresIn')}</Label>
          <Input
            id="ak-days"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('s16Developers.keys.scopes')}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {scopes.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(scope)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked ? [...chosen, scope] : chosen.filter((x) => x !== scope),
                  )
                }
              />
              {t(`s16Developers.scopes.${scope}` as StringKey)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={busy || name.trim() === '' || chosen.length === 0}>
        {t('s16Developers.keys.make')}
      </Button>
    </form>
  );
}

/** Rotates a key: the new secret is shown once and the old key works for 24 more hours. */
export function RotateKeyButton({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  async function rotate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/keys/${id}/rotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!response.ok) {
        setError(await readFailure(response));
      } else {
        const json = (await response.json()) as { data: { secret: string } };
        setSecret(json.data.secret);
        router.refresh();
      }
    } catch {
      setError(t('s16Developers.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void rotate()}
      >
        {t('s16Developers.keys.rotate')}
      </Button>
      {secret ? (
        <>
          <SecretBox secret={secret} />
          <span className="text-xs text-muted-foreground">
            {t('s16Developers.keys.rotateOverlap')}
          </span>
        </>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}
