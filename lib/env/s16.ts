// path: lib/env/s16.ts
// Environment fragment of STEP 16: the platform's Meta app, used by "Connect with Facebook" (Facebook Pages and Instagram).
import { z } from 'zod';

export const serverShape = {
  /** The App ID of the platform's Meta app (App Dashboard > App settings > Basic). Without it the connect button is not shown. */
  META_APP_ID: z
    .string()
    .regex(/^\d{5,30}$/, 'digits only')
    .optional(),
  /** The App Secret of the same app. Server only; never sent to a browser, never logged. */
  META_APP_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9]{20,100}$/, 'letters and digits only')
    .optional(),
};
