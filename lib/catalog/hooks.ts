// path: lib/catalog/hooks.ts
// Extension points of the catalog. A later STEP registers a guard when it loads; STEP 08 asks the guards before it
// deletes a product. Without a registration nothing blocks.

/** Returns a sentence when the product may not be deleted (for example "The product is on an invoice"), else null. */
export type ProductDeleteGuard = (companyId: string, productId: string) => Promise<string | null>;

const guards = new Map<string, ProductDeleteGuard>();
export const registerProductDeleteGuard = (id: string, fn: ProductDeleteGuard): void =>
  void guards.set(id, fn);
export const productDeleteGuards = (): ProductDeleteGuard[] => [...guards.values()];
