// path: services/evidence/facts.ts
// Small pure parts of the evidence pack: how long it is kept, and the facts handed to a processor adapter.
import type { EvidencePackData } from './types';

/** The platform keeps a pack at least this long (the storage contract keeps `evidence` files for seven years). */
export const PACK_RETENTION_MONTHS = 18;

/** The facts handed to the processor adapter so it can lay them out in its own evidence format. */
export function processorSections(data: EvidencePackData): Record<string, unknown> {
  return {
    invoice: {
      number: data.invoice.number,
      total: data.invoice.total,
      sentAt: data.invoice.sentAt,
    },
    receipt: data.receipt,
    consent: data.consent.records.map((c) => ({
      at: c.at,
      version: c.version,
      text: c.text,
      ip: c.ip,
      device: c.device,
    })),
    refundPolicy: { days: data.consent.refundWindowDays, text: data.consent.refundPolicyText },
    delivery: data.delivery.invoiceMessages.map((m) => ({
      at: m.at,
      status: m.status,
      openedAt: m.openedAt,
    })),
    identity: {
      payerIp: data.identity.payerIp,
      payerCountry: data.identity.payerCountry,
      threeDs: data.identity.threeDs,
    },
    timeline: data.timeline,
  };
}
