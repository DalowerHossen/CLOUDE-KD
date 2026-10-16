// path: lib/env/schema.generated.ts
// GENERATED - do not edit. Source: lib/env/sNN.ts (run: npm run gen)

import { z } from 'zod';
import { serverShape as s01 } from './s01';
import { serverShape as s03 } from './s03';
import { serverShape as s05 } from './s05';

export const serverSchema = z.object({ ...s01, ...s03, ...s05 });
