// path: lib/middleware/chain.generated.ts
// GENERATED - do not edit. Source: config/middleware/sNN.ts (run: npm run gen)

import type { MiddlewareEntry } from '@/types/contracts';
import { entry as s04 } from '@/config/middleware/s04';

const entries: MiddlewareEntry[] = [s04];

/** Modules in execution order (lower order runs first). */
export const middlewareChain: MiddlewareEntry[] = [...entries].sort((a, b) => a.order - b.order);
