// path: components/marketing/status-view.tsx
import { t } from '@/lib/i18n';
import {
  dayBars,
  overallLevel,
  uptimePercent,
  type Level,
  type PublicIncident,
} from '@/lib/support/status';
import type { StatusData } from '@/services/help/status';

const COLOR: Record<Level, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  outage: 'bg-red-600',
};
const utc = (v: string): string => v.replace('T', ' ').slice(0, 16);

function Bars({ incidents }: { incidents: PublicIncident[] }): JSX.Element {
  const bars = dayBars(incidents, 90);
  return (
    <div
      className="flex h-8 items-end gap-px"
      role="img"
      aria-label={t('s06Public.status.barsLabel')}
    >
      {bars.map((b) => (
        <span
          key={b.day}
          title={`${b.day}: ${t(`s06Public.status.level.${b.level}`)}`}
          className={`h-full flex-1 rounded-sm ${COLOR[b.level]}`}
        />
      ))}
    </div>
  );
}

export function StatusView({ data }: { data: StatusData }): JSX.Element {
  const open = data.incidents.filter((i) => i.state !== 'resolved');
  const level = overallLevel(open, data.databaseOk);
  const services: { name: string; level: Level }[] = [
    { name: t('s06Public.status.web'), level: 'operational' },
    { name: t('s06Public.status.database'), level: data.databaseOk ? 'operational' : 'outage' },
  ];
  return (
    <div className="space-y-sp-32">
      <section aria-live="polite" className={`rounded-lg p-sp-24 text-white ${COLOR[level]}`}>
        <h2 className="text-h3 font-semibold">{t(`s06Public.status.overall.${level}`)}</h2>
        <p className="text-sm">{t('s06Public.status.checked', { time: utc(data.checkedAt) })}</p>
      </section>
      <section aria-labelledby="svc" className="space-y-sp-12">
        <h2 id="svc" className="text-h3 font-semibold">
          {t('s06Public.status.services')}
        </h2>
        <ul className="divide-y rounded-lg border">
          {services.map((s) => (
            <li key={s.name} className="flex items-center justify-between p-sp-12">
              <span>{s.name}</span>
              <span className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className={`h-3 w-3 rounded-full ${COLOR[s.level]}`} />
                {t(`s06Public.status.level.${s.level}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {data.historyOk ? (
        <section aria-labelledby="hist" className="space-y-sp-12">
          <h2 id="hist" className="text-h3 font-semibold">
            {t('s06Public.status.history')}
          </h2>
          <Bars incidents={data.incidents} />
          <p className="text-sm text-muted-foreground">
            {t('s06Public.status.uptime', { percent: uptimePercent(data.incidents, 90) })}
          </p>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{t('s06Public.status.historyDown')}</p>
      )}
      <section aria-labelledby="inc" className="space-y-sp-12">
        <h2 id="inc" className="text-h3 font-semibold">
          {t('s06Public.status.incidents')}
        </h2>
        {data.incidents.length === 0 ? (
          <p className="text-muted-foreground">{t('s06Public.status.none')}</p>
        ) : (
          <ul className="space-y-sp-12">
            {data.incidents.map((i) => (
              <li key={i.number} className="rounded-lg border p-sp-12 text-sm">
                <p className="font-medium">{i.title}</p>
                <p className="text-muted-foreground">
                  {t(`s06Public.status.state.${i.state}`)} - {utc(i.startedAt)}
                  {i.resolvedAt
                    ? ` - ${t('s06Public.status.resolvedAt', { time: utc(i.resolvedAt) })}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
