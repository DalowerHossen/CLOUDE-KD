// path: components/accounting/expense-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';

interface Props {
  categories: readonly { id: string; label: string }[];
  isOwner: boolean;
}

interface Ocr {
  vendor?: string;
  date?: string;
  total?: string;
  tax?: string;
}

const TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 8 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function money(v: string): Money {
  try {
    return Money.parse(v === '' ? '0' : v);
  } catch {
    return Money.zero();
  }
}

/** The new-expense form: details, a receipt upload with what the OCR read, the total, and a "save anyway" for duplicates. */
export function ExpenseForm({ categories, isOwner }: Props): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryId: '',
    vendor: '',
    description: '',
    amountNet: '',
    taxAmount: '',
    reimbursable: false,
    paid: false,
    paidVia: 'bank',
    overrideReason: '',
  });
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; duplicate?: boolean } | null>(
    null,
  );
  const set = (patch: Partial<typeof v>): void => setV({ ...v, ...patch });
  const total = money(v.amountNet).add(money(v.taxAmount));

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setNotice(null);
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setNotice({ ok: false, text: t('s15Expenses.form.receipt') });
      return;
    }
    try {
      const response = await fetch('/api/expenses/receipts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type,
          dataBase64: toBase64(new Uint8Array(await file.arrayBuffer())),
        }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { id?: string; ocr?: Ocr | null };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data?.id)
        throw new Error(json?.error?.message ?? t('s15Expenses.common.failed'));
      setReceiptId(json.data.id);
      setOcr(json.data.ocr ?? null);
      setNotice({ ok: true, text: t('s15Expenses.form.receiptAdded') });
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Expenses.common.failed'),
      });
    }
  }

  async function save(confirmDuplicate: boolean): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          expense: {
            expenseDate: v.expenseDate,
            categoryId: v.categoryId === '' ? null : v.categoryId,
            vendor: v.vendor,
            description: v.description,
            amountNet: v.amountNet,
            taxAmount: v.taxAmount === '' ? '0' : v.taxAmount,
            reimbursable: v.reimbursable,
            paid: v.paid,
            paidVia: v.paid ? v.paidVia : null,
            receiptId,
            overrideReason: v.overrideReason,
          },
          confirmDuplicate,
        }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { id?: string };
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok) {
        if (json?.error?.code === 'duplicate') {
          setNotice({ ok: false, text: t('s15Expenses.form.duplicateAsk'), duplicate: true });
          setBusy(false);
          return;
        }
        throw new Error(json?.error?.message ?? t('s15Expenses.common.failed'));
      }
      router.push(json?.data?.id ? `/expenses/${json.data.id}` : '/expenses');
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Expenses.common.failed'),
      });
    }
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-12"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      {notice ? (
        <Alert variant={notice.ok ? 'success' : 'destructive'}>
          {notice.text}
          {notice.duplicate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-2"
              onClick={() => void save(true)}
            >
              {t('s15Expenses.form.saveAnyway')}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="ex-receipt">{t('s15Expenses.form.receipt')}</Label>
        <input
          id="ex-receipt"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {ocr ? (
          <p className="text-sm text-muted-foreground">
            {t('s15Expenses.form.ocrSuggestion')}:{' '}
            {[ocr.vendor, ocr.date, ocr.total ? `${ocr.total} USD` : '']
              .filter(Boolean)
              .join(' | ')}{' '}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                set({
                  vendor: ocr.vendor ?? v.vendor,
                  expenseDate: ocr.date ?? v.expenseDate,
                  amountNet:
                    ocr.total && ocr.tax
                      ? money(ocr.total).sub(ocr.tax).toDbString()
                      : (ocr.total ?? v.amountNet),
                  taxAmount: ocr.tax ?? v.taxAmount,
                })
              }
            >
              {t('s15Expenses.form.useSuggestion')}
            </Button>
          </p>
        ) : null}
      </div>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ex-date">{t('s15Expenses.form.date')}</Label>
          <Input
            id="ex-date"
            type="date"
            value={v.expenseDate}
            onChange={(e) => set({ expenseDate: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-cat">{t('s15Expenses.form.category')}</Label>
          <NativeSelect
            id="ex-cat"
            value={v.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
          >
            <option value="">{t('s15Expenses.form.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-vendor">{t('s15Expenses.form.vendor')}</Label>
          <Input
            id="ex-vendor"
            value={v.vendor}
            maxLength={120}
            onChange={(e) => set({ vendor: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-desc">{t('s15Expenses.form.description')}</Label>
          <Input
            id="ex-desc"
            value={v.description}
            maxLength={500}
            onChange={(e) => set({ description: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-net">{t('s15Expenses.form.net')}</Label>
          <Input
            id="ex-net"
            inputMode="decimal"
            value={v.amountNet}
            onChange={(e) => set({ amountNet: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-tax">{t('s15Expenses.form.tax')}</Label>
          <Input
            id="ex-tax"
            inputMode="decimal"
            value={v.taxAmount}
            onChange={(e) => set({ taxAmount: e.target.value })}
          />
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {t('s15Expenses.form.total')}: {total.toDbString()} USD
      </p>
      <label className="flex items-center gap-2 text-sm" htmlFor="ex-reimb">
        <input
          id="ex-reimb"
          type="checkbox"
          checked={v.reimbursable}
          onChange={(e) =>
            set({ reimbursable: e.target.checked, paid: e.target.checked ? false : v.paid })
          }
        />
        {t('s15Expenses.form.reimbursable')}
      </label>
      <label className="flex items-center gap-2 text-sm" htmlFor="ex-paid">
        <input
          id="ex-paid"
          type="checkbox"
          checked={v.paid}
          disabled={v.reimbursable}
          onChange={(e) => set({ paid: e.target.checked })}
        />
        {t('s15Expenses.form.paid')}
      </label>
      {v.paid ? (
        <div className="space-y-1">
          <Label htmlFor="ex-via">{t('s15Expenses.form.paidVia')}</Label>
          <NativeSelect
            id="ex-via"
            value={v.paidVia}
            onChange={(e) => set({ paidVia: e.target.value })}
          >
            {(['bank', 'cash', 'card'] as const).map((x) => (
              <option key={x} value={x}>
                {t(`s15Expenses.form.vias.${x}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      {isOwner ? (
        <div className="space-y-1">
          <Label htmlFor="ex-override">{t('s15Expenses.form.override')}</Label>
          <Input
            id="ex-override"
            value={v.overrideReason}
            maxLength={300}
            onChange={(e) => set({ overrideReason: e.target.value })}
            autoComplete="off"
          />
        </div>
      ) : null}
      <Button type="submit" disabled={busy || !total.isPositive()}>
        {t('s15Expenses.form.save')}
      </Button>
    </form>
  );
}
