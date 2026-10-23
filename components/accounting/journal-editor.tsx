// path: components/accounting/journal-editor.tsx
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

export interface EditorAccount {
  id: string;
  label: string;
}

export interface EditorTemplate {
  id: string;
  name: string;
  memo: string;
  lines: { accountId: string; debit: string; credit: string; description: string }[];
}

interface Line {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

interface Props {
  accounts: readonly EditorAccount[];
  templates: readonly EditorTemplate[];
  /** Staff entries are sent for approval; an owner posts at once. */
  staff: boolean;
  /** When set, a draft is changed (PUT) instead of a new entry made. */
  edit?: { id: string; version: number };
  initial?: { entryDate: string; memo: string; note: string; lines: Line[] };
}

const blank = (): Line => ({ accountId: '', debit: '', credit: '', description: '' });
const num = (v: string): Money => {
  try {
    return Money.parse(v === '' ? '0' : v);
  } catch {
    return Money.zero();
  }
};

function newKey(): string {
  return `ui-${crypto.randomUUID()}`;
}

/** The form for a journal entry: date, memo, lines with live totals, save as draft or post. */
export function JournalEditor({ accounts, templates, staff, edit, initial }: Props): JSX.Element {
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(
    initial?.entryDate ?? new Date().toISOString().slice(0, 10),
  );
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [adjusting, setAdjusting] = useState(false);
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; duplicate?: boolean } | null>(
    null,
  );
  const [templateName, setTemplateName] = useState('');
  const debit = lines.reduce((s, l) => s.add(num(l.debit)), Money.zero());
  const credit = lines.reduce((s, l) => s.add(num(l.credit)), Money.zero());
  const balanced = debit.eq(credit) && debit.isPositive();

  function setLine(i: number, patch: Partial<Line>): void {
    setLines(lines.map((l, at) => (at === i ? { ...l, ...patch } : l)));
  }

  function body(): {
    entryDate: string;
    memo: string;
    note: string;
    lines: Record<string, string>[];
  } {
    return {
      entryDate,
      memo,
      note,
      lines: lines
        .filter((l) => l.accountId !== '')
        .map((l) => ({
          accountId: l.accountId,
          debit: l.debit === '' ? '0' : l.debit,
          credit: l.credit === '' ? '0' : l.credit,
          description: l.description,
        })),
    };
  }

  async function send(mode: 'draft' | 'post', confirmDuplicate: boolean): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = edit
        ? await fetch(`/api/accounting/journals/${edit.id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ version: edit.version, entry: body() }),
            cache: 'no-store',
          })
        : await fetch('/api/accounting/journals', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'idempotency-key': newKey() },
            body: JSON.stringify({ entry: body(), mode, confirmDuplicate, adjusting }),
            cache: 'no-store',
          });
      const json = (await response.json().catch(() => null)) as {
        data?: { id?: string };
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok) {
        if (json?.error?.code === 'duplicate') {
          setNotice({ ok: false, text: t('s15Accounting.journals.duplicate'), duplicate: true });
        } else throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
        setBusy(false);
        return;
      }
      const id = edit?.id ?? json?.data?.id;
      if (edit && mode === 'post') {
        const post = await fetch(`/api/accounting/journals/${edit.id}/post`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': newKey() },
          body: '{}',
          cache: 'no-store',
        });
        if (!post.ok) {
          const err = (await post.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(err?.error?.message ?? t('s15Accounting.common.failed'));
        }
      }
      setNotice({ ok: true, text: t('s15Accounting.journals.saved') });
      router.push(id ? `/accounting/journals/${id}` : '/accounting/journals');
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Accounting.common.failed'),
      });
    }
    setBusy(false);
  }

  async function saveTemplate(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/accounting/journals/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: templateName, memo, lines: body().lines }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
      setNotice({ ok: true, text: t('s15Accounting.journals.saved') });
      setTemplateName('');
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Accounting.common.failed'),
      });
    }
    setBusy(false);
  }

  function applyTemplate(id: string): void {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setMemo(tpl.memo);
    setLines(
      tpl.lines.map((l) => ({
        accountId: l.accountId,
        debit: num(l.debit).isZero() ? '' : l.debit,
        credit: num(l.credit).isZero() ? '' : l.credit,
        description: l.description,
      })),
    );
  }

  return (
    <form
      className="space-y-sp-16"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send('post', false);
      }}
    >
      {notice ? (
        <Alert variant={notice.ok ? 'success' : 'destructive'}>
          {notice.text}
          {notice.duplicate ? (
            <Button
              type="button"
              className="ml-2"
              size="sm"
              variant="outline"
              onClick={() => void send('draft', true)}
            >
              {t('s15Accounting.journals.saveAnyway')}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <div className="grid gap-sp-12 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="je-date">{t('s15Accounting.journals.entryDate')}</Label>
          <Input
            id="je-date"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="je-memo">{t('s15Accounting.common.memo')}</Label>
          <Input
            id="je-memo"
            value={memo}
            maxLength={500}
            onChange={(e) => setMemo(e.target.value)}
            autoComplete="off"
          />
        </div>
        {templates.length > 0 && !edit ? (
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="je-tpl">{t('s15Accounting.journals.useTemplate')}</Label>
            <NativeSelect id="je-tpl" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">{t('s15Accounting.journals.templates')}</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      <fieldset className="space-y-sp-8">
        <legend className="text-lg font-semibold">{t('s15Accounting.journals.lines')}</legend>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-sp-8 rounded-md border p-sp-8 sm:grid-cols-12">
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor={`je-acc-${i}`}>{t('s15Accounting.common.account')}</Label>
              <NativeSelect
                id={`je-acc-${i}`}
                value={l.accountId}
                onChange={(e) => setLine(i, { accountId: e.target.value })}
              >
                <option value="">{t('s15Accounting.journals.chooseAccount')}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`je-dr-${i}`}>{t('s15Accounting.common.debit')}</Label>
              <Input
                id={`je-dr-${i}`}
                inputMode="decimal"
                value={l.debit}
                onChange={(e) =>
                  setLine(i, {
                    debit: e.target.value,
                    credit: e.target.value === '' ? l.credit : '',
                  })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`je-cr-${i}`}>{t('s15Accounting.common.credit')}</Label>
              <Input
                id={`je-cr-${i}`}
                inputMode="decimal"
                value={l.credit}
                onChange={(e) =>
                  setLine(i, {
                    credit: e.target.value,
                    debit: e.target.value === '' ? l.debit : '',
                  })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`je-ds-${i}`}>{t('s15Accounting.common.description')}</Label>
              <Input
                id={`je-ds-${i}`}
                value={l.description}
                maxLength={300}
                onChange={(e) => setLine(i, { description: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="flex items-end sm:col-span-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lines.length <= 2}
                onClick={() => setLines(lines.filter((_, at) => at !== i))}
              >
                {t('s15Accounting.journals.removeLine')}
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={lines.length >= 200}
          onClick={() => setLines([...lines, blank()])}
        >
          {t('s15Accounting.journals.addLine')}
        </Button>
      </fieldset>
      <p
        role="status"
        className={
          balanced ? 'text-sm text-muted-foreground' : 'text-sm font-medium text-destructive'
        }
      >
        {t('s15Accounting.common.debit')} {debit.toDbString()} | {t('s15Accounting.common.credit')}{' '}
        {credit.toDbString()} | {t('s15Accounting.journals.difference')}{' '}
        {debit.sub(credit).abs().toDbString()}.{' '}
        {balanced ? t('s15Accounting.journals.balanced') : t('s15Accounting.journals.unbalanced')}
      </p>
      <div className="space-y-1">
        <Label htmlFor="je-note">{t('s15Accounting.journals.note')}</Label>
        <Input
          id="je-note"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          autoComplete="off"
        />
      </div>
      {!edit ? (
        <label className="flex items-center gap-2 text-sm" htmlFor="je-adj">
          <input
            id="je-adj"
            type="checkbox"
            checked={adjusting}
            onChange={(e) => setAdjusting(e.target.checked)}
          />
          {t('s15Accounting.journals.adjusting')}
        </label>
      ) : null}
      <div className="flex flex-wrap gap-sp-8">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void send('draft', false)}
        >
          {t('s15Accounting.journals.saveDraft')}
        </Button>
        <Button type="submit" disabled={busy || !balanced}>
          {staff ? t('s15Accounting.journals.postStaff') : t('s15Accounting.journals.post')}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-sp-8">
        <div className="space-y-1">
          <Label htmlFor="je-tname">{t('s15Accounting.journals.templateName')}</Label>
          <Input
            id="je-tname"
            value={templateName}
            maxLength={100}
            onChange={(e) => setTemplateName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || templateName.trim() === '' || !balanced}
          onClick={() => void saveTemplate()}
        >
          {t('s15Accounting.journals.saveTemplate')}
        </Button>
      </div>
    </form>
  );
}
