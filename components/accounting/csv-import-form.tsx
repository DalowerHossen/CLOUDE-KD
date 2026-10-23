// path: components/accounting/csv-import-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

interface Props {
  endpoint: string;
  help: string;
  submitLabel: string;
  doneText: string;
}

interface Answer {
  created?: number;
  errors?: { line: number; message: string }[];
}

/** A text box (or a chosen file) with the CSV text, sent to an import route; problems are listed with their line number. */
export function CsvImportForm({ endpoint, help, submitLabel, doneText }: Props): JSX.Element {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<{ line: number; message: string }[]>([]);

  async function readFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > 1_000_000) {
      setNotice({ ok: false, text: t('s15Accounting.common.failed') });
      return;
    }
    setCsv(await file.text());
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setProblems([]);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ csv }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as {
        data?: Answer;
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s15Accounting.common.failed'));
      setProblems(json?.data?.errors ?? []);
      setNotice({ ok: true, text: `${doneText} (${json?.data?.created ?? 0})` });
      if ((json?.data?.created ?? 0) > 0) router.refresh();
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
      <p className="text-sm text-muted-foreground">{help}</p>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor={`${endpoint}-file`}>{t('s15Accounting.accounts.csv')}</Label>
        <input
          id={`${endpoint}-file`}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void readFile(e.target.files?.[0])}
        />
        <Textarea
          value={csv}
          rows={6}
          onChange={(e) => setCsv(e.target.value)}
          aria-label={t('s15Accounting.accounts.csv')}
        />
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
      <Button type="submit" disabled={busy || csv.trim() === ''}>
        {submitLabel}
      </Button>
    </form>
  );
}
