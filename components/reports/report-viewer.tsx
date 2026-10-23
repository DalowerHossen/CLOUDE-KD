// path: components/reports/report-viewer.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { ComparisonRow } from '@/lib/reports/compare';
import { RANGE_KEYS, type RangeKey } from '@/lib/reports/ranges';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export function formatCell(column: ReportColumn, value: string): string {
  if (value === '') return '';
  if (column.type === 'money') return formatMoney(Money.parse(value));
  if (column.type === 'percent') return `${value}%`;
  return value;
}

export interface ViewerProps {
  reportKey: string;
  usesPeriod: boolean;
  groupable: boolean;
  canExport: boolean;
  canSchedule: boolean;
  initial: {
    range: RangeKey | 'custom';
    from: string;
    to: string;
    groupBy: 'project' | 'person';
    compare: boolean;
  };
  result: ReportResult;
  previous: ReportResult | null;
  comparison: ComparisonRow[];
  presets: { id: string; name: string; query: string }[];
}

function queryOf(v: ViewerProps['initial']): string {
  const q = new URLSearchParams();
  if (v.range === 'custom') {
    q.set('from', v.from);
    q.set('to', v.to);
  } else q.set('range', v.range);
  q.set('groupBy', v.groupBy);
  if (v.compare) q.set('compare', 'true');
  return q.toString();
}

export function ReportViewer(p: ViewerProps): JSX.Element {
  const router = useRouter();
  const [v, setV] = useState(p.initial);
  const [presetName, setPresetName] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const r = p.result;

  async function savePreset(): Promise<void> {
    setBusy(true);
    setNote(null);
    const params = {
      ...(v.range === 'custom' ? { from: v.from, to: v.to } : { range: v.range }),
      groupBy: v.groupBy,
      compare: v.compare,
    };
    const res = await callJson('/api/reports/presets', 'POST', {
      reportKey: p.reportKey,
      name: presetName.trim(),
      params,
    });
    if (res.ok) {
      setPresetName('');
      setNote({ ok: true, text: t('s09Reports.presets.saved') });
      router.refresh();
    } else setNote({ ok: false, text: res.message ?? t('s09Reports.schedule.error') });
    setBusy(false);
  }

  async function removePreset(id: string): Promise<void> {
    const res = await callJson(`/api/reports/presets/${id}`, 'DELETE');
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-sp-16 text-sm">
      <form
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/reports/${p.reportKey}?${queryOf(v)}`);
        }}
      >
        {p.usesPeriod ? (
          <>
            <label>
              {t('s09Reports.filters.period')}
              <NativeSelect
                value={v.range}
                onChange={(e) =>
                  setV({ ...v, range: RANGE_KEYS.find((k) => k === e.target.value) ?? 'custom' })
                }
              >
                {RANGE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`s09Dashboard.ranges.${k}` as StringKey)}
                  </option>
                ))}
                <option value="custom">{t('s09Reports.filters.custom')}</option>
              </NativeSelect>
            </label>
            {v.range === 'custom' ? (
              <>
                <label>
                  {t('s09Reports.filters.from')}
                  <Input
                    type="date"
                    required
                    value={v.from}
                    onChange={(e) => setV({ ...v, from: e.target.value })}
                  />
                </label>
                <label>
                  {t('s09Reports.filters.to')}
                  <Input
                    type="date"
                    required
                    value={v.to}
                    onChange={(e) => setV({ ...v, to: e.target.value })}
                  />
                </label>
              </>
            ) : null}
          </>
        ) : (
          <p className="sm:col-span-2 text-muted-foreground">{t('s09Reports.filters.asOf')}</p>
        )}
        {p.groupable ? (
          <label>
            {t('s09Reports.filters.groupBy')}
            <NativeSelect
              value={v.groupBy}
              onChange={(e) =>
                setV({ ...v, groupBy: e.target.value === 'person' ? 'person' : 'project' })
              }
            >
              <option value="project">{t('s09Reports.filters.byProject')}</option>
              <option value="person">{t('s09Reports.filters.byPerson')}</option>
            </NativeSelect>
          </label>
        ) : null}
        {p.usesPeriod ? (
          <label className="flex items-end gap-sp-8 pb-sp-4">
            <input
              type="checkbox"
              checked={v.compare}
              onChange={(e) => setV({ ...v, compare: e.target.checked })}
            />
            {t('s09Reports.filters.compare')}
          </label>
        ) : null}
        <div className="flex items-end">
          <Button type="submit">{t('s09Reports.filters.run')}</Button>
        </div>
      </form>

      {p.canExport ? (
        <div className="flex flex-wrap items-center gap-sp-8 print:hidden">
          <span className="font-medium">{t('s09Reports.export.title')}:</span>
          {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
            <Button key={f} asChild variant="outline">
              <a
                href={`/api/reports/${p.reportKey}/export?${queryOf({ ...v, compare: false })}&format=${f}`}
                download
              >
                {t(`s09Reports.export.${f}`)}
              </a>
            </Button>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="report-title" className="space-y-sp-8">
        <div>
          <h2 id="report-title" className="text-lg font-semibold">
            {r.title}
          </h2>
          <p className="text-muted-foreground">
            {r.period
              ? t('s09Reports.result.period', { from: r.period.from, to: r.period.to })
              : t('s09Reports.filters.asOf')}{' '}
            - {t('s09Reports.result.rows', { count: String(r.rows.length) })}
          </p>
        </div>
        {r.rows.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Reports.result.noRows')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">{r.title}</caption>
              <thead>
                <tr className="border-b text-left">
                  {r.columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={
                        c.type === 'text' || c.type === 'date' ? 'py-sp-4' : 'py-sp-4 text-right'
                      }
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row, i) => (
                  <tr key={i} className="border-b">
                    {r.columns.map((c) => (
                      <td
                        key={c.key}
                        className={
                          c.type === 'text' || c.type === 'date' ? 'py-sp-4' : 'py-sp-4 text-right'
                        }
                      >
                        {formatCell(c, row[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {r.totals ? (
                <tfoot>
                  <tr className="font-semibold">
                    {r.columns.map((c) => (
                      <td
                        key={c.key}
                        className={
                          c.type === 'text' || c.type === 'date' ? 'py-sp-4' : 'py-sp-4 text-right'
                        }
                      >
                        {formatCell(c, r.totals?.[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
        {r.notes.map((n) => (
          <p key={n} className="text-muted-foreground">
            {n}
          </p>
        ))}
      </section>

      {p.previous && p.comparison.length > 0 ? (
        <section className="space-y-sp-4">
          <h3 className="font-medium">
            {t('s09Reports.result.comparison', {
              from: p.previous.period?.from ?? '',
              to: p.previous.period?.to ?? '',
            })}
          </h3>
          <table className="w-full">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-sp-4" />
                <th scope="col" className="text-right">
                  {t('s09Reports.result.colCurrent')}
                </th>
                <th scope="col" className="text-right">
                  {t('s09Reports.result.colPrevious')}
                </th>
                <th scope="col" className="text-right">
                  {t('s09Reports.result.colChange')}
                </th>
              </tr>
            </thead>
            <tbody>
              {p.comparison.map((c) => {
                const col = r.columns.find((x) => x.key === c.key) as ReportColumn;
                return (
                  <tr key={c.key} className="border-b">
                    <th scope="row" className="py-sp-4 text-left font-normal">
                      {c.label}
                    </th>
                    <td className="text-right">{formatCell(col, c.current)}</td>
                    <td className="text-right">{formatCell(col, c.previous)}</td>
                    <td className="text-right">
                      {c.change === null ? t('s09Reports.result.noChange') : `${c.change}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="space-y-sp-8 print:hidden">
        <h3 className="font-medium">{t('s09Reports.presets.title')}</h3>
        {p.presets.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Reports.presets.none')}</p>
        ) : (
          <ul className="space-y-sp-4">
            {p.presets.map((pr) => (
              <li key={pr.id} className="flex flex-wrap items-center gap-sp-8">
                <Link className="underline" href={`/reports/${p.reportKey}?${pr.query}`}>
                  {pr.name}
                </Link>
                <Button type="button" variant="outline" onClick={() => void removePreset(pr.id)}>
                  {t('s09Reports.presets.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-sp-8">
          <label>
            {t('s09Reports.presets.name')}
            <Input
              maxLength={80}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={busy || presetName.trim() === ''}
            onClick={() => void savePreset()}
          >
            {t('s09Reports.presets.save')}
          </Button>
        </div>
        {note ? (
          <p
            role={note.ok ? 'status' : 'alert'}
            className={note.ok ? undefined : 'text-destructive'}
          >
            {note.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
