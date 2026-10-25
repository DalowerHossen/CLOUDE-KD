// path: lib/env/schema.generated.ts
// GENERATED - do not edit. Source: lib/env/sNN.ts (run: npm run gen)

import { z } from 'zod';
import { serverShape as s01 } from './s01';
import { serverShape as s03 } from './s03';
import { serverShape as s05 } from './s05';
import { serverShape as s06 } from './s06';
import { serverShape as s09 } from './s09';
import { serverShape as s10 } from './s10';
import { serverShape as s16 } from './s16';

export const serverSchema = z.object({ ...s01, ...s03, ...s05, ...s06, ...s09, ...s10, ...s16 });
