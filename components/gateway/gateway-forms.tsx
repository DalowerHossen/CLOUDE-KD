// path: components/gateway/gateway-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { GATEWAY_METHODS } from '@/config/s16-gateway';
import { t } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

type Reply = { ok: true; data: unknown } | { ok: false; text: string };

async function send(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<Reply> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as Failure | null;
      return {
        ok: false,
        text:
          json?.error?.code === 'step_up_required'
            ? t('s16Gateway.common.needStepUp')
            : (json?.error?.message ?? t('s16Gateway.common.failed')),
      };
    }
    const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
    return { ok: true, data: json?.data ?? null };
  } catch {
    return { ok: false, text: t('s16Gateway.common.failed') };
  }
}

/** Shows a secret that exists only in this answer. */
function SecretBox({ label, secret }: { label: string; secret: string }): JSX.Element {
  return (
    <Alert variant="success" role="status">
      <p className="font-medium">{label}</p>
      <p className="text-sm">{t('s16Gateway.common.secretOnce')}</p>
      <code className="mt-1 block break-all rounded bg-muted p-2 text-sm">{secret}</code>
    </Alert>
  );
}

function secretOf(data: unknown): string | null {
  const value = (data as { secret?: unknown } | null)?.secret;
  return typeof value === 'string' ? value : null;
}

/** Saves the address of the company's app. */
export function UpstreamForm(): JSX.Element {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('15000');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const reply = await send('/api/integrations/gateway/upstream', 'POST', {
      baseUrl: baseUrl.trim(),
      timeoutMs: Number.parseInt(timeoutMs, 10) || 15000,
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setSecret(secretOf(reply.data));
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant="destructive">{notice.text}</Alert> : null}
      {secret ? <SecretBox label={t('s16Gateway.upstream.newSecret')} secret={secret} /> : null}
      <div className="space-y-1">
        <Label htmlFor="gw-base">{t('s16Gateway.upstream.baseUrl')}</Label>
        <Input
          id="gw-base"
          value={baseUrl}
          maxLength={500}
          onChange={(e) => setBaseUrl(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="gw-timeout">{t('s16Gateway.upstream.timeout')}</Label>
        <Input
          id="gw-timeout"
          inputMode="numeric"
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <Button type="submit" disabled={busy || baseUrl.trim() === ''}>
        {t('s16Gateway.upstream.create')}
      </Button>
    </form>
  );
}

/** Turn the upstream on or off, or make a new secret. */
export function UpstreamActions({
  enabled,
  kycRequired,
  version,
}: {
  enabled: boolean;
  kycRequired: boolean;
  version: number;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function run(
    endpoint: string,
    method: 'POST' | 'PATCH',
    body: Record<string, unknown>,
    keepSecret: boolean,
  ): Promise<void> {
    setBusy(true);
    setNotice(null);
    const reply = await send(endpoint, method, body);
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setSecret(keepSecret ? secretOf(reply.data) : null);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-8">
      {notice ? <Alert variant="destructive">{notice.text}</Alert> : null}
      {secret ? <SecretBox label={t('s16Gateway.upstream.rotated')} secret={secret} /> : null}
      <div className="flex flex-wrap gap-sp-8">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(
              '/api/integrations/gateway/upstream',
              'PATCH',
              { enabled: !enabled, version },
              false,
            )
          }
        >
          {enabled ? t('s16Gateway.upstream.turnOff') : t('s16Gateway.upstream.turnOn')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void run('/api/integrations/gateway/upstream/secret', 'POST', {}, true)}
        >
          {t('s16Gateway.upstream.rotate')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(
              '/api/integrations/gateway/upstream',
              'PATCH',
              { kycRequired: !kycRequired, version },
              false,
            )
          }
        >
          {kycRequired ? t('s16Gateway.kyc.requireOff') : t('s16Gateway.kyc.requireOn')}
        </Button>
      </div>
    </div>
  );
}

/** Adds a route. */
export function RouteForm(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [method, setMethod] = useState<(typeof GATEWAY_METHODS)[number]>('GET');
  const [pathTemplate, setPathTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const reply = await send('/api/integrations/gateway/routes', 'POST', {
      name,
      method,
      pathTemplate: pathTemplate.trim(),
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setNotice({ ok: true, text: t('s16Gateway.routes.saved') });
      setName('');
      setPathTemplate('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="gr-name">{t('s16Gateway.routes.name')}</Label>
          <Input
            id="gr-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="gr-method">{t('s16Gateway.routes.method')}</Label>
          <NativeSelect
            id="gr-method"
            value={method}
            onChange={(e) => setMethod(GATEWAY_METHODS.find((m) => m === e.target.value) ?? 'GET')}
          >
            {GATEWAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gr-path">{t('s16Gateway.routes.path')}</Label>
          <Input
            id="gr-path"
            value={pathTemplate}
            maxLength={200}
            placeholder="/orders/{id}"
            onChange={(e) => setPathTemplate(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <Button type="submit" disabled={busy || name.trim() === '' || pathTemplate.trim() === ''}>
        {t('s16Gateway.routes.add')}
      </Button>
    </form>
  );
}

/** One button that sends one request and refreshes the page. */
export function RowAction({
  endpoint,
  method,
  body,
  label,
  variant = 'outline',
}: {
  endpoint: string;
  method: 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  label: string;
  variant?: 'outline' | 'destructive';
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    const reply = await send(endpoint, method, body);
    if (!reply.ok) setError(reply.text);
    else router.refresh();
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant={variant} disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Adds a sub-merchant. */
export function SubMerchantForm(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const reply = await send('/api/integrations/gateway/sub-merchants', 'POST', {
      name,
      reference: reference.trim(),
      contactEmail: email.trim() === '' ? null : email.trim(),
    });
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setNotice({ ok: true, text: t('s16Gateway.subs.saved') });
      setName('');
      setReference('');
      setEmail('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="gs-name">{t('s16Gateway.subs.name')}</Label>
          <Input
            id="gs-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="gs-ref">{t('s16Gateway.subs.reference')}</Label>
          <Input
            id="gs-ref"
            value={reference}
            maxLength={64}
            onChange={(e) => setReference(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="gs-email">{t('s16Gateway.subs.email')}</Label>
          <Input
            id="gs-email"
            type="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={busy || name.trim() === '' || reference.trim() === ''}>
        {t('s16Gateway.subs.add')}
      </Button>
    </form>
  );
}

/** Makes a key for one sub-merchant. */
export function KeyForm({ subMerchantId }: { subMerchantId: string }): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [rate, setRate] = useState('60');
  const [ips, setIps] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const list = ips
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);
    const reply = await send(
      `/api/integrations/gateway/sub-merchants/${subMerchantId}/keys`,
      'POST',
      {
        name,
        rateLimitPerMinute: Number.parseInt(rate, 10) || 60,
        allowedIps: list.length > 0 ? list : null,
        expiresInDays: days.trim() === '' ? null : Number.parseInt(days, 10) || null,
      },
    );
    if (!reply.ok) setNotice({ ok: false, text: reply.text });
    else {
      setSecret(secretOf(reply.data));
      setName('');
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-8" noValidate>
      {notice ? <Alert variant="destructive">{notice.text}</Alert> : null}
      {secret ? <SecretBox label={t('s16Gateway.keys.newKey')} secret={secret} /> : null}
      <div className="grid gap-sp-8 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`gk-name-${subMerchantId}`}>{t('s16Gateway.keys.name')}</Label>
          <Input
            id={`gk-name-${subMerchantId}`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`gk-rate-${subMerchantId}`}>{t('s16Gateway.keys.rate')}</Label>
          <Input
            id={`gk-rate-${subMerchantId}`}
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`gk-days-${subMerchantId}`}>{t('s16Gateway.keys.expires')}</Label>
          <Input
            id={`gk-days-${subMerchantId}`}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`gk-ips-${subMerchantId}`}>{t('s16Gateway.keys.ips')}</Label>
        <textarea
          id={`gk-ips-${subMerchantId}`}
          className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
          value={ips}
          onChange={(e) => setIps(e.target.value)}
          spellCheck={false}
        />
      </div>
      <Button type="submit" size="sm" disabled={busy || name.trim() === ''}>
        {t('s16Gateway.keys.add')}
      </Button>
    </form>
  );
}
