// path: components/client/portal-page.tsx
import type { ReactNode } from 'react';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { PORTAL_ROUTES, resolvePortalAccess, type PortalAccess } from '@/services/portal/access';
import { recordPortalEvent } from '@/services/portal/events';
import { getTenantBrand } from '@/services/branding/brand';
import { tenantForRequest } from '@/services/branding/domain';
import { BrandedFrame } from './branded-frame';
import { OtpGate } from './otp-gate';
import { RerequestForm } from './rerequest-form';
import { StateCard } from './state-card';
import { portalViews } from './views/registry';

interface PortalPageProps {
  /** The first path segment of the page: "i", "pay", "e", "r", "hub" or "c". */
  route: keyof typeof PORTAL_ROUTES;
  token: string;
}

function invalid(): JSX.Element {
  return (
    <StateCard title={t('s13Portal.state.invalidTitle')} body={t('s13Portal.state.invalidBody')} />
  );
}

async function show(access: PortalAccess, token: string): Promise<ReactNode> {
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
    case 'expired':
      return (
        <StateCard
          title={t('s13Portal.state.expiredTitle')}
          body={t('s13Portal.state.expiredBody')}
        >
          <RerequestForm token={token} />
        </StateCard>
      );
    case 'otp':
      return (
        <StateCard title={t('s13Portal.otp.title')} body={t('s13Portal.otp.body')}>
          <OtpGate token={token} />
        </StateCard>
      );
    case 'invalid':
      return invalid();
    case 'ok': {
      const view = portalViews[access.docType];
      if (!view) return invalid();
      try {
        const body = await view(access, token);
        await recordPortalEvent(access, 'view');
        return body;
      } catch (thrown) {
        // A document that cannot be shown (not found, not for the client yet) looks like an unavailable link.
        if (thrown instanceof NotFoundError) return invalid();
        throw thrown;
      }
    }
  }
}

/** The body of every token page: checks the link, then shows the document or the matching state. */
export async function PortalPage({ route, token }: PortalPageProps): Promise<JSX.Element> {
  const doc = PORTAL_ROUTES[route];
  const access = doc ? await resolvePortalAccess(token, [doc]) : ({ state: 'invalid' } as const);
  const body = await show(access, token);
  const hostCompany = await tenantForRequest();
  const companyId = 'companyId' in access ? access.companyId : hostCompany;
  if (!companyId) return <>{body}</>;
  // A brand that cannot be read must not hide the document: the page is then shown in the platform look.
  const brand = await getTenantBrand(companyId).catch(() => null);
  if (!brand) return <>{body}</>;
  return (
    <BrandedFrame brand={brand} showName={hostCompany !== companyId}>
      {body}
    </BrandedFrame>
  );
}
