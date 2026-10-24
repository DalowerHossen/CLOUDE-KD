// path: components/invoice/bulk-selection.tsx
'use client';
import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { BatchAction } from '@/lib/invoice/batch';

// The selection lives outside React so the checkboxes in the table (a server-rendered list) and the bar share it.
let selected: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = (): ReadonlySet<string> => selected;
const setSelected = (next: Set<string>): void => {
  selected = next;
  emit();
};

export function useSelection(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function BulkCheckbox({ id, number }: { id: string; number: string }): JSX.Element {
  const current = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={t('s09Batches.bar.selectRow', { number })}
      checked={current.has(id)}
      onChange={(e) => {
        const next = new Set(current);
        if (e.target.checked) next.add(id);
        else next.delete(id);
        setSelected(next);
      }}
    />
  );
}

export function BulkSelectPage({ ids }: { ids: string[] }): JSX.Element {
  const current = useSelection();
  const all = ids.length > 0 && ids.every((id) => current.has(id));
  return (
    <label className="flex items-center gap-sp-8 text-sm">
      <input
        type="checkbox"
        checked={all}
        onChange={(e) => {
          const next = new Set(current);
          for (const id of ids) {
            if (e.target.checked) next.add(id);
            else next.delete(id);
          }
          setSelected(next);
        }}
      />
      {t('s09Batches.bar.selectPage')}
    </label>
  );
}

const created = z.object({ id: z.string() });

export function BulkBar({
  allowed,
}: {
  allowed: Partial<Record<Exclude<BatchAction, 'create'>, boolean>>;
}): JSX.Element | null {
  const router = useRouter();
  const current = useSelection();
  const actions = (['send', 'remind', 'tag', 'trash', 'void'] as const).filter(
    (a) => allowed[a] === true,
  );
  const [action, setAction] = useState<(typeof actions)[number]>(actions[0] ?? 'send');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [tag, setTag] = useState('');
  const [dup, setDup] = useState(false);
  const [ack, setAck] = useState(false);
  const [runAfter, setRunAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (current.size === 0 || actions.length === 0) return null;

  async function start(): Promise<void> {
    if (action === 'void' && !window.confirm(t('s09Batches.bar.confirmVoid'))) return;
    if (action === 'trash' && !window.confirm(t('s09Batches.bar.confirmTrash'))) return;
    setBusy(true);
    setError(null);
    const base = {
      action,
      invoiceIds: [...current],
      runAfter: runAfter === '' ? null : new Date(runAfter).toISOString(),
    };
    const body =
      action === 'send'
        ? { ...base, confirmDuplicate: dup, message }
        : action === 'remind'
          ? { ...base, message }
          : action === 'void'
            ? { ...base, reason, acknowledgePayments: ack }
            : action === 'tag'
              ? { ...base, tag }
              : base;
    const r = await callJson('/api/invoices/batches', 'POST', body, {
      'idempotency-key': crypto.randomUUID(),
    });
    if (r.ok) {
      const parsed = created.safeParse(r.data);
      setSelected(new Set());
      if (parsed.success) router.push(`/invoices/batches/${parsed.data.id}`);
    } else setError(r.message ?? t('s09Batches.bar.error'));
    setBusy(false);
  }

  return (
    <div
      role="region"
      aria-label={t('s09Batches.title')}
      className="sticky bottom-sp-8 z-10 space-y-sp-8 rounded-lg border bg-card p-sp-12 text-sm shadow print:hidden"
    >
      <div className="flex flex-wrap items-end gap-sp-8">
        <strong>{t('s09Batches.bar.selected', { count: String(current.size) })}</strong>
        <Button type="button" variant="outline" onClick={() => setSelected(new Set())}>
          {t('s09Batches.bar.clear')}
        </Button>
        <label>
          {t('s09Batches.bar.action')}
          <NativeSelect
            value={action}
            onChange={(e) =>
              setAction(actions.find((a) => a === e.target.value) ?? actions[0] ?? 'send')
            }
          >
            {actions.map((a) => (
              <option key={a} value={a}>
                {t(`s09Batches.actions.${a}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        {action === 'send' || action === 'remind' ? (
          <label>
            {t('s09Batches.bar.message')}
            <Input maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        ) : null}
        {action === 'void' ? (
          <label>
            {t('s09Batches.bar.reason')}
            <Input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        ) : null}
        {action === 'tag' ? (
          <label>
            {t('s09Batches.bar.tag')}
            <Input maxLength={30} value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>
        ) : null}
        <label>
          {t('s09Batches.bar.runAfter')}
          <Input
            type="datetime-local"
            value={runAfter}
            onChange={(e) => setRunAfter(e.target.value)}
          />
        </label>
        <Button
          type="button"
          disabled={
            busy ||
            (action === 'void' && (reason.trim().length < 3 || !ack)) ||
            (action === 'tag' && tag.trim() === '')
          }
          onClick={() => void start()}
        >
          {busy ? t('s09Batches.bar.starting') : t('s09Batches.bar.start')}
        </Button>
      </div>
      {action === 'send' ? (
        <label className="flex items-center gap-sp-8">
          <input type="checkbox" checked={dup} onChange={(e) => setDup(e.target.checked)} />
          {t('s09Batches.bar.confirmDuplicate')}
        </label>
      ) : null}
      {action === 'void' ? (
        <label className="flex items-center gap-sp-8">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {t('s09Batches.bar.acknowledgePayments')}
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
