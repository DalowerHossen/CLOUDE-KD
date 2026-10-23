// path: components/charts/dashboard-board.tsx
'use client';
import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { AgingChart } from '@/components/charts/aging-chart';
import { SentVsPaidChart } from '@/components/charts/sent-vs-paid-chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, type StringKey } from '@/lib/i18n';
import { RANGE_KEYS, type RangeKey } from '@/lib/reports/ranges';
import { moveWidget, type WidgetId, type WidgetState } from '@/lib/reports/widgets';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import type { DashboardData, InvoiceLine } from '@/services/report/dashboard';

const money = (v: string): string => formatMoney(Money.parse(v));
const searchBody = z.object({
  data: z.array(
    z.object({
      kind: z.string(),
      id: z.string(),
      title: z.string(),
      subtitle: z.string(),
      href: z.string(),
    }),
  ),
});
const clientBody = z.object({
  data: z.object({ rows: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

export interface QuickActions {
  invoice: boolean;
  estimate: boolean;
  project: boolean;
  time: boolean;
  client: boolean;
  bill: boolean;
}

export interface TimeSummary {
  hoursThisWeek: string;
  waiting: number;
}

function Widget({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  async function toggle(): Promise<void> {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      setFull(false);
    } else {
      await el
        .requestFullscreen()
        .then(() => setFull(true))
        .catch(() => undefined);
    }
  }
  return (
    <section
      ref={ref}
      id={`widget-${id}`}
      aria-labelledby={`widget-${id}-title`}
      className="space-y-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
    >
      <div className="flex items-center justify-between gap-sp-8">
        <h2 id={`widget-${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <Button
          type="button"
          variant="outline"
          onClick={() => void toggle()}
          className="print:hidden"
        >
          {full ? t('s09Dashboard.fullscreen.exit') : t('s09Dashboard.fullscreen.enter')}
        </Button>
      </div>
      {children}
    </section>
  );
}

function InvoiceList({
  rows,
  hint,
}: {
  rows: InvoiceLine[];
  hint: (r: InvoiceLine) => string;
}): JSX.Element {
  if (rows.length === 0)
    return <p className="text-muted-foreground">{t('s09Dashboard.attention.none')}</p>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-sp-8 py-sp-4">
          <Link className="underline" href={`/invoices/${r.id}`}>
            {r.number ?? t('s09Dashboard.recent.draft')} - {r.client}
          </Link>
          <span>
            {money(r.balance)} <span className="text-muted-foreground">{hint(r)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SearchBox(): JSX.Element {
  const [hits, setHits] = useState<
    { kind: string; id: string; title: string; subtitle: string; href: string }[] | null
  >(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  async function run(text: string): Promise<void> {
    if (text.trim().length < 2) {
      setHits(null);
      return;
    }
    const q = new URLSearchParams({ q: text.trim() }).toString();
    const [mine, theirs] = await Promise.all([
      fetch(`/api/reports/search?${q}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/clients?${q}`)
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const a = searchBody.safeParse(mine);
    const b = clientBody.safeParse(theirs);
    setHits(a.success ? a.data.data : []);
    setClients(b.success ? b.data.data.rows.slice(0, 5) : []);
  }
  return (
    <div className="space-y-sp-8">
      <label className="block">
        <span className="sr-only">{t('s09Dashboard.search.label')}</span>
        <Input
          type="search"
          maxLength={60}
          placeholder={t('s09Dashboard.search.placeholder')}
          onChange={(e) => void run(e.target.value)}
        />
      </label>
      {hits ? (
        hits.length === 0 && clients.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Dashboard.search.none')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link className="block px-sp-8 py-sp-4 hover:bg-muted" href={h.href}>
                  <span className="text-muted-foreground">
                    {t(`s09Dashboard.search.kinds.${h.kind}` as StringKey)}
                  </span>{' '}
                  {h.title}
                  <span className="block text-muted-foreground">{h.subtitle}</span>
                </Link>
              </li>
            ))}
            {clients.map((c) => (
              <li key={c.id}>
                <Link className="block px-sp-8 py-sp-4 hover:bg-muted" href={`/clients/${c.id}`}>
                  <span className="text-muted-foreground">{t('s09Dashboard.search.clients')}</span>{' '}
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function DashboardBoard({
  data,
  widgets,
  quick,
  time,
}: {
  data: DashboardData;
  widgets: WidgetState[];
  quick: QuickActions;
  time: TimeSummary;
}): JSX.Element {
  const router = useRouter();
  const [layout, setLayout] = useState<WidgetState[]>(widgets);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const s = data.stats;
  const empty =
    s.invoicedCount === 0 && s.outstandingCount === 0 && s.drafts === 0 && data.recent.length === 0;

  async function persist(next: WidgetState[]): Promise<void> {
    setLayout(next);
    const r = await callJson('/api/reports/dashboard/layout', 'PUT', { widgets: next });
    setNote(
      r.ok
        ? { ok: true, text: t('s09Dashboard.customize.saved') }
        : { ok: false, text: t('s09Dashboard.customize.error') },
    );
  }

  const card = (
    label: string,
    value: string,
    hint: string,
    change?: string | null,
  ): JSX.Element => (
    <div className="rounded-lg border p-sp-12">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground">{hint}</p>
      {change !== undefined ? (
        <p className="text-muted-foreground">
          {change === null
            ? t('s09Dashboard.cards.noPrevious')
            : t('s09Dashboard.cards.vsPrevious', { percent: change })}
        </p>
      ) : null}
    </div>
  );

  const body = (id: WidgetId): JSX.Element | null => {
    switch (id) {
      case 'search':
        return <SearchBox />;
      case 'quick':
        return (
          <div className="flex flex-wrap gap-sp-8">
            {quick.invoice ? (
              <Button asChild>
                <Link href="/invoices/new">{t('s09Dashboard.quick.newInvoice')}</Link>
              </Button>
            ) : null}
            {quick.estimate ? (
              <Button asChild variant="outline">
                <Link href="/estimates/new">{t('s09Dashboard.quick.newEstimate')}</Link>
              </Button>
            ) : null}
            {quick.client ? (
              <Button asChild variant="outline">
                <Link href="/clients/new">{t('s09Dashboard.quick.newClient')}</Link>
              </Button>
            ) : null}
            {quick.project ? (
              <Button asChild variant="outline">
                <Link href="/projects/new">{t('s09Dashboard.quick.newProject')}</Link>
              </Button>
            ) : null}
            {quick.time ? (
              <Button asChild variant="outline">
                <Link href="/timesheets">{t('s09Dashboard.quick.logTime')}</Link>
              </Button>
            ) : null}
            {quick.bill ? (
              <Button asChild variant="outline">
                <Link href="/projects/unbilled">{t('s09Dashboard.quick.unbilled')}</Link>
              </Button>
            ) : null}
          </div>
        );
      case 'cards':
        return empty ? (
          <p className="text-muted-foreground">{t('s09Dashboard.empty')}</p>
        ) : (
          <div className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-4">
            {card(
              t('s09Dashboard.cards.invoiced'),
              money(s.invoiced),
              t('s09Dashboard.cards.invoices', { count: String(s.invoicedCount) }),
              data.change.invoiced,
            )}
            {card(
              t('s09Dashboard.cards.collected'),
              money(s.collected),
              t('s09Dashboard.cards.credited', { amount: money(s.credited) }),
              data.change.collected,
            )}
            {card(
              t('s09Dashboard.cards.outstanding'),
              money(s.outstanding),
              t('s09Dashboard.cards.open', { count: String(s.outstandingCount) }),
            )}
            {card(
              t('s09Dashboard.cards.overdue'),
              money(s.overdue),
              t('s09Dashboard.cards.late', { count: String(s.overdueCount) }),
            )}
          </div>
        );
      case 'chart':
        return <SentVsPaidChart data={data.series} />;
      case 'aging':
        return <AgingChart aging={s.aging} />;
      case 'attention':
        return (
          <div className="grid gap-sp-12 md:grid-cols-2">
            <div>
              <h3 className="font-medium">{t('s09Dashboard.attention.overdue')}</h3>
              <InvoiceList
                rows={data.attention.overdue}
                hint={(r) => t('s09Dashboard.attention.due', { date: r.dueDate })}
              />
            </div>
            <div>
              <h3 className="font-medium">{t('s09Dashboard.attention.dueSoon')}</h3>
              <InvoiceList
                rows={data.attention.dueSoon}
                hint={(r) => t('s09Dashboard.attention.due', { date: r.dueDate })}
              />
            </div>
          </div>
        );
      case 'recent':
        return (
          <div className="grid gap-sp-12 md:grid-cols-2">
            <div>
              <h3 className="font-medium">{t('s09Dashboard.recent.invoices')}</h3>
              {data.recent.length === 0 ? (
                <p className="text-muted-foreground">{t('s09Dashboard.recent.none')}</p>
              ) : (
                <ul className="divide-y">
                  {data.recent.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-sp-8 py-sp-4"
                    >
                      <Link className="underline" href={`/invoices/${r.id}`}>
                        {r.number ?? t('s09Dashboard.recent.draft')} - {r.client}
                      </Link>
                      <span>{money(r.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-medium">{t('s09Dashboard.recent.payments')}</h3>
              {data.payments.length === 0 ? (
                <p className="text-muted-foreground">{t('s09Dashboard.recent.none')}</p>
              ) : (
                <ul className="divide-y">
                  {data.payments.map((p) => (
                    <li key={p.id} className="py-sp-4">
                      <Link className="underline" href={`/invoices/${p.invoiceId}`}>
                        {t('s09Dashboard.recent.paymentLine', {
                          amount: money(p.amount),
                          number: p.number ?? '',
                        })}
                      </Link>{' '}
                      <time dateTime={p.at} className="text-muted-foreground">
                        {p.at.slice(0, 10)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      case 'time':
        return (
          <div className="space-y-sp-4">
            <p>{t('s09Dashboard.time.thisWeek', { hours: time.hoursThisWeek })}</p>
            {time.waiting > 0 ? (
              <p>{t('s09Dashboard.time.waiting', { count: String(time.waiting) })}</p>
            ) : null}
            <Link className="underline" href="/timesheets">
              {t('s09Dashboard.time.open')}
            </Link>
          </div>
        );
    }
  };

  const shown = editing ? layout : layout.filter((w) => w.visible);
  return (
    <div className="space-y-sp-16">
      <div className="flex flex-wrap items-center justify-between gap-sp-8 print:hidden">
        <nav aria-label={t('s09Dashboard.rangeLabel')} className="flex flex-wrap gap-sp-8 text-sm">
          {RANGE_KEYS.map((k: RangeKey) => (
            <Link
              key={k}
              href={`/dashboard?range=${k}`}
              aria-current={k === data.range ? 'page' : undefined}
              className={k === data.range ? 'font-semibold underline' : 'underline'}
            >
              {t(`s09Dashboard.ranges.${k}` as StringKey)}
            </Link>
          ))}
        </nav>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing(!editing);
            setNote(null);
            if (editing) router.refresh();
          }}
        >
          {editing ? t('s09Dashboard.customize.done') : t('s09Dashboard.customize.open')}
        </Button>
      </div>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
      <div className="grid gap-sp-16">
        {shown.map((w, i) => (
          <div key={w.id} className={w.visible ? undefined : 'opacity-60'}>
            {editing ? (
              <div className="mb-sp-4 flex flex-wrap items-center gap-sp-8 text-sm">
                <span className="font-medium">
                  {t(`s09Dashboard.widgets.${w.id}` as StringKey)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={i === 0}
                  onClick={() => void persist(moveWidget(layout, w.id, -1))}
                >
                  {t('s09Dashboard.customize.up')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={i === shown.length - 1}
                  onClick={() => void persist(moveWidget(layout, w.id, 1))}
                >
                  {t('s09Dashboard.customize.down')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void persist(
                      layout.map((x) => (x.id === w.id ? { ...x, visible: !x.visible } : x)),
                    )
                  }
                >
                  {w.visible ? t('s09Dashboard.customize.hide') : t('s09Dashboard.customize.show')}
                </Button>
              </div>
            ) : null}
            <Widget id={w.id} title={t(`s09Dashboard.widgets.${w.id}` as StringKey)}>
              {body(w.id)}
            </Widget>
          </div>
        ))}
      </div>
    </div>
  );
}
