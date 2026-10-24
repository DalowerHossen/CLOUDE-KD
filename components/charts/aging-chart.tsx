// path: components/charts/aging-chart.tsx
'use client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { t } from '@/lib/i18n';
import { plotValue } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface AgingBuckets {
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
}

const KEYS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
const COLORS = ['--chart-2', '--chart-1', '--chart-3', '--chart-4', '--chart-5'] as const;

/** What clients owe, by how late it is. The table under the chart carries the same numbers. */
export function AgingChart({ aging }: { aging: AgingBuckets }): JSX.Element {
  const points = KEYS.map((k, i) => ({
    name: t(`s09Dashboard.aging.${k}`),
    value: plotValue(aging[k]),
    color: COLORS[i] ?? '--chart-1',
  }));
  return (
    <div>
      <div role="img" aria-label={t('s09Dashboard.aging.label')} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={56} />
            <Tooltip />
            <Bar dataKey="value" name={t('s09Dashboard.aging.owed')}>
              {points.map((p) => (
                <Cell key={p.name} fill={`hsl(var(${p.color}))`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('s09Dashboard.aging.label')}</caption>
        <tbody>
          {KEYS.map((k) => (
            <tr key={k}>
              <th scope="row">{t(`s09Dashboard.aging.${k}`)}</th>
              <td>{formatMoney(Money.parse(aging[k]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
