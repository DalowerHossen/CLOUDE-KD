// path: services/email/template-admin.ts
// Template manager: list, details, preview, edit with versions, reset to the built-in design, restore, test message.
// Edited bodies are cleaned (strict tag and attribute allow list), may only use the template's own variables and may
// only link to the application's own host or hosts allowed in config/email.ts.
import 'server-only';
import { z } from 'zod';
import {
  EXTRA_LINK_HOSTS,
  LOCKED_TEMPLATE_PREFIXES,
  TENANT_EDITABLE_PREFIXES,
} from '@/config/email';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { disallowedLinkHosts, scanContent } from '@/lib/email/content';
import { sampleData, sanitizeBodyHtml, unknownVariables } from '@/lib/email/template-body';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EmailTemplateDefinition } from '@/types/contracts';
import {
  activeOverride,
  getTemplate,
  listTemplates,
  renderOverride,
  renderTemplate,
} from './templates';

const templateId = z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,80}$/);

export const templateActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save'),
      id: templateId,
      subject: z.string().trim().min(1).max(300),
      bodyHtml: z.string().min(1).max(100_000),
      note: z.string().trim().max(300).default(''),
    })
    .strict(),
  z.object({ action: z.literal('reset'), id: templateId }).strict(),
  z
    .object({ action: z.literal('restore'), id: templateId, revision: z.number().int().min(1) })
    .strict(),
  z
    .object({
      action: z.literal('preview'),
      id: templateId,
      subject: z.string().max(300).optional(),
      bodyHtml: z.string().max(100_000).optional(),
      mobile: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal('test'),
      id: templateId,
      to: z.string().trim().toLowerCase().email().max(254),
    })
    .strict(),
]);
export type TemplateAction = z.infer<typeof templateActionSchema>;

export const categoryOf = (id: string): string => {
  const head = id.split('.')[0] ?? 'system';
  return [
    'invoice',
    'estimate',
    'payment',
    'subscription',
    'payslip',
    'auth',
    'security',
    'notification',
  ].includes(head)
    ? head
    : 'system';
};

const startsWithAny = (id: string, prefixes: readonly string[]): boolean =>
  prefixes.some((p) => id.startsWith(p));

/** Platform staff can edit every template that is not locked; a company only the customer-facing ones. */
export function canEdit(id: string, companyId: string | null): boolean {
  if (startsWithAny(id, LOCKED_TEMPLATE_PREFIXES)) return false;
  return companyId === null || startsWithAny(id, TENANT_EDITABLE_PREFIXES);
}

export interface TemplateListItem {
  id: string;
  category: string;
  subject: string;
  variables: readonly string[];
  editable: boolean;
  edited: boolean;
}

async function activeRevisions(companyId: string | null): Promise<Map<string, number>> {
  let query = getAdminSupabase()
    .from('email_template_overrides')
    .select('template_id, revision')
    .eq('status', 'active')
    .is('deleted_at', null);
  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return new Map((data ?? []).map((r) => [String(r.template_id), Number(r.revision)]));
}

export async function templateList(companyId: string | null): Promise<TemplateListItem[]> {
  const edited = await activeRevisions(companyId);
  return listTemplates()
    .filter((t) => (companyId === null ? true : canEdit(t.id, companyId)))
    .map((t) => ({
      id: t.id,
      category: categoryOf(t.id),
      subject: t.subject,
      variables: t.variables,
      editable: canEdit(t.id, companyId),
      edited: edited.has(t.id),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export interface TemplateDetail {
  id: string;
  category: string;
  editable: boolean;
  variables: readonly string[];
  defaultSubject: string;
  subject: string;
  bodyHtml: string;
  edited: boolean;
  inheritedFromPlatform: boolean;
  history: {
    revision: number;
    status: string;
    subject: string;
    note: string | null;
    createdAt: string;
  }[];
}

export async function templateDetail(
  companyId: string | null,
  id: string,
): Promise<TemplateDetail> {
  const entry = getTemplate(id);
  if (!entry) throw new NotFoundError();
  if (companyId && !canEdit(id, companyId)) throw new NotFoundError();
  const active = await activeOverride(id, companyId);
  let q = getAdminSupabase()
    .from('email_template_overrides')
    .select('revision, status, subject, note, created_at')
    .eq('template_id', id)
    .is('deleted_at', null)
    .order('revision', { ascending: false })
    .limit(30);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const history = await q;
  if (history.error) throw new InternalError(history.error);
  return {
    id,
    category: categoryOf(id),
    editable: canEdit(id, companyId),
    variables: entry.definition.variables,
    defaultSubject: entry.definition.subject,
    subject: active?.subject ?? entry.definition.subject,
    bodyHtml: active?.body ?? '',
    edited: active !== null && (companyId === null || active.scope === 'company'),
    inheritedFromPlatform: active?.scope === 'platform' && companyId !== null,
    history: (history.data ?? []).map((h) => ({
      revision: Number(h.revision),
      status: String(h.status),
      subject: String(h.subject),
      note: h.note ? String(h.note) : null,
      createdAt: String(h.created_at),
    })),
  };
}

function appHosts(): string[] {
  try {
    return [new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).hostname, ...EXTRA_LINK_HOSTS];
  } catch {
    return [...EXTRA_LINK_HOSTS];
  }
}

/** Cleans and checks an edited body. Returns the clean HTML or throws a message for the editor. */
export function validateBody(
  definition: EmailTemplateDefinition,
  subject: string,
  bodyHtml: string,
): string {
  const unknown = [
    ...unknownVariables(subject, definition.variables),
    ...unknownVariables(bodyHtml, definition.variables),
  ];
  if (unknown.length > 0)
    throw new ValidationError(
      `Unknown variable(s): ${[...new Set(unknown)].map((v) => `{{${v}}}`).join(', ')}. Allowed: ${definition.variables.map((v) => `{{${v}}}`).join(', ') || 'none'}.`,
    );
  const clean = sanitizeBodyHtml(bodyHtml);
  if (clean.replace(/<[^>]+>/g, '').trim().length === 0)
    throw new ValidationError('The message has no text.');
  const bad = disallowedLinkHosts(clean, appHosts());
  if (bad.length > 0)
    throw new ValidationError(
      `Links may only point to this application. Not allowed: ${bad.join(', ')}.`,
    );
  const serious = scanContent(bodyHtml).filter((f) =>
    ['script', 'form', 'link_text_mismatch', 'ip_address_link', 'url_shortener'].includes(f.code),
  );
  if (serious.length > 0)
    throw new ValidationError(
      `The message looks unsafe: ${serious.map((f) => f.code.replace(/_/g, ' ')).join(', ')}.`,
    );
  return clean;
}

export async function runTemplateAction(
  actor: Actor,
  companyId: string | null,
  input: TemplateAction,
): Promise<unknown> {
  const entry = getTemplate(input.id);
  if (!entry) throw new NotFoundError();
  const mayEdit = canEdit(input.id, companyId);
  const admin = getAdminSupabase();
  const audit = getService('audit');
  switch (input.action) {
    case 'save': {
      if (!mayEdit) throw new NotFoundError();
      const clean = validateBody(entry.definition, input.subject, input.bodyHtml);
      const { data, error } = await admin.rpc('kd_template_save', {
        p_company: companyId,
        p_template: input.id,
        p_subject: input.subject,
        p_body: clean,
        p_note: input.note || null,
        p_user: actor.userId,
      });
      if (error) throw new InternalError(error);
      await audit.record({
        action: 'email.template_saved',
        resourceType: 'email_template',
        resourceId: null,
        companyId,
        metadata: { template: input.id, revision: data },
      });
      return { revision: Number(data) };
    }
    case 'reset': {
      if (!mayEdit) throw new NotFoundError();
      const { data, error } = await admin.rpc('kd_template_reset', {
        p_company: companyId,
        p_template: input.id,
      });
      if (error) throw new InternalError(error);
      if (data !== true)
        throw new ValidationError('This template already uses the built-in design.');
      await audit.record({
        action: 'email.template_reset',
        resourceType: 'email_template',
        resourceId: null,
        companyId,
        metadata: { template: input.id },
      });
      return { done: true };
    }
    case 'restore': {
      if (!mayEdit) throw new NotFoundError();
      const { data, error } = await admin.rpc('kd_template_restore', {
        p_company: companyId,
        p_template: input.id,
        p_revision: input.revision,
        p_user: actor.userId,
      });
      if (error) {
        if (error.code === 'P0002') throw new NotFoundError();
        throw new InternalError(error);
      }
      await audit.record({
        action: 'email.template_restored',
        resourceType: 'email_template',
        resourceId: null,
        companyId,
        metadata: { template: input.id, from: input.revision, revision: data },
      });
      return { revision: Number(data) };
    }
    case 'preview': {
      if (input.bodyHtml !== undefined && !mayEdit) throw new NotFoundError();
      const data = sampleData(entry.definition.variables);
      const rendered =
        input.bodyHtml !== undefined
          ? await renderOverride(
              input.subject ?? entry.definition.subject,
              validateBody(
                entry.definition,
                input.subject ?? entry.definition.subject,
                input.bodyHtml,
              ),
              data,
              companyId,
            )
          : await renderTemplate(input.id, data, { companyId });
      return { subject: rendered.subject, html: rendered.html, width: input.mobile ? 375 : 640 };
    }
    case 'test': {
      await getService('email').send({
        template: input.id,
        to: input.to,
        data: sampleData(entry.definition.variables),
        companyId,
        idempotencyKey: `template-test:${input.id}:${actor.userId}:${Date.now()}`,
      });
      await audit.record({
        action: 'email.template_test',
        resourceType: 'email_template',
        resourceId: null,
        companyId,
        metadata: { template: input.id },
      });
      return { sent: true };
    }
  }
}
