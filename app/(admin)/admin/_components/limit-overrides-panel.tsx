// path: app/(admin)/admin/_components/limit-overrides-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ENTITLEMENT_KEYS } from '@/config/plans';
import { t } from '@/lib/i18n';
import { keyKind } from '@/lib/payment/plan-rules';
import type { OverrideView } from '@/services/platform/tenant-overrides';
import { sendJson } from './post-json';

const p = (k: string): string => t(`s16System.tenant.${k}` as never);
const show = (v: boolean | number | null | undefined): string =>
  v === undefined
    ? '-'
    : v === null
      ? p('unlimited')
      : typeof v === 'boolean'
        ? v
          ? p('on')
          : p('off')
        : String(v);

export function LimitOverridesPanel({
  companyId,
  overrides,
  canManage,
}: {
  companyId: string;
  overrides: OverrideView[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [key, setKey] = useState<(typeof ENTITLEMENT_KEYS)[number]>(ENTITLEMENT_KEYS[0]);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [ends, setEnds] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const kind = keyKind(key);

  async function send(body: Record<string, unknown>): Promise<void> {
    setMessage(null);
    const error = await sendJson('/api/admin/system/tenant-overrides', 'POST', body);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('saved') });
      setReason('');
      router.refresh();
    }
  }

  const parsedValue = (): boolean | number | null =>
    kind === 'switch' ? value === 'on' : value.trim() === '' ? null : Number(value);

  return (
    <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
      <h2 className="text-h4 font-semibold">{p('overridesTitle')}</h2>
      <p className="text-sm text-muted-foreground">{p('overridesHelp')}</p>
      {overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p('overridesEmpty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {overrides.map((o) => (
            <li
              key={o.key}
              className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
            >
              <span className="min-w-0 break-words">
                <strong>{o.key}</strong>: {show(o.value)} ({p('plan')}: {show(o.planValue)})
                {o.expired
                  ? ` - ${p('expired')}`
                  : o.expiresAt
                    ? ` - ${o.expiresAt.slice(0, 16).replace('T', ' ')}`
                    : ''}
                <span className="block text-muted-foreground">{o.reason}</span>
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void send({ action: 'clear', companyId, key: o.key })}
                >
                  {p('remove')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="space-y-sp-8 border-t pt-sp-8">
          <div className="grid gap-sp-8 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="o-key">
                {p('feature')}
              </label>
              <select
                id="o-key"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value as (typeof ENTITLEMENT_KEYS)[number]);
                  setValue('');
                }}
                className="w-full rounded-md border bg-background px-sp-8 py-sp-4 text-sm"
              >
                {ENTITLEMENT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="o-value">
                {kind === 'switch' ? p('valueSwitch') : p('valueLimit')}
              </label>
              {kind === 'switch' ? (
                <select
                  id="o-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-md border bg-background px-sp-8 py-sp-4 text-sm"
                >
                  <option value="off">{p('off')}</option>
                  <option value="on">{p('on')}</option>
                </select>
              ) : (
                <Input
                  id="o-value"
                  inputMode="numeric"
                  value={value}
                  maxLength={10}
                  onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="o-reason">
                {p('reason')}
              </label>
              <Input
                id="o-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="o-ends">
                {p('endsAt')}
              </label>
              <Input
                id="o-ends"
                type="datetime-local"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={reason.trim().length < 10}
            onClick={() =>
              void send({
                action: 'set',
                companyId,
                key,
                value: parsedValue(),
                reason,
                expiresAt: ends === '' ? null : `${ends}:00Z`,
              })
            }
          >
            {p('set')}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
