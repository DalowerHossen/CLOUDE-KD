// path: services/email/templates.ts
// Template registry and rendering. A template is a React Email component plus a definition (id, subject, variables).
import 'server-only';
import { render } from '@react-email/render';
import { createElement, type ComponentType } from 'react';
import { emailCatalog } from '@/emails/catalog';
import { ValidationError } from '@/lib/errors';
import { htmlToText } from '@/lib/email/content';
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

export async function renderTemplate(id: string, data: Record<string, unknown>): Promise<Rendered> {
  const entry = registry().get(id);
  if (!entry) throw new ValidationError(`The e-mail template "${id}" does not exist.`);
  if (!entry.component) throw new ValidationError(`The e-mail template "${id}" has no design yet.`);
  const missing = missingVariables(entry.definition, data);
  if (missing.length > 0)
    throw new ValidationError(`The e-mail template "${id}" needs: ${missing.join(', ')}.`);
  const element = createElement(entry.component as ComponentType<Record<string, unknown>>, data);
  const html = (await render(element)).replace(/<!--\/?\$-->/g, '');
  return { subject: renderSubject(entry.definition.subject, data), html, text: htmlToText(html) };
}
