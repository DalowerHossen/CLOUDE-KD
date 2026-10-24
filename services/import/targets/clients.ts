// path: services/import/targets/clients.ts
// Clients as an import and export target. A duplicate is a client with the same e-mail, else the same tax number,
// else the same name (ignoring case).
import 'server-only';
import { clientInputSchema, type ClientInput } from '@/lib/crm/clients';
import { deepMerge } from '@/lib/transfer/rows';
import { CLIENT_FIELDS, parseClientRow, type ParsedClient } from '@/lib/transfer/targets';
import type { ImportTarget } from '@/lib/transfer/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';
import {
  CLIENT_COLUMNS,
  createClient,
  getClient,
  toView,
  updateClient,
  type ClientView,
} from '@/services/client/clients';
import { EXPORT_LIMIT, filterText, likeExact } from './shared';

function viewToInput(c: ClientView): ClientInput {
  return clientInputSchema.parse({
    kind: c.kind,
    name: c.name,
    contactName: c.contactName,
    email: c.email ?? '',
    billingEmail: c.billingEmail ?? '',
    phone: c.phone,
    website: c.website,
    taxId: c.taxId,
    displayCurrency: c.displayCurrency,
    paymentTermsDays: c.paymentTermsDays,
    notes: c.notes,
    tags: c.tags,
    customFields: c.customFields,
    billing: c.billing,
    shipping: c.shipping,
    openingBalance: c.openingBalance,
    creditLimit: c.creditLimit,
    riskFlag: c.riskFlag,
    doNotContact: c.doNotContact,
    remindersOptOut: c.remindersOptOut,
    marketingConsent: c.marketingConsent,
    contactPreference: c.contactPreference,
    portalPrefs: c.portalPrefs,
    contacts: c.contacts.map((x) => ({ ...x, email: x.email ?? '' })),
  });
}

async function firstId(
  companyId: string,
  column: string,
  value: string,
  exact: boolean,
): Promise<string | null> {
  let q = getAdminSupabase()
    .from('clients')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .is('anonymized_at', null)
    .limit(1);
  q = exact ? q.eq(column, value) : q.ilike(column, likeExact(value));
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return data?.[0] ? String(data[0].id) : null;
}

export const clientsTarget: ImportTarget<ParsedClient> = {
  id: 'clients',
  writePermission: 'client.create',
  readPermission: 'client.read',
  resourceType: 'client',
  fields: CLIENT_FIELDS,
  parse: (row) => parseClientRow(row),
  fileKey: (v) =>
    v.input.email
      ? `e:${v.input.email}`
      : v.input.taxId
        ? `t:${v.input.taxId.toLowerCase()}`
        : `n:${v.input.name.toLowerCase()}`,
  async findDuplicate(companyId, v) {
    if (v.input.email) {
      const hit = await firstId(companyId, 'email', v.input.email, true);
      if (hit) return hit;
    }
    if (v.input.taxId) {
      const hit = await firstId(companyId, 'tax_id', v.input.taxId, false);
      if (hit) return hit;
    }
    return firstId(companyId, 'name', v.input.name, false);
  },
  async create(actor, v) {
    return (await createClient(actor, v.input, true)).id;
  },
  async update(actor, id, v) {
    if (!actor.companyId) return;
    const current = await getClient(actor.companyId, id);
    const merged = clientInputSchema.parse(
      deepMerge(viewToInput(current) as unknown as Record<string, unknown>, v.patch),
    );
    await updateClient(actor, id, { ...merged, expectedVersion: current.version });
  },
  exportColumns: [
    ...CLIENT_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    { key: 'status', label: 'State' },
  ],
  async exportRows(companyId, filter) {
    let q = getAdminSupabase()
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .is('anonymized_at', null)
      .order('name')
      .limit(EXPORT_LIMIT);
    if (filter.status === 'active' || filter.status === 'archived')
      q = q.eq('status', filter.status);
    const text = filterText(filter.q ?? '');
    if (text) q = q.or(`name.ilike.%${text}%,email.ilike.%${text}%,tax_id.ilike.%${text}%`);
    const { data, error } = await q;
    if (error) throw new InternalError(error);
    return (data ?? []).map((r) => {
      const c = toView(r as unknown as Record<string, unknown>, []);
      return {
        name: c.name,
        kind: c.kind,
        contact_name: c.contactName,
        email: c.email ?? '',
        billing_email: c.billingEmail ?? '',
        phone: c.phone,
        website: c.website,
        tax_id: c.taxId,
        payment_terms_days: c.paymentTermsDays === null ? '' : String(c.paymentTermsDays),
        notes: c.notes,
        tags: c.tags.join('; '),
        billing_line1: c.billing.line1,
        billing_line2: c.billing.line2,
        billing_city: c.billing.city,
        billing_region: c.billing.region,
        billing_postal_code: c.billing.postalCode,
        billing_country: c.billing.country ?? '',
        shipping_line1: c.shipping.line1,
        shipping_city: c.shipping.city,
        shipping_postal_code: c.shipping.postalCode,
        shipping_country: c.shipping.country ?? '',
        opening_balance: c.openingBalance,
        credit_limit: c.creditLimit ?? '',
        risk_flag: c.riskFlag,
        do_not_contact: c.doNotContact ? 'yes' : 'no',
        marketing_consent: c.marketingConsent ? 'yes' : 'no',
        status: c.status,
      };
    });
  },
};
