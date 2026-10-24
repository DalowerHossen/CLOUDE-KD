// path: services/esign/schemas.ts
// Request shapes of the signing page. Strict: unknown fields are refused.
import { z } from 'zod';
import { plain } from '@/lib/crm/clients';
import { portalTokenSchema } from '@/services/portal/schemas';

const sha = z.string().regex(/^[0-9a-f]{64}$/);

export const signBody = z
  .strictObject({
    token: portalTokenSchema,
    /** The checksum of the wording shown on the page; the signature is refused if it no longer matches. */
    docHash: sha,
    method: z.enum(['typed', 'drawn', 'uploaded']),
    typedName: plain(2, 200),
    /** Base64 of the picture; required for drawn and uploaded. */
    image: z.string().max(700_000).nullable(),
    accepted: z.literal(true),
  })
  .refine((v) => (v.method === 'typed') === (v.image === null), {
    message: 'A drawn or uploaded signature needs a picture; a typed one does not.',
    path: ['image'],
  });
export type SignBody = z.infer<typeof signBody>;

export const declineBody = z.strictObject({ token: portalTokenSchema, reason: plain(3, 500) });
