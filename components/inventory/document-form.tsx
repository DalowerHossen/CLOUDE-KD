// path: components/inventory/document-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DOCUMENT_KINDS, MOVES_STOCK, type DocumentKind } from '@/lib/stock/documents';
import { t, type StringKey } from '@/lib/i18n';
import type { DocumentView } from '@/services/inventory/documents';
import type { WarehouseView } from '@/services/inventory/warehouses';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const pickerBody = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      variantId: z.string().nullable(),
      label: z.string(),
      sku: z.string().nullable(),
    }),
  ),
});

interface Line {
  productId: string;
  variantId: string | null;
  label: string;
  quantity: string;
  unitCost: string;
  batchNo: string;
  expiresOn: string;
  note: string;
}
interface State {
  kind: DocumentKind;
  warehouseId: string;
  partyType: 'none' | 'client' | 'supplier';
  partyName: string;
  reference: string;
  note: string;
  lines: Line[];
}

function initial(doc: DocumentView | null, kind: DocumentKind, warehouseId: string): State {
  return {
    kind: doc?.kind ?? kind,
    warehouseId: doc?.warehouseId ?? warehouseId,
    partyType:
      doc?.partyType ??
      (kind === 'receipt' || kind === 'purchase_return'
        ? 'supplier'
        : kind === 'issue'
          ? 'none'
          : 'client'),
    partyName: doc?.partyName ?? '',
    reference: doc?.reference ?? '',
    note: doc?.note ?? '',
    lines: (doc?.lines ?? []).map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      label: l.variantName ? `${l.productName} - ${l.variantName}` : l.productName,
      quantity: l.quantity.replace(/0+$/, '').replace(/\.$/, ''),
      unitCost: l.unitCost ?? '',
      batchNo: l.batchNo ?? '',
      expiresOn: l.expiresOn ?? '',
      note: l.note,
    })),
  };
}

export function DocumentForm({
  doc,
  kind,
  warehouses,
}: {
  doc: DocumentView | null;
  kind: DocumentKind;
  warehouses: WarehouseView[];
}): JSX.Element {
  const router = useRouter();
  const active = warehouses.filter((w) => w.isActive);
  const [s, setS] = useState<State>(() =>
    initial(doc, kind, active.find((w) => w.isDefault)?.id ?? active[0]?.id ?? ''),
  );
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<z.infer<typeof pickerBody>['data']>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const stockKind = MOVES_STOCK.includes(s.kind);
  const adds = s.kind === 'receipt' || s.kind === 'sales_return';

  async function search(text: string): Promise<void> {
    setQ(text);
    if (text.trim().length < 2) return setHits([]);
    try {
      const response = await fetch(
        `/api/products/picker?${new URLSearchParams({ q: text.trim(), limit: '10' }).toString()}`,
      );
      const parsed = pickerBody.safeParse(await response.json().catch(() => null));
      setHits(parsed.success ? parsed.data.data : []);
    } catch {
      setHits([]);
    }
  }

  function payload(): Record<string, unknown> {
    return {
      kind: s.kind,
      warehouseId: s.warehouseId,
      partyType: s.partyType,
      partyId: null,
      partyName: s.partyType === 'none' ? '' : s.partyName,
      reference: s.reference,
      note: s.note,
      lines: s.lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitCost: adds ? l.unitCost : '',
        batchNo: adds ? l.batchNo : '',
        expiresOn: adds ? l.expiresOn : '',
        note: l.note,
      })),
    };
  }

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(
        doc ? `/api/inventory/documents/${doc.id}` : '/api/inventory/documents',
        {
          method: doc ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            doc ? { expectedVersion: doc.version, document: payload() } : payload(),
          ),
        },
      );
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        setNote({ ok: true, text: t('s08Crm.documents.saved') });
        if (!doc && id.success) router.replace(`/inventory/documents/${id.data.data.id}`);
        router.refresh();
      } else if (response.status === 409)
        setNote({ ok: false, text: t('s08Crm.documents.conflict') });
      else {
        const err = errorBody.safeParse(json);
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.documents.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.documents.error') });
    }
    setBusy(false);
  }

  async function act(action: 'post' | 'cancel'): Promise<void> {
    if (!doc) return;
    if (action === 'post' && !window.confirm(t('s08Crm.documents.confirmPost'))) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/inventory/documents/${doc.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        setNote({
          ok: true,
          text: action === 'post' ? t('s08Crm.documents.posted') : t('s08Crm.documents.saved'),
        });
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.documents.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.documents.error') });
    }
    setBusy(false);
  }

  const setLine = (i: number, patch: Partial<Line>): void =>
    setS({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <form
      className="space-y-sp-16"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy} className="space-y-sp-16">
        <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 text-sm sm:grid-cols-2">
          <label>
            <span className="block font-medium">{t('s08Crm.documents.kind')}</span>
            <NativeSelect
              value={s.kind}
              disabled={doc !== null}
              onChange={(e) =>
                setS({ ...s, kind: DOCUMENT_KINDS.find((k) => k === e.target.value) ?? 'receipt' })
              }
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`s08Crm.documents.kinds.${k}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
            <span className="text-muted-foreground">
              {t(`s08Crm.documents.kindHelp.${s.kind}` as StringKey)}
            </span>
          </label>
          <label>
            <span className="block font-medium">{t('s08Crm.documents.warehouse')}</span>
            <NativeSelect
              value={s.warehouseId}
              onChange={(e) => setS({ ...s, warehouseId: e.target.value })}
            >
              {active.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            <span className="block font-medium">{t('s08Crm.documents.partyType')}</span>
            <NativeSelect
              value={s.partyType}
              onChange={(e) =>
                setS({
                  ...s,
                  partyType:
                    e.target.value === 'client'
                      ? 'client'
                      : e.target.value === 'supplier'
                        ? 'supplier'
                        : 'none',
                })
              }
            >
              <option value="none">{t('s08Crm.documents.partyNone')}</option>
              <option value="client">{t('s08Crm.documents.partyClient')}</option>
              <option value="supplier">{t('s08Crm.documents.partySupplier')}</option>
            </NativeSelect>
          </label>
          {s.partyType !== 'none' ? (
            <label>
              <span className="block font-medium">{t('s08Crm.documents.partyName')}</span>
              <Input
                maxLength={200}
                value={s.partyName}
                onChange={(e) => setS({ ...s, partyName: e.target.value })}
              />
            </label>
          ) : null}
          <label>
            <span className="block font-medium">{t('s08Crm.documents.reference')}</span>
            <Input
              maxLength={100}
              value={s.reference}
              onChange={(e) => setS({ ...s, reference: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium">{t('s08Crm.documents.note')}</span>
            <Textarea
              rows={2}
              maxLength={1000}
              value={s.note}
              onChange={(e) => setS({ ...s, note: e.target.value })}
            />
          </label>
        </section>

        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm">
          <h2 className="text-h4 font-semibold">{t('s08Crm.documents.lines')}</h2>
          {s.lines.map((l, i) => (
            <div key={i} className="grid gap-sp-8 rounded-md border p-sp-12 sm:grid-cols-6">
              <p className="sm:col-span-2">
                <span className="block text-muted-foreground">{t('s08Crm.documents.item')}</span>
                {l.label}
              </p>
              <label>
                <span className="block">{t('s08Crm.documents.quantity')}</span>
                <Input
                  inputMode="decimal"
                  value={l.quantity}
                  maxLength={20}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
              </label>
              {adds ? (
                <>
                  <label>
                    <span className="block">{t('s08Crm.documents.unitCost')}</span>
                    <Input
                      inputMode="decimal"
                      value={l.unitCost}
                      maxLength={20}
                      onChange={(e) => setLine(i, { unitCost: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="block">{t('s08Crm.documents.batch')}</span>
                    <Input
                      value={l.batchNo}
                      maxLength={40}
                      onChange={(e) => setLine(i, { batchNo: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="block">{t('s08Crm.documents.expiry')}</span>
                    <Input
                      type="date"
                      value={l.expiresOn}
                      onChange={(e) => setLine(i, { expiresOn: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
              <div className="sm:col-span-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setS({ ...s, lines: s.lines.filter((_, j) => j !== i) })}
                >
                  {t('s08Crm.documents.removeLine')}
                </Button>
              </div>
            </div>
          ))}
          <label className="block">
            <span className="block font-medium">{t('s08Crm.documents.searchItem')}</span>
            <Input value={q} maxLength={80} onChange={(e) => void search(e.target.value)} />
          </label>
          {hits.length > 0 ? (
            <ul className="rounded-md border">
              {hits.map((h) => (
                <li key={`${h.id}-${h.variantId ?? 'x'}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-1 text-left hover:bg-muted"
                    onClick={() => {
                      setS({
                        ...s,
                        lines: [
                          ...s.lines,
                          {
                            productId: h.id,
                            variantId: h.variantId,
                            label: h.label,
                            quantity: '1',
                            unitCost: '',
                            batchNo: '',
                            expiresOn: '',
                            note: '',
                          },
                        ],
                      });
                      setHits([]);
                      setQ('');
                    }}
                  >
                    {h.label} {h.sku ? `(${h.sku})` : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </fieldset>
      {stockKind ? null : (
        <p className="text-sm text-muted-foreground">
          {t(`s08Crm.documents.kindHelp.${s.kind}` as StringKey)}
        </p>
      )}
      <div className="flex flex-wrap gap-sp-8">
        <Button type="submit" disabled={busy || s.lines.length === 0}>
          {t('s08Crm.documents.saveDraft')}
        </Button>
        {doc ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy || s.lines.length === 0}
              onClick={() => void act('post')}
            >
              {t('s08Crm.documents.post')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void act('cancel')}
            >
              {t('s08Crm.documents.cancel')}
            </Button>
          </>
        ) : null}
      </div>
      {s.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s08Crm.documents.needLine')}</p>
      ) : null}
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
