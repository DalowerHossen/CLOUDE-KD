// path: config/middleware/s04.ts
import type { MiddlewareEntry } from '@/types/contracts';
import { runShield } from '@/lib/middleware/shield';

export const entry: MiddlewareEntry = {
  id: 'security-shield',
  order: 10,
  run: runShield,
};
