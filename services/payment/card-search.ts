// path: services/payment/card-search.ts
// Find a payment by the last four digits of the card. An owner searches the payments of the owner's own company. Platform staff
// search all companies (or one): the permission `payment.card.search`, a fresh sign-in check, a written reason, a rate limit, and
// every search is written to the audit log with its filters and how many payments it found (never the people it showed).
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, RateLimitError } from '@/lib/errors';
import {
  SEARCH_STEP_UP_SECONDS,
  addressLine,
  hostOf,
  platformSearchInput,
  resolveWindow,
  tenantSearchInput,
  type CardSearchRow,
} from '@/lib/payment/card-search-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { PLATFORM_ROLES, type Actor } from '@/types/contracts';

interface Filter {
  last4: string;
  brand?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  amountMin?: string | undefined;
  amountMax?: string | undefined;
  companyId: string | null;
  limit: number;
}

const STATUSES = [
  'authorized',
  'captured',
  'partially_refunded',
  'refunded',
  'pending_review',
  'voided',
  'failed',
];

type Raw = Record<string, unknown>;

async function query(filter: Filter, now: Date): Promise<CardSearchRow[]> {
  const admin = getAdminSupabase();
  const { from, to } = resolveWindow(filter, now);
  let q = admin
    .from('payments')
    .select(
      'id, company_id, invoice_id, amount, status, card_last4, card_brand, payer_country, captured_at, created_at',
    )
    .eq('card_last4', filter.last4)
    .in('status', STATUSES)
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lt('created_at', new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString())
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filter.limit);
  if (filter.companyId) q = q.eq('company_id', filter.companyId);
  if (filter.brand) q = q.eq('card_brand', filter.brand);
  if (filter.amountMin) q = q.gte('amount', filter.amountMin);
  if (filter.amountMax) q = q.lte('amount', filter.amountMax);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const payments = (data ?? []) as Raw[];
  if (payments.length === 0) return [];

  const invoiceIds = [...new Set(payments.map((p) => String(p.invoice_id)))];
  const companyIds = [...new Set(payments.map((p) => String(p.company_id)))];
  const [invoices, companies, profiles, stores] = await Promise.all([
    admin.from('invoices').select('id, number, bill_to').in('id', invoiceIds),
    admin.from('companies').select('id, name').in('id', companyIds),
    admin
      .from('company_settings')
      .select('company_id, value')
      .eq('section', 'profile')
      .in('company_id', companyIds)
      .is('deleted_at', null),
    admin.from('checkout_sessions').select('invoice_id, success_url').in('invoice_id', invoiceIds),
  ]);
  for (const r of [invoices, companies, profiles, stores])
    if (r.error) throw new InternalError(r.error);
  const invoiceBy = new Map(((invoices.data ?? []) as Raw[]).map((r) => [String(r.id), r]));
  const nameBy = new Map(
    ((companies.data ?? []) as Raw[]).map((r) => [String(r.id), String(r.name)]),
  );
  const siteBy = new Map(
    ((profiles.data ?? []) as Raw[]).map((r) => {
      const value = (r.value ?? {}) as Raw;
      return [
        String(r.company_id),
        typeof value.website === 'string' && value.website !== '' ? value.website : null,
      ];
    }),
  );
  const storeBy = new Map(
    ((stores.data ?? []) as Raw[]).map((r) => [
      String(r.invoice_id),
      hostOf(String(r.success_url)),
    ]),
  );

  return payments.map((p) => {
    const invoice = invoiceBy.get(String(p.invoice_id));
    const bill = (invoice?.bill_to ?? {}) as Raw;
    const text = (k: string): string | null =>
      typeof bill[k] === 'string' && String(bill[k]).trim() !== '' ? String(bill[k]).trim() : null;
    return {
      paymentId: String(p.id),
      at: String(p.captured_at ?? p.created_at),
      amount: String(p.amount),
      status: String(p.status),
      card: { brand: p.card_brand ? String(p.card_brand) : null, last4: String(p.card_last4) },
      merchant: {
        companyId: String(p.company_id),
        name: nameBy.get(String(p.company_id)) ?? '',
        website: siteBy.get(String(p.company_id)) ?? null,
        store: storeBy.get(String(p.invoice_id)) ?? null,
      },
      invoiceNumber: invoice?.number ? String(invoice.number) : null,
      payer: {
        name: text('name') ?? text('contactName') ?? '',
        email: text('email'),
        phone: text('phone'),
        address: addressLine(bill),
        country: text('country') ?? (p.payer_country ? String(p.payer_country) : null),
      },
    };
  });
}

/** An owner or staff member searches the payments of the own company. */
export async function searchOwnPayments(
  actor: Actor,
  input: unknown,
  now: Date = new Date(),
): Promise<CardSearchRow[]> {
  if (!actor.companyId) throw new ForbiddenError();
  if (!(await getService('permissions').can(actor, 'payment.read', { type: 'payment', id: null })))
    throw new ForbiddenError();
  const d = tenantSearchInput.parse(input);
  const rows = await query({ ...d, companyId: actor.companyId }, now);
  await getService('audit').record({
    action: 'payment.card_search',
    resourceType: 'payment',
    resourceId: null,
    companyId: actor.companyId,
    metadata: { scope: 'company', last4: d.last4, found: rows.length },
  });
  return rows;
}

/** Platform staff search across companies. Needs a fresh sign-in check and a reason. */
export async function searchAllPayments(
  actor: Actor,
  input: unknown,
  now: Date = new Date(),
): Promise<CardSearchRow[]> {
  if (!PLATFORM_ROLES.includes(actor.role)) throw new ForbiddenError();
  if (
    !(await getService('permissions').can(actor, 'payment.card.search', {
      type: 'payment',
      id: null,
    }))
  )
    throw new ForbiddenError();
  await getService('auth').requireStepUp(actor, { maxAgeSeconds: SEARCH_STEP_UP_SECONDS });
  const limit = await getService('security').rateLimit(`card-search:${actor.userId}`, 'strict');
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
  const d = platformSearchInput.parse(input);
  const rows = await query({ ...d, companyId: d.companyId ?? null }, now);
  await getService('audit').record({
    action: 'payment.card_search',
    resourceType: 'payment',
    resourceId: null,
    companyId: null,
    metadata: {
      scope: d.companyId ? 'one_company' : 'platform',
      last4: d.last4,
      brand: d.brand ?? null,
      companyId: d.companyId ?? null,
      from: d.from ?? null,
      to: d.to ?? null,
      reason: d.reason,
      found: rows.length,
    },
  });
  return rows;
}
