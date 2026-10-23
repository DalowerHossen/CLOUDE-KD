// path: lib/env/s05.ts
// Environment fragment of STEP 05: secondary encryption keys (rotation) and the Google Drive link.
import { z } from 'zod';

/** Base64 text that decodes to exactly 32 bytes. */
const key32 = z.string().refine(
  (v) => {
    try {
      return atob(v).length === 32;
    } catch {
      return false;
    }
  },
  { message: 'must be base64 text that decodes to 32 bytes' },
);

export const serverShape = {
  /** Secondary data-key roots. ENCRYPTION_KEY is version 1 and never changes. */
  ENCRYPTION_KEY_V2: key32.optional(),
  ENCRYPTION_KEY_V3: key32.optional(),
  /** Version used for new data. Older versions stay readable for as long as their key is set. */
  ENCRYPTION_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).max(3).default(1),
  /** Base URL of a ClamAV REST gateway (optional). When set, every upload is scanned. */
  MALWARE_SCANNER_URL: z.string().url().optional(),
  MALWARE_SCANNER_TOKEN: z.string().min(8).optional(),
};
