// path: components/accounting/recurring-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

interface Props {
  accounts: readonly { id: string; label: string }[];
}

/** A recurring entry with one debit account, one credit account and an amount (more lines can be added as a template entry). */
export function RecurringForm({ accounts }: Props): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState({
    name: '',
    memo: '',
    frequency: 'monthly',
    day: '1',
    firstRun: new Date().toISOString().slice(0, 10),
    endDate: '',
    debit: '',
    credit: '',
    amount: '',
    autoPost: false,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof v>): void => setV({ ...v, ...patch });

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/accounting/recurring', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: v.name,
          memo: v.memo,
          frequency: v.frequency,
          dayOfMonth: Number.parseInt(v.day, 10) || 1,
          firstRun: v.firstRun,
          endDate: v.endDate === '' ? null : v.endDate,
          autoPost: v.autoPost,
          lines: [
            { accountId: v.debit, debit: v.amount, credit: '0', description: '' },
            { accountId: v.credit, debit: '0', credit: v.amount, description: '' },
          ],
        }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
      setNotice({ ok: true, text: t('s15Accounting.recurring.created') });
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Accounting.common.failed'),
      });
    }
    setBusy(false);
  }

  const select = (
    id: string,
    label: string,
    value: string,
    onChange: (x: string) => void,
  ): JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">{t('s15Accounting.journals.chooseAccount')}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <form className="space-y-sp-12" onSubmit={(e) => void submit(e)} noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rc-name">{t('s15Accounting.recurring.name')}</Label>
          <Input
            id="rc-name"
            value={v.name}
            maxLength={100}
            onChange={(e) => set({ name: e.target.value })}
            required
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rc-memo">{t('s15Accounting.common.memo')}</Label>
          <Input
            id="rc-memo"
            value={v.memo}
            maxLength={500}
            onChange={(e) => set({ memo: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rc-freq">{t('s15Accounting.recurring.frequency')}</Label>
          <NativeSelect
            id="rc-freq"
            value={v.frequency}
            onChange={(e) => set({ frequency: e.target.value })}
          >
            <option value="monthly">{t('s15Accounting.recurring.frequencies.monthly')}</option>
            <option value="quarterly">{t('s15Accounting.recurring.frequencies.quarterly')}</option>
            <option value="yearly">{t('s15Accounting.recurring.frequencies.yearly')}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rc-day">{t('s15Accounting.recurring.day')}</Label>
          <Input
            id="rc-day"
            inputMode="numeric"
            value={v.day}
            onChange={(e) => set({ day: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rc-first">{t('s15Accounting.recurring.firstRun')}</Label>
          <Input
            id="rc-first"
            type="date"
            value={v.firstRun}
            onChange={(e) => set({ firstRun: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rc-end">{t('s15Accounting.recurring.endDate')}</Label>
          <Input
            id="rc-end"
            type="date"
            value={v.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </div>
        {select('rc-dr', t('s15Accounting.recurring.debitAccount'), v.debit, (x) =>
          set({ debit: x }),
        )}
        {select('rc-cr', t('s15Accounting.recurring.creditAccount'), v.credit, (x) =>
          set({ credit: x }),
        )}
        <div className="space-y-1">
          <Label htmlFor="rc-amt">{t('s15Accounting.recurring.amount')}</Label>
          <Input
            id="rc-amt"
            inputMode="decimal"
            value={v.amount}
            onChange={(e) => set({ amount: e.target.value })}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm" htmlFor="rc-auto">
          <input
            id="rc-auto"
            type="checkbox"
            checked={v.autoPost}
            onChange={(e) => set({ autoPost: e.target.checked })}
          />
          {t('s15Accounting.recurring.autoPost')}
        </label>
      </div>
      <Button type="submit" disabled={busy}>
        {t('s15Accounting.common.save')}
      </Button>
    </form>
  );
}
