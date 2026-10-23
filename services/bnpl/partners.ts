// path: services/bnpl/partners.ts
// The installment partners. The in-house partner needs no outside service: the parts are the installment plan of the
// invoice and the seller carries the risk, with the rules of the company. A live partner (it takes the risk and pays the
// seller) needs its official documentation first (rule 8) and a soft credit check call; none is built until then.
import 'server-only';
import type { Eligibility, EligibilityFacts, Offer } from '@/lib/payment/bnpl-rules';

export interface BnplPartner {
  id: string;
  label: string;
  /** True when the partner pays the seller up front and carries the non-payment risk. */
  carriesRisk: boolean;
  /** A soft credit check for the client; the in-house partner has none and relies on the company's own rules. */
  creditCheck(facts: EligibilityFacts): Promise<Eligibility | null>;
  /** Called when the client accepts an offer. */
  onAccepted(input: { planId: string; invoiceId: string; offer: Offer }): Promise<void>;
  /** Called when a part is refunded. */
  onRefund(input: { planId: string; invoiceId: string; amount: string }): Promise<void>;
}

const inHouse: BnplPartner = {
  id: 'in_house',
  label: 'Installments from the seller',
  carriesRisk: false,
  async creditCheck() {
    return null;
  },
  async onAccepted() {
    // The installment plan of the invoice already holds the parts; nothing to tell an outside partner.
  },
  async onRefund() {
    // A refund is recorded in the plan history; the seller decides about the remaining parts.
  },
};

const PARTNERS: readonly BnplPartner[] = [inHouse];

export const listBnplPartners = (): readonly BnplPartner[] => PARTNERS;
export const getBnplPartner = (id: string): BnplPartner | null =>
  PARTNERS.find((p) => p.id === id) ?? null;
