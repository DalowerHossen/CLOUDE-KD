// path: app/(admin)/admin/processors/accounts/_components/accounts-console.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { AccountView } from '@/lib/payment/company-accounts-rules';

interface FormOption {
  processorId: string;
  name: string;
  fields: {
    key: string;
    label: string;
    secret: boolean;
    required: boolean;
    helpText: string | null;
  }[];
}

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const testBody = z.object({ data: z.object({ ok: z.boolean(), message: z.string() }) });
const linkBody = z.object({ data: z.object({ url: z.string().url() }) });
const BASE = '/api/admin/processors/accounts';

export function AccountsConsole({
  accounts,
  companies,
  processors,
}: {
  accounts: AccountView[];
  companies: { id: string; name: string }[];
  processors: FormOption[];
}): JSX.Element {
  const router = useRouter();
  const [companyId, setCompanyId] = useState('');
  const [processorId, setProcessorId] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [reference, setReference] = useState('');
  const [stripeEmail, setStripeEmail] = useState('');
  const [stripeName, setStripeName] = useState('');
  const [stripeCountry, setStripeCountry] = useState('US');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const option = processors.find((p) => p.processorId === processorId) ?? null;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  async function send(url: string, body: unknown, ok: (data: unknown) => string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setMessage({
          text: parsed.success ? parsed.data.error.message : t('s10Processors.accounts.failed'),
          bad: true,
        });
        return;
      }
      setMessage({ text: ok(json), bad: false });
      router.refresh();
    } catch {
      setMessage({ text: t('s10Processors.accounts.failed'), bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function createStripeAccount(): Promise<void> {
    await send(
      '/api/admin/processors/stripe/connect',
      { companyId, email: stripeEmail, displayName: stripeName, country: stripeCountry },
      () => t('s10Processors.accounts.stripeCreated'),
    );
  }

  async function openOnboarding(id: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${BASE}/${id}/onboarding-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const json: unknown = await response.json().catch(() => null);
      const parsed = linkBody.safeParse(json);
      if (response.ok && parsed.success) {
        window.open(parsed.data.data.url, '_blank', 'noopener,noreferrer');
        setMessage({ text: t('s10Processors.accounts.stripeLinkOpened'), bad: false });
      } else {
        const failed = errorBody.safeParse(json);
        setMessage({
          text: failed.success ? failed.data.error.message : t('s10Processors.accounts.failed'),
          bad: true,
        });
      }
    } catch {
      setMessage({ text: t('s10Processors.accounts.failed'), bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    await send(
      BASE,
      {
        companyId,
        processorId,
        environment,
        values,
        ...(reference.trim() !== '' ? { merchantReference: reference.trim() } : {}),
      },
      () => t('s10Processors.accounts.saved'),
    );
    setValues({});
  }

  return (
    <div className="space-y-sp-16">
      {message ? (
        <Alert variant={message.bad ? 'destructive' : 'default'} aria-live="polite">
          {message.text}
        </Alert>
      ) : null}

      <form
        className="space-y-sp-12 rounded-md border p-sp-12"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="font-medium">{t('s10Processors.accounts.newAccount')}</h2>
        <div className="grid gap-sp-12 sm:grid-cols-3">
          <label className="block space-y-1 text-sm">
            <span>{t('s10Processors.accounts.company')}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-2"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">{t('s10Processors.accounts.chooseCompany')}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('s10Processors.accounts.processor')}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-2"
              value={processorId}
              onChange={(e) => {
                setProcessorId(e.target.value);
                setValues({});
              }}
            >
              <option value="">{t('s10Processors.accounts.chooseProcessor')}</option>
              {processors.map((p) => (
                <option key={p.processorId} value={p.processorId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('s10Processors.accounts.environment')}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-2"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value === 'live' ? 'live' : 'sandbox')}
            >
              <option value="sandbox">{t('s10Processors.accounts.sandbox')}</option>
              <option value="live">{t('s10Processors.accounts.live')}</option>
            </select>
          </label>
        </div>
        {option ? (
          <div className="space-y-sp-12">
            <div className="grid gap-sp-12 sm:grid-cols-2">
              {option.fields.map((f) => (
                <label key={f.key} className="block space-y-1 text-sm">
                  <span>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </span>
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                  {f.helpText ? (
                    <span className="block text-caption text-muted-foreground">{f.helpText}</span>
                  ) : null}
                </label>
              ))}
            </div>
            <label className="block space-y-1 text-sm">
              <span>{t('s10Processors.accounts.reference')}</span>
              <Input
                value={reference}
                maxLength={60}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        {processorId === 'stripe' ? (
          <div className="space-y-sp-12 rounded-md border p-sp-12">
            <p className="text-sm font-medium">{t('s10Processors.accounts.stripeTitle')}</p>
            <p className="text-caption text-muted-foreground">
              {t('s10Processors.accounts.stripeHelp')}
            </p>
            <div className="grid gap-sp-12 sm:grid-cols-3">
              <label className="block space-y-1 text-sm">
                <span>{t('s10Processors.accounts.stripeEmail')}</span>
                <Input value={stripeEmail} onChange={(e) => setStripeEmail(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t('s10Processors.accounts.stripeName')}</span>
                <Input value={stripeName} onChange={(e) => setStripeName(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t('s10Processors.accounts.stripeCountry')}</span>
                <Input
                  value={stripeCountry}
                  maxLength={2}
                  onChange={(e) => setStripeCountry(e.target.value.toUpperCase())}
                />
              </label>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={
                busy ||
                companyId === '' ||
                stripeEmail.trim() === '' ||
                stripeName.trim() === '' ||
                stripeCountry.length !== 2
              }
              onClick={() => void createStripeAccount()}
            >
              {t('s10Processors.accounts.stripeCreate')}
            </Button>
          </div>
        ) : null}
        <p className="text-caption text-muted-foreground">{t('s10Processors.accounts.help')}</p>
        <Button type="submit" disabled={busy || companyId === '' || processorId === ''}>
          {t('s10Processors.accounts.save')}
        </Button>
      </form>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s10Processors.accounts.empty')}</p>
      ) : (
        <ul className="space-y-sp-12">
          {accounts.map((a) => (
            <li key={a.id} className="space-y-2 rounded-md border p-sp-12 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {a.companyName} -{' '}
                  {processors.find((p) => p.processorId === a.processorId)?.name ?? a.processorId} (
                  {a.environment}){a.merchantReference ? ` - ${a.merchantReference}` : ''}
                </p>
                <Badge variant={a.status === 'active' ? 'default' : 'outline'}>
                  {a.status === 'active'
                    ? t('s10Processors.accounts.statusActive')
                    : t('s10Processors.accounts.statusDisabled')}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                {a.fields
                  .filter((f) => f.saved)
                  .map((f) => `${f.label}: ${f.display ?? 'saved'}`)
                  .join(' | ')}
              </p>
              <p className="text-muted-foreground">
                {a.lastTestOk === null
                  ? t('s10Processors.accounts.notTested')
                  : t('s10Processors.accounts.tested', {
                      result: a.lastTestOk
                        ? t('s10Processors.accounts.testPassed')
                        : t('s10Processors.accounts.testFailed'),
                      time: a.lastTestAt ? new Date(a.lastTestAt).toLocaleString() : '',
                    })}
                {a.lastTestMessage ? ` - ${a.lastTestMessage}` : ''}
              </p>
              <p className="break-all text-caption text-muted-foreground">
                {t('s10Processors.accounts.webhook', {
                  url: `${origin}/api/webhooks/account/${a.processorId}/${a.id}`,
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void send(`${BASE}/${a.id}`, { action: 'test' }, (json) => {
                      const parsed = testBody.safeParse(json);
                      if (!parsed.success) return t('s10Processors.accounts.done');
                      return parsed.data.data.ok
                        ? t('s10Processors.accounts.testOk')
                        : t('s10Processors.accounts.testBad', {
                            message: parsed.data.data.message,
                          });
                    })
                  }
                >
                  {t('s10Processors.accounts.actions.test')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      `${BASE}/${a.id}`,
                      { action: a.status === 'active' ? 'disable' : 'enable' },
                      () => t('s10Processors.accounts.done'),
                    )
                  }
                >
                  {a.status === 'active'
                    ? t('s10Processors.accounts.actions.disable')
                    : t('s10Processors.accounts.actions.enable')}
                </Button>
                {a.processorId === 'stripe' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void openOnboarding(a.id)}
                  >
                    {t('s10Processors.accounts.stripeLink')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void send(`${BASE}/${a.id}`, { action: 'remove' }, () =>
                      t('s10Processors.accounts.done'),
                    )
                  }
                >
                  {t('s10Processors.accounts.actions.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
