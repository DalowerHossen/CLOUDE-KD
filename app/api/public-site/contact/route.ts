// path: app/api/public-site/contact/route.ts
import { withApi } from '@/lib/api/with-api';
import { CONTACT_THANKS, contactSchema, submitContact } from '@/services/cms/contact';

export const POST = withApi(
  {
    id: 'public.contact',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: contactSchema,
    auditExempt: 'The message is stored in contact_messages, which is its own record.',
  },
  async ({ body, ip }) => {
    await submitContact(body, ip);
    return { status: 202, data: { message: CONTACT_THANKS } };
  },
);
