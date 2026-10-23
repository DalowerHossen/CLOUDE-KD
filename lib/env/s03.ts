// path: lib/env/s03.ts
// Environment fragment of STEP 03: GitHub sign-in credentials.
import { z } from 'zod';

export const serverShape = {
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
};
