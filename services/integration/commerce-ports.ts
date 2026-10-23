// path: services/integration/commerce-ports.ts
// The only place where the store sync calls into STEP 08 (clients and products) and STEP 09 (invoices). A client is found and made
// through the import target of the clients list of the owning service (the same way the migration wizard does, request R7), and
// a product is checked through the product service. Invoice drafts have no contract yet (request R1, BLOCKERS B7): the function
// answers null, and the order waits as "client ready". When R1 is answered, this is the only file that changes.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { clientInputSchema } from '@/lib/crm/clients';
import { parseClientRow } from '@/lib/transfer/targets';
import type { Actor } from '@/types/contracts';
import { clientsTarget } from '@/services/import/targets/clients';
import { getProduct } from '@/services/product/products';
import type { NormalizedOrder } from '@/lib/integrations/mapping-rules';
import { clientNameOf } from '@/lib/integrations/mapping-rules';

/** The client of an order: the client with the same e-mail (or name), else a new one made through the clients service. */
export async function findOrCreateClient(
  actor: Actor,
  order: NormalizedOrder,
): Promise<{ id: string; created: boolean }> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const b = order.billing;
  const parsed = parseClientRow({
    name: clientNameOf(order),
    kind: 'person',
    email: order.email ?? '',
    billing_line1: b?.line1 ?? '',
    billing_city: b?.city ?? '',
    billing_region: b?.region ?? '',
    billing_postal_code: b?.postalCode ?? '',
    billing_country: b?.country ?? '',
  });
  if (!parsed.ok) throw new ValidationError(parsed.errors[0] ?? 'The client is not valid.');
  clientInputSchema.parse(parsed.value.input);
  const existing = await clientsTarget.findDuplicate(actor.companyId, parsed.value);
  if (existing !== null) return { id: existing, created: false };
  return { id: await clientsTarget.create(actor, parsed.value), created: true };
}

/** True when the product exists in the company (NotFound from the product service otherwise). */
export async function productExists(companyId: string, productId: string): Promise<boolean> {
  try {
    await getProduct(companyId, productId);
    return true;
  } catch {
    return false;
  }
}

/** Whether the invoices service can make a draft for an order (request R1 is open: it cannot yet). */
export const invoiceDraftsAvailable = (): boolean => false;

/** Makes an invoice draft for an order and returns its id; null while request R1 is open. */
export async function createInvoiceDraft(
  _actor: Actor,
  _order: NormalizedOrder,
  _clientId: string,
): Promise<string | null> {
  return null;
}
