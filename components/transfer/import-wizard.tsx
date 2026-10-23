// path: components/transfer/import-wizard.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { toCsv } from '@/lib/transfer/csv';
import { t, type StringKey } from '@/lib/i18n';
import type { ImportDetail, PreviewResult } from '@/services/import/imports';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const previewBody = z.object({
  data: z.object({
    total: z.number(),
    valid: z.number(),
    invalid: z.number(),
    duplicatesInSystem: z.number(),
    duplicatesInFile: z.number(),
    problems: z.array(z.object({ row: z.number(), messages: z.array(z.string()) })),
    duplicates: z.array(z.object({ row: z.number(), sample: z.string() })),
  }),
});
const MODES = ['skip', 'overwrite', 'create'] as const;
const MODE_LABEL: Record<(typeof MODES)[number], StringKey> = {
  skip: 's08Crm.transfer.modeSkip',
  overwrite: 's08Crm.transfer.modeOverwrite',
  create: 's08Crm.transfer.modeCreate',
};

export function ImportWizard({ detail }: { detail: ImportDetail }): JSX.Element {
  const router = useRouter();
  const [mapping, setMapping] = useState<Record<string, string>>(
    Object.keys(detail.mapping).length > 0 ? detail.mapping : detail.suggested,
  );
  const [mode, setMode] = useState<(typeof MODES)[number]>(detail.duplicateMode);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = detail.status === 'queued' || detail.status === 'running';
  const editable = detail.status === 'uploaded' || detail.status === 'previewed';

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [active, router]);

  async function post(body: unknown): Promise<Response | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/import/${detail.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = errorBody.safeParse(
          await response
            .clone()
            .json()
            .catch(() => null),
        );
        setError(err.success ? err.data.error.message : t('s08Crm.transfer.actionError'));
        setBusy(false);
        return null;
      }
      setBusy(false);
      return response;
    } catch {
      setError(t('s08Crm.transfer.actionError'));
      setBusy(false);
      return null;
    }
  }

  async function check(): Promise<void> {
    const response = await post({ action: 'preview', mapping, duplicateMode: mode });
    if (!response) return;
    const parsed = previewBody.safeParse(await response.json().catch(() => null));
    if (parsed.success) setPreview(parsed.data.data);
    else setError(t('s08Crm.transfer.checkError'));
    router.refresh();
  }

  async function simple(action: 'run' | 'cancel'): Promise<void> {
    if (action === 'cancel' && !window.confirm(t('s08Crm.transfer.confirmCancel'))) return;
    if (await post({ action })) router.refresh();
  }

  function downloadErrors(): void {
    const url = URL.createObjectURL(
      new Blob(
        [
          toCsv([
            [t('s08Crm.transfer.row'), 'Message'],
            ...detail.errors.map((e) => [String(e.row), e.message]),
          ]),
        ],
        { type: 'text/csv;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${detail.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const done = detail.processed;
  return (
    <div className="space-y-sp-16">
      <p className="text-sm">
        {t(`s08Crm.transfer.statuses.${detail.status}` as StringKey)} - {detail.total}{' '}
        {t('s08Crm.transfer.rows')}
      </p>
      {detail.status === 'failed' && detail.errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {t('s08Crm.transfer.stopped', { reason: detail.errorMessage })}
        </p>
      ) : null}
      {editable ? (
        <>
          <section className="space-y-sp-8">
            <h2 className="text-lg font-semibold">{t('s08Crm.transfer.mapTitle')}</h2>
            <p className="text-sm">{t('s08Crm.transfer.mapHelp')}</p>
            <div className="grid gap-sp-8 sm:grid-cols-2">
              {detail.fields.map((f) => (
                <label key={f.key} className="text-sm">
                  {f.label}
                  {f.required ? ' *' : ''}
                  <NativeSelect
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                  >
                    <option value="">{t('s08Crm.transfer.noColumn')}</option>
                    {detail.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="text-left font-medium">{t('s08Crm.transfer.sample')}</caption>
                <thead>
                  <tr className="text-left">
                    {detail.headers.map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.sample.map((r, i) => (
                    <tr key={`${i}-${r.join('|')}`}>
                      {detail.headers.map((h, j) => (
                        <td key={h}>{r[j] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <fieldset className="space-y-sp-4 text-sm">
            <legend className="font-medium">{t('s08Crm.transfer.duplicates')}</legend>
            {MODES.map((m) => (
              <label key={m} className="flex items-center gap-sp-8">
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {t(MODE_LABEL[m])}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-sp-8">
            <Button type="button" disabled={busy} onClick={() => void check()}>
              {busy ? t('s08Crm.transfer.checking') : t('s08Crm.transfer.check')}
            </Button>
            {detail.status === 'previewed' || preview ? (
              <Button type="button" disabled={busy} onClick={() => void simple('run')}>
                {t('s08Crm.transfer.start')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void simple('cancel')}
            >
              {t('s08Crm.transfer.cancel')}
            </Button>
          </div>
          {preview ? (
            <section className="space-y-sp-8 rounded-lg border bg-card p-sp-12 text-sm">
              <h2 className="text-lg font-semibold">{t('s08Crm.transfer.previewTitle')}</h2>
              <p>
                {t('s08Crm.transfer.previewCounts', {
                  valid: preview.valid,
                  invalid: preview.invalid,
                })}
              </p>
              <p>
                {t('s08Crm.transfer.previewDuplicates', {
                  system: preview.duplicatesInSystem,
                  file: preview.duplicatesInFile,
                })}
              </p>
              {preview.problems.length > 0 ? (
                <div>
                  <h3 className="font-medium">{t('s08Crm.transfer.problems')}</h3>
                  <ul className="list-disc pl-sp-16">
                    {preview.problems.map((p) => (
                      <li key={p.row}>
                        {t('s08Crm.transfer.row')} {p.row}: {p.messages.join(' ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.duplicates.length > 0 ? (
                <div>
                  <h3 className="font-medium">{t('s08Crm.transfer.duplicatesList')}</h3>
                  <ul className="list-disc pl-sp-16">
                    {preview.duplicates.map((d) => (
                      <li key={d.row}>
                        {t('s08Crm.transfer.row')} {d.row}: {d.sample}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
      {active ||
      detail.status === 'done' ||
      detail.status === 'failed' ||
      detail.status === 'cancelled' ? (
        <section className="space-y-sp-8 text-sm">
          <progress
            className="w-full"
            max={detail.total}
            value={done}
            aria-label={t('s08Crm.transfer.progress', { done, total: detail.total })}
          />
          <p>{t('s08Crm.transfer.progress', { done, total: detail.total })}</p>
          <ul className="grid grid-cols-2 gap-sp-4 sm:grid-cols-4">
            <li>
              {t('s08Crm.transfer.created')}: {detail.created}
            </li>
            <li>
              {t('s08Crm.transfer.updated')}: {detail.updated}
            </li>
            <li>
              {t('s08Crm.transfer.skipped')}: {detail.skipped}
            </li>
            <li>
              {t('s08Crm.transfer.failed')}: {detail.failed}
            </li>
          </ul>
          {active ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void simple('cancel')}
            >
              {t('s08Crm.transfer.cancel')}
            </Button>
          ) : null}
          {detail.errors.length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold">{t('s08Crm.transfer.errorsTitle')}</h2>
              <ul className="list-disc pl-sp-16">
                {detail.errors.slice(0, 50).map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    {t('s08Crm.transfer.row')} {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" onClick={downloadErrors}>
                {t('s08Crm.transfer.downloadErrors')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
