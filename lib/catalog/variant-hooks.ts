// path: lib/catalog/variant-hooks.ts
// Guards that stop a variant from being removed (for example "it still has stock"). Registered by later sub-steps and
// STEPs; without a registration nothing blocks.
export type VariantRemoveGuard = (companyId: string, variantId: string) => Promise<string | null>;

const guards = new Map<string, VariantRemoveGuard>();
export const registerVariantRemoveGuard = (id: string, fn: VariantRemoveGuard): void =>
  void guards.set(id, fn);
export const variantHooks = (): VariantRemoveGuard[] => [...guards.values()];
