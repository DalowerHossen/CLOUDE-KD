// path: services/email/templates.ts
// Template registry and rendering. A template is a React Email component plus a definition (id, subject, variables).
import 'server-only';
import { render } from '@react-email/render';
import { createElement, type ComponentType } from 'react';
import { emailCatalog } from '@/emails/catalog';
import { ValidationError } from '@/lib/errors';
import { htmlToText } from '@/lib/email/content';
import { fillVariables, sanitizeBodyHtml, wrapInShell } from '@/lib/email/template-body';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { replaceUntilStable } from '@/lib/utils/html-text';
import { resolveBrand } from './brand';
import type { EmailTemplateDefinition } from '@/types/contracts';

interface Registered {
  definition: EmailTemplateDefinition;
  component: ComponentType<never> | null;
}

const KEY = Symbol.for('kd.solution.it.email.templates');
function registry(): Map<string, Registered> {
  const holder = globalThis as unknown as Record<symbol, Map<string, Registered> | undefined>;
  const existing = holder[KEY];
  if (existing) return existing;
  const created = new Map<string, Registered>();
  holder[KEY] = created;
  for (const t of emailCatalog)
    created.set(t.definition.id, { definition: t.definition, component: t.component });
  return created;
}

/** Adds or replaces a definition. The component of an existing catalogue entry is kept. */
export function registerTemplate(
  definition: EmailTemplateDefinition,
  component?: ComponentType<never>,
): void {
  const map = registry();
  const current = map.get(definition.id);
  map.set(definition.id, { definition, component: component ?? current?.component ?? null });
}

export function listTemplates(): EmailTemplateDefinition[] {
  return [...registry().values()].map((r) => r.definition);
}

export function getTemplate(id: string): Registered | undefined {
  return registry().get(id);
}

export function missingVariables(
  definition: EmailTemplateDefinition,
  data: Record<string, unknown>,
): string[] {
  return definition.variables.filter((v) => data[v] === undefined || data[v] === null);
}

/** Subject text: "{name}" placeholders are filled from the data. */
export function renderSubject(subject: string, data: Record<string, unknown>): string {
  return subject
    .replace(/\{(\w+)\}/g, (m, name: string) =>
      typeof data[name] === 'string' || typeof data[name] === 'number' ? String(data[name]) : m,
    )
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

/** The active edited version for a company, else the platform's edited version, else none. */
export async function activeOverride(
  templateId: string,
  companyId: string | null,
): Promise<{ subject: string; body: string; scope: 'company' | 'platform' } | null> {
  const admin = getAdminSupabase();
  const lookup = async (id: string | null): Promise<{ subject: string; body: string } | null> => {
    let query = admin
      .from('email_template_overrides')
      .select('subject, body_html')
      .eq('template_id', templateId)
      .eq('status', 'active')
      .is('deleted_at', null);
    query = id ? query.eq('company_id', id) : query.is('company_id', null);
    const { data } = await query.maybeSingle();
    return data ? { subject: String(data.subject), body: String(data.body_html) } : null;
  };
  if (companyId) {
    const own = await lookup(companyId);
    if (own) return { ...own, scope: 'company' };
  }
  const platform = await lookup(null);
  return platform ? { ...platform, scope: 'platform' } : null;
}

/** Renders an edited body: values are escaped, the result is cleaned again and put into the brand shell. */
export async function renderOverride(
  subject: string,
  body: string,
  data: Record<string, unknown>,
  companyId: string | null,
): Promise<Rendered> {
  const brand = await resolveBrand(companyId);
  const filled = sanitizeBodyHtml(fillVariables(body, data, 'html'), {
    allowPlaceholderUri: false,
  });
  const html = wrapInShell(brand, filled, fillVariables(subject, data, 'text'));
  return {
    subject: fillVariables(subject, data, 'text').slice(0, 300),
    html,
    text: htmlToText(html),
  };
}

export async function renderTemplate(
  id: string,
  data: Record<string, unknown>,
  options: { companyId?: string | null; ignoreOverride?: boolean } = {},
): Promise<Rendered> {
  const entry = registry().get(id);
  if (!entry) throw new ValidationError(`The e-mail template "${id}" does not exist.`);
  const missing = missingVariables(entry.definition, data);
  if (missing.length > 0)
    throw new ValidationError(`The e-mail template "${id}" needs: ${missing.join(', ')}.`);
  if (!options.ignoreOverride) {
    const override = await activeOverride(id, options.companyId ?? null);
    if (override)
      return renderOverride(override.subject, override.body, data, options.companyId ?? null);
  }
  if (!entry.component) throw new ValidationError(`The e-mail template "${id}" has no design yet.`);
  const element = createElement(entry.component as ComponentType<Record<string, unknown>>, data);
  const html = replaceUntilStable(await render(element), /<!--\/?\$-->/g, '');
  return { subject: renderSubject(entry.definition.subject, data), html, text: htmlToText(html) };
}
