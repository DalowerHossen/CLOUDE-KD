// path: components/email/email-settings-manager.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { SMTP_PRESETS } from '@/lib/email/presets';
import { EMAIL_PROVIDERS } from '@/lib/email/types';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const reportBody = z.object({
  data: z.object({
    score: z.number(),
    spf: z.object({ ok: z.boolean(), detail: z.string() }),
    dkim: z.object({ ok: z.boolean(), detail: z.string() }),
    dmarc: z.object({ ok: z.boolean(), detail: z.string() }),
  }),
});

export interface ProviderRow {
  id: string;
  slot: number;
  provider: string;
  host: string | null;
  fromEmail: string | null;
  fromName: string;
  replyTo: string | null;
  enabled: boolean;
  hasSecret: boolean;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  usedToday: number;
  usedMonth: number;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
}

interface Props {
  endpoint: string;
  /** Tenant pages can switch to the platform e-mail; the platform page cannot. */
  allowPlatformMode: boolean;
  providers: ProviderRow[];
  usingPlatform: boolean;
}

const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export function EmailSettingsManager({
  endpoint,
  allowPlatformMode,
  providers,
  usingPlatform,
}: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'platform' | 'own'>(
    allowPlatformMode && usingPlatform ? 'platform' : 'own',
  );
  const [provider, setProvider] = useState<string>('smtp');
  const [preset, setPreset] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [security, setSecurity] = useState('starttls');
  const [report, setReport] = useState<z.infer<typeof reportBody>['data'] | null>(null);

  async function act(body: unknown): Promise<unknown> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setMessage(parsed.success ? parsed.data.error.message : t('s05Storage.email.genericError'));
        return null;
      }
      setMessage(t('s05Storage.email.done'));
      router.refresh();
      return json;
    } catch {
      setMessage(t('s05Storage.email.genericError'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(id: string): void {
    setPreset(id);
    const p = SMTP_PRESETS.find((x) => x.id === id);
    if (p) {
      setHost(p.host());
      setPort(String(p.port));
      setSecurity(p.security);
    }
  }

  async function submitProvider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const text = (k: string): string => String(d.get(k) ?? '').trim();
    const num = (k: string): number | undefined => (text(k) === '' ? undefined : Number(text(k)));
    const body: Record<string, unknown> = {
      action: 'save_provider',
      slot: Number(text('slot') || 1),
      provider,
      preset: provider === 'smtp' && preset ? preset : null,
      fromEmail: text('fromEmail') || null,
      fromName: text('fromName'),
      replyTo: text('replyTo') || null,
      dailyLimit: num('dailyLimit') ?? null,
      monthlyLimit: num('monthlyLimit') ?? null,
      enabled: d.get('enabled') === 'on',
    };
    if (provider === 'smtp')
      Object.assign(body, {
        host: host.trim(),
        port: Number(port),
        security,
        username: text('username') || undefined,
      });
    if (provider === 'ses')
      Object.assign(body, { region: text('region'), username: text('username') || undefined });
    if (provider === 'mailgun')
      Object.assign(body, { domain: text('domain'), eu: d.get('eu') === 'on' });
    if (text('secret')) body.secret = text('secret');
    if (text('webhookSecret')) body.webhookSecret = text('webhookSecret');
    await act(body);
  }

  async function submitPlatformMode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    await act({
      action: 'save_provider',
      slot: 1,
      provider: 'platform',
      fromName: String(d.get('fromName') ?? '').trim(),
      replyTo: String(d.get('replyTo') ?? '').trim() || null,
      enabled: true,
    });
  }

  async function checkDomain(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const json = await act({
      action: 'check_domain',
      domain: String(d.get('domain') ?? ''),
      provider: provider === 'smtp' && preset ? preset : provider,
    });
    const parsed = reportBody.safeParse(json);
    setReport(parsed.success ? parsed.data.data : null);
  }

  const own = providers.filter((p) => p.provider !== 'platform');
  const platformRow = providers.find((p) => p.provider === 'platform');
  return (
    <div className="space-y-sp-24">
      {allowPlatformMode ? (
        <section className="space-y-sp-12" aria-labelledby="mode-title">
          <h2 id="mode-title" className="text-h3 font-semibold">
            {t('s05Storage.email.modeTitle')}
          </h2>
          <div
            role="radiogroup"
            aria-label={t('s05Storage.email.modeTitle')}
            className="flex flex-wrap gap-4 text-sm"
          >
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'platform'}
                onChange={() => setMode('platform')}
              />
              {t('s05Storage.email.modePlatform')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'own'}
                onChange={() => setMode('own')}
              />
              {t('s05Storage.email.modeOwn')}
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === 'platform'
              ? t('s05Storage.email.modePlatformHelp')
              : t('s05Storage.email.modeOwnHelp')}
          </p>
          {mode === 'platform' ? (
            <form
              onSubmit={submitPlatformMode}
              className="grid gap-sp-12 sm:grid-cols-2"
              aria-label={t('s05Storage.email.modePlatform')}
            >
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.senderName')}</span>
                <Input name="fromName" maxLength={120} defaultValue={platformRow?.fromName ?? ''} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.replyTo')}</span>
                <Input
                  name="replyTo"
                  type="email"
                  maxLength={254}
                  defaultValue={platformRow?.replyTo ?? ''}
                />
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {t('s05Storage.email.savePlatform')}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {mode === 'own' ? (
        <>
          <section className="space-y-sp-12" aria-labelledby="providers-title">
            <h2 id="providers-title" className="text-h3 font-semibold">
              {t('s05Storage.email.providersTitle')}
            </h2>
            {own.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('s05Storage.email.noProviders')}</p>
            ) : null}
            <ul className="space-y-sp-12" aria-label={t('s05Storage.email.providersTitle')}>
              {own.map((p) => (
                <li key={p.id} className="space-y-2 rounded-md border p-sp-12">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{p.slot}</Badge>
                    <strong>{p.provider}</strong>
                    {p.host ? <span className="text-muted-foreground">{p.host}</span> : null}
                    <span>{p.fromName ? `${p.fromName} <${p.fromEmail ?? ''}>` : p.fromEmail}</span>
                    {!p.enabled ? (
                      <Badge variant="secondary">{t('s05Storage.email.disabled')}</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.dailyLimit
                      ? t('s05Storage.email.usageLimit', {
                          today: p.usedToday,
                          daily: p.dailyLimit,
                          month: p.usedMonth,
                        })
                      : t('s05Storage.email.usage', { today: p.usedToday, month: p.usedMonth })}
                  </p>
                  <p className="text-xs">
                    {p.lastTestOk === null
                      ? t('s05Storage.email.notTested')
                      : p.lastTestOk
                        ? t('s05Storage.email.lastTestOk')
                        : t('s05Storage.email.lastTestFailed', { error: p.lastError ?? '' })}
                  </p>
                  <TestRow id={p.id} busy={busy} act={act} />
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-sp-12" aria-labelledby="form-title">
            <h2 id="form-title" className="text-h3 font-semibold">
              {t('s05Storage.email.save')}
            </h2>
            <form
              onSubmit={submitProvider}
              className="grid gap-sp-12 sm:grid-cols-2"
              aria-label={t('s05Storage.email.save')}
            >
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.slot')}</span>
                <select name="slot" defaultValue="1" className={selectClass}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.provider')}</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className={selectClass}
                >
                  {EMAIL_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              {provider === 'smtp' ? (
                <>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>{t('s05Storage.email.preset')}</span>
                    <select
                      value={preset}
                      onChange={(e) => applyPreset(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">{t('s05Storage.email.presetNone')}</option>
                      {SMTP_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>{t('s05Storage.email.host')}</span>
                    <Input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      required
                      maxLength={253}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>{t('s05Storage.email.port')}</span>
                    <Input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      required
                      min={1}
                      max={65535}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>{t('s05Storage.email.security')}</span>
                    <select
                      value={security}
                      onChange={(e) => setSecurity(e.target.value)}
                      className={selectClass}
                    >
                      <option value="starttls">{t('s05Storage.email.securityStarttls')}</option>
                      <option value="ssl">{t('s05Storage.email.securitySsl')}</option>
                      <option value="none">{t('s05Storage.email.securityNone')}</option>
                    </select>
                  </label>
                </>
              ) : null}
              {provider === 'smtp' || provider === 'ses' ? (
                <label className="space-y-1 text-sm">
                  <span>{t('s05Storage.email.username')}</span>
                  <Input name="username" maxLength={254} autoComplete="off" />
                </label>
              ) : null}
              {provider === 'ses' ? (
                <label className="space-y-1 text-sm">
                  <span>{t('s05Storage.email.region')}</span>
                  <Input name="region" required maxLength={30} />
                </label>
              ) : null}
              {provider === 'mailgun' ? (
                <>
                  <label className="space-y-1 text-sm">
                    <span>{t('s05Storage.email.domain')}</span>
                    <Input name="domain" required maxLength={253} />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" name="eu" />
                    EU
                  </label>
                </>
              ) : null}
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.secret')}</span>
                <Input
                  name="secret"
                  type="password"
                  autoComplete="new-password"
                  maxLength={2000}
                  placeholder={t('s05Storage.email.secretKeep')}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.webhookSecret')}</span>
                <Input name="webhookSecret" type="password" autoComplete="off" maxLength={2000} />
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {t('s05Storage.email.webhookHelp')}
              </p>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.fromEmail')}</span>
                <Input name="fromEmail" type="email" required maxLength={254} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.senderName')}</span>
                <Input name="fromName" maxLength={120} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.replyTo')}</span>
                <Input name="replyTo" type="email" maxLength={254} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.dailyLimit')}</span>
                <Input name="dailyLimit" type="number" min={1} />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.monthlyLimit')}</span>
                <Input name="monthlyLimit" type="number" min={1} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked />
                {t('s05Storage.email.enabled')}
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {t('s05Storage.email.save')}
                </Button>
              </div>
            </form>
          </section>

          <section className="space-y-sp-12" aria-labelledby="domain-title">
            <h2 id="domain-title" className="text-h3 font-semibold">
              {t('s05Storage.email.domainTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('s05Storage.email.domainHelp')}</p>
            <form
              onSubmit={checkDomain}
              className="flex flex-wrap items-end gap-2"
              aria-label={t('s05Storage.email.domainTitle')}
            >
              <label className="space-y-1 text-sm">
                <span>{t('s05Storage.email.domain')}</span>
                <Input name="domain" required maxLength={253} placeholder="example.com" />
              </label>
              <Button type="submit" variant="outline" disabled={busy}>
                {t('s05Storage.email.domainCheck')}
              </Button>
            </form>
            {report ? (
              <div className="space-y-1 text-sm" aria-live="polite">
                <p className="font-semibold">
                  {t('s05Storage.email.domainScore', { score: report.score })}
                </p>
                {(
                  [
                    ['spf', report.spf],
                    ['dkim', report.dkim],
                    ['dmarc', report.dmarc],
                  ] as const
                ).map(([name, f]) => (
                  <p key={name}>
                    <Badge variant={f.ok ? 'outline' : 'destructive'}>
                      {t(`s05Storage.email.${name}`)}
                    </Badge>{' '}
                    {f.detail}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function TestRow({
  id,
  busy,
  act,
}: {
  id: string;
  busy: boolean;
  act: (body: unknown) => Promise<unknown>;
}): JSX.Element {
  const [to, setTo] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => act({ action: 'test_connection', id })}
      >
        {t('s05Storage.email.testConnection')}
      </Button>
      <label className="space-y-1 text-xs">
        <span className="sr-only">{t('s05Storage.email.testTo')}</span>
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t('s05Storage.email.testTo')}
          maxLength={254}
          className="h-8 w-56"
        />
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || to.length < 5}
        onClick={() => act({ action: 'send_test', id, to })}
      >
        {t('s05Storage.email.sendTest')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => act({ action: 'delete_provider', id })}
      >
        {t('s05Storage.email.remove')}
      </Button>
    </div>
  );
}
