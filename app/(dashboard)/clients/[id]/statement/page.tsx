// path: app/(dashboard)/clients/[id]/statement/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatementMailButton } from '@/components/crm/statement-mail-button';
import { PrintButton } from '@/components/crm/print-button';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AGING_BUCKETS } from '@/lib/crm/aging';
import { statementQuery } from '@/lib/crm/search';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { statementData, type StatementData } from '@/services/client/statement';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client statement' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: string): string => formatMoney(Money.parse(v));

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.read', 'tenant', 'client');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const parsed = statementQuery.safeParse({ from: sp.from ?? yearStart, to: sp.to ?? today });
  const range = parsed.success ? parsed.data : { from: yearStart, to: today };
  let data: StatementData;
  try {
    data = await statementData(actor.companyId as string, id, range);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16 print:max-w-none">
      <PageHeader
        title={t('s08Crm.statement.title', { name: data.client.name })}
        actions={
          <Link className="underline print:hidden" href={`/clients/${id}`}>
            {t('s08Crm.clients.back')}
          </Link>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-sp-8 text-sm print:hidden">
        <label>
          <span className="block">{t('s08Crm.statement.from')}</span>
          <Input type="date" name="from" defaultValue={range.from} />
        </label>
        <label>
          <span className="block">{t('s08Crm.statement.to')}</span>
          <Input type="date" name="to" defaultValue={range.to} />
        </label>
        <Button type="submit">{t('s08Crm.statement.show')}</Button>
      </form>
      <p className="text-sm">
        {t('s08Crm.statement.opening')}: <strong>{money(data.openingBalance)}</strong>
      </p>
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{t('s08Crm.statement.open')}</h2>
        {data.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('s08Crm.statement.noDocuments')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>{t('s08Crm.statement.number')}</th>
                <th>{t('s08Crm.statement.issued')}</th>
                <th>{t('s08Crm.statement.due')}</th>
                <th className="text-right">{t('s08Crm.statement.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.documents.map((d) => (
                <tr key={d.number}>
                  <td>{d.number}</td>
                  <td>{d.issuedOn}</td>
                  <td>{d.dueOn}</td>
                  <td className="text-right">{money(d.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {data.payments.length > 0 ? (
        <section className="space-y-sp-8">
          <h2 className="text-h4 font-semibold">{t('s08Crm.statement.payments')}</h2>
          <table className="w-full text-sm">
            <tbody>
              {data.payments.map((p, i) => (
                <tr key={`${p.reference}-${i}`}>
                  <td>{p.on}</td>
                  <td>{p.reference}</td>
                  <td className="text-right">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section className="space-y-sp-8">
        <h2 className="text-h4 font-semibold">{t('s08Crm.statement.aging')}</h2>
        <dl className="grid grid-cols-2 gap-sp-8 text-sm sm:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <div key={b} className="rounded-md border p-sp-8">
              <dt className="text-muted-foreground">{t(`s08Crm.statement.${b}` as StringKey)}</dt>
              <dd className="font-medium">{money(data.aging[b])}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          {t('s08Crm.statement.total')}: <strong>{money(data.aging.total)}</strong> -{' '}
          {t('s08Crm.statement.balance')}: <strong>{money(data.balance)}</strong>
        </p>
      </section>
      <div className="flex flex-wrap gap-sp-8">
        <PrintButton label={t('s08Crm.statement.print')} />
        <StatementMailButton clientId={id} from={range.from} to={range.to} />
      </div>
    </div>
  );
}
