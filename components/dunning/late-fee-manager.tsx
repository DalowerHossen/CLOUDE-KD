// path: components/dunning/late-fee-manager.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { clampInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface FeeSettingsValue {
  enabled: boolean;
  kind: 'percent' | 'fixed';
  value: string;
  repeat: 'once' | 'monthly';
  graceDays: number;
  capPercent: string | null;
  capAmount: string | null;
  autoApply: boolean;
  label: string;
}

export interface FeeRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  periodKey: string;
  amount: string;
  status: 'proposed' | 'applied' | 'waived';
}

export function LateFeeManager({
  initial,
  version,
  fees,
  canManage,
}: {
  initial: FeeSettingsValue;
  version: number;
  fees: FeeRow[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState<FeeSettingsValue>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const keys = useRef<Record<string, string>>({});

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson('/api/invoices/late-fees/settings', 'PUT', {
      expectedVersion: version,
      settings: v,
    });
    if (r.ok) {
      setNote({ ok: true, text: t('s09Dunning.fees.saved') });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Dunning.panel.error') });
    setBusy(false);
  }

  async function decide(id: string, action: 'apply' | 'waive'): Promise<void> {
    setBusy(true);
    setNote(null);
    keys.current[id] ??= crypto.randomUUID();
    const r = await callJson(
      `/api/invoices/late-fees/${id}`,
      'POST',
      { action, reason: reasons[id] ?? '' },
      { 'idempotency-key': keys.current[id] },
    );
    if (r.ok) {
      delete keys.current[id];
      setNote({ ok: true, text: t('s09Dunning.fees.done') });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Dunning.panel.error') });
    setBusy(false);
  }

  const proposed = fees.filter((f) => f.status === 'proposed');
  const others = fees.filter((f) => f.status !== 'proposed');
  return (
    <div className="space-y-sp-24 text-sm">
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Dunning.fees.proposedTitle')}</h2>
        {proposed.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Dunning.fees.none')}</p>
        ) : (
          <ul className="space-y-sp-8">
            {proposed.map((f) => (
              <li key={f.id} className="flex flex-wrap items-end gap-sp-8 rounded-lg border p-sp-8">
                <span>
                  {f.invoiceNumber} - {f.periodKey} -{' '}
                  <strong>{formatMoney(Money.parse(f.amount))}</strong>
                </span>
                {canManage ? (
                  <>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(f.id, 'apply')}
                    >
                      {t('s09Dunning.fees.apply')}
                    </Button>
                    <label>
                      <span className="sr-only">{t('s09Dunning.fees.waiveReason')}</span>
                      <Input
                        placeholder={t('s09Dunning.fees.waiveReason')}
                        maxLength={300}
                        value={reasons[f.id] ?? ''}
                        onChange={(e) => setReasons({ ...reasons, [f.id]: e.target.value })}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || (reasons[f.id] ?? '').trim().length < 3}
                      onClick={() => void decide(f.id, 'waive')}
                    >
                      {t('s09Dunning.fees.waive')}
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className="space-y-sp-12"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={!canManage} className="space-y-sp-12">
          <label className="flex items-center gap-sp-8">
            <input
              type="checkbox"
              checked={v.enabled}
              onChange={(e) => setV({ ...v, enabled: e.target.checked })}
            />
            {t('s09Dunning.fees.enabled')}
          </label>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <label>
              {t('s09Dunning.fees.kind')}
              <NativeSelect
                value={v.kind}
                onChange={(e) =>
                  setV({ ...v, kind: e.target.value === 'fixed' ? 'fixed' : 'percent' })
                }
              >
                <option value="percent">{t('s09Dunning.fees.kindPercent')}</option>
                <option value="fixed">{t('s09Dunning.fees.kindFixed')}</option>
              </NativeSelect>
            </label>
            <label>
              {t('s09Dunning.fees.value')}
              <Input
                inputMode="decimal"
                value={v.value}
                onChange={(e) => setV({ ...v, value: e.target.value })}
              />
            </label>
            <label>
              {t('s09Dunning.fees.repeat')}
              <NativeSelect
                value={v.repeat}
                onChange={(e) =>
                  setV({ ...v, repeat: e.target.value === 'once' ? 'once' : 'monthly' })
                }
              >
                <option value="once">{t('s09Dunning.fees.repeatOnce')}</option>
                <option value="monthly">{t('s09Dunning.fees.repeatMonthly')}</option>
              </NativeSelect>
            </label>
            <label>
              {t('s09Dunning.fees.grace')}
              <Input
                type="number"
                min={0}
                max={365}
                value={v.graceDays}
                onChange={(e) =>
                  setV({
                    ...v,
                    graceDays: clampInt(e.target.value, 0, 365, 0),
                  })
                }
              />
            </label>
            <label>
              {t('s09Dunning.fees.capPercent')}
              <Input
                inputMode="decimal"
                value={v.capPercent ?? ''}
                onChange={(e) =>
                  setV({ ...v, capPercent: e.target.value.trim() === '' ? null : e.target.value })
                }
              />
            </label>
            <label>
              {t('s09Dunning.fees.capAmount')}
              <Input
                inputMode="decimal"
                value={v.capAmount ?? ''}
                onChange={(e) =>
                  setV({ ...v, capAmount: e.target.value.trim() === '' ? null : e.target.value })
                }
              />
            </label>
            <label className="sm:col-span-2">
              {t('s09Dunning.fees.label')}
              <Input
                maxLength={100}
                value={v.label}
                onChange={(e) => setV({ ...v, label: e.target.value })}
              />
            </label>
          </div>
          <label className="flex items-center gap-sp-8">
            <input
              type="checkbox"
              checked={v.autoApply}
              onChange={(e) => setV({ ...v, autoApply: e.target.checked })}
            />
            {t('s09Dunning.fees.autoApply')}
          </label>
        </fieldset>
        <p className="text-muted-foreground">{t('s09Dunning.fees.note')}</p>
        {canManage ? (
          <Button type="submit" disabled={busy}>
            {t('s09Dunning.fees.save')}
          </Button>
        ) : null}
      </form>

      {others.length > 0 ? (
        <section className="space-y-sp-8">
          <h2 className="text-lg font-semibold">{t('s09Dunning.fees.otherTitle')}</h2>
          <ul className="space-y-sp-4">
            {others.map((f) => (
              <li key={f.id}>
                {f.invoiceNumber} - {f.periodKey} - {formatMoney(Money.parse(f.amount))} -{' '}
                {t(`s09Dunning.fees.statuses.${f.status}` as StringKey)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
