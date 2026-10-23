// path: services/payout/partners.ts
// The Global Payout Partners known to the platform. The manual partner needs no vendor API: the platform team pays by
// bank transfer outside the platform and confirms the payout in the queue. A live partner adapter is added here when
// its official documentation has been read (request R3); until then only the manual partner exists.
import 'server-only';
import type { PartnerAnswer, PartnerRequest, PayoutPartner } from '@/lib/payment/payout';

const manual: PayoutPartner = {
  id: 'manual',
  label: 'Manual payout by the platform team',
  automatic: false,
  async healthy() {
    return true;
  },
  async submit(_request: PartnerRequest): Promise<PartnerAnswer> {
    // Nothing is sent from here: the payout waits in the queue until a person confirms it.
    return { kind: 'accepted', reference: null, completed: false };
  },
};

const PARTNERS: readonly PayoutPartner[] = [manual];

export function listPartners(): readonly PayoutPartner[] {
  return PARTNERS;
}

export function getPartner(id: string): PayoutPartner | null {
  return PARTNERS.find((p) => p.id === id) ?? null;
}

/** The partner to use for a method: its own partner when it is healthy, otherwise the manual partner (the fallback). */
export async function partnerFor(id: string): Promise<PayoutPartner> {
  const wanted = getPartner(id);
  if (wanted && (await wanted.healthy())) return wanted;
  return manual;
}
