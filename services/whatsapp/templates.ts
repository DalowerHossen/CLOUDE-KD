// path: services/whatsapp/templates.ts
// Message templates. A live account sends the template to Meta for review (status starts as the answer, usually PENDING) and
// keeps the status current from the status webhook and from a sync. A sandbox account approves its templates at once, so the
// whole flow can be tried without Meta. Only an APPROVED template can be sent.
import 'server-only';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  createTemplate as createRemote,
  deleteTemplate as deleteRemote,
  listTemplates as listRemote,
  WhatsAppApiError,
} from '@/lib/whatsapp/client';
import {
  buildTemplateComponents,
  placeholders,
  bodyOfComponents,
  templateInput,
  templateStatusFromEvent,
  type TemplateUpdate,
} from '@/lib/whatsapp/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { credentialsOf, need, record, requireAccount } from './db';

const COLUMNS =
  'id, name, language, category, parameter_format, components, status, meta_template_id, reject_reason, source, last_synced_at, version';

interface Row {
  id: string;
  name: string;
  language: string;
  category: string;
  parameter_format: string;
  components: unknown;
  status: string;
  meta_template_id: string | null;
  reject_reason: string | null;
  source: string;
  last_synced_at: string | null;
  version: number;
}

export interface TemplateView {
  id: string;
  name: string;
  language: string;
  category: 'authentication' | 'marketing' | 'utility';
  parameterFormat: 'named' | 'positional';
  body: string;
  variables: string[];
  components: unknown;
  status: string;
  metaTemplateId: string | null;
  rejectReason: string | null;
  source: 'created' | 'synced';
  lastSyncedAt: string | null;
  version: number;
}

const toView = (r: Row): TemplateView => ({
  id: r.id,
  name: r.name,
  language: r.language,
  category:
    r.category === 'marketing'
      ? 'marketing'
      : r.category === 'authentication'
        ? 'authentication'
        : 'utility',
  parameterFormat: r.parameter_format === 'named' ? 'named' : 'positional',
  body: bodyOfComponents(r.components),
  variables: placeholders(bodyOfComponents(r.components)),
  components: r.components,
  status: r.status,
  metaTemplateId: r.meta_template_id,
  rejectReason: r.reject_reason,
  source: r.source === 'synced' ? 'synced' : 'created',
  lastSyncedAt: r.last_synced_at,
  version: r.version,
});

export async function listTemplates(companyId: string): Promise<TemplateView[]> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_templates')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(1000);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function getTemplate(companyId: string, id: string): Promise<TemplateView> {
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_templates')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

export async function createTemplate(actor: Actor, input: unknown): Promise<TemplateView> {
  const companyId = need(actor);
  const parsed = templateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The template is not valid.');
  const t = parsed.data;
  const account = await requireAccount(companyId);
  const components = buildTemplateComponents(t);
  let status = 'APPROVED';
  let metaId: string | null = null;
  if (!account.sandbox) {
    try {
      const made = await createRemote(await credentialsOf(account), {
        name: t.name,
        category: t.category,
        language: t.language,
        parameter_format: t.parameterFormat,
        components,
      });
      status = made.status;
      metaId = made.id === '' ? null : made.id;
    } catch (error) {
      if (error instanceof WhatsAppApiError) throw new ValidationError(error.message);
      throw error;
    }
  }
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_templates')
    .insert({
      company_id: companyId,
      account_id: account.id,
      name: t.name,
      language: t.language,
      category: t.category,
      parameter_format: t.parameterFormat,
      components,
      status,
      meta_template_id: metaId,
      source: 'created',
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('A template with this name and language exists.');
    mapIntegrationError(error);
  }
  const view = toView(data as unknown as Row);
  await record(companyId, 'whatsapp.template_created', 'whatsapp_template', view.id, {
    name: t.name,
    language: t.language,
    category: t.category,
    status,
    sandbox: account.sandbox,
  });
  return view;
}

/** Reads the templates of the account from Meta and updates the stored ones (status, text); new ones are added. */
export async function syncTemplates(actor: Actor): Promise<{ added: number; updated: number }> {
  const companyId = need(actor);
  const account = await requireAccount(companyId);
  if (account.sandbox) return { added: 0, updated: 0 };
  let remote;
  try {
    remote = await listRemote(await credentialsOf(account));
  } catch (error) {
    if (error instanceof WhatsAppApiError) throw new ValidationError(error.message);
    throw error;
  }
  const admin = getAdminSupabase();
  const known = await listTemplates(companyId);
  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();
  for (const r of remote) {
    if (!/^[a-z0-9_]+$/.test(r.name)) continue;
    const language = r.language.replace('-', '_');
    const existing = known.find((k) => k.name === r.name && k.language === language);
    const category = ['authentication', 'marketing', 'utility'].includes(r.category)
      ? r.category
      : 'utility';
    if (existing) {
      const { error } = await admin
        .from('whatsapp_templates')
        .update({
          status: r.status,
          components: r.components,
          category,
          meta_template_id: r.id === '' ? existing.metaTemplateId : r.id,
          last_synced_at: now,
        })
        .eq('company_id', companyId)
        .eq('id', existing.id);
      if (error) mapIntegrationError(error);
      updated += 1;
    } else {
      const { error } = await admin.from('whatsapp_templates').insert({
        company_id: companyId,
        account_id: account.id,
        name: r.name,
        language,
        category,
        parameter_format: r.parameterFormat,
        components: r.components,
        status: r.status,
        meta_template_id: r.id === '' ? null : r.id,
        source: 'synced',
        last_synced_at: now,
      });
      if (error) {
        if (error.code === '23505') continue;
        mapIntegrationError(error);
      }
      added += 1;
    }
  }
  await record(companyId, 'whatsapp.templates_synced', 'whatsapp_account', account.id, {
    added,
    updated,
  });
  return { added, updated };
}

export async function deleteTemplate(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const t = await getTemplate(companyId, id);
  const account = await requireAccount(companyId);
  if (!account.sandbox && t.metaTemplateId !== null) {
    try {
      await deleteRemote(await credentialsOf(account), t.name, t.metaTemplateId);
    } catch (error) {
      if (error instanceof WhatsAppApiError) throw new ValidationError(error.message);
      throw error;
    }
  }
  const { error } = await getAdminSupabase()
    .from('whatsapp_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'whatsapp.template_removed', 'whatsapp_template', id, { name: t.name });
}

/** A status event from Meta. Returns true when a stored template changed. */
export async function applyTemplateUpdate(
  companyId: string,
  accountId: string,
  update: TemplateUpdate,
): Promise<boolean> {
  const status = templateStatusFromEvent(update.event);
  if (status === null) return false;
  const language = update.language.replace('-', '_');
  const admin = getAdminSupabase();
  let q = admin
    .from('whatsapp_templates')
    .update({
      status,
      reject_reason:
        status === 'REJECTED' && update.reason !== '' && update.reason !== 'NONE'
          ? update.reason.slice(0, 200)
          : null,
      last_synced_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('account_id', accountId)
    .is('deleted_at', null);
  q =
    update.templateId !== ''
      ? q.eq('meta_template_id', update.templateId)
      : q.eq('name', update.name).eq('language', language);
  const { data, error } = await q.select('id');
  if (error) throw new InternalError(error);
  return (data ?? []).length > 0;
}
