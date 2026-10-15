// path: types/contracts/fx.ts
import type { Money } from '@/lib/utils/currency';

export interface FxService {
  /** Units of the display currency per one USD, as decimal text, at the given time. */
  rateAt(currency: string, at: Date): Promise<string>;
  /** Read-only conversion for display. Stored amounts stay in USD. */
  convertForDisplay(amount: Money, currency: string, at: Date): Promise<{ amount: string; currency: string; rate: string }>;
}
