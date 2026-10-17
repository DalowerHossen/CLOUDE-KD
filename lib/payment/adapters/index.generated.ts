// path: lib/payment/adapters/index.generated.ts
// GENERATED - do not edit. Source: lib/payment/adapters/*.ts (run: npm run gen)

import type { AdapterModule, ProcessorId } from '@/types/contracts';

/** Adapters that exist in code. The dashboard can only enable processors listed here. */
export const adapterLoaders: Partial<Record<ProcessorId, () => Promise<AdapterModule>>> = {
  stripe: () => import('./stripe'),
};
