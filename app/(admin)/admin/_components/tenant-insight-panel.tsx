// path: app/(admin)/admin/_components/tenant-insight-panel.tsx
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import type { TenantInsight } from '@/services/platform/tenant-insight';

const p = (k: string, v?: Record<string, string | number>): string =>
  t(`s16System.insight.${k}` as never, v);

function Figure({ label, value }: { label: string; value: number | string | null }): JSX.Element {
  return (
    <div className="rounded-lg border p-sp-12">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-h4 font-semibold">{value === null ? p('na') : value}</p>
    </div>
  );
}

export function TenantInsightPanel({ data }: { data: TenantInsight }): JSX.Element {
  const { api, email, meters, insight } = data;
  return (
    <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
      <div className="flex flex-wrap items-center justify-between gap-sp-8">
        <h2 className="text-h4 font-semibold">{p('title')}</h2>
        {insight ? (
          <Badge variant={insight.risk === 'high' ? 'destructive' : 'outline'}>
            {p('health')}: {insight.score} / 100 ({p(`risk_${insight.risk}`)})
          </Badge>
        ) : null}
      </div>
      {insight ? (
        insight.reasons.length + insight.signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p('noSignals')}</p>
        ) : (
          <ul className="list-disc pl-sp-16 text-sm">
            {insight.signals.map((s) => (
              <li key={s.key}>
                <strong>{p('churn')}:</strong> {s.text}
              </li>
            ))}
            {insight.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{p('na')}</p>
      )}
      <h3 className="text-sm font-semibold">{p('api')}</h3>
      <div className="grid gap-sp-8 sm:grid-cols-4">
        <Figure label={p('apiToday')} value={api?.requestsToday ?? null} />
        <Figure label={p('api30')} value={api?.requests30d ?? null} />
        <Figure label={p('apiErrors')} value={api?.errors30d ?? null} />
        <Figure label={p('apiKeys')} value={api?.keys ?? null} />
      </div>
      <h3 className="text-sm font-semibold">{p('email')}</h3>
      <div className="grid gap-sp-8 sm:grid-cols-4">
        <Figure label={p('emailSent')} value={email?.sentMonth ?? null} />
        <Figure label={p('emailFailed')} value={email?.failedMonth ?? null} />
        <Figure label={p('emailBounced')} value={email?.bouncedMonth ?? null} />
        <Figure label={p('emailQueued')} value={email?.queued ?? null} />
      </div>
      <h3 className="text-sm font-semibold">{p('quotas')}</h3>
      {meters === null ? (
        <p className="text-sm text-muted-foreground">{p('na')}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {meters.map((m) => (
            <li
              key={m.key}
              className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
            >
              <code>{m.key}</code>
              <span>
                {m.used} / {m.limit === null ? p('unlimited') : m.limit} ({p(`state_${m.state}`)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
