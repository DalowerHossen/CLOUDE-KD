// path: components/accounting/statement-import-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

interface Answer {
  imported?: number;
  skipped?: number;
  booked?: number;
  errors?: { line: number; message: string }[];
}

/** Reads a statement file (CSV, OFX or QFX) in the browser and sends its text to the import route. */
export function StatementImportForm({ bankAccountId }: { bankAccountId: string }): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('statement.csv');
  const [text, setText] = useState('');
  const [dateFormat, setDateFormat] = useState('iso');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<{ line: number; message: string }[]>([]);

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice({ ok: false, text: t('s15Accounting.common.failed') });
      return;
    }
    setName(file.name);
    setText(await file.text());
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setProblems([]);
    try {
      const response = await fetch('/api/accounting/reconciliation/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ bankAccountId, fileName: name, text, dateFormat }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        data?: Answer;
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
      const d = json?.data ?? {};
      setProblems(d.errors ?? []);
      setNotice({
        ok: true,
        text: `${t('s15Accounting.reconciliation.imported')}: ${d.imported ?? 0}, ${t('s15Accounting.reconciliation.skipped')}: ${d.skipped ?? 0}, ${t('s15Accounting.reconciliation.booked')}: ${d.booked ?? 0}`,
      });
      setText('');
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s15Accounting.common.failed'),
      });
    }
    setBusy(false);
  }

  return (
    <form className="space-y-sp-8" onSubmit={(e) => void submit(e)} noValidate>
      <p className="text-sm text-muted-foreground">
        {t('s15Accounting.reconciliation.importHelp')}
      </p>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="bs-file">{t('s15Accounting.reconciliation.file')}</Label>
        <input
          id="bs-file"
          type="file"
          accept=".csv,.ofx,.qfx,text/csv"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Textarea
          value={text}
          rows={5}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('s15Accounting.reconciliation.file')}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bs-format">{t('s15Accounting.reconciliation.dateFormat')}</Label>
        <NativeSelect
          id="bs-format"
          value={dateFormat}
          onChange={(e) => setDateFormat(e.target.value)}
        >
          {(['iso', 'mdy', 'dmy'] as const).map((f) => (
            <option key={f} value={f}>
              {t(`s15Accounting.reconciliation.dateFormats.${f}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {problems.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {problems.slice(0, 50).map((p, i) => (
            <li key={`${p.line}-${i}`}>
              {p.line}: {p.message}
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" disabled={busy || text.trim() === ''}>
        {t('s15Accounting.reconciliation.import')}
      </Button>
    </form>
  );
}
