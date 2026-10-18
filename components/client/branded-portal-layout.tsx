// path: components/client/branded-portal-layout.tsx
// The shell of every client page, host-aware. On a company's own domain the shell carries the company name, and on
// white-label plans no platform mark. On the platform's address it stays the platform's (the company look is applied
// inside the page by BrandedFrame). `app/(client-portal)/layout.tsx` belongs to STEP 01: request R8 asks the Integrator
// to make it return this component, which is a one-line change.
import type { ReactNode } from 'react';
import { PortalShell } from '@/components/layout/portal-shell';
import { getTenantBrand } from '@/services/branding/brand';
import { tenantForRequest } from '@/services/branding/domain';

export async function BrandedPortalLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const companyId = await tenantForRequest().catch(() => null);
  const brand = companyId ? await getTenantBrand(companyId).catch(() => null) : null;
  return (
    <PortalShell brandName={brand?.name || undefined} hidePlatformMark={brand?.whiteLabel ?? false}>
      {children}
    </PortalShell>
  );
}
