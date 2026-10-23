// path: components/bankfeed/bank-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PLAID_ENVIRONMENTS, type PlaidEnvironment } from '@/config/s16-bankfeed';
import { t, type StringKey } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

async function failure(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as Failure | null;
  if (json?.error?.code === 'step_up_required') return t('s16Bankfeed.common.needStepUp');
  return json?.error?.message ?? t('s16Bankfeed.common.failed');
}

async function send(
  endpoint: string,
  method: 'POST' | 'PUT',
  body: Record<string, unknown>,
): Promise<{ ok: boolean; text: string; data: unknown }> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, text: await failure(response), data: null };
    const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
    return { ok: true, text: '', data: json?.data ?? null };
  } catch {
    return { ok: false, text: t('s16Bankfeed.common.failed'), data: null };
  }
}

/** Saves the keys of a Plaid or Salt Edge account. They are sent once and not shown again. */
export function ConnectBankForm(): JSX.Element {
  const router = useRouter();
  const [provider, setProvider] = useState<'plaid' | 'saltedge'>('plaid');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [environment, setEnvironment] = useState<PlaidEnvironment>('production');
  const [countries, setCountries] = useState('US');
  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const plaid = provider === 'plaid';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await send(
      '/api/integrations/bank/connections',
      'POST',
      plaid
        ? {
            provider,
            name,
            clientId,
            secret,
            environment,
            countryCodes: countries
              .split(';')
              .map((c) => c.trim().toUpperCase())
              .filter(Boolean),
          }
        : { provider, name, appId, secret, ...(privateKey.trim() === '' ? {} : { privateKey }) },
    );
    if (!result.ok) setNotice({ ok: false, text: result.text });
    else {
      setNotice({ ok: true, text: t('s16Bankfeed.common.done') });
      setSecret('');
      setPrivateKey('');
      setName('');
      router.refresh();
    }
    setBusy(false);
  }

  const ready =
    name.trim() !== '' &&
    secret.trim() !== '' &&
    (plaid ? clientId.trim() !== '' : appId.trim() !== '');
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="bf-provider">{t('s16Bankfeed.page.provider')}</Label>
          <NativeSelect
            id="bf-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value === 'saltedge' ? 'saltedge' : 'plaid')}
          >
            <option value="plaid">{t('s16Bankfeed.providers.plaid')}</option>
            <option value="saltedge">{t('s16Bankfeed.providers.saltedge')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bf-name">{t('s16Bankfeed.page.name')}</Label>
          <Input
            id="bf-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        {plaid ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="bf-client">{t('s16Bankfeed.page.clientId')}</Label>
              <Input
                id="bf-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bf-env">{t('s16Bankfeed.page.environment')}</Label>
              <NativeSelect
                id="bf-env"
                value={environment}
                onChange={(e) =>
                  setEnvironment(
                    PLAID_ENVIRONMENTS.find((x) => x === e.target.value) ?? 'production',
                  )
                }
              >
                {PLAID_ENVIRONMENTS.map((x) => (
                  <option key={x} value={x}>
                    {t(`s16Bankfeed.page.environments.${x}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bf-countries">{t('s16Bankfeed.page.countries')}</Label>
              <Input
                id="bf-countries"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                autoComplete="off"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="bf-app">{t('s16Bankfeed.page.appId')}</Label>
            <Input
              id="bf-app"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="bf-secret">{t('s16Bankfeed.page.secret')}</Label>
          <Input
            id="bf-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
          />
        </div>
        {!plaid ? (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="bf-key">{t('s16Bankfeed.page.privateKey')}</Label>
            <Textarea
              id="bf-key"
              rows={4}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {t(plaid ? 's16Bankfeed.page.plaidHelp' : 's16Bankfeed.page.saltedgeHelp')}
      </p>
      <Button type="submit" disabled={busy || !ready}>
        {t('s16Bankfeed.page.connect')}
      </Button>
    </form>
  );
}

/** Starts the bank's own window and shows its address; for Plaid a second button reads the result when the webhook is missed. */
export function LinkButton({
  id,
  relink,
  plaid,
}: {
  id: string;
  relink: boolean;
  plaid: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setNotice(null);
    const result = await send(`/api/integrations/bank/connections/${id}/link`, 'POST', {});
    const data = result.data as { url?: string } | null;
    if (!result.ok) setNotice({ ok: false, text: result.text });
    else if (typeof data?.url === 'string' && data.url.startsWith('https://')) setUrl(data.url);
    else setNotice({ ok: false, text: t('s16Bankfeed.common.failed') });
    setBusy(false);
  }

  async function finish(): Promise<void> {
    setBusy(true);
    setNotice(null);
    const result = await send(`/api/integrations/bank/connections/${id}/finish`, 'POST', {});
    const data = result.data as { linked?: boolean } | null;
    if (!result.ok) setNotice({ ok: false, text: result.text });
    else if (data?.linked) {
      setNotice({ ok: true, text: t('s16Bankfeed.page.finishedYes') });
      router.refresh();
    } else setNotice({ ok: false, text: t('s16Bankfeed.page.finishedNo') });
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void start()}
        >
          {t(relink ? 's16Bankfeed.page.relink' : 's16Bankfeed.page.link')}
        </Button>
        {plaid && url !== null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void finish()}
          >
            {t('s16Bankfeed.page.finish')}
          </Button>
        ) : null}
      </span>
      {url !== null ? (
        <span className="text-xs">
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            {t('s16Bankfeed.page.linkOpen')}
          </a>
          <span className="block text-muted-foreground">{t('s16Bankfeed.page.linkNote')}</span>
        </span>
      ) : null}
      {notice ? (
        <span className={notice.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {notice.text}
        </span>
      ) : null}
    </span>
  );
}

/** Maps an account of the bank to a bank account of the books. */
export function MapAccountForm({
  connectionId,
  accountId,
  current,
  books,
  disabled,
}: {
  connectionId: string;
  accountId: string;
  current: string | null;
  books: readonly { id: string; label: string }[];
  disabled: boolean;
}): JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setNotice(null);
    const result = await send(
      `/api/integrations/bank/connections/${connectionId}/accounts/${accountId}`,
      'PUT',
      { bankAccountId: value === '' ? null : value, enabled: true },
    );
    if (!result.ok) setNotice({ ok: false, text: result.text });
    else {
      setNotice({ ok: true, text: t('s16Bankfeed.page.mapDone') });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="flex flex-wrap gap-2">
        <NativeSelect
          aria-label={t('s16Bankfeed.page.accountColumns.book')}
          value={value}
          disabled={disabled || busy}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">{t('s16Bankfeed.page.notMapped')}</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || busy || value === (current ?? '')}
          onClick={() => void save()}
        >
          {t('s16Bankfeed.page.mapSave')}
        </Button>
      </span>
      {disabled ? (
        <span className="text-xs text-muted-foreground">{t('s16Bankfeed.page.usdOnly')}</span>
      ) : null}
      {notice ? (
        <span className={notice.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {notice.text}
        </span>
      ) : null}
    </span>
  );
}
