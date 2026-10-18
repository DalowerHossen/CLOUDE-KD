// path: components/client/views/registry.ts
// The document views of the portal. Each document page (invoice, payment, estimate, receipt, hub, contract) is added here
// by its own sub-step; a link whose document type has no view yet is answered like any unavailable link.
import type { ReactNode } from 'react';
import type { PortalSubject } from '@/services/portal/events';
import type { TokenDocumentType } from '@/types/contracts';
import { renderContractView } from './contract-view';
import { renderEstimateView } from './estimate-view';
import { renderHubView } from './hub-view';
import { renderInvoiceView } from './invoice-view';
import { renderPaymentView } from './payment-view';
import { renderReceiptView } from './receipt-view';

export type PortalView = (subject: PortalSubject, token: string) => Promise<ReactNode>;

export const portalViews: Partial<Record<TokenDocumentType, PortalView>> = {
  invoice: renderInvoiceView,
  payment: renderPaymentView,
  estimate: renderEstimateView,
  receipt: renderReceiptView,
  hub: renderHubView,
  contract: renderContractView,
};
