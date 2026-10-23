// path: app/(client-portal)/p/[token]/page.tsx
import Link from 'next/link';
import { OtpGate } from '@/components/client/otp-gate';
import { StateCard } from '@/components/client/state-card';
import { DeclarationForm } from '@/components/payroll/declaration-form';
import { LeaveCancelButton, LeaveForm } from '@/components/payroll/leave-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { resolvePortalAccess } from '@/services/portal/access';
import { recordPortalEvent } from '@/services/portal/events';
import { portalView, type PortalView } from '@/services/payroll/portal';
import { portalLeave, type PortalLeave } from '@/services/hr/leave';

// An employee page is always built for the request: it checks the link, the code and the rate limits each time.
export const dynamic = 'force-dynamic';

const invalid = (): JSX.Element => (
  <StateCard title={t('s13Portal.state.invalidTitle')} body={t('s13Portal.state.invalidBody')} />
);

export default async function EmployeePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<JSX.Element> {
  const { token } = await params;
  const access = await resolvePortalAccess(token, ['payslip']);
  switch (access.state) {
    case 'limited':
      return (
        <StateCard
          title={t('s13Portal.state.limitedTitle')}
          body={t('s13Portal.state.limitedBody')}
        />
      );
    case 'revoked':
      return (
        <StateCard
          title={t('s13Portal.state.revokedTitle')}
          body={t('s13Portal.state.revokedBody')}
        />
      );
    // An expired link gets the same plain answer as any other bad link: the employee asks the employer for a new one.
    case 'expired':
    case 'invalid':
      return invalid();
    case 'otp':
      return (
        <StateCard title={t('s13Portal.otp.title')} body={t('s13Portal.otp.body')}>
          <OtpGate token={token} />
        </StateCard>
      );
    case 'ok':
      break;
  }
  let view: PortalView;
  try {
    view = await portalView(access);
  } catch (error) {
    if (error instanceof NotFoundError) return invalid();
    throw error;
  }
  const leave: PortalLeave = await portalLeave(access).catch(() => ({
    types: [],
    balances: [],
    requests: [],
  }));
  await recordPortalEvent(access, 'view');
  const pending = view.declaration?.status === 'pending';
  return (
    <div className="space-y-sp-16">
      <div>
        <h1 className="text-xl font-semibold">{t('s15Payroll.portal.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('s15Payroll.portal.hello')} {view.employeeName}, {t('s15Payroll.portal.from')}{' '}
          {view.companyName}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Payroll.portal.payslipsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.payslips.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s15Payroll.portal.empty')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {view.payslips.map((p) => (
                <li
                  key={p.itemId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    {p.periodStart} - {p.periodEnd}
                    <span className="block text-xs text-muted-foreground">
                      {t('s15Payroll.portal.columns.paid')} {p.payDate}
                    </span>
                  </span>
                  <span className="tabular-nums">{p.net}</span>
                  <Link
                    href={`/p/${encodeURIComponent(token)}/payslip/${p.itemId}`}
                    prefetch={false}
                    className="underline"
                  >
                    {t('s15Payroll.portal.open')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Payroll.portal.declarationTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <p className="text-sm text-muted-foreground">{t('s15Payroll.portal.declarationHelp')}</p>
          {view.declaration ? (
            <p className="text-sm">
              {t('s15Payroll.portal.last')}: {view.declaration.filingStatus},{' '}
              {view.declaration.allowances}{' '}
              <Badge variant="outline">
                {t(`s15Payroll.portal.statuses.${view.declaration.status}` as StringKey)}
              </Badge>
              {view.declaration.rejectReason
                ? ` - ${t('s15Payroll.portal.rejected')}: ${view.declaration.rejectReason}`
                : ''}
            </p>
          ) : null}
          {pending ? (
            <p className="text-sm text-muted-foreground">{t('s15Payroll.portal.waiting')}</p>
          ) : (
            <DeclarationForm token={token} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Hr.portal.leaveTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          {leave.balances.length > 0 ? (
            <ul className="text-sm">
              {leave.balances.map((b) => (
                <li key={`${b.type}-${b.year}`}>
                  {b.type} {b.year}: {b.left} {t('s15Hr.portal.left')} {t('s15Hr.portal.of')}{' '}
                  {b.entitled}
                </li>
              ))}
            </ul>
          ) : null}
          <h3 className="font-semibold">{t('s15Hr.portal.requests')}</h3>
          {leave.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s15Hr.portal.none')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {leave.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {r.type}: {r.startDate} - {r.endDate} ({r.days}){r.note ? ` - ${r.note}` : ''}
                  </span>
                  <Badge variant="outline">
                    {t(`s15Hr.portal.statuses.${r.status}` as StringKey)}
                  </Badge>
                  {r.status === 'pending' ? <LeaveCancelButton token={token} id={r.id} /> : null}
                </li>
              ))}
            </ul>
          )}
          {leave.types.length > 0 ? (
            <>
              <h3 className="font-semibold">{t('s15Hr.portal.newTitle')}</h3>
              <LeaveForm token={token} types={leave.types} />
            </>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t('s15Payroll.portal.confidential')}</p>
    </div>
  );
}
