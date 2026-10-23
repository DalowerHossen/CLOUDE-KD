// path: app/api/public/v1/invoices/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { invoiceCreate, invoicesQuery } from '@/lib/integrations/public-schemas';
import { createInvoiceSandbox, listResource, requireSandbox } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.invoices.list', resource: 'invoices', query: invoicesQuery },
  async ({ query, companyId, mode }) => {
    const page = await listResource({ companyId, mode }, 'invoices', query);
    return { data: page.items, nextCursor: page.nextCursor };
  },
);

/** Sandbox keys only until the invoices service offers a write operation (request R1). */
export const POST = withPublicApi(
  { id: 'public.invoices.create', resource: 'invoices', body: invoiceCreate, idempotent: true },
  async ({ body, companyId, mode }) => {
    requireSandbox(mode);
    const created = await createInvoiceSandbox({ companyId, mode }, body);
    return {
      status: 201,
      data: created,
      audit: {
        action: 'public_api.invoice_created',
        resourceType: 'sandbox_invoice',
        resourceId: String(created.id),
      },
    };
  },
);
