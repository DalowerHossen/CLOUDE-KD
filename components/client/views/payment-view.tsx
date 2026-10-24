// path: components/client/views/payment-view.tsx
import type { ReactNode } from 'react';
import { PayPanel } from '@/components/client/pay-panel';
import { PAYMENT_PAGE_TIMEOUT_MINUTES } from '@/config/s13-portal';
import { consentText } from '@/services/portal/consent-capture';
import type { PortalSubject } from '@/services/portal/events';

/** The payment page: consent first, then the processor's secure form (STEP 10 checkout slot). */
export async function renderPaymentView(
  _subject: PortalSubject,
  token: string,
): Promise<ReactNode> {
  return (
    <PayPanel
      token={token}
      consentText={consentText()}
      timeoutMinutes={PAYMENT_PAGE_TIMEOUT_MINUTES}
    />
  );
}
