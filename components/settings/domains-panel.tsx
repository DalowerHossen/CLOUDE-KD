// path: components/settings/domains-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, type StringKey } from '@/lib/i18n';
import type { DomainView } from '@/services/domain/domains';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function DomainsPanel({
  domains,
  allowed,
}: {
  domains: DomainView[];
  allowed: boolean;
}): JSX.Element {
  const router = useRouter();
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) {
        setMessage({ ok: true, text: t('s07Company.domains.done') });
        router.refresh();
        return true;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setMessage({
        ok: false,
        text: err.success ? err.data.error.message : t('s07Company.domains.error'),
      });
    } catch {
      setMessage({ ok: false, text: t('s07Company.domains.error') });
    } finally {
      setBusy(false);
    }
    return false;
  }

  return (
    <div className="space-y-sp-24">
      {!allowed ? (
        <p role="note" className="rounded-md border bg-muted/40 p-sp-12 text-sm">
          {t('s07Company.domains.planLocked')}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void call('POST', '/api/settings/domains', { hostname }).then((ok) => {
            if (ok) setHostname('');
          });
        }}
      >
        <label className="flex-1 space-y-1 text-sm">
          <span>{t('s07Company.domains.hostname')}</span>
          <Input
            value={hostname}
            maxLength={253}
            placeholder="billing.example.com"
            disabled={!allowed || busy}
            onChange={(e) => setHostname(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={!allowed || busy || hostname.length < 4}>
          {t('s07Company.domains.add')}
        </Button>
      </form>
      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s07Company.domains.none')}</p>
      ) : (
        <ul className="space-y-sp-16">
          {domains.map((d) => (
            <li key={d.id} className="space-y-sp-12 rounded-lg border p-sp-16 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{d.hostname}</span>
                <Badge
                  variant={
                    d.status === 'verified'
                      ? 'default'
                      : d.status === 'failed'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {t(`s07Company.domains.status.${d.status}` as StringKey)}
                </Badge>
                {d.isPrimary ? (
                  <Badge variant="outline">{t('s07Company.domains.primary')}</Badge>
                ) : null}
                {d.status === 'verified' ? (
                  <Badge variant="outline">
                    {t(`s07Company.domains.ssl.${d.sslStatus}` as StringKey)}
                  </Badge>
                ) : null}
              </div>
              {d.lastError ? <p className="text-muted-foreground">{d.lastError}</p> : null}
              <div>
                <h3 className="font-medium">{t('s07Company.domains.recordsTitle')}</h3>
                <p className="text-caption text-muted-foreground">
                  {t('s07Company.domains.recordsHelp')}
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left">
                    <caption className="sr-only">{t('s07Company.domains.recordsTitle')}</caption>
                    <thead>
                      <tr className="border-b">
                        <th className="py-1 pr-3">{t('s07Company.domains.type')}</th>
                        <th className="py-1 pr-3">{t('s07Company.domains.name')}</th>
                        <th className="py-1 pr-3">{t('s07Company.domains.value')}</th>
                        <th className="py-1">{t('s07Company.domains.need')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.records.map((r) => (
                        <tr key={r.purpose} className="border-b align-top">
                          <td className="py-1 pr-3">{r.type}</td>
                          <td className="py-1 pr-3 break-all font-mono text-xs">{r.name}</td>
                          <td className="py-1 pr-3 break-all font-mono text-xs">{r.value}</td>
                          <td className="py-1">
                            {r.required
                              ? t('s07Company.domains.required')
                              : t('s07Company.domains.forVisitors')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void call('PUT', '/api/settings/domains', { id: d.id, action: 'check' })
                  }
                >
                  {t('s07Company.domains.check')}
                </Button>
                {d.status === 'verified' && !d.isPrimary ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void call('PUT', '/api/settings/domains', { id: d.id, action: 'primary' })
                    }
                  >
                    {t('s07Company.domains.makePrimary')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('s07Company.domains.confirmRemove')))
                      void call('DELETE', `/api/settings/domains?id=${d.id}`);
                  }}
                >
                  {t('s07Company.settings.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p
        aria-live="polite"
        role="status"
        className={`text-sm ${message && !message.ok ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
