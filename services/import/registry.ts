// path: services/import/registry.ts
// The import and export targets (clients, products, suppliers) by id.
import 'server-only';
import { NotFoundError } from '@/lib/errors';
import type { ImportTargetId } from '@/lib/transfer/mapping';
import type { ImportTarget } from '@/lib/transfer/types';
import { importTargets } from './targets';

export function getImportTarget(id: ImportTargetId): ImportTarget {
  const target = importTargets.find((t) => t.id === id);
  if (!target) throw new NotFoundError();
  return target;
}
