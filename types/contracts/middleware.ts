// path: types/contracts/middleware.ts
import type { NextRequest, NextResponse } from 'next/server';

/** One module of the request middleware chain (config/middleware/sNN.ts exports `entry`). */
export interface MiddlewareEntry {
  id: string;
  /** Lower numbers run first. */
  order: number;
  /** Returns a response to stop the chain (block, redirect) or null to continue. */
  run(request: NextRequest): Promise<NextResponse | null>;
}
