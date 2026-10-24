// path: components/charts/sent-vs-paid-chart.tsx
'use client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { t } from '@/lib/i18n';
import { plotValue } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface SeriesRow {
  month: string;
  invoiced: string;
  collected: string;
}

/** Invoiced against collected for each month. The chart is for the eye; the table under it carries the same numbers. */
export function SentVsPaidChart({ data }: { data: SeriesRow[] }): JSX.Element {
  // Chart libraries draw with plain numbers. These are only heights of bars; every amount shown as text comes from Money.
  const points = data.map((d) => ({
    month: d.month,
    invoiced: plotValue(d.invoiced),
    collected: plotValue(d.collected),
  }));
  return (
    <div>
      <div role="img" aria-label={t('s09Dashboard.chart.label')} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={56} />
            <Tooltip />
            <Legend />
            <Bar
              dataKey="invoiced"
              name={t('s09Dashboard.chart.invoiced')}
              fill="hsl(var(--chart-1))"
            />
            <Bar
              dataKey="collected"
              name={t('s09Dashboard.chart.collected')}
              fill="hsl(var(--chart-2))"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('s09Dashboard.chart.label')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('s09Dashboard.chart.month')}</th>
            <th scope="col">{t('s09Dashboard.chart.invoiced')}</th>
            <th scope="col">{t('s09Dashboard.chart.collected')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.month}</th>
              <td>{formatMoney(Money.parse(d.invoiced))}</td>
              <td>{formatMoney(Money.parse(d.collected))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
