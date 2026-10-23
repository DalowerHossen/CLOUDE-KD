// path: app/(dashboard)/hr/performance/page.tsx
import type { Metadata } from 'next';
import { z } from 'zod';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listEmployees, type EmployeeView } from '@/services/payroll/employees';
import { listNotes, type NoteView } from '@/services/hr/performance';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Performance' };

const query = z.object({ employeeId: z.string().uuid().optional().catch(undefined) });

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('hr.performance.read', 'tenant', 'employee');
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const canWrite = await getService('permissions').can(actor, 'hr.performance.manage', {
    type: 'employee',
  });
  let people: EmployeeView[] | null;
  let notes: NoteView[] = [];
  try {
    people = await listEmployees(actor.companyId as string);
    if (q.employeeId) notes = await listNotes(actor, q.employeeId);
  } catch {
    people = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Hr.performance.title')}
        description={t('s15Hr.performance.description')}
      />
      {people === null ? (
        <ErrorState description={t('s15Hr.common.loadError')} />
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-sp-8">
            <div className="space-y-1">
              <Label htmlFor="pf-employee">{t('s15Hr.performance.employee')}</Label>
              <NativeSelect id="pf-employee" name="employeeId" defaultValue={q.employeeId ?? ''}>
                <option value="">{t('s15Hr.performance.choose')}</option>
                {people.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.number} {e.firstName} {e.lastName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit">{t('s15Hr.performance.show')}</Button>
          </form>
          {q.employeeId ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Hr.performance.notesTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('s15Hr.performance.empty')}</p>
                ) : null}
                <ul className="space-y-2 text-sm">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-md border p-sp-8">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {t(`s15Hr.performance.kinds.${n.kind}` as StringKey)}
                        </Badge>
                        {n.period ? (
                          <span className="text-muted-foreground">{n.period}</span>
                        ) : null}
                        {n.rating !== null ? (
                          <span className="font-medium">{n.rating} / 5</span>
                        ) : null}
                        {n.raiseSuggested ? (
                          <Badge variant="outline">{t('s15Hr.performance.raise')}</Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {n.createdAt.slice(0, 10)}
                        </span>
                      </span>
                      <p>{n.body}</p>
                    </li>
                  ))}
                </ul>
                {canWrite ? (
                  <>
                    <h3 className="font-semibold">{t('s15Hr.performance.addTitle')}</h3>
                    <JsonForm
                      endpoint="/api/hr/performance"
                      idempotent
                      resetAfter
                      fixed={{ employeeId: q.employeeId }}
                      submitLabel={t('s15Hr.performance.add')}
                      doneText={t('s15Hr.common.done')}
                      fields={[
                        {
                          name: 'kind',
                          label: t('s15Hr.performance.kind'),
                          kind: 'select',
                          initial: 'note',
                          options: (['note', 'review'] as const).map((k) => ({
                            value: k,
                            label: t(`s15Hr.performance.kinds.${k}` as StringKey),
                          })),
                        },
                        { name: 'period', label: t('s15Hr.performance.period') },
                        { name: 'rating', label: t('s15Hr.performance.rating'), whole: true },
                        { name: 'body', label: t('s15Hr.performance.body'), required: true },
                        {
                          name: 'raiseSuggested',
                          label: t('s15Hr.performance.raise'),
                          kind: 'checkbox',
                          initial: 'false',
                        },
                      ]}
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Hr.performance.reportTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                method="get"
                action="/api/hr/performance/export"
                className="flex flex-wrap items-end gap-sp-8"
              >
                <div className="space-y-1">
                  <Label htmlFor="pf-from">{t('s15Hr.performance.reportFrom')}</Label>
                  <Input
                    id="pf-from"
                    name="from"
                    type="date"
                    defaultValue={`${today.slice(0, 4)}-01-01`}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pf-to">{t('s15Hr.performance.reportTo')}</Label>
                  <Input id="pf-to" name="to" type="date" defaultValue={today} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pf-format">{t('s15Hr.common.download')}</Label>
                  <NativeSelect id="pf-format" name="format" defaultValue="csv">
                    <option value="csv">{t('s15Hr.common.csv')}</option>
                    <option value="xlsx">{t('s15Hr.common.excel')}</option>
                    <option value="pdf">{t('s15Hr.common.pdf')}</option>
                  </NativeSelect>
                </div>
                <Button type="submit">{t('s15Hr.common.download')}</Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
