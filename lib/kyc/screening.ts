// path: lib/kyc/screening.ts
// Hook for sanctions and anti-money-laundering screening. No provider is built in: a provider registers itself
// (for example an adapter written from its official documentation) and is called when a review starts.
// Without a provider the review shows "not configured" and the reviewer must check by hand.

export interface ScreeningSubject {
  name: string;
  countryCode: string | null;
  kind: 'business' | 'person';
}

export interface ScreeningResult {
  status: 'clear' | 'hits' | 'error';
  summary: string;
}

export interface ScreeningProvider {
  id: string;
  screen(subjects: readonly ScreeningSubject[]): Promise<ScreeningResult>;
}

const providers: ScreeningProvider[] = [];

export function registerScreeningProvider(provider: ScreeningProvider): void {
  if (!providers.some((p) => p.id === provider.id)) providers.push(provider);
}

/** Runs every registered provider. The worst result wins: any "hits" beats "error", which beats "clear". */
export async function runScreening(
  subjects: readonly ScreeningSubject[],
): Promise<ScreeningResult | null> {
  if (providers.length === 0) return null;
  const results: ScreeningResult[] = [];
  for (const provider of providers) {
    try {
      results.push(await provider.screen(subjects));
    } catch {
      results.push({
        status: 'error',
        summary: `${provider.id}: the screening could not be completed.`,
      });
    }
  }
  const rank = { clear: 0, error: 1, hits: 2 } as const;
  const worst = results.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
  return {
    status: worst.status,
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000),
  };
}
