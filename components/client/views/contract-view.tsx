// path: components/client/views/contract-view.tsx
import type { ReactNode } from 'react';
import { ContractSigner } from '@/components/client/contract-signer';
import { DocumentActions } from '@/components/client/document-actions';
import { SafeHtml } from '@/components/shared/safe-html';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { getSigningView } from '@/services/esign/sign';
import type { PortalSubject } from '@/services/portal/events';

/** The signing page: the frozen wording, who has signed, and the form to sign or decline. */
export async function renderContractView(
  subject: PortalSubject,
  token: string,
): Promise<ReactNode> {
  const view = await getSigningView(subject);
  const { contract, signer } = view;
  return (
    <article className="space-y-sp-16" aria-labelledby="contract-title">
      <Card>
        <CardHeader className="gap-sp-8">
          <CardTitle>
            <span id="contract-title">{contract.title}</span> {contract.number}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('s13Portal.sign.forSigner', { name: signer.name })}
            {contract.signBy ? ` - ${t('s13Portal.sign.signBy', { date: contract.signBy })}` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <SafeHtml html={contract.bodyHtml} className="prose max-w-none text-sm" />
          <p className="break-all text-caption text-muted-foreground">
            {t('s13Portal.sign.checksum', { value: contract.bodyHash })}
          </p>
        </CardContent>
      </Card>
      {view.others.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s13Portal.sign.others')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {view.others.map((o) => (
                <li key={o.position}>
                  {o.name} - {t(`s13Portal.sign.status.${o.status}` as StringKey)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {view.canSign ? (
        <ContractSigner
          token={token}
          docHash={contract.bodyHash}
          statement={view.statement}
          defaultName={signer.name}
        />
      ) : view.waitingFor ? (
        <Alert>{t('s13Portal.sign.waiting', { name: view.waitingFor })}</Alert>
      ) : signer.status === 'signed' ? (
        <Alert variant="success">
          {contract.status === 'signed'
            ? t('s13Portal.sign.allSigned')
            : t('s13Portal.sign.youSigned')}
        </Alert>
      ) : (
        <Alert>
          {t('s13Portal.sign.closed', {
            status: t(`s13Portal.contracts.statuses.${contract.status}` as StringKey),
          })}
        </Alert>
      )}
      {view.hasSignedCopy ? (
        <DocumentActions token={token} fileName={`${contract.number}-signed`} />
      ) : null}
    </article>
  );
}
