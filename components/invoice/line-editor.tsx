// path: components/invoice/line-editor.tsx
'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import type { CalcLineResult } from '@/lib/invoice/calc';
import type { InvoiceLineInput } from '@/lib/invoice/input';
import { floorDiv } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const ROW = 196;
const WINDOW_FROM = 60;
const VIEW_HEIGHT = 720;
const OVERSCAN = 3;

export function LineEditor({
  lines,
  results,
  taxCodes,
  disabled,
  onChange,
}: {
  lines: InvoiceLineInput[];
  results: readonly CalcLineResult[] | null;
  taxCodes: readonly { code: string; name: string; rate: string }[];
  disabled: boolean;
  onChange: (next: InvoiceLineInput[]) => void;
}): JSX.Element {
  const [scrollTop, setScrollTop] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const windowed = lines.length > WINDOW_FROM;
  const first = windowed ? Math.max(0, floorDiv(scrollTop, ROW) - OVERSCAN) : 0;
  const last = windowed
    ? Math.min(lines.length, floorDiv(scrollTop + VIEW_HEIGHT, ROW) + OVERSCAN + 1)
    : lines.length;

  const patch = (i: number, p: Partial<InvoiceLineInput>): void =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= lines.length || from === to) return;
    const next = [...lines];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    onChange(next);
  };
  const toggleTax = (i: number, code: string): void => {
    const l = lines[i];
    if (!l) return;
    const has = l.taxCodes.includes(code);
    patch(i, {
      taxCodes: has ? l.taxCodes.filter((c) => c !== code) : [...l.taxCodes, code].slice(0, 5),
    });
  };

  const rows = lines.slice(first, last).map((l, k) => {
    const i = first + k;
    const r = results?.[i];
    return (
      <div
        key={i}
        draggable={!disabled}
        onDragStart={() => setDragFrom(i)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragFrom !== null) move(dragFrom, i);
          setDragFrom(null);
        }}
        style={windowed ? { height: ROW } : undefined}
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-8 text-sm sm:grid-cols-12"
      >
        <label className="sm:col-span-6">
          {t('s09Invoicing.invoices.lineDescription')} {i + 1}
          <Input
            disabled={disabled}
            maxLength={2000}
            value={l.description}
            onChange={(e) => patch(i, { description: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          {t('s09Invoicing.invoices.sku')}
          <Input
            disabled={disabled}
            maxLength={40}
            value={l.sku}
            onChange={(e) => patch(i, { sku: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          {t('s09Invoicing.invoices.quantity')}
          <Input
            disabled={disabled}
            inputMode="decimal"
            maxLength={20}
            value={l.quantity}
            onChange={(e) => patch(i, { quantity: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          {t('s09Invoicing.invoices.unit')}
          <Input
            disabled={disabled}
            maxLength={20}
            value={l.unit}
            onChange={(e) => patch(i, { unit: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          {t('s09Invoicing.invoices.unitPrice')}
          <Input
            disabled={disabled}
            inputMode="decimal"
            maxLength={20}
            value={l.unitPrice}
            onChange={(e) => patch(i, { unitPrice: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          {t('s09Invoicing.invoices.discount')}
          <NativeSelect
            disabled={disabled}
            value={l.discountKind}
            onChange={(e) =>
              patch(i, {
                discountKind:
                  e.target.value === 'percent'
                    ? 'percent'
                    : e.target.value === 'fixed'
                      ? 'fixed'
                      : 'none',
              })
            }
          >
            <option value="none">{t('s09Invoicing.invoices.discountNone')}</option>
            <option value="percent">{t('s09Invoicing.invoices.discountPercent')}</option>
            <option value="fixed">{t('s09Invoicing.invoices.discountFixed')}</option>
          </NativeSelect>
        </label>
        <label className="sm:col-span-2">
          <span className="sr-only">{t('s09Invoicing.invoices.discount')}</span>
          <Input
            disabled={disabled || l.discountKind === 'none'}
            inputMode="decimal"
            maxLength={20}
            value={l.discountValue}
            onChange={(e) => patch(i, { discountValue: e.target.value })}
          />
        </label>
        <fieldset
          className="flex flex-wrap items-center gap-sp-8 sm:col-span-4"
          disabled={disabled}
        >
          <legend className="sr-only">{t('s09Invoicing.invoices.taxes')}</legend>
          {taxCodes.map((c) => (
            <label key={c.code} className="flex items-center gap-sp-4">
              <input
                type="checkbox"
                checked={l.taxCodes.includes(c.code)}
                onChange={() => toggleTax(i, c.code)}
              />
              {c.code}
            </label>
          ))}
          <label className="flex items-center gap-sp-4">
            <input
              type="checkbox"
              checked={l.taxExempt}
              onChange={(e) => patch(i, { taxExempt: e.target.checked })}
            />
            {t('s09Invoicing.invoices.taxExempt')}
          </label>
        </fieldset>
        <p className="self-end text-right font-medium sm:col-span-2">
          {t('s09Invoicing.invoices.lineAmount')}: {r ? formatMoney(Money.parse(r.net)) : '-'}
        </p>
        {disabled ? null : (
          <div className="flex flex-wrap gap-sp-4 sm:col-span-12">
            <Button
              type="button"
              variant="outline"
              onClick={() => move(i, i - 1)}
              aria-label={t('s09Invoicing.invoices.moveUp')}
            >
              {t('s09Invoicing.invoices.moveUp')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => move(i, i + 1)}
              aria-label={t('s09Invoicing.invoices.moveDown')}
            >
              {t('s09Invoicing.invoices.moveDown')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            >
              {t('s09Invoicing.invoices.removeLine')}
            </Button>
          </div>
        )}
      </div>
    );
  });

  if (!windowed) return <div className="space-y-sp-8">{rows}</div>;
  return (
    <div className="space-y-sp-8">
      <p className="text-sm text-muted-foreground">{t('s09Invoicing.invoices.manyLines')}</p>
      <div
        ref={box}
        className="overflow-y-auto"
        style={{ height: VIEW_HEIGHT }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: lines.length * ROW, position: 'relative' }}>
          <div
            style={{ position: 'absolute', top: first * ROW, left: 0, right: 0 }}
            className="space-y-0"
          >
            {rows}
          </div>
        </div>
      </div>
    </div>
  );
}
