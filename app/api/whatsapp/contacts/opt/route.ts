// path: app/api/whatsapp/contacts/opt/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recordDecision } from '@/services/whatsapp/contacts';

/** Records that a person agreed (with where) or declined to receive WhatsApp messages. */
export const POST = withApi(
  {
    id: 'whatsapp.contacts.opt',
    scope: 'tenant',
    permission: { action: 'whatsapp.contacts.manage', resourceType: 'whatsapp_contact' },
    body: z
      .object({
        phone: z.string().trim().min(5).max(40),
        status: z.enum(['opted_in', 'opted_out']),
        source: z
          .string()
          .trim()
          .max(60)
          .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
          .default(''),
      })
      .strict(),
    idempotent: true,
    auditExempt: 'The contact service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await recordDecision(actor, body) };
  },
);
