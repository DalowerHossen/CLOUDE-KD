// path: schemas/payment/credentials.ts
// The credential form is generated from the adapter's `credentialFields`: the same description gives the labels shown
// in the dashboard and the strict schema the server checks on save (REQ-ADMIN-CONNECT).
import { z } from 'zod';
import type { CredentialField, ProcessorAdapter } from '@/types/contracts';

const MAX_VALUE_LENGTH = 4000;
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f]');

/** What the dashboard shows for one field. Never contains a stored value. */
export interface CredentialFormField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  helpText: string | null;
}

export function credentialFormFields(adapter: ProcessorAdapter): CredentialFormField[] {
  return adapter.credentialFields.map((f) => ({
    key: f.key,
    label: f.label,
    secret: f.secret,
    required: f.required,
    helpText: f.helpText ?? null,
  }));
}

function fieldSchema(field: CredentialField): z.ZodTypeAny {
  const base = z.string().trim().min(1).max(MAX_VALUE_LENGTH);
  const formatted = field.pattern
    ? base.regex(new RegExp(field.pattern), `${field.label} has an invalid format.`)
    : base;
  // Control characters and line breaks never belong in a credential.
  const clean = formatted.refine((v) => !CONTROL.test(v), `${field.label} has invalid characters.`);
  return field.required ? clean : clean.optional();
}

/** Strict schema: only the declared keys, required ones present, formats checked. */
export function credentialSchema(
  adapter: ProcessorAdapter,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of adapter.credentialFields) shape[field.key] = fieldSchema(field);
  return z.object(shape).strict();
}

export function parseCredentials(
  adapter: ProcessorAdapter,
  input: unknown,
): Record<string, string> {
  const parsed = credentialSchema(adapter).parse(input);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
