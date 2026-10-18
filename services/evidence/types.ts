// path: services/evidence/types.ts
// The nine sections of an evidence pack. Plain data (strings and numbers) so the PDF and the ZIP draw exactly what was
// collected and the same collection can be checked without a database.
export const PACK_SECTIONS = [
  'invoice',
  'receipt',
  'consent',
  'delivery',
  'communications',
  'identity',
  'timeline',
  'audit',
  'platform',
] as const;
export type PackSection = (typeof PACK_SECTIONS)[number];

export interface PackTimelineEvent {
  at: string;
  source:
    'invoice' | 'email' | 'portal' | 'consent' | 'payment' | 'refund' | 'dispute' | 'contract';
  text: string;
}

export interface PackInvoice {
  number: string;
  status: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  total: string;
  sentAt: string | null;
  lines: { description: string; quantity: string; unitPrice: string; total: string }[];
  /** Checksum of the stored PDF that was made when the invoice was sent (null when none exists). */
  snapshotHash: string | null;
  snapshotFileId: string | null;
}

export interface PackReceipt {
  reference: string;
  paidAt: string;
  amount: string;
  surcharge: string;
  total: string;
  refunded: string;
  method: string;
  processorName: string;
  processorTransactionId: string | null;
}

export interface PackConsent {
  at: string;
  version: string;
  text: string;
  textHash: string;
  ipMasked: string;
  /** The full address, decrypted for this evidence only. */
  ip: string;
  device: string;
  userAgent: string;
}

export interface PackMessage {
  at: string;
  template: string;
  subject: string;
  to: string;
  document: string;
  status: string;
  openedAt: string | null;
  clickedAt: string | null;
  contentHash: string;
}

export interface PackView {
  at: string;
  event: string;
  document: string;
  ipMasked: string;
  device: string;
}

export interface PackAudit {
  chainOk: boolean;
  checkedFrom: string;
  checkedTo: string;
  gaps: string[];
  entries: { sequence: string; at: string; action: string; entryHash: string; prevHash: string }[];
}

export interface EvidencePackData {
  generatedAt: string;
  dispute: {
    id: string;
    processorId: string;
    processorDisputeId: string | null;
    status: string;
    reasonCode: string | null;
    reasonCategory: string;
    amount: string;
    openedAt: string;
    dueAt: string;
  };
  invoice: PackInvoice;
  receipt: PackReceipt | null;
  consent: {
    records: PackConsent[];
    termsVersion: string;
    refundWindowDays: number;
    refundPolicyText: string;
  };
  delivery: {
    /** The messages that carried the invoice to the client, with what happened to each. */
    invoiceMessages: PackMessage[];
    /** Proof that the client accepted work before it was paid for (accepted estimate, signed contract). */
    acceptances: string[];
  };
  communications: PackMessage[];
  identity: {
    views: PackView[];
    payerIp: string | null;
    payerCountry: string | null;
    cardIdentity: string | null;
    threeDs: Record<string, unknown>;
  };
  timeline: PackTimelineEvent[];
  audit: PackAudit;
  platform: {
    name: string;
    companyName: string;
    note: string;
  };
}

/** Which sections have content (the others are listed as "nothing recorded"). */
export function sectionsPresent(data: EvidencePackData): Record<PackSection, boolean> {
  return {
    invoice: data.invoice.number !== '',
    receipt: data.receipt !== null,
    consent: data.consent.records.length > 0,
    delivery: data.delivery.invoiceMessages.length > 0 || data.delivery.acceptances.length > 0,
    communications: data.communications.length > 0,
    identity: data.identity.views.length > 0 || data.identity.payerIp !== null,
    timeline: data.timeline.length > 0,
    audit: data.audit.entries.length > 0,
    platform: true,
  };
}

/** Events in time order; two events at the same time keep their given order. */
export function sortTimeline(events: readonly PackTimelineEvent[]): PackTimelineEvent[] {
  return events
    .map((e, index) => ({ e, index }))
    .sort((a, b) => Date.parse(a.e.at) - Date.parse(b.e.at) || a.index - b.index)
    .map((x) => x.e);
}
