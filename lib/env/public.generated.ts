// path: lib/env/public.generated.ts
// GENERATED - do not edit. Source: lib/env/sNN-public.ts (run: npm run gen)

import { z } from 'zod';
import { publicShape as s01PublicShape, publicRuntime as s01PublicRuntime } from './s01-public';

export const publicSchema = z.object({ ...s01PublicShape });
export const publicRuntime: Record<string, string | undefined> = { ...s01PublicRuntime };
