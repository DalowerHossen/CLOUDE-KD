// path: components/client/views/registry.ts
// The document views of the portal. Each document page (invoice, payment, estimate, receipt, hub, contract) is added here
// by its own sub-step; a link whose document type has no view yet is answered like any unavailable link.
import type { ReactNode } from 'react';
import type { PortalSubject } from '@/services/portal/events';
import type { TokenDocumentType } from '@/types/contracts';

export type PortalView = (subject: PortalSubject, token: string) => Promise<ReactNode>;

export const portalViews: Partial<Record<TokenDocumentType, PortalView>> = {};
