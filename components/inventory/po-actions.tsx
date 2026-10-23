// path: components/inventory/po-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { PoLineView } from '@/services/purchase/orders';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

type Entry = { quantity: string; batchNo: string; expiresOn: string };

export function PoActions({
  id,
  status,
  lines,
  canWrite,
  canSend,
  canReceive,
}: {
  id: string;
  status: string;
  lines: PoLineView[];
  canWrite: boolean;
  canSend: boolean;
  canReceive: boolean;
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  async function run(body: unknown): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/purchase-orders/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setNote({ ok: true, text: t('s08Crm.orders.done') });
        setEntries({});
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.orders.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.orders.error') });
    }
    setBusy(false);
  }

  const receivable = status === 'sent' || status === 'partial';
  const cancellable = ['draft', 'pending_approval', 'approved', 'sent'].includes(status);
  const open = (l: PoLineView): boolean => Number(l.quantity) - Number(l.receivedQty) > 0;

  function receive(): void {
    const picked = lines.flatMap((l) => {
      const e = entries[l.id];
      if (!e || !e.quantity || Number(e.quantity) <= 0) return [];
      return [
        {
          lineId: l.id,
          quantity: e.quantity,
          batchNo: e.batchNo,
          expiresOn: e.expiresOn,
        },
      ];
    });
    if (picked.length === 0) return setNote({ ok: false, text: t('s08Crm.orders.needLine') });
    void run({ action: 'receive', lines: picked });
  }

  return (
    <div className="space-y-sp-12 print:hidden">
      <div className="flex flex-wrap gap-sp-8">
        {status === 'draft' && canWrite ? (
          <Button type="button" disabled={busy} onClick={() => void run({ action: 'submit' })}>
            {t('s08Crm.orders.submit')}
          </Button>
        ) : null}
        {status === 'approved' && canSend ? (
          <Button type="button" disabled={busy} onClick={() => void run({ action: 'send' })}>
            {t('s08Crm.orders.send')}
          </Button>
        ) : null}
        {cancellable && canWrite ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('s08Crm.orders.confirmCancel'))) void run({ action: 'cancel' });
            }}
          >
            {t('s08Crm.orders.cancel')}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => window.print()}>
          {t('s08Crm.orders.print')}
        </Button>
      </div>
      {receivable && canReceive ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-12">
          <h2 className="text-lg font-semibold">{t('s08Crm.orders.receiveTitle')}</h2>
          <p className="text-sm">{t('s08Crm.orders.receiveHelp')}</p>
          {lines.filter(open).map((l) => {
            const e = entries[l.id] ?? { quantity: '', batchNo: '', expiresOn: '' };
            const set = (patch: Partial<Entry>): void =>
              setEntries({ ...entries, [l.id]: { ...e, ...patch } });
            return (
              <div key={l.id} className="grid gap-sp-8 text-sm sm:grid-cols-4">
                <p className="font-medium sm:col-span-4">
                  {l.variantName ? `${l.productName} - ${l.variantName}` : l.productName} (
                  {t('s08Crm.orders.open2')}:{' '}
                  {(Number(l.quantity) - Number(l.receivedQty)).toString()})
                </p>
                <label>
                  {t('s08Crm.orders.receiveNow')}
                  <Input
                    inputMode="decimal"
                    value={e.quantity}
                    maxLength={20}
                    onChange={(ev) => set({ quantity: ev.target.value })}
                  />
                </label>
                <label>
                  {t('s08Crm.orders.batch')}
                  <Input
                    value={e.batchNo}
                    maxLength={60}
                    onChange={(ev) => set({ batchNo: ev.target.value })}
                  />
                </label>
                <label>
                  {t('s08Crm.orders.expiry')}
                  <Input
                    type="date"
                    value={e.expiresOn}
                    onChange={(ev) => set({ expiresOn: ev.target.value })}
                  />
                </label>
              </div>
            );
          })}
          <Button type="button" disabled={busy} onClick={receive}>
            {t('s08Crm.orders.receive')}
          </Button>
        </section>
      ) : null}
      {note ? (
        <p role="status" className={note.ok ? 'text-sm' : 'text-sm text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
