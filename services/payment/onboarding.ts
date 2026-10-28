// path: services/payment/onboarding.ts
// Merchant onboarding through NMI's Merchant Sign-Up API (docs/processors/nmi.md section 13): platform staff open an
// application for a company, fill it from the package NMI defines, add documents, get the legal consent link, submit it and
// follow the decision. NMI's decisions arrive by webhook (`handleSignupWebhook`); a status can also be refreshed by hand.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { createLogger } from '@/lib/logger';
import {
  EVENT_STATUS,
  EXTERNAL_APPLICATION_ID,
  PACKAGE_ID,
  APPLICATION_STATUSES,
  compactFields,
  isEditable,
  webhookBody,
  type ApplicationData,
  type ApplicationStatus,
  type PackageCollection,
  type PackageDetail,
  type PackageField,
  type FieldValue,
} from '@/lib/payment/onboarding/rules';
import {
  asJson,
  createMerchantKey,
  failIfRefused,
  multipartDocument,
  signupCall,
  type Json,
  type PartnerAccess,
} from '@/lib/payment/onboarding/nmi-signup';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { apiBase } from '@/lib/payment/adapters/nmi/shared-server';
import { saveAccount } from './company-accounts';
import { getProcessorRow, loadCurrentCredentials } from './credential-store';
import { mapPaymentDbError } from './rpc';

const log = createLogger({ component: 'processor-onboarding' });
const PROCESSOR = 'nmi';
const WEBHOOK_PATH = '/api/webhooks/nmi-signup';
const SUBSCRIBED_EVENTS = Object.keys(EVENT_STATUS);

const COLUMNS =
  'id, company_id, processor_id, external_id, package_id, status, business_name, merchant_id, gateway_id, pending_reason, reject_reason, last_event_at, created_at, updated_at, version';

interface Row {
  id: string;
  company_id: string;
  processor_id: string;
  external_id: string | null;
  package_id: string;
  status: string;
  business_name: string;
  merchant_id: string | null;
  gateway_id: string | null;
  pending_reason: string | null;
  reject_reason: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface ApplicationView {
  id: string;
  companyId: string;
  companyName: string;
  externalId: string | null;
  packageId: string;
  status: ApplicationStatus;
  businessName: string;
  merchantId: string | null;
  gatewayId: string | null;
  pendingReason: string | null;
  rejectReason: string | null;
  lastEventAt: string | null;
  createdAt: string;
  version: number;
}

const statusOf = (value: string): ApplicationStatus =>
  (APPLICATION_STATUSES as readonly string[]).includes(value)
    ? (value as ApplicationStatus)
    : 'draft';

const toView = (r: Row, companyName: string): ApplicationView => ({
  id: r.id,
  companyId: r.company_id,
  companyName,
  externalId: r.external_id,
  packageId: r.package_id,
  status: statusOf(r.status),
  businessName: r.business_name,
  merchantId: r.merchant_id,
  gatewayId: r.gateway_id,
  pendingReason: r.pending_reason,
  rejectReason: r.reject_reason,
  lastEventAt: r.last_event_at,
  createdAt: r.created_at,
  version: r.version,
});

/** The partner credentials of NMI (client id and secret) and the environment of the NMI processor. */
async function partnerAccess(): Promise<PartnerAccess> {
  const processor = await getProcessorRow(PROCESSOR);
  const { values } = await loadCurrentCredentials(PROCESSOR);
  const clientId = values.partnerClientId ?? '';
  const clientSecret = values.partnerClientSecret ?? '';
  if (clientId === '' || clientSecret === '')
    throw new ValidationError(
      'Save the "Partner OAuth2 client ID" and "Partner OAuth2 client secret" of NMI in Payment processors, NMI, Credentials first.',
    );
  return { environment: processor.environment, clientId, clientSecret };
}

async function companyNames(ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('id, name')
    .in('id', [...new Set(ids)]);
  if (error) throw new InternalError(error);
  for (const c of data ?? []) names.set(String(c.id), String(c.name));
  return names;
}

export async function listCompanies(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((c) => ({ id: String(c.id), name: String(c.name) }));
}

export async function listApplications(): Promise<ApplicationView[]> {
  const { data, error } = await getAdminSupabase()
    .from('processor_applications')
    .select(COLUMNS)
    .eq('processor_id', PROCESSOR)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw mapPaymentDbError(error);
  const rows = (data ?? []) as Row[];
  const names = await companyNames(rows.map((r) => r.company_id));
  return rows.map((r) => toView(r, names.get(r.company_id) ?? ''));
}

async function loadRow(id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('processor_applications')
    .select(COLUMNS)
    .eq('id', id)
    .eq('processor_id', PROCESSOR)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) throw new NotFoundError();
  return data as Row;
}

async function viewOf(row: Row): Promise<ApplicationView> {
  const names = await companyNames([row.company_id]);
  return toView(row, names.get(row.company_id) ?? '');
}

function externalOf(row: Row): string {
  if (!row.external_id || !EXTERNAL_APPLICATION_ID.test(row.external_id))
    throw new ValidationError('This application has not been sent to NMI yet.');
  return row.external_id;
}

// ---- Packages ------------------------------------------------------------------------------------------------------

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function fieldOf(raw: Json): PackageField {
  const choices = Array.isArray(raw.choices)
    ? raw.choices.filter((c): c is string => typeof c === 'string')
    : null;
  const def = raw.default;
  const defaultValue: FieldValue =
    typeof def === 'string' || typeof def === 'number' || typeof def === 'boolean' ? def : null;
  return {
    id: text(raw.id),
    name: text(raw.name, text(raw.id)),
    required: raw.required === true,
    type: text(raw.type, 'string'),
    choices,
    min: num(raw.min),
    max: num(raw.max),
    regex: typeof raw.regex === 'string' ? raw.regex : null,
    defaultValue,
  };
}

const objects = (v: unknown): Json[] =>
  Array.isArray(v) ? v.map(asJson).filter((x): x is Json => x !== null) : [];

export async function listPackages(): Promise<{ id: string; name: string; description: string }[]> {
  const access = await partnerAccess();
  const out: { id: string; name: string; description: string }[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = failIfRefused(
      await signupCall(access, { method: 'GET', path: `/packages?page=${page}&per_page=100` }),
    );
    for (const p of objects(body.packages))
      out.push({ id: text(p.id), name: text(p.name), description: text(p.description) });
    const last = num(body.last_page) ?? page;
    if (page >= last) break;
  }
  return out.filter((p) => PACKAGE_ID.test(p.id));
}

export async function getPackage(packageId: string): Promise<PackageDetail> {
  if (!PACKAGE_ID.test(packageId)) throw new ValidationError('Not an NMI package id.');
  const access = await partnerAccess();
  const body = failIfRefused(
    await signupCall(access, { method: 'GET', path: `/packages/${packageId}` }),
  );
  const collections: PackageCollection[] = objects(body.collections).map((c) => ({
    id: text(c.id),
    name: text(c.name, text(c.id)),
    description: text(c.description),
    min: num(c.min) ?? 0,
    max: num(c.max) ?? 1,
    fields: objects(c.fields).map(fieldOf),
  }));
  return {
    id: text(body.id, packageId),
    name: text(body.name),
    description: text(body.description),
    rules: Array.isArray(body.package_rules)
      ? body.package_rules.filter((r): r is string => typeof r === 'string')
      : [],
    fields: objects(body.fields).map(fieldOf),
    collections,
  };
}

// ---- Applications --------------------------------------------------------------------------------------------------

function payloadOf(data: ApplicationData): Json {
  return {
    fields: compactFields(data.fields),
    collections: data.collections.map((c) => ({
      id: c.id,
      records: c.records.map((r) => ({ id: r.id, fields: compactFields(r.fields) })),
    })),
  };
}

function businessNameOf(data: ApplicationData): string {
  const hit = data.fields.find(
    (f) => /dba|business_name|legal_name/.test(f.id) && typeof f.value === 'string',
  );
  return typeof hit?.value === 'string' ? hit.value.slice(0, 255) : '';
}

async function audit(
  actor: Actor,
  action: string,
  row: Row,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'processor_application',
    resourceId: row.id,
    companyId: row.company_id,
    metadata: { by: actor.userId, processor: PROCESSOR, externalId: row.external_id, ...extra },
  });
}

export async function createApplication(
  actor: Actor,
  input: { companyId: string; packageId: string; data: ApplicationData },
): Promise<ApplicationView> {
  const db = getAdminSupabase();
  const company = await db
    .from('companies')
    .select('id')
    .eq('id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (company.error) throw new InternalError(company.error);
  if (!company.data) throw new NotFoundError();
  const access = await partnerAccess();
  const created = failIfRefused(
    await signupCall(access, {
      method: 'POST',
      path: '/applications',
      idempotent: true,
      body: { package_id: input.packageId, ...payloadOf(input.data) },
    }),
  );
  const externalId = text(created.id);
  if (!EXTERNAL_APPLICATION_ID.test(externalId))
    throw new InternalError('NMI answered without an application id.');
  const { data, error } = await db
    .from('processor_applications')
    .insert({
      company_id: input.companyId,
      processor_id: PROCESSOR,
      external_id: externalId,
      package_id: input.packageId,
      status: statusOf(text(created.status, 'draft')),
      business_name: businessNameOf(input.data),
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) throw mapPaymentDbError(error);
  const row = data as Row;
  await audit(actor, 'processor_application.created', row);
  return viewOf(row);
}

export async function updateApplication(
  actor: Actor,
  id: string,
  input: { data: ApplicationData; expectedVersion: number },
): Promise<ApplicationView> {
  const row = await loadRow(id);
  if (!isEditable(statusOf(row.status)))
    throw new ConflictError('Only a draft application can be edited.');
  if (row.version !== input.expectedVersion)
    throw new ConflictError('This application was changed by someone else. Reload and try again.');
  const access = await partnerAccess();
  failIfRefused(
    await signupCall(access, {
      method: 'PATCH',
      path: `/applications/${externalOf(row)}`,
      idempotent: true,
      body: payloadOf(input.data),
    }),
  );
  const { data, error } = await getAdminSupabase()
    .from('processor_applications')
    .update({ business_name: businessNameOf(input.data) || row.business_name })
    .eq('id', id)
    .eq('version', input.expectedVersion)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data)
    throw new ConflictError('This application was changed by someone else. Reload and try again.');
  await audit(actor, 'processor_application.updated', data as Row);
  return viewOf(data as Row);
}

/** The application as NMI holds it (fields and collections), for the edit form. */
export async function readRemoteApplication(
  id: string,
): Promise<{ fields: Json[]; collections: Json[] }> {
  const row = await loadRow(id);
  const access = await partnerAccess();
  const body = failIfRefused(
    await signupCall(access, { method: 'GET', path: `/applications/${externalOf(row)}` }),
  );
  return { fields: objects(body.fields), collections: objects(body.collections) };
}

async function applyStatus(
  row: Row,
  status: ApplicationStatus,
  extra: Partial<Pick<Row, 'merchant_id' | 'gateway_id' | 'pending_reason' | 'reject_reason'>> = {},
): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('processor_applications')
    .update({ status, last_event_at: new Date().toISOString(), ...extra })
    .eq('id', row.id)
    .select(COLUMNS)
    .single();
  if (error) throw mapPaymentDbError(error);
  return data as Row;
}

export async function refreshApplication(actor: Actor, id: string): Promise<ApplicationView> {
  const row = await loadRow(id);
  const access = await partnerAccess();
  const body = failIfRefused(
    await signupCall(access, { method: 'GET', path: `/applications/${externalOf(row)}` }),
  );
  const updated = await applyStatus(row, statusOf(text(body.status, row.status)));
  await audit(actor, 'processor_application.refreshed', updated, { status: updated.status });
  return viewOf(updated);
}

export async function consentUrl(id: string): Promise<string> {
  const row = await loadRow(id);
  const access = await partnerAccess();
  const body = failIfRefused(
    await signupCall(access, {
      method: 'GET',
      path: `/applications/${externalOf(row)}/legal-consent`,
    }),
  );
  const url = text(body.url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InternalError('NMI answered without a consent address.');
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)nmi\.com$/.test(parsed.hostname))
    throw new InternalError('NMI answered with an unexpected consent address.');
  return parsed.toString();
}

export async function uploadDocument(
  actor: Actor,
  id: string,
  input: { type: string; fileName: string; mimeType: string; dataBase64: string },
): Promise<{ documentId: string }> {
  const row = await loadRow(id);
  const status = statusOf(row.status);
  if (status !== 'draft' && status !== 'underwriter_requested_information')
    throw new ConflictError('Documents can only be added to a draft or while NMI asks for more.');
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024)
    throw new ValidationError('A document must be between 1 byte and 20 MB.');
  const access = await partnerAccess();
  const body = failIfRefused(
    await signupCall(access, {
      method: 'POST',
      path: `/applications/${externalOf(row)}/documents`,
      idempotent: true,
      bytes: multipartDocument(input.type, input.fileName, input.mimeType, bytes),
    }),
  );
  await audit(actor, 'processor_application.document_added', row, { type: input.type });
  return { documentId: text(body.id) };
}

export async function submitApplication(actor: Actor, id: string): Promise<ApplicationView> {
  const row = await loadRow(id);
  if (statusOf(row.status) !== 'draft')
    throw new ConflictError('Only a draft application can be submitted.');
  const access = await partnerAccess();
  const body = failIfRefused(
    await signupCall(access, {
      method: 'POST',
      path: `/applications/${externalOf(row)}/submit`,
      idempotent: true,
    }),
  );
  const updated = await applyStatus(row, statusOf(text(body.status, 'submitted')));
  await audit(actor, 'processor_application.submitted', updated);
  return viewOf(updated);
}

export async function addNote(actor: Actor, id: string, note: string): Promise<void> {
  const row = await loadRow(id);
  if (statusOf(row.status) !== 'underwriter_requested_information')
    throw new ConflictError('NMI is not asking for more information on this application.');
  const access = await partnerAccess();
  failIfRefused(
    await signupCall(access, {
      method: 'POST',
      path: `/applications/${externalOf(row)}/info`,
      body: { note },
    }),
  );
  await applyStatus(row, 'requested_information_sent');
  await audit(actor, 'processor_application.note_sent', row);
}

// ---- Webhooks ------------------------------------------------------------------------------------------------------

/** Subscribes NMI's application events to this platform's endpoint, signed with the saved sign-up webhook secret. */
export async function subscribeWebhook(
  actor: Actor,
): Promise<{ subscriptionId: string; callbackUrl: string }> {
  const access = await partnerAccess();
  const { values } = await loadCurrentCredentials(PROCESSOR);
  const secret = values.partnerWebhookSecret ?? '';
  if (secret === '')
    throw new ValidationError('Save a "Sign-up webhook secret" (6 to 64 characters) first.');
  const callbackUrl = `${getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}${WEBHOOK_PATH}`;
  const body = failIfRefused(
    await signupCall(access, {
      method: 'POST',
      path: '/subscriptions',
      idempotent: true,
      body: { callback_url: callbackUrl, secret, events: SUBSCRIBED_EVENTS },
    }),
  );
  await getService('audit').record({
    action: 'processor_application.webhook_subscribed',
    resourceType: 'processor_application',
    resourceId: null,
    companyId: null,
    metadata: { by: actor.userId, processor: PROCESSOR, callbackUrl },
  });
  return { subscriptionId: text(body.id), callbackUrl };
}

/** True when `signature` is the hex HMAC-SHA256 of the raw body under the secret (docs section 13, header `Signature`). */
export function signatureMatches(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export type WebhookOutcome = 'applied' | 'duplicate' | 'ignored';

/**
 * Checks the signature, stores the event once by its id and moves the application to the state the event names.
 * Unknown event types are stored and ignored; an unknown application is stored and ignored.
 */
export async function handleSignupWebhook(
  rawBody: string,
  signature: string,
): Promise<WebhookOutcome> {
  const { values } = await loadCurrentCredentials(PROCESSOR);
  const secret = values.partnerWebhookSecret ?? '';
  if (secret === '' || !signatureMatches(rawBody, signature, secret))
    throw new ValidationError('The signature of this webhook is not valid.');
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new ValidationError('The webhook body is not valid JSON.');
  }
  const parsed = webhookBody.safeParse(json);
  if (!parsed.success) throw new ValidationError('The webhook body has an unexpected shape.');
  const event = parsed.data;
  const body = event.event_body;
  const appId = typeof body.app_id === 'string' ? body.app_id : null;
  const db = getAdminSupabase();
  const found =
    appId && EXTERNAL_APPLICATION_ID.test(appId)
      ? await db
          .from('processor_applications')
          .select(COLUMNS)
          .eq('processor_id', PROCESSOR)
          .eq('external_id', appId)
          .is('deleted_at', null)
          .maybeSingle()
      : null;
  if (found?.error) throw mapPaymentDbError(found.error);
  const row = (found?.data as Row | null | undefined) ?? null;
  const stored = await db.from('processor_application_events').insert({
    company_id: row?.company_id ?? null,
    processor_id: PROCESSOR,
    event_id: event.event_id,
    event_type: event.event_type,
    external_id: appId,
    body,
  });
  if (stored.error) {
    if (stored.error.code === '23505') return 'duplicate';
    throw mapPaymentDbError(stored.error);
  }
  const status = EVENT_STATUS[event.event_type];
  if (!row || !status) return 'ignored';
  const str = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v !== '' ? v.slice(0, max) : null;
  const updated = await applyStatus(row, status, {
    ...(status === 'boarded'
      ? { merchant_id: str(body.mid, 30), gateway_id: str(body.gateway_id, 30) }
      : {}),
    ...(status === 'underwriter_requested_information'
      ? { pending_reason: str(body.pending_reason, 255) }
      : {}),
    ...(status === 'rejected' || status === 'cancelled' || status === 'closed'
      ? { reject_reason: str(body.reject_reason, 255) }
      : {}),
  });
  await getService('audit').record({
    action: 'processor_application.event',
    resourceType: 'processor_application',
    resourceId: updated.id,
    companyId: updated.company_id,
    metadata: { processor: PROCESSOR, eventType: event.event_type, status },
  });
  log.info('processor application event applied', { eventType: event.event_type, status });
  return 'applied';
}

/**
 * For an application that NMI has boarded: creates the merchant's private and tokenization keys through the Partner API and
 * saves them as the company's own merchant account (switched off until a test passes). The keys never reach the browser.
 */
export async function createMerchantAccount(
  actor: Actor,
  id: string,
): Promise<{ accountId: string }> {
  const row = await loadRow(id);
  if (statusOf(row.status) !== 'boarded' || !row.gateway_id)
    throw new ConflictError('The merchant is not ready to process yet. Wait for NMI to board it.');
  const processor = await getProcessorRow(PROCESSOR);
  const { values } = await loadCurrentCredentials(PROCESSOR);
  const partnerKey = values.partnerKey ?? '';
  if (partnerKey === '')
    throw new ValidationError(
      'Save the "Partner API key" (NMI "My Keys", box "Partner Keys") in Payment processors, NMI, Credentials first.',
    );
  const base = apiBase(processor.environment, values);
  const label = row.business_name !== '' ? row.business_name : row.company_id;
  const privateKey = await createMerchantKey({
    apiBase: base,
    partnerKey,
    gatewayId: row.gateway_id,
    description: `KD SOLUTION IT private key for ${label}`,
    permission: 'transaction',
  });
  const tokenizationKey = await createMerchantKey({
    apiBase: base,
    partnerKey,
    gatewayId: row.gateway_id,
    description: `KD SOLUTION IT public key for ${label}`,
    permission: 'tokenization',
  });
  const account = await saveAccount(actor, {
    companyId: row.company_id,
    processorId: PROCESSOR,
    environment: processor.environment,
    values: {
      privateKey,
      tokenizationKey,
      ...(processor.environment === 'live' && values.liveApiBase
        ? { liveApiBase: values.liveApiBase }
        : {}),
    },
    merchantReference: row.merchant_id ?? row.gateway_id,
    applicationId: row.id,
  });
  await audit(actor, 'processor_application.keys_created', row, { accountId: account.id });
  return { accountId: account.id };
}
