// path: app/(client-portal)/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PortalShell } from '@/components/layout/portal-shell';
import { getTenantBrand } from '@/services/branding/brand';
import { tenantForRequest } from '@/services/branding/domain';

// Token pages must never be indexed and must not leak the link through the referrer header.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  // On a company's own domain the shell carries the company name, and on white-label plans no platform mark. On the
  // platform's address the shell stays the platform's (the company look is applied inside the page).
  const companyId = await tenantForRequest().catch(() => null);
  const brand = companyId ? await getTenantBrand(companyId).catch(() => null) : null;
  return (
    <PortalShell brandName={brand?.name || undefined} hidePlatformMark={brand?.whiteLabel ?? false}>
      {children}
    </PortalShell>
  );
}
