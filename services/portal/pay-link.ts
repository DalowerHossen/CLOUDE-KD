// path: services/portal/pay-link.ts
// "Pay now" on the invoice page: makes a short-lived payment link (STEP 10) for the open balance and returns its page
// address. The link service wants an actor only for the company and the creator column; the portal passes a fixed
// "portal" actor that carries the company of the verified link and no user (decision D8).
import 'server-only';
import { PORTAL_PAY_LINK_HOURS } from '@/config/s13-portal';
import type { Actor } from '@/types/contracts';
import { createPaymentLink } from '@/services/payment/links';
import type { PortalSubject } from './events';

const NIL_USER = '00000000-0000-0000-0000-000000000000';

function portalActor(companyId: string): Actor {
  return {
    userId: NIL_USER,
    role: 'staff',
    subRole: null,
    companyId,
    email: 'portal@invalid.local',
    sessionId: 'portal',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: false,
  };
}

/** The page path (with the new token) where the payer pays this invoice. */
export async function createPortalPayPath(subject: PortalSubject): Promise<string> {
  const link = await createPaymentLink(portalActor(subject.companyId), {
    invoiceId: subject.docId,
    amount: null,
    validHours: PORTAL_PAY_LINK_HOURS,
  });
  return new URL(link.url).pathname;
}
