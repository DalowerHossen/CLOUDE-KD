// path: lib/fx/provider.ts
// Providers of daily exchange rates. A provider is written from the rate source's own documentation and registers
// itself here; the daily job asks every registered provider. Without a provider, rates come from the rates a company
// types in itself.
export interface FxProviderResult {
  /** YYYY-MM-DD the rates are valid for. */
  asOf: string;
  /** Units of each currency per one US dollar, as decimal text. */
  rates: Record<string, string>;
}
export interface FxProvider {
  id: string;
  fetchRates(): Promise<FxProviderResult>;
}

const providers = new Map<string, FxProvider>();
export function registerFxProvider(provider: FxProvider): void {
  providers.set(provider.id, provider);
}
export function fxProviders(): FxProvider[] {
  return [...providers.values()];
}
