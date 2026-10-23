// path: app/api/public/v1/automation/actions/record-payment-note/route.ts
import { noteInput } from '@/lib/integrations/automation-rules';
import { withPublicApi } from '@/lib/integrations/public-api';
import { addPaymentNote } from '@/services/integration/automation';

/** Adds a note to a payment. Sandbox keys only until the payments contract offers writes (request R1). */
export const POST = withPublicApi(
  {
    id: 'public.automation.record_payment_note',
    resource: 'invoices',
    body: noteInput,
    idempotent: true,
  },
  async ({ body, companyId, mode, key }) => {
    const done = await addPaymentNote(
      { companyId, mode, keyId: key.id },
      body.payment_id,
      body.note,
    );
    return {
      data: done,
      audit: {
        action: 'public_api.payment_note_added',
        resourceType: 'sandbox_payment',
        resourceId: body.payment_id,
      },
    };
  },
);
