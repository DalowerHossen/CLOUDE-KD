// path: lib/payment/adapters/index.generated.ts
// GENERATED - do not edit. Source: lib/payment/adapters/*.ts (run: npm run gen)

import type { AdapterModule, ProcessorId } from '@/types/contracts';

/** Adapters that exist in code. The dashboard can only enable processors listed here. */
export const adapterLoaders: Partial<Record<ProcessorId, () => Promise<AdapterModule>>> = {
  authorizenet: () => import('./authorizenet'),
  bluesnap: () => import('./bluesnap'),
  braintree: () => import('./braintree'),
  fastspring: () => import('./fastspring'),
  nmi: () => import('./nmi'),
  paddle: () => import('./paddle'),
  payarc: () => import('./payarc'),
  paypal: () => import('./paypal'),
  payproglobal: () => import('./payproglobal'),
  rapyd: () => import('./rapyd'),
  square: () => import('./square'),
  stripe: () => import('./stripe'),
  verifone: () => import('./verifone'),
};
