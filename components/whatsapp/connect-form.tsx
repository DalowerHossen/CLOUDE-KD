// path: components/whatsapp/connect-form.tsx
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
  if (json?.error?.code === 'step_up_required') return t('s16Whatsapp.common.needStepUp');
  return json?.error?.message ?? t('s16Whatsapp.common.failed');
}

function TokenBox({ token }: { token: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Alert variant="success" className="space-y-2">
      <p>{t('s16Whatsapp.connection.verifyOnce')}</p>
      <code className="block break-all rounded bg-muted p-2 text-sm">{token}</code>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? t('s16Developers.keys.copied') : t('s16Developers.keys.copy')}
      </Button>
    </Alert>
  );
}

/** Connects the account. The verify token comes back once and is shown once. */
export function ConnectForm(): JSX.Element {
  const router = useRouter();
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [sandbox, setSandbox] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/whatsapp/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wabaId, phoneNumberId, accessToken, appSecret, sandbox }),
        cache: 'no-store',
      });
      if (!response.ok) setError(await readFailure(response));
      else {
        const json = (await response.json()) as { data: { verifyToken: string } };
        setToken(json.data.verifyToken);
        setAccessToken('');
        setAppSecret('');
        router.refresh();
      }
    } catch {
      setError(t('s16Whatsapp.common.failed'));
    }
    setBusy(false);
  }

  if (token) return <TokenBox token={token} />;
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="wa-waba">{t('s16Whatsapp.connection.wabaId')}</Label>
          <Input
            id="wa-waba"
            inputMode="numeric"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-phone">{t('s16Whatsapp.connection.phoneNumberId')}</Label>
          <Input
            id="wa-phone"
            inputMode="numeric"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-token">{t('s16Whatsapp.connection.accessToken')}</Label>
          <Input
            id="wa-token"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-secret">{t('s16Whatsapp.connection.appSecret')}</Label>
          <Input
            id="wa-secret"
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm" htmlFor="wa-sandbox">
        <input
          id="wa-sandbox"
          type="checkbox"
          checked={sandbox}
          onChange={(e) => setSandbox(e.target.checked)}
        />
        {t('s16Whatsapp.connection.sandbox')}
      </label>
      <Button
        type="submit"
        disabled={
          busy || wabaId === '' || phoneNumberId === '' || accessToken === '' || appSecret === ''
        }
      >
        {t('s16Whatsapp.connection.connect')}
      </Button>
    </form>
  );
}

/** Makes a new verify token (shown once). */
export function NewTokenButton(): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/whatsapp/account/verify-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!response.ok) setError(await readFailure(response));
      else
        setToken(((await response.json()) as { data: { verifyToken: string } }).data.verifyToken);
    } catch {
      setError(t('s16Whatsapp.common.failed'));
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {t('s16Whatsapp.connection.newToken')}
      </Button>
      {token ? <TokenBox token={token} /> : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </span>
  );
}

/** Checks the connection with WhatsApp and shows the answer. */
export function HealthButton(): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/whatsapp/account/health', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!response.ok) setNotice({ ok: false, text: await readFailure(response) });
      else {
        const json = (await response.json()) as { data: { ok: boolean; message: string } };
        setNotice({ ok: json.data.ok, text: json.data.message });
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: t('s16Whatsapp.common.failed') });
    }
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {t('s16Whatsapp.connection.check')}
      </Button>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
    </span>
  );
}

/** Changes the sandbox mode or pauses sending (with the version for the optimistic lock). */
export function AccountPatchButton({
  version,
  patch,
  label,
}: {
  version: number;
  patch: { sandbox?: boolean; status?: 'active' | 'paused' };
  label: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/whatsapp/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, ...patch }),
        cache: 'no-store',
      });
      if (!response.ok) setError(await readFailure(response));
      else router.refresh();
    } catch {
      setError(t('s16Whatsapp.common.failed'));
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
