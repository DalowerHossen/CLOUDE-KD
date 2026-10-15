// path: lib/middleware/chain.generated.ts
// GENERATED - do not edit. Source: config/middleware/sNN.ts (run: npm run gen)

import type { MiddlewareEntry } from '@/types/contracts';

const entries: MiddlewareEntry[] = [];

/** Modules in execution order (lower order runs first). */
export const middlewareChain: MiddlewareEntry[] = [...entries].sort((a, b) => a.order - b.order);
