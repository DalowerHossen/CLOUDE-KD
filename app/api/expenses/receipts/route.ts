// path: app/api/expenses/receipts/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_ATTACHMENT_BODY_BYTES } from '@/config/s15-accounting';
import { attachmentInput } from '@/services/accounting/attachments';
import { uploadReceipt } from '@/services/expense/receipts';

export const POST = withApi(
  {
    id: 'expenses.receipts.upload',
    scope: 'tenant',
    permission: { action: 'expense.create', resourceType: 'receipt' },
    body: attachmentInput,
    maxBodyBytes: MAX_ATTACHMENT_BODY_BYTES,
    auditExempt: 'The receipt service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await uploadReceipt(actor, body) };
  },
);
