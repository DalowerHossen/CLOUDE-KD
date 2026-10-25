// path: lib/payment/card-facts.ts
// The only readable facts kept about a card: the last four digits and the brand, as the processor returned them. Never more of the
// number. Adapters add these to the card identity; the payment core stores them so support can find a payment by them.

export interface CardFacts {
  last4?: string;
  brand?: string;
}

export function cardFacts(
  last4: string | null | undefined,
  brand: string | null | undefined,
): CardFacts {
  const out: CardFacts = {};
  if (typeof last4 === 'string' && /^\d{4}$/.test(last4.trim())) out.last4 = last4.trim();
  const clean =
    typeof brand === 'string'
      ? brand
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9 _-]/g, '')
          .slice(0, 20)
      : '';
  if (clean !== '') out.brand = clean;
  return out;
}

/** "4242", "XXXX4242" or "************4242" to the last four digits; null when they are not there. */
export function lastFourOf(masked: string | null | undefined): string | null {
  const m = typeof masked === 'string' ? /(\d{4})\s*$/.exec(masked) : null;
  return m ? (m[1] ?? null) : null;
}
