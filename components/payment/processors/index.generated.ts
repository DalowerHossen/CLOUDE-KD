// path: components/payment/processors/index.generated.ts
// GENERATED - do not edit. Source: components/payment/processors/*/index.tsx (run: npm run gen)

import type { SecureFormLoader } from '@/components/payment/secure-form-types';
import type { ProcessorId } from '@/types/contracts';

/** Secure forms that exist in code. The checkout shows "unavailable" for a processor that has none. */
export const secureFormLoaders: Partial<Record<ProcessorId, SecureFormLoader>> = {
  stripe: () => import('./stripe'),
};
