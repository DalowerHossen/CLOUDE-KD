// path: app/(admin)/admin/system/_components/system-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { MaintenanceInput } from '@/lib/platform/controls';
import type { KillSwitchView, TenantLimitView } from '@/services/platform/controls';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s16System.system.${k}` as never);
const local = (iso: string | null): string => (iso ? iso.slice(0, 16) : '');
const toIso = (v: string): string | null => (v === '' ? null : `${v}:00Z`);

export function SystemPanel({
  maintenance,
  active,
  switches,
  limits,
}: {
  maintenance: MaintenanceInput;
  active: boolean;
  switches: KillSwitchView[];
  limits: TenantLimitView[];
}): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(maintenance.enabled);
  const [text, setText] = useState(maintenance.message);
  const [startsAt, setStartsAt] = useState(local(maintenance.startsAt));
  const [endsAt, setEndsAt] = useState(local(maintenance.endsAt));
  const [flagKey, setFlagKey] = useState('');
  const [killReason, setKillReason] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [limit, setLimit] = useState('600');
  const [capReason, setCapReason] = useState('');
  const [capEnds, setCapEnds] = useState('');

  async function send(
    url: string,
    body: Record<string, unknown>,
    after?: () => void,
  ): Promise<void> {
    setMessage(null);
    const error = await sendJson(url, 'POST', body);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('saved') });
      after?.();
      router.refresh();
    }
  }

  const card = 'space-y-sp-8 rounded-lg border bg-card p-sp-16';
  const field = 'block text-sm font-medium';
  return (
    <div className="space-y-sp-16">
      <section className={card}>
        <div className="flex items-center justify-between gap-sp-8">
          <h2 className="text-h4 font-semibold">{p('maintenanceTitle')}</h2>
          <Badge variant="outline">
            {active
              ? p('maintenanceOn')
              : maintenance.enabled
                ? p('maintenanceScheduled')
                : p('maintenanceOff')}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{p('maintenanceHelp')}</p>
        <label className="flex items-center gap-sp-8 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {p('enabled')}
        </label>
        <label className={field} htmlFor="m-text">
          {p('message')}
        </label>
        <Input id="m-text" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        <div className="grid gap-sp-8 sm:grid-cols-2">
          <div>
            <label className={field} htmlFor="m-start">
              {p('startsAt')}
            </label>
            <Input
              id="m-start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className={field} htmlFor="m-end">
              {p('endsAt')}
            </label>
            <Input
              id="m-end"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() =>
            void send('/api/admin/system/maintenance', {
              enabled,
              message: text,
              startsAt: toIso(startsAt),
              endsAt: toIso(endsAt),
            })
          }
        >
          {p('save')}
        </Button>
      </section>

      <section className={card}>
        <h2 className="text-h4 font-semibold">{p('killTitle')}</h2>
        <p className="text-sm text-muted-foreground">{p('killHelp')}</p>
        <div className="grid gap-sp-8 sm:grid-cols-2">
          <div>
            <label className={field} htmlFor="k-key">
              {p('killKey')}
            </label>
            <Input
              id="k-key"
              value={flagKey}
              maxLength={80}
              onChange={(e) => setFlagKey(e.target.value)}
            />
          </div>
          <div>
            <label className={field} htmlFor="k-reason">
              {p('killReason')}
            </label>
            <Input
              id="k-reason"
              value={killReason}
              maxLength={500}
              onChange={(e) => setKillReason(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={flagKey.trim().length < 3 || killReason.trim().length < 10}
          onClick={() =>
            void send(
              '/api/admin/system/kill-switches',
              { action: 'engage', flagKey: flagKey.trim(), reason: killReason },
              () => {
                setFlagKey('');
                setKillReason('');
              },
            )
          }
        >
          {p('engage')}
        </Button>
        {switches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p('killEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {switches.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
              >
                <span className="min-w-0 break-words">
                  <strong>{s.flagKey}</strong> - {s.reason}
                  <span className="block text-muted-foreground">
                    {p('engagedAt')} {s.engagedAt.slice(0, 16).replace('T', ' ')}
                    {s.releasedAt
                      ? ` / ${p('releasedAt')} ${s.releasedAt.slice(0, 16).replace('T', ' ')}`
                      : ''}
                  </span>
                </span>
                {s.releasedAt === null ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void send('/api/admin/system/kill-switches', { action: 'release', id: s.id })
                    }
                  >
                    {p('release')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-h4 font-semibold">{p('capTitle')}</h2>
        <p className="text-sm text-muted-foreground">{p('capHelp')}</p>
        <div className="grid gap-sp-8 sm:grid-cols-2">
          <div>
            <label className={field} htmlFor="c-company">
              {p('capCompany')}
            </label>
            <Input
              id="c-company"
              value={companyId}
              maxLength={36}
              onChange={(e) => setCompanyId(e.target.value)}
            />
          </div>
          <div>
            <label className={field} htmlFor="c-limit">
              {p('capLimit')}
            </label>
            <Input
              id="c-limit"
              inputMode="numeric"
              value={limit}
              maxLength={6}
              onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div>
            <label className={field} htmlFor="c-reason">
              {p('capReason')}
            </label>
            <Input
              id="c-reason"
              value={capReason}
              maxLength={500}
              onChange={(e) => setCapReason(e.target.value)}
            />
          </div>
          <div>
            <label className={field} htmlFor="c-ends">
              {p('capExpires')}
            </label>
            <Input
              id="c-ends"
              type="datetime-local"
              value={capEnds}
              onChange={(e) => setCapEnds(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={companyId.trim().length !== 36 || capReason.trim().length < 10 || limit === ''}
          onClick={() =>
            void send(
              '/api/admin/system/tenant-limits',
              {
                action: 'set',
                companyId: companyId.trim(),
                limitPerMinute: Number(limit),
                reason: capReason,
                expiresAt: toIso(capEnds),
              },
              () => {
                setCompanyId('');
                setCapReason('');
              },
            )
          }
        >
          {p('capSet')}
        </Button>
        {limits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p('capEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {limits.map((l) => (
              <li
                key={l.companyId}
                className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
              >
                <span className="min-w-0 break-words">
                  <strong>{l.companyName || l.companyId}</strong>: {l.limitPerMinute} / min -{' '}
                  {l.reason}
                  {l.expiresAt ? ` (${l.expiresAt.slice(0, 16).replace('T', ' ')})` : ''}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void send('/api/admin/system/tenant-limits', {
                      action: 'clear',
                      companyId: l.companyId,
                    })
                  }
                >
                  {p('capClear')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
