// path: components/payment/admin/routing-manager.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { PAYMENT_METHODS } from '@/config/processors';
import { PLAN_KEYS } from '@/config/plans';
import { t } from '@/lib/i18n';
import type { RoutingRuleView } from '@/services/payment/routing';

const errorBody = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});

interface Props {
  rules: RoutingRuleView[];
  processors: { id: string; name: string }[];
}

function conditions(rule: RoutingRuleView): string {
  const parts: string[] = [];
  if (rule.minAmount || rule.maxAmount) {
    parts.push(
      t('s10Processors.routing.conditionAmount', {
        min: rule.minAmount ?? t('s10Processors.routing.conditionOpen'),
        max: rule.maxAmount ?? t('s10Processors.routing.conditionOpen'),
      }),
    );
  }
  if (rule.countries.length > 0) parts.push(rule.countries.join(', '));
  if (rule.methods.length > 0) parts.push(rule.methods.join(', '));
  if (rule.plans.length > 0) parts.push(rule.plans.join(', '));
  return parts.length > 0 ? parts.join(' | ') : t('s10Processors.routing.anyValue');
}

export function RoutingManager({ rules, processors }: Props): JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState<RoutingRuleView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    okText: string,
  ): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const json: unknown = await response.json().catch(() => null);
        const parsed = errorBody.safeParse(json);
        setFeedback({
          ok: false,
          text:
            parsed.success && parsed.data.error.code === 'step_up_required'
              ? t('s10Processors.actions.needStepUp')
              : parsed.success
                ? parsed.data.error.message
                : t('s10Processors.actions.failed'),
        });
        return false;
      }
      setFeedback({ ok: true, text: okText });
      router.refresh();
      return true;
    } catch {
      setFeedback({ ok: false, text: t('s10Processors.actions.failed') });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string): string => String(data.get(key) ?? '').trim();
    const amount = (key: string): string | null => (text(key) === '' ? null : text(key));
    const body = {
      name: text('name'),
      priority: +text('priority'),
      processorId: text('processorId'),
      minAmount: amount('minAmount'),
      maxAmount: amount('maxAmount'),
      countries: text('countries')
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c !== ''),
      methods: data.getAll('methods').map(String),
      plans: data.getAll('plans').map(String),
      enabled: data.get('enabled') === 'on',
    };
    const done = editing
      ? await send(
          `/api/admin/processors/routing/${editing.id}`,
          'PUT',
          { ...body, expectedVersion: editing.version },
          t('s10Processors.routing.saved'),
        )
      : await send('/api/admin/processors/routing', 'POST', body, t('s10Processors.routing.saved'));
    if (done) {
      setEditing(null);
      setFormOpen(false);
    }
  }

  const current = editing;

  return (
    <div className="space-y-sp-16">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('s10Processors.routing.add')}
        </Button>
      </div>
      {feedback ? (
        <Alert variant={feedback.ok ? 'success' : 'destructive'}>{feedback.text}</Alert>
      ) : null}
      {formOpen ? (
        <form
          key={current?.id ?? 'new'}
          onSubmit={(e) => void submit(e)}
          className="grid gap-sp-12 rounded-lg border p-sp-16 sm:grid-cols-2"
        >
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="rule-name">{t('s10Processors.routing.name')}</Label>
            <Input
              id="rule-name"
              name="name"
              required
              maxLength={100}
              defaultValue={current?.name ?? ''}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-priority">{t('s10Processors.routing.priority')}</Label>
            <Input
              id="rule-priority"
              name="priority"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              required
              defaultValue={current?.priority ?? 100}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-processor">{t('s10Processors.routing.processor')}</Label>
            <NativeSelect
              id="rule-processor"
              name="processorId"
              required
              defaultValue={current?.processorId ?? processors[0]?.id}
            >
              {processors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-min">{t('s10Processors.routing.minAmount')}</Label>
            <Input
              id="rule-min"
              name="minAmount"
              inputMode="decimal"
              pattern="\d{1,14}(\.\d{1,4})?"
              defaultValue={current?.minAmount ?? ''}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-max">{t('s10Processors.routing.maxAmount')}</Label>
            <Input
              id="rule-max"
              name="maxAmount"
              inputMode="decimal"
              pattern="\d{1,14}(\.\d{1,4})?"
              defaultValue={current?.maxAmount ?? ''}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="rule-countries">{t('s10Processors.routing.countries')}</Label>
            <Input
              id="rule-countries"
              name="countries"
              maxLength={1000}
              defaultValue={current?.countries.join(', ') ?? ''}
            />
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t('s10Processors.routing.methods')}</legend>
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="methods"
                  value={m}
                  defaultChecked={current?.methods.includes(m) ?? false}
                />
                {m}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t('s10Processors.routing.plans')}</legend>
            {PLAN_KEYS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="plans"
                  value={p}
                  defaultChecked={current?.plans.includes(p) ?? false}
                />
                {p}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={current?.enabled ?? true} />
            {t('s10Processors.routing.enabled')}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {t('s10Processors.routing.save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setFormOpen(false);
              }}
            >
              {t('s01Core.common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s10Processors.routing.empty')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-col gap-2 rounded-md border p-sp-12 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {rule.priority}. {rule.name}{' '}
                  <Badge variant={rule.enabled ? 'success' : 'secondary'}>
                    {rule.enabled
                      ? t('s10Processors.statuses.enabled')
                      : t('s10Processors.statuses.disabled')}
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {processors.find((p) => p.id === rule.processorId)?.name ?? rule.processorId} -{' '}
                  {conditions(rule)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(rule);
                    setFormOpen(true);
                  }}
                >
                  {t('s10Processors.routing.edit')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      `/api/admin/processors/routing/${rule.id}`,
                      'DELETE',
                      { expectedVersion: rule.version },
                      t('s10Processors.routing.removed'),
                    )
                  }
                >
                  {t('s10Processors.routing.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
