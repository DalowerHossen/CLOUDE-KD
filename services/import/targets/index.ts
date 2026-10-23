// path: services/import/targets/index.ts
// Targets of the import and export framework.
import 'server-only';
import type { ImportTarget } from '@/lib/transfer/types';
import { clientsTarget } from './clients';
import { productsTarget } from './products';
import { suppliersTarget } from './suppliers';

export const importTargets: readonly ImportTarget[] = [
  clientsTarget as unknown as ImportTarget,
  productsTarget as unknown as ImportTarget,
  suppliersTarget as unknown as ImportTarget,
];
