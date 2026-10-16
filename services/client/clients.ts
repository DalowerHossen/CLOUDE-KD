// path: services/client/clients.ts
// The client record: create, read, change, archive, reactivate and soft delete. Every query carries the company of
// the signed-in person, so a foreign id is "not found". A change needs the version the editor loaded (optimistic lock).
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { clientDeleteGuards } from '@/lib/crm/hooks';
import type { ClientInput, ClientUpdate, QuickClient } from '@/lib/crm/clients';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { logClientEvent } from './activity';
import { checkCustomValues, listDefs } from './custom-fields';
import { findDuplicates } from './duplicates';

export interface Address {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string | null;
}
export interface ClientContact {
  name: string;
  role: string;
  email: string | null;
  phone: string;
}
export interface ClientView {
  id: string;
  kind: 'company' | 'person';
  name: string;
  contactName: string;
  email: string | null;
  billingEmail: string | null;
  phone: string;
  website: string;
  taxId: string;
  displayCurrency: string;
  paymentTermsDays: number | null;
  notes: string;
  tags: string[];
  customFields: Record<string, string | number | boolean | null>;
  billing: Address;
  shipping: Address;
  openingBalance: string;
  creditBalance: string;
  creditLimit: string | null;
  riskFlag: 'none' | 'watch' | 'high';
  doNotContact: boolean;
  remindersOptOut: boolean;
  portalPrefs: { notifyByEmail: boolean; showStatement: boolean };
  status: 'active' | 'archived';
  contacts: ClientContact[];
  anonymized: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const CLIENT_COLUMNS =
  'id, kind, name, contact_name, email, billing_email, phone, website, tax_id, display_currency, payment_terms_days, notes, tags, custom_fields, status, ' +
  'billing_line1, billing_line2, billing_city, billing_region, billing_postal_code, billing_country, ' +
  'shipping_line1, shipping_line2, shipping_city, shipping_region, shipping_postal_code, shipping_country, ' +
  'opening_balance, credit_balance, credit_limit, risk_flag, do_not_contact, reminders_opt_out, portal_prefs, anonymized_at, version, created_at, updated_at';

type Row = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const money = (v: unknown): string => (v === null || v === undefined ? '0' : String(v));

export function toView(r: Row, contacts: ClientContact[]): ClientView {
  const prefs = (r.portal_prefs ?? {}) as { notifyByEmail?: boolean; showStatement?: boolean };
  return {
    id: String(r.id),
    kind: String(r.kind) as ClientView['kind'],
    name: text(r.name),
    contactName: text(r.contact_name),
    email: r.email ? String(r.email) : null,
    billingEmail: r.billing_email ? String(r.billing_email) : null,
    phone: text(r.phone),
    website: text(r.website),
    taxId: text(r.tax_id),
    displayCurrency: text(r.display_currency),
    paymentTermsDays:
      r.payment_terms_days === null || r.payment_terms_days === undefined
        ? null
        : Math.trunc(Number(r.payment_terms_days)),
    notes: text(r.notes),
    tags: (r.tags as string[] | null) ?? [],
    customFields: (r.custom_fields ?? {}) as ClientView['customFields'],
    billing: {
      line1: text(r.billing_line1),
      line2: text(r.billing_line2),
      city: text(r.billing_city),
      region: text(r.billing_region),
      postalCode: text(r.billing_postal_code),
      country: r.billing_country ? String(r.billing_country) : null,
    },
    shipping: {
      line1: text(r.shipping_line1),
      line2: text(r.shipping_line2),
      city: text(r.shipping_city),
      region: text(r.shipping_region),
      postalCode: text(r.shipping_postal_code),
      country: r.shipping_country ? String(r.shipping_country) : null,
    },
    openingBalance: money(r.opening_balance),
    creditBalance: money(r.credit_balance),
    creditLimit:
      r.credit_limit === null || r.credit_limit === undefined ? null : String(r.credit_limit),
    riskFlag: String(r.risk_flag) as ClientView['riskFlag'],
    doNotContact: r.do_not_contact === true,
    remindersOptOut: r.reminders_opt_out === true,
    portalPrefs: {
      notifyByEmail: prefs.notifyByEmail !== false,
      showStatement: prefs.showStatement !== false,
    },
    status: String(r.status) as ClientView['status'],
    contacts,
    anonymized: r.anonymized_at !== null && r.anonymized_at !== undefined,
    version: Math.trunc(Number(r.version)),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

async function contactsOf(companyId: string, clientId: string): Promise<ClientContact[]> {
  const { data, error } = await getAdminSupabase()
    .from('client_contacts')
    .select('name, role, email, phone, is_primary, created_at')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('created_at');
  if (error) throw new InternalError(error);
  return (data ?? []).map((c) => ({
    name: text(c.name),
    role: text(c.role),
    email: c.email ? String(c.email) : null,
    phone: text(c.phone),
  }));
}

export async function getClient(companyId: string, id: string): Promise<ClientView> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row, await contactsOf(companyId, id));
}

function columns(input: ClientInput): Row {
  return {
    kind: input.kind,
    name: input.name,
    contact_name: input.contactName,
    email: input.email,
    billing_email: input.billingEmail,
    phone: input.phone,
    website: input.website,
    tax_id: input.taxId,
    display_currency: input.displayCurrency,
    payment_terms_days: input.paymentTermsDays,
    notes: input.notes,
    tags: input.tags,
    billing_line1: input.billing.line1,
    billing_line2: input.billing.line2,
    billing_city: input.billing.city,
    billing_region: input.billing.region,
    billing_postal_code: input.billing.postalCode,
    billing_country: input.billing.country,
    shipping_line1: input.shipping.line1,
    shipping_line2: input.shipping.line2,
    shipping_city: input.shipping.city,
    shipping_region: input.shipping.region,
    shipping_postal_code: input.shipping.postalCode,
    shipping_country: input.shipping.country,
    opening_balance: input.openingBalance,
    credit_limit: input.creditLimit,
    risk_flag: input.riskFlag,
    do_not_contact: input.doNotContact,
    reminders_opt_out: input.remindersOptOut,
    portal_prefs: input.portalPrefs,
  };
}

async function saveContacts(
  companyId: string,
  clientId: string,
  input: ClientInput,
): Promise<void> {
  const rows = input.contacts.map((c) => ({
    name: c.name,
    role: c.role,
    email: c.email ?? '',
    phone: c.phone,
  }));
  const r = await getAdminSupabase().rpc('kd_client_contacts_replace', {
    p_company: companyId,
    p_client: clientId,
    p_rows: rows,
  });
  if (r.error) throw new InternalError(r.error);
}

function needCompany(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function createClient(
  actor: Actor,
  input: ClientInput,
  confirmDuplicate = false,
): Promise<ClientView> {
  const companyId = needCompany(actor);
  if (!confirmDuplicate) {
    const similar = await findDuplicates(companyId, {
      name: input.name,
      email: input.email,
      taxId: input.taxId,
    });
    if (similar.length > 0)
      throw new DuplicateError(
        'A similar client already exists. Check the list, or confirm to create it anyway.',
        similar,
      );
  }
  const custom = checkCustomValues(await listDefs(companyId, 'client'), input.customFields);
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .insert({
      company_id: companyId,
      created_by: actor.userId,
      custom_fields: custom,
      ...columns(input),
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  await saveContacts(companyId, id, input);
  await logClientEvent(companyId, id, 'system', 'Client created', '', actor.userId);
  await getService('audit').record({
    action: 'client.created',
    resourceType: 'client',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  await getService('events').publish({
    name: 'client.created',
    companyId,
    payload: { clientId: id },
  });
  return getClient(companyId, id);
}

/** The short form from the invoice screen: name, optional e-mail, billing postal code and country. */
export async function quickCreateClient(actor: Actor, input: QuickClient): Promise<ClientView> {
  const defs = await listDefs(needCompany(actor), 'client');
  if (defs.some((d) => d.required))
    throw new ValidationError('Your company has required custom fields. Use the full client form.');
  return createClient(
    actor,
    {
      kind: 'company',
      name: input.name,
      contactName: '',
      email: input.email,
      billingEmail: null,
      phone: '',
      website: '',
      taxId: '',
      displayCurrency: 'USD',
      paymentTermsDays: null,
      notes: '',
      tags: [],
      customFields: {},
      billing: {
        line1: '',
        line2: '',
        city: '',
        region: '',
        postalCode: input.postalCode,
        country: input.country,
      },
      shipping: { line1: '', line2: '', city: '', region: '', postalCode: '', country: null },
      openingBalance: '0',
      creditLimit: null,
      riskFlag: 'none',
      doNotContact: false,
      remindersOptOut: false,
      portalPrefs: { notifyByEmail: true, showStatement: true },
      contacts: [],
    },
    input.confirmDuplicate,
  );
}

export async function updateClient(
  actor: Actor,
  id: string,
  input: ClientUpdate,
): Promise<ClientView> {
  const companyId = needCompany(actor);
  const current = await getClient(companyId, id);
  if (current.anonymized)
    throw new ValidationError('This client was anonymized and cannot be changed.');
  const custom = checkCustomValues(await listDefs(companyId, 'client'), input.customFields);
  const { expectedVersion, ...rest } = input;
  const r = await getAdminSupabase()
    .from('clients')
    .update({ ...columns(rest), custom_fields: custom })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await saveContacts(companyId, id, rest);
  await getService('audit').record({
    action: 'client.updated',
    resourceType: 'client',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  await getService('events').publish({
    name: 'client.updated',
    companyId,
    payload: { clientId: id },
  });
  return getClient(companyId, id);
}

export async function setClientStatus(
  actor: Actor,
  id: string,
  action: 'archive' | 'reactivate',
): Promise<ClientView> {
  const companyId = needCompany(actor);
  const status = action === 'archive' ? 'archived' : 'active';
  const r = await getAdminSupabase()
    .from('clients')
    .update({ status })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await logClientEvent(
    companyId,
    id,
    'status',
    action === 'archive' ? 'Client archived' : 'Client reactivated',
    '',
    actor.userId,
  );
  await getService('audit').record({
    action: `client.${action === 'archive' ? 'archived' : 'reactivated'}`,
    resourceType: 'client',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  await getService('events').publish({
    name: 'client.updated',
    companyId,
    payload: { clientId: id, status },
  });
  return getClient(companyId, id);
}

/** Soft delete. A registered guard (for example "the client has invoices") blocks it; archive instead. */
export async function deleteClient(actor: Actor, id: string): Promise<void> {
  const companyId = needCompany(actor);
  await getClient(companyId, id);
  for (const guard of clientDeleteGuards()) {
    const reason = await guard(companyId, id);
    if (reason) throw new ValidationError(`${reason} Archive the client instead.`);
  }
  const r = await getAdminSupabase()
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'client.deleted',
    resourceType: 'client',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  await getService('events').publish({
    name: 'client.updated',
    companyId,
    payload: { clientId: id, deleted: true },
  });
}

/** A short list for the first screen; the search service (08.2) takes over the real list. */
export async function recentClients(
  companyId: string,
  status: 'active' | 'archived',
): Promise<ClientView[]> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('company_id', companyId)
    .eq('status', status)
    .is('deleted_at', null)
    .order('name')
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toView(r as unknown as Row, []));
}
