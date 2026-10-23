// path: app/(dashboard)/payroll/employees/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { AttachmentForm } from '@/components/accounting/attachment-form';
import { PageHeader } from '@/components/shared/page-header';
import { listLinks, type LinkView } from '@/services/payroll/portal';
import { ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getEmployee,
  listDocuments,
  type EmployeeDocumentView,
  type EmployeeView,
  type SensitiveView,
} from '@/services/payroll/employees';
import { CONTRACTS, STATUSES } from '@/services/payroll/payroll-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Employee' };

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('payroll.employee.read', 'tenant', 'employee');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const companyId = actor.companyId as string;
  const permissions = getService('permissions');
  const canManage = await permissions.can(actor, 'payroll.employee.manage', { type: 'employee' });
  const canPayManage = await permissions.can(actor, 'payroll.pay.manage', { type: 'employee' });
  const canPortal = await permissions.can(actor, 'payroll.portal.manage', { type: 'employee' });
  let data: {
    employee: EmployeeView;
    sensitive: SensitiveView | null;
    documents: EmployeeDocumentView[];
    links: LinkView[];
  } | null;
  try {
    const [{ employee, sensitive }, documents] = await Promise.all([
      getEmployee(actor, id),
      listDocuments(companyId, id),
    ]);
    const links = canPortal ? await listLinks(companyId, id).catch(() => []) : [];
    data = { employee, sensitive, documents, links };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  const e = data?.employee;
  const hint = t('s15Payroll.common.dateHint');
  const done = t('s15Payroll.common.done');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={e ? `${e.firstName} ${e.lastName}` : t('s15Payroll.employees.title')}
        description={e ? `${e.number} - ${e.jobTitle || e.department || ''}` : undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/payroll/employees" prefetch={false}>
                {t('s15Payroll.detail.back')}
              </Link>
            </Button>
            {data?.sensitive ? (
              <Button asChild variant="outline">
                <Link href={`/payroll/preview?employeeId=${id}`} prefetch={false}>
                  {t('s15Payroll.detail.previewLink')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {data === null || !e ? (
        <ErrorState description={t('s15Payroll.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t('s15Payroll.detail.profile')}
                <Badge variant="outline">
                  {t(`s15Payroll.employees.statuses.${e.status}` as StringKey)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-sp-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['email', e.email],
                    ['phone', e.phone],
                    ['address', e.address],
                    ['dateOfBirth', e.dateOfBirth ?? ''],
                    ['department', e.department],
                    ['jobTitle', e.jobTitle],
                    ['joinDate', e.joinDate],
                    [
                      'contractType',
                      t(`s15Payroll.employees.contracts.${e.contractType}` as StringKey),
                    ],
                    ['payBasis', t(`s15Payroll.employees.bases.${e.payBasis}` as StringKey)],
                    ['emergencyName', e.emergencyName],
                    ['emergencyPhone', e.emergencyPhone],
                    ['emergencyRelation', e.emergencyRelation],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">
                      {t(`s15Payroll.employees.fields.${k}` as StringKey)}
                    </dt>
                    <dd>{v || '-'}</dd>
                  </div>
                ))}
                {e.endDate ? (
                  <div>
                    <dt className="text-muted-foreground">{t('s15Payroll.detail.endDate')}</dt>
                    <dd>{e.endDate}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.detail.payTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.sensitive ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('s15Payroll.detail.payNote')}</p>
                  <dl className="grid gap-sp-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {(
                      [
                        ['baseAmount', data.sensitive.baseAmount],
                        ['commissionRate', data.sensitive.commissionRatePercent],
                        ['bankHolder', data.sensitive.bankHolder],
                        ['bankName', data.sensitive.bankName],
                        ['accountNumber', data.sensitive.accountNumber],
                        ['taxId', data.sensitive.taxIdMasked],
                        ['filingStatus', data.sensitive.filingStatus],
                        ['allowances', e.hasTax ? String(data.sensitive.allowances) : ''],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-muted-foreground">
                          {t(`s15Payroll.detail.${k}` as StringKey)}
                        </dt>
                        <dd className="tabular-nums">{v || t('s15Payroll.detail.notSet')}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <Alert>{t('s15Payroll.detail.payHidden')}</Alert>
              )}
              {canPayManage && canManage ? (
                <>
                  <h3 className="font-semibold">{t('s15Payroll.detail.payFormTitle')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('s15Payroll.detail.payFormHelp')}
                  </p>
                  <JsonForm
                    endpoint={`/api/payroll/employees/${id}/pay`}
                    method="PUT"
                    fixed={{ version: e.version, group: 'pay' }}
                    submitLabel={t('s15Payroll.common.save')}
                    doneText={done}
                    fields={[
                      {
                        name: 'baseAmount',
                        label: t('s15Payroll.detail.baseAmount'),
                        required: true,
                      },
                      {
                        name: 'commissionRatePercent',
                        label: t('s15Payroll.detail.commissionRate'),
                        initial: '0',
                      },
                    ]}
                  />
                  <JsonForm
                    endpoint={`/api/payroll/employees/${id}/pay`}
                    method="PUT"
                    fixed={{ version: e.version, group: 'bank' }}
                    submitLabel={t('s15Payroll.common.save')}
                    doneText={done}
                    fields={[
                      { name: 'holder', label: t('s15Payroll.detail.bankHolder'), required: true },
                      { name: 'bankName', label: t('s15Payroll.detail.bankName'), required: true },
                      {
                        name: 'accountNumber',
                        label: t('s15Payroll.detail.accountNumber'),
                        required: true,
                      },
                      { name: 'routingCode', label: t('s15Payroll.detail.routingCode') },
                    ]}
                  />
                  <JsonForm
                    endpoint={`/api/payroll/employees/${id}/pay`}
                    method="PUT"
                    fixed={{ version: e.version, group: 'tax' }}
                    submitLabel={t('s15Payroll.common.save')}
                    doneText={done}
                    fields={[
                      { name: 'taxId', label: t('s15Payroll.detail.taxId'), required: true },
                      { name: 'filingStatus', label: t('s15Payroll.detail.filingStatus') },
                      {
                        name: 'allowances',
                        label: t('s15Payroll.detail.allowances'),
                        whole: true,
                        initial: '0',
                      },
                    ]}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Payroll.detail.statusTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint={`/api/payroll/employees/${id}`}
                    method="PATCH"
                    fixed={{ version: e.version }}
                    submitLabel={t('s15Payroll.detail.setStatus')}
                    doneText={done}
                    fields={[
                      {
                        name: 'status',
                        label: t('s15Payroll.employees.columns.status'),
                        kind: 'select',
                        initial: e.status,
                        options: STATUSES.map((s) => ({
                          value: s,
                          label: t(`s15Payroll.employees.statuses.${s}` as StringKey),
                        })),
                      },
                      {
                        name: 'endDate',
                        label: t('s15Payroll.detail.endDate'),
                        hint,
                        initial: e.endDate ?? '',
                      },
                    ]}
                  />
                  {e.status === 'terminated' ? (
                    <ActionButton
                      endpoint={`/api/payroll/employees/${id}`}
                      method="DELETE"
                      variant="destructive"
                      label={t('s15Payroll.detail.archive')}
                      doneText={t('s15Payroll.detail.archived')}
                    />
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Payroll.detail.editTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint={`/api/payroll/employees/${id}`}
                    method="PATCH"
                    fixed={{ version: e.version }}
                    submitLabel={t('s15Payroll.common.save')}
                    doneText={done}
                    fields={[
                      {
                        name: 'firstName',
                        label: t('s15Payroll.employees.fields.firstName'),
                        initial: e.firstName,
                      },
                      {
                        name: 'lastName',
                        label: t('s15Payroll.employees.fields.lastName'),
                        initial: e.lastName,
                      },
                      {
                        name: 'email',
                        label: t('s15Payroll.employees.fields.email'),
                        initial: e.email,
                      },
                      {
                        name: 'phone',
                        label: t('s15Payroll.employees.fields.phone'),
                        initial: e.phone,
                      },
                      {
                        name: 'address',
                        label: t('s15Payroll.employees.fields.address'),
                        initial: e.address,
                      },
                      {
                        name: 'department',
                        label: t('s15Payroll.employees.fields.department'),
                        initial: e.department,
                      },
                      {
                        name: 'jobTitle',
                        label: t('s15Payroll.employees.fields.jobTitle'),
                        initial: e.jobTitle,
                      },
                      {
                        name: 'contractType',
                        label: t('s15Payroll.employees.fields.contractType'),
                        kind: 'select',
                        initial: e.contractType,
                        options: CONTRACTS.map((c) => ({
                          value: c,
                          label: t(`s15Payroll.employees.contracts.${c}` as StringKey),
                        })),
                      },
                      {
                        name: 'emergencyName',
                        label: t('s15Payroll.employees.fields.emergencyName'),
                        initial: e.emergencyName,
                      },
                      {
                        name: 'emergencyPhone',
                        label: t('s15Payroll.employees.fields.emergencyPhone'),
                        initial: e.emergencyPhone,
                      },
                      {
                        name: 'emergencyRelation',
                        label: t('s15Payroll.employees.fields.emergencyRelation'),
                        initial: e.emergencyRelation,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
          {canPortal ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Payroll.links.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">{t('s15Payroll.links.help')}</p>
                {data.links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('s15Payroll.links.none')}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.links.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {t(`s15Payroll.links.states.${l.state}` as StringKey)}
                        </Badge>
                        {t('s15Payroll.links.expires')} {l.expiresAt.slice(0, 10)}
                        {l.state === 'active' ? (
                          <ActionButton
                            endpoint={`/api/payroll/portal/links/${l.id}`}
                            method="DELETE"
                            label={t('s15Payroll.links.revoke')}
                            doneText={done}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <JsonForm
                  endpoint="/api/payroll/portal/links"
                  idempotent
                  fixed={{ employeeId: id }}
                  submitLabel={t('s15Payroll.links.issue')}
                  doneText={t('s15Payroll.links.issued')}
                  fields={[
                    {
                      name: 'ttlDays',
                      label: t('s15Payroll.links.ttl'),
                      whole: true,
                      initial: '3',
                    },
                    {
                      name: 'otpRequired',
                      label: t('s15Payroll.links.otp'),
                      kind: 'checkbox',
                      initial: 'true',
                    },
                    {
                      name: 'sendEmail',
                      label: t('s15Payroll.links.email'),
                      kind: 'checkbox',
                      initial: 'true',
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.detail.documentsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s15Payroll.detail.documentsEmpty')}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      {d.name} ({d.kind})
                      <Link
                        href={`/api/payroll/employees/documents/${d.id}/file`}
                        prefetch={false}
                        className="underline"
                      >
                        {t('s15Payroll.detail.open')}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <AttachmentForm endpoint={`/api/payroll/employees/${id}/documents?kind=other`} />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
