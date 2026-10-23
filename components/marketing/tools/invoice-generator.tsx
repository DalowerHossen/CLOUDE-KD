// path: components/marketing/tools/invoice-generator.tsx
'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { trackConversion } from '@/lib/analytics/start-provider';
import { formatUsd, invoiceTotals, type InvoiceLine } from '@/lib/marketing/tools';
import { Money } from '@/lib/utils/currency';
import { t } from '@/lib/i18n';
import { NativeSelect } from '@/components/ui/native-select';

const STYLES = {
  classic: 'border-2 border-foreground/70 font-serif',
  modern: 'border-t-8 border-primary font-sans',
  minimal: 'border font-sans',
} as const;
type Style = keyof typeof STYLES;

/** Free invoice generator: runs in the browser, stores nothing, and prints or saves as PDF through the browser. */
export function InvoiceGenerator(): JSX.Element {
  const [style, setStyle] = useState<Style>('modern');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [number, setNumber] = useState('INV-001');
  const [date, setDate] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [lines, setLines] = useState<InvoiceLine[]>([
    { description: '', quantity: '1', unitPrice: '0' },
  ]);
  const [counted, setCounted] = useState(false);
  const totals = useMemo(() => invoiceTotals(lines, discount, tax), [lines, discount, tax]);

  function setLine(i: number, patch: Partial<InvoiceLine>): void {
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function print(): void {
    if (!counted) {
      setCounted(true);
      trackConversion('free_tool_used');
    }
    window.print();
  }

  return (
    <div className="grid gap-sp-24 lg:grid-cols-2">
      <form
        className="no-print space-y-sp-12"
        aria-label={t('s06Public.tools.invoice.form')}
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.invoice.style')}</span>
          <NativeSelect value={style} onChange={(e) => setStyle(e.target.value as Style)}>
            <option value="modern">{t('s06Public.tools.invoice.modern')}</option>
            <option value="classic">{t('s06Public.tools.invoice.classic')}</option>
            <option value="minimal">{t('s06Public.tools.invoice.minimal')}</option>
          </NativeSelect>
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.invoice.from')}</span>
          <Textarea
            value={from}
            rows={3}
            maxLength={400}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.invoice.to')}</span>
          <Textarea value={to} rows={3} maxLength={400} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="grid gap-sp-12 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.tools.invoice.number')}</span>
            <Input value={number} maxLength={30} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.tools.invoice.date')}</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.tools.invoice.due')}</span>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <fieldset className="space-y-sp-12">
          <legend className="text-sm font-medium">{t('s06Public.tools.invoice.items')}</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_auto]">
              <Input
                aria-label={t('s06Public.tools.invoice.itemDescription')}
                placeholder={t('s06Public.tools.invoice.itemDescription')}
                value={l.description}
                maxLength={120}
                onChange={(e) => setLine(i, { description: e.target.value })}
              />
              <Input
                aria-label={t('s06Public.tools.invoice.quantity')}
                inputMode="decimal"
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
              />
              <Input
                aria-label={t('s06Public.tools.invoice.price')}
                inputMode="decimal"
                value={l.unitPrice}
                onChange={(e) => setLine(i, { unitPrice: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                {t('s06Public.cms.remove')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lines.length >= 30}
            onClick={() => setLines([...lines, { description: '', quantity: '1', unitPrice: '0' }])}
          >
            {t('s06Public.cms.addItem')}
          </Button>
        </fieldset>
        <div className="grid gap-sp-12 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.tools.invoice.discount')}</span>
            <Input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.tools.invoice.tax')}</span>
            <Input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>{t('s06Public.tools.invoice.notes')}</span>
          <Textarea
            value={notes}
            rows={3}
            maxLength={600}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {totals === null ? (
          <p role="alert" className="text-sm text-destructive">
            {t('s06Public.tools.invalid')}
          </p>
        ) : null}
        <Button type="button" disabled={totals === null} onClick={print}>
          {t('s06Public.tools.invoice.print')}
        </Button>
        <p className="text-caption text-muted-foreground">{t('s06Public.tools.invoice.privacy')}</p>
      </form>
      <section
        aria-label={t('s06Public.tools.invoice.preview')}
        className={`space-y-sp-16 bg-white p-sp-24 text-black ${STYLES[style]}`}
      >
        <header className="flex justify-between gap-sp-16">
          <h2 className="text-h2 font-bold">{t('s06Public.tools.invoice.title')}</h2>
          <dl className="text-right text-sm">
            <dt className="sr-only">{t('s06Public.tools.invoice.number')}</dt>
            <dd className="font-semibold">{number}</dd>
            {date ? <dd>{date}</dd> : null}
            {due ? <dd>{t('s06Public.tools.invoice.dueOn', { date: due })}</dd> : null}
          </dl>
        </header>
        <div className="grid gap-sp-12 text-sm sm:grid-cols-2">
          <p className="whitespace-pre-line">{from}</p>
          <p className="whitespace-pre-line">{to}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1">{t('s06Public.tools.invoice.itemDescription')}</th>
              <th className="py-1 text-right">{t('s06Public.tools.invoice.quantity')}</th>
              <th className="py-1 text-right">{t('s06Public.tools.invoice.price')}</th>
              <th className="py-1 text-right">{t('s06Public.tools.invoice.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {(totals?.lines ?? []).map((l, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{l.description}</td>
                <td className="py-1 text-right">{l.quantity}</td>
                <td className="py-1 text-right">{formatUsd(Money.parseRounded(l.unitPrice))}</td>
                <td className="py-1 text-right">{formatUsd(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totals ? (
          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>{t('s06Public.tools.invoice.subtotal')}</dt>
              <dd>{formatUsd(totals.subtotal)}</dd>
            </div>
            {!totals.discount.isZero() ? (
              <div className="flex justify-between">
                <dt>{t('s06Public.tools.invoice.discount')}</dt>
                <dd>-{formatUsd(totals.discount)}</dd>
              </div>
            ) : null}
            {!totals.tax.isZero() ? (
              <div className="flex justify-between">
                <dt>{t('s06Public.tools.invoice.tax')}</dt>
                <dd>{formatUsd(totals.tax)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <dt>{t('s06Public.tools.invoice.total')}</dt>
              <dd>{formatUsd(totals.total)}</dd>
            </div>
          </dl>
        ) : null}
        {notes ? <p className="whitespace-pre-line text-sm">{notes}</p> : null}
      </section>
    </div>
  );
}
