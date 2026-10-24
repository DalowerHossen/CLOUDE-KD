// path: lib/catalog/resolve.ts
// Which unit price applies: the price agreed with the client, else the volume tier for the quantity, else the variant
// price, else the product price. Pure, decimal arithmetic.
import { Money } from '@/lib/utils/currency';

export interface PricingInput {
  base: string;
  variantPrice?: string | null;
  tiers: readonly { minQty: string; unitPrice: string }[];
  clientPrice?: string | null;
  quantity: string;
}

export type PriceSource = 'client' | 'tier' | 'variant' | 'base';

export function resolveUnitPrice(input: PricingInput): { unitPrice: string; source: PriceSource } {
  if (input.clientPrice !== null && input.clientPrice !== undefined)
    return { unitPrice: Money.parse(input.clientPrice).toDbString(), source: 'client' };
  const qty = Money.parse(input.quantity);
  let tier: { minQty: string; unitPrice: string } | null = null;
  for (const t of input.tiers) {
    if (qty.gte(t.minQty) && (tier === null || Money.parse(t.minQty).gt(tier.minQty))) tier = t;
  }
  if (tier) return { unitPrice: Money.parse(tier.unitPrice).toDbString(), source: 'tier' };
  if (input.variantPrice !== null && input.variantPrice !== undefined)
    return { unitPrice: Money.parse(input.variantPrice).toDbString(), source: 'variant' };
  return { unitPrice: Money.parse(input.base).toDbString(), source: 'base' };
}

/** Margin as a percentage of the selling price, or null when the price is zero. */
export function marginPercent(unitPrice: string, costPrice: string): string | null {
  const price = Money.parse(unitPrice);
  if (price.isZero()) return null;
  return price.sub(costPrice).div(price.toDbString()).mul('100').toDbString();
}
