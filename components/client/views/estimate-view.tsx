// path: components/client/views/estimate-view.tsx
import type { ReactNode } from 'react';
import { DocumentActions } from '@/components/client/document-actions';
import { EstimateDecision } from '@/components/client/estimate-decision';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import type { PortalSubject } from '@/services/portal/events';
import { getPortalEstimate } from '@/services/portal/estimate-view';

/** The estimate page: the lines and totals, the PDF, and the accept / decline form while the estimate is open. */
export async function renderEstimateView(
  _subject: PortalSubject,
  token: string,
): Promise<ReactNode> {
  const estimate = await getPortalEstimate(token);
  const sellerName = String(
    (estimate.seller as { legalName?: string; name?: string } | null)?.legalName ??
      (estimate.seller as { name?: string } | null)?.name ??
      '',
  );
  return (
    <article className="space-y-sp-16" aria-labelledby="estimate-title">
      <Card>
        <CardHeader className="gap-sp-8">
          <CardTitle>
            <span id="estimate-title">{t('s13Portal.estimate.title')}</span> {estimate.number}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {sellerName} - {t('s13Portal.estimate.validUntil', { date: estimate.validUntil })}
          </p>
        </CardHeader>
        <CardContent className="space-y-sp-16">
          <p className="text-sm">
            {t('s13Portal.estimate.preparedFor', { name: estimate.clientName })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b text-left text-caption uppercase text-muted-foreground">
                  <th scope="col" className="py-2 pr-2">
                    {t('s13Portal.invoice.description')}
                  </th>
                  <th scope="col" className="py-2 pr-2 text-right">
                    {t('s13Portal.invoice.quantity')}
                  </th>
                  <th scope="col" className="py-2 text-right">
                    {t('s13Portal.invoice.unitPrice')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {estimate.lines.map((line, index) => (
                  <tr key={`${index}-${line.description}`} className="border-b align-top">
                    <td className="py-2 pr-2">{line.description}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums">{line.unitPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>{t('s13Portal.invoice.subtotal')}</dt>
              <dd className="tabular-nums">{estimate.subtotal}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('s13Portal.invoice.tax')}</dt>
              <dd className="tabular-nums">{estimate.taxTotal}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>{t('s13Portal.estimate.total')}</dt>
              <dd className="tabular-nums">USD {estimate.total}</dd>
            </div>
          </dl>
          {estimate.notes ? <p className="whitespace-pre-line text-sm">{estimate.notes}</p> : null}
        </CardContent>
      </Card>
      <DocumentActions token={token} fileName={`estimate-${estimate.number}`} />
      {estimate.canDecide ? (
        <EstimateDecision token={token} />
      ) : estimate.status === 'accepted' ? (
        <Alert variant="success">
          {t('s13Portal.estimate.statusAccepted', { name: estimate.signerName })}
        </Alert>
      ) : estimate.status === 'declined' ? (
        <Alert>{t('s13Portal.estimate.statusDeclined')}</Alert>
      ) : (
        <Alert>{t('s13Portal.estimate.statusClosed')}</Alert>
      )}
    </article>
  );
}
