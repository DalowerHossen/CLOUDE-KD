// path: components/developers/webhook-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

async function readFailure(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as Failure | null;
  if (json?.error?.code === 'step_up_required') return t('s16Developers.common.needStepUp');
  return json?.error?.message ?? t('s16Developers.common.failed');
}

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
      <p>{t('s16Developers.webhooks.secretOnce')}</p>
      <code className="block break-all rounded bg-muted p-2 text-sm">{secret}</code>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? t('s16Developers.keys.copied') : t('s16Developers.keys.copy')}
      </Button>
    </Alert>
  );
}

/** Adds an endpoint. The signing secret is in the answer once and is shown here once. */
export function CreateEndpointForm({ events }: { events: readonly string[] }): JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const response = await fetch('/api/integrations/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), description, events: chosen }),
        cache: 'no-store',
      });
      if (!response.ok) {
        setError(await readFailure(response));
      } else {
        const json = (await response.json()) as { data: { secret: string } };
        setSecret(json.data.secret);
        setUrl('');
        setDescription('');
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
      <div className="space-y-1">
        <Label htmlFor="wh-url">{t('s16Developers.webhooks.url')}</Label>
        <Input
          id="wh-url"
          value={url}
          maxLength={2000}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
          placeholder="https://example.com/webhooks"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="wh-desc">{t('s16Developers.webhooks.descriptionLabel')}</Label>
        <Input
          id="wh-desc"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
          autoComplete="off"
        />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('s16Developers.webhooks.events')}</legend>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(name)}
                onChange={(e) =>
                  setChosen(e.target.checked ? [...chosen, name] : chosen.filter((x) => x !== name))
                }
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={busy || url.trim() === '' || chosen.length === 0}>
        {t('s16Developers.webhooks.add')}
      </Button>
    </form>
  );
}

/** Makes a new signing secret; shown once. */
export function RotateSecretButton({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  async function rotate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/webhooks/${id}/rotate-secret`, {
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
        {t('s16Developers.webhooks.rotate')}
      </Button>
      <span className="text-xs text-muted-foreground">
        {t('s16Developers.webhooks.rotateNote')}
      </span>
      {secret ? <SecretBox secret={secret} /> : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}

/** Sends a test event now and shows how it went. */
export function TestButton({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/integrations/webhooks/${id}/ping`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!response.ok) {
        setNotice({ ok: false, text: await readFailure(response) });
      } else {
        const json = (await response.json()) as {
          data: { status: string; lastStatusCode: number | null; lastError: string | null };
        };
        setNotice(
          json.data.status === 'succeeded'
            ? { ok: true, text: t('s16Developers.webhooks.testOk') }
            : {
                ok: false,
                text: `${t('s16Developers.webhooks.testFailed')}: ${json.data.lastError ?? json.data.lastStatusCode ?? ''}`,
              },
        );
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Developers.common.failed') });
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {t('s16Developers.webhooks.test')}
      </Button>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
    </span>
  );
}

/** Pauses or switches on an endpoint (with the version for the optimistic lock). */
export function StatusButton({
  id,
  version,
  to,
  label,
}: {
  id: string;
  version: number;
  to: 'active' | 'paused';
  label: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, status: to }),
        cache: 'no-store',
      });
      if (!response.ok) setError(await readFailure(response));
      else router.refresh();
    } catch {
      setError(t('s16Developers.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}

/** Sends a finished delivery again. */
export function ReplayButton({ deliveryId }: { deliveryId: string }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/integrations/webhooks/deliveries/${deliveryId}/replay`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await readFailure(response) });
      else {
        setNotice({ ok: true, text: t('s16Developers.webhooks.replayed') });
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Developers.common.failed') });
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {t('s16Developers.webhooks.replay')}
      </Button>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
    </span>
  );
}
