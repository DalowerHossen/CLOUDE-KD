// path: lib/env/s10.ts
// Environment fragment of STEP 10: the key that turns a card fingerprint or token into the stored identity (HMAC).
import { z } from 'zod';

export const serverShape = {
  /**
   * Secret for the card identity HMAC (REQ-CARD item 5). Base64 text, at least 32 bytes. Changing it makes every
   * stored identity unmatchable, so rotate it only on purpose. Payments with card tracking stop until it is set.
   */
  CARD_IDENTITY_HMAC_KEY: z.string().min(44).max(200).optional(),
};
