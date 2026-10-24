// path: services/contract/templates.ts
// The template library: the pre-built wordings and the company's own. A company can also copy a pre-built one.
import 'server-only';
import { InternalError, NotFoundError } from '@/lib/errors';
import { sanitizeBodyHtml } from '@/lib/email/template-body';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { CONTRACT_LIBRARY, libraryTemplate } from './library';
import type { TemplateInput } from './schemas';

export interface TemplateView {
  /** "nda" for a pre-built one, "custom:<id>" for the company's own. */
  key: string;
  name: string;
  builtIn: boolean;
  bodyHtml: string;
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new NotFoundError();
  return actor.companyId;
}

/** Contract wording is rich text; only a safe set of tags survives (no script, no event handlers, no remote images). */
export function cleanContractHtml(html: string): string {
  return sanitizeBodyHtml(html, { allowPlaceholderUri: false });
}

export async function listTemplates(companyId: string): Promise<TemplateView[]> {
  const { data, error } = await getAdminSupabase()
    .from('contract_templates')
    .select('id, name, body_html')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw new InternalError(error);
  return [
    ...CONTRACT_LIBRARY.map((t) => ({ key: t.key, name: t.name, builtIn: true, bodyHtml: t.html })),
    ...(data ?? []).map((r) => ({
      key: `custom:${String(r.id)}`,
      name: String(r.name),
      builtIn: false,
      bodyHtml: String(r.body_html),
    })),
  ];
}

/** The wording behind a template key, for this company only. */
export async function templateBody(companyId: string, key: string): Promise<string> {
  const builtIn = libraryTemplate(key);
  if (builtIn) return builtIn.html;
  const m = /^custom:([0-9a-f-]{36})$/.exec(key);
  if (!m) throw new NotFoundError();
  const { data, error } = await getAdminSupabase()
    .from('contract_templates')
    .select('body_html')
    .eq('id', m[1])
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return String(data.body_html);
}

export async function createTemplate(actor: Actor, input: TemplateInput): Promise<TemplateView> {
  const companyId = need(actor);
  const body = cleanContractHtml(input.bodyHtml);
  const { data, error } = await getAdminSupabase()
    .from('contract_templates')
    .insert({ company_id: companyId, name: input.name, body_html: body, created_by: actor.userId })
    .select('id')
    .single();
  if (error || !data) throw new InternalError(error);
  return { key: `custom:${String(data.id)}`, name: input.name, builtIn: false, bodyHtml: body };
}

export async function deleteTemplate(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('contract_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
}
