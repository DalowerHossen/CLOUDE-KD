// path: components/settings/data-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, type StringKey } from '@/lib/i18n';
import type { RequestView } from '@/services/lifecycle/data';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const linkBody = z.object({ data: z.object({ url: z.string().url() }) });
const mb = (n: number | null): string =>
  n === null ? '-' : `${(n / (1024 * 1024)).toFixed(1)} MB`;

export function DataPanel({
  requests,
  companyName,
}: {
  requests: RequestView[];
  companyName: string;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState('');
  const closure = requests.find((r) => r.kind === 'closure' && r.status === 'pending');
  const files = requests.filter((r) => r.kind !== 'closure');

  async function call(
    method: string,
    url: string,
    body?: unknown,
    ok = t('s07Company.data.done'),
  ): Promise<Response | null> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) {
        setMessage({ ok: true, text: ok });
        router.refresh();
        return response;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setMessage({
        ok: false,
        text: err.success ? err.data.error.message : t('s07Company.data.error'),
      });
    } catch {
      setMessage({ ok: false, text: t('s07Company.data.error') });
    } finally {
      setBusy(false);
    }
    return null;
  }

  async function download(id: string): Promise<void> {
    const response = await call(
      'GET',
      `/api/settings/data/download?id=${id}`,
      undefined,
      t('s07Company.data.downloading'),
    );
    const parsed = linkBody.safeParse(response ? await response.json().catch(() => null) : null);
    if (parsed.success) window.location.assign(parsed.data.data.url);
  }

  return (
    <div className="space-y-sp-24">
      <section className="space-y-sp-12" aria-labelledby="files">
        <h2 id="files" className="text-h4 font-semibold">
          {t('s07Company.data.filesTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('s07Company.data.filesHelp')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void call(
                'POST',
                '/api/settings/data',
                { kind: 'export' },
                t('s07Company.data.requested'),
              )
            }
          >
            {t('s07Company.data.newExport')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void call(
                'POST',
                '/api/settings/data',
                { kind: 'backup' },
                t('s07Company.data.requested'),
              )
            }
          >
            {t('s07Company.data.newBackup')}
          </Button>
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('s07Company.data.none')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {files.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 p-sp-12 text-sm">
                <span className="font-medium">
                  {t(`s07Company.data.kind.${r.kind}` as StringKey)}
                </span>
                <Badge variant={r.status === 'failed' ? 'destructive' : 'outline'}>
                  {t(`s07Company.data.state.${r.status}` as StringKey)}
                </Badge>
                <span className="text-muted-foreground">
                  {r.createdAt.replace('T', ' ').slice(0, 16)}
                </span>
                {r.status === 'ready' ? (
                  <span className="text-muted-foreground">
                    {mb(r.sizeBytes)} - {t('s07Company.data.rows', { count: r.rows })}
                  </span>
                ) : null}
                {r.checksum ? (
                  <span
                    className="break-all font-mono text-xs text-muted-foreground"
                    title={t('s07Company.data.checksum')}
                  >
                    {r.checksum.slice(0, 16)}...
                  </span>
                ) : null}
                {r.error ? <span className="text-destructive">{r.error}</span> : null}
                {r.status === 'ready' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => void download(r.id)}
                  >
                    {t('s07Company.data.download')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="space-y-sp-12 rounded-lg border border-destructive/40 p-sp-16"
        aria-labelledby="close"
      >
        <h2 id="close" className="text-h4 font-semibold">
          {t('s07Company.data.closeTitle')}
        </h2>
        {closure ? (
          <>
            <p className="text-sm">
              {t('s07Company.data.closing', { date: (closure.scheduledFor ?? '').slice(0, 10) })}
            </p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void call('PUT', '/api/settings/data', { action: 'cancel' })}
            >
              {t('s07Company.data.cancelClosure')}
            </Button>
          </>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call('PUT', '/api/settings/data', {
                action: 'request',
                companyName: confirm,
              }).then((r) => {
                if (r) setConfirm('');
              });
            }}
          >
            <p className="text-sm text-muted-foreground">{t('s07Company.data.closeHelp')}</p>
            <label className="block space-y-1 text-sm">
              <span>{t('s07Company.data.typeName', { name: companyName })}</span>
              <Input value={confirm} maxLength={200} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || confirm.trim().length === 0}
            >
              {t('s07Company.data.requestClosure')}
            </Button>
          </form>
        )}
      </section>
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
