// path: components/payment/processors/index.generated.ts
// GENERATED - do not edit. Source: components/payment/processors/*/index.tsx (run: npm run gen)

import type { SecureFormLoader } from '@/components/payment/secure-form-types';
import type { ProcessorId } from '@/types/contracts';

/** Secure forms that exist in code. The checkout shows "unavailable" for a processor that has none. */
export const secureFormLoaders: Partial<Record<ProcessorId, SecureFormLoader>> = {
  authorizenet: () => import('./authorizenet'),
  bluesnap: () => import('./bluesnap'),
  braintree: () => import('./braintree'),
  fastspring: () => import('./fastspring'),
  payproglobal: () => import('./payproglobal'),
  payarc: () => import('./payarc'),
  paypal: () => import('./paypal'),
  square: () => import('./square'),
  stripe: () => import('./stripe'),
  verifone: () => import('./verifone'),
};
