// path: lib/env/s06.ts
// Environment fragment of STEP 06: public site.
import { z } from 'zod';

export const serverShape = {
  /** Where messages from the public contact form are sent. Falls back to the SMTP_FROM address. */
  CONTACT_INBOX: z.string().email().optional(),
};
