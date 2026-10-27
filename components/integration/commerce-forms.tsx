// path: components/integration/commerce-forms.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SYNC_MODES, type SyncMode } from '@/config/s16-commerce';
import { t, type StringKey } from '@/lib/i18n';

interface Failure {
  error?: { code?: string; message?: string };
}

async function failure(response: Response): Promise<string> {
  const json = (await response.json().catch(() => null)) as Failure | null;
  if (json?.error?.code === 'step_up_required') return t('s16Commerce.common.needStepUp');
  return json?.error?.message ?? t('s16Commerce.common.failed');
}

const key = (): string => `ui-${crypto.randomUUID()}`;

/** Sends one JSON request and tells the form what happened. */
async function send(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: Record<string, unknown> | null,
  idempotent: boolean,
): Promise<{ ok: boolean; text: string; json: unknown }> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        ...(body === null ? {} : { 'content-type': 'application/json' }),
        ...(idempotent ? { 'idempotency-key': key() } : {}),
      },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, text: await failure(response), json: null };
    return { ok: true, text: '', json: await response.json().catch(() => null) };
  } catch {
    return { ok: false, text: t('s16Commerce.common.failed'), json: null };
  }
}

const field = (
  id: string,
  label: string,
  value: string,
  set: (v: string) => void,
  secret = false,
): JSX.Element => (
  <div className="space-y-1">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type={secret ? 'password' : 'text'}
      value={value}
      onChange={(e) => set(e.target.value)}
      autoComplete="off"
      spellCheck={false}
    />
  </div>
);

/** Connects a Shopify or WooCommerce store. The credentials are sent once and are not shown again. */
export function ConnectStoreForm({
  endpoint = '/api/integrations/commerce/connections',
  companyId,
}: {
  endpoint?: string;
  /** Platform staff connect a store for a company: the company is sent with the store details. */
  companyId?: string;
} = {}): JSX.Element {
  const router = useRouter();
  const [provider, setProvider] = useState<'shopify' | 'woocommerce'>('shopify');
  const [name, setName] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [syncMode, setSyncMode] = useState<SyncMode>('realtime');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const shopify = provider === 'shopify';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const store = shopify
      ? { provider, name, shopDomain, accessToken, clientSecret, syncMode }
      : { provider, name, storeUrl, consumerKey, consumerSecret, syncMode };
    const result = await send(
      endpoint,
      'POST',
      companyId === undefined ? store : { companyId, store },
      false,
    );
    if (!result.ok) setNotice({ ok: false, text: result.text });
    else {
      setNotice({ ok: true, text: t('s16Commerce.common.done') });
      setAccessToken('');
      setClientSecret('');
      setConsumerKey('');
      setConsumerSecret('');
      setName('');
      router.refresh();
    }
    setBusy(false);
  }

  const ready = shopify
    ? name.trim() !== '' &&
      shopDomain.trim() !== '' &&
      accessToken.trim() !== '' &&
      clientSecret.trim() !== ''
    : name.trim() !== '' &&
      storeUrl.trim() !== '' &&
      consumerKey.trim() !== '' &&
      consumerSecret.trim() !== '';

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cs-provider">{t('s16Commerce.tabs.stores')}</Label>
          <NativeSelect
            id="cs-provider"
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value === 'woocommerce' ? 'woocommerce' : 'shopify')
            }
          >
            <option value="shopify">{t('s16Commerce.providers.shopify')}</option>
            <option value="woocommerce">{t('s16Commerce.providers.woocommerce')}</option>
          </NativeSelect>
        </div>
        {field('cs-name', t('s16Commerce.stores.name'), name, setName)}
        {shopify ? (
          <>
            {field('cs-domain', t('s16Commerce.stores.shopDomain'), shopDomain, setShopDomain)}
            {field(
              'cs-token',
              t('s16Commerce.stores.accessToken'),
              accessToken,
              setAccessToken,
              true,
            )}
            {field(
              'cs-secret',
              t('s16Commerce.stores.clientSecret'),
              clientSecret,
              setClientSecret,
              true,
            )}
          </>
        ) : (
          <>
            {field('cs-url', t('s16Commerce.stores.storeUrl'), storeUrl, setStoreUrl)}
            {field('cs-key', t('s16Commerce.stores.consumerKey'), consumerKey, setConsumerKey)}
            {field(
              'cs-csecret',
              t('s16Commerce.stores.consumerSecret'),
              consumerSecret,
              setConsumerSecret,
              true,
            )}
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="cs-mode">{t('s16Commerce.stores.syncMode')}</Label>
          <NativeSelect
            id="cs-mode"
            value={syncMode}
            onChange={(e) =>
              setSyncMode(SYNC_MODES.find((m) => m === e.target.value) ?? 'realtime')
            }
          >
            {SYNC_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`s16Commerce.stores.modes.${m}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(shopify ? 's16Commerce.stores.shopifyHelp' : 's16Commerce.stores.wooHelp')}
      </p>
      <Button type="submit" disabled={busy || !ready}>
        {t('s16Commerce.stores.connect')}
      </Button>
    </form>
  );
}

/** A button for a store action that answers { ok, message } (check, register webhooks). */
export function StoreActionButton({
  endpoint,
  label,
  doneText,
}: {
  endpoint: string;
  label: string;
  doneText: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setNotice(null);
    const result = await send(endpoint, 'POST', {}, false);
    const data = (result.json as { data?: { ok?: boolean; message?: string } } | null)?.data;
    if (!result.ok) setNotice({ ok: false, text: result.text });
    else if (data?.ok === false)
      setNotice({ ok: false, text: data.message ?? t('s16Commerce.common.failed') });
    else setNotice({ ok: true, text: doneText });
    router.refresh();
    setBusy(false);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {notice ? (
        <span className={notice.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {notice.text}
        </span>
      ) : null}
    </span>
  );
}

/** Closes a conflict as resolved or accepted, with an optional note. */
export function ConflictButtons({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function close(resolution: 'resolved' | 'ignored'): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await send(
      `/api/integrations/commerce/conflicts/${id}`,
      'POST',
      { resolution, note },
      true,
    );
    if (!result.ok) setError(result.text);
    else router.refresh();
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label={t('s16Commerce.conflicts.note')}
        placeholder={t('s16Commerce.conflicts.note')}
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void close('resolved')}
        >
          {t('s16Commerce.conflicts.resolve')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void close('ignored')}
        >
          {t('s16Commerce.conflicts.ignore')}
        </Button>
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
