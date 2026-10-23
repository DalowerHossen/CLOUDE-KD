// path: lib/whatsapp/rules.ts
// WhatsApp as pure functions: phone numbers, the inputs, template building and checking, the message payloads of the Cloud API,
// the 24 hour window, opt-out words, the signature of a webhook, parsing of webhook payloads, and the order of message
// statuses. No database or network here. Shapes follow docs/integrations/whatsapp.md.
import { z } from 'zod';
import {
  OPT_IN_WORDS,
  OPT_OUT_WORDS,
  WHATSAPP_ERROR_TEXT,
  WHATSAPP_TEMPLATE_BODY_MAX,
  WHATSAPP_TEMPLATE_FOOTER_MAX,
  WHATSAPP_TEMPLATE_HEADER_MAX,
  WHATSAPP_TEXT_MAX,
  WHATSAPP_WINDOW_HOURS,
} from '@/config/s16-whatsapp';
import { verifyHmacSignature } from '@/lib/webhook';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

/* ---------- phone numbers ---------- */

/** A phone number in E.164 form (+ and 8 to 15 digits, not starting with 0), or null. Spaces, dashes, dots and brackets are ignored. */
export function toE164(input: string): string | null {
  let text = input.trim().replace(/[\s().-]/g, '');
  if (text.startsWith('00')) text = `+${text.slice(2)}`;
  if (!text.startsWith('+')) text = `+${text}`;
  return /^\+[1-9][0-9]{7,14}$/.test(text) ? text : null;
}

const phone = z
  .string()
  .max(40)
  .transform((v, ctx) => {
    const e164 = toE164(v);
    if (e164 === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter the number with its country code, for example +16505551234.',
      });
      return z.NEVER;
    }
    return e164;
  });

/* ---------- account ---------- */

const digits = (label: string): z.ZodString =>
  z
    .string()
    .trim()
    .regex(/^[0-9]{5,25}$/, `${label} is made of digits only.`);
const secretText = (min: number, max: number): z.ZodString =>
  z.string().trim().min(min).max(max).regex(/^\S+$/, 'It must not contain spaces.');

export const accountInput = z
  .object({
    wabaId: digits('The WhatsApp Business Account id'),
    phoneNumberId: digits('The phone number id'),
    accessToken: secretText(20, 600),
    appSecret: secretText(16, 128),
    sandbox: z.boolean().default(true),
  })
  .strict();

export const accountUpdate = z
  .object({
    version: z.number().int().min(1),
    wabaId: digits('The WhatsApp Business Account id').optional(),
    phoneNumberId: digits('The phone number id').optional(),
    accessToken: secretText(20, 600).optional(),
    appSecret: secretText(16, 128).optional(),
    sandbox: z.boolean().optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict();

/* ---------- templates ---------- */

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** The placeholders of a text in order of appearance, without repeats. */
export function placeholders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) {
    const name = (m[1] ?? '').trim();
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

export type ParameterFormat = 'named' | 'positional';

/** Why a placeholder list is not allowed for the format, or null. */
export function placeholderProblem(
  names: readonly string[],
  format: ParameterFormat,
): string | null {
  if (format === 'positional') {
    for (let i = 0; i < names.length; i += 1)
      if (names[i] !== String(i + 1))
        return 'Positional parameters must be {{1}}, {{2}} and so on, in order.';
    return null;
  }
  for (const n of names)
    if (!/^[a-z][a-z0-9_]*$/.test(n))
      return 'Named parameters use lower case letters, digits and underscores, for example {{first_name}}.';
  return null;
}

export const templateInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/, 'Use lower case letters, digits and underscores.'),
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(_[A-Za-z]{2,4})?$/, 'Use a language code like en or en_US.'),
    category: z.enum(['authentication', 'marketing', 'utility']),
    parameterFormat: z.enum(['named', 'positional']).default('positional'),
    header: plain(0, WHATSAPP_TEMPLATE_HEADER_MAX).default(''),
    body: plain(1, WHATSAPP_TEMPLATE_BODY_MAX),
    footer: plain(0, WHATSAPP_TEMPLATE_FOOTER_MAX).default(''),
    /** Example values for the parameters of the body, in the order they appear. */
    bodyExamples: z.array(plain(1, 200)).max(30).default([]),
    headerExample: plain(0, 200).default(''),
  })
  .strict()
  .superRefine((v, ctx) => {
    const body = placeholders(v.body);
    const bad = placeholderProblem(body, v.parameterFormat);
    if (bad) ctx.addIssue({ code: 'custom', path: ['body'], message: bad });
    else if (v.bodyExamples.length !== body.length)
      ctx.addIssue({
        code: 'custom',
        path: ['bodyExamples'],
        message: 'Give one example value for every parameter of the body.',
      });
    const head = placeholders(v.header);
    if (head.length > 1)
      ctx.addIssue({
        code: 'custom',
        path: ['header'],
        message: 'A header can have one parameter at most.',
      });
    else if (head.length === 1 && v.headerExample === '')
      ctx.addIssue({
        code: 'custom',
        path: ['headerExample'],
        message: 'Give an example value for the header parameter.',
      });
    if (placeholders(v.footer).length > 0)
      ctx.addIssue({
        code: 'custom',
        path: ['footer'],
        message: 'A footer cannot have parameters.',
      });
  });

export type TemplateInput = z.infer<typeof templateInput>;

/** The `components` array of the template-create request (header as text, body, footer). */
export function buildTemplateComponents(t: TemplateInput): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (t.header !== '') {
    const head = placeholders(t.header);
    out.push({
      type: 'HEADER',
      format: 'TEXT',
      text: t.header,
      ...(head.length === 1
        ? {
            example:
              t.parameterFormat === 'named'
                ? { header_text_named_params: [{ param_name: head[0], example: t.headerExample }] }
                : { header_text: [t.headerExample] },
          }
        : {}),
    });
  }
  const body = placeholders(t.body);
  out.push({
    type: 'BODY',
    text: t.body,
    ...(body.length > 0
      ? {
          example:
            t.parameterFormat === 'named'
              ? {
                  body_text_named_params: body.map((n, i) => ({
                    param_name: n,
                    example: t.bodyExamples[i],
                  })),
                }
              : { body_text: [t.bodyExamples] },
        }
      : {}),
  });
  if (t.footer !== '') out.push({ type: 'FOOTER', text: t.footer });
  return out;
}

/** The body text of a stored template (from its components), or ''. */
export function bodyOfComponents(components: unknown): string {
  if (!Array.isArray(components)) return '';
  for (const c of components) {
    const part = c as { type?: unknown; text?: unknown };
    if (String(part.type).toUpperCase() === 'BODY' && typeof part.text === 'string')
      return part.text;
  }
  return '';
}

/** The parameters the body of a stored template needs, in order. */
export function templateVariables(components: unknown): string[] {
  return placeholders(bodyOfComponents(components));
}

/** The text of the template with the values filled in (for the log and the preview). */
export function renderTemplate(
  components: unknown,
  values: Readonly<Record<string, string>>,
): string {
  return bodyOfComponents(components).replace(
    PLACEHOLDER,
    (_m, raw: string) => values[raw.trim()] ?? '',
  );
}

/* ---------- sending ---------- */

export const sendTextInput = z
  .object({
    to: phone,
    body: plain(1, WHATSAPP_TEXT_MAX),
    previewUrl: z.boolean().default(false),
    clientId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const sendTemplateInput = z
  .object({
    to: phone,
    templateId: z.string().uuid(),
    /** Values for the body parameters, keyed by placeholder ("1", "2" or the name). */
    values: z.record(plain(1, 1024)).default({}),
    clientId: z.string().uuid().nullable().default(null),
  })
  .strict();

export function buildTextPayload(
  to: string,
  body: string,
  previewUrl: boolean,
): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: previewUrl, body },
  };
}

export function buildTemplatePayload(
  to: string,
  template: {
    name: string;
    language: string;
    parameterFormat: ParameterFormat;
    components: unknown;
  },
  values: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const vars = templateVariables(template.components);
  const parameters = vars.map((v) => ({
    type: 'text',
    ...(template.parameterFormat === 'named' ? { parameter_name: v } : {}),
    text: values[v] ?? '',
  }));
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template.name,
      // The send payload names the language with the same code the template was created with.
      language: { code: template.language },
      ...(parameters.length > 0 ? { components: [{ type: 'body', parameters }] } : {}),
    },
  };
}

/** The values that are missing for a template, or an empty list. */
export function missingValues(
  components: unknown,
  values: Readonly<Record<string, string>>,
): string[] {
  return templateVariables(components).filter((v) => (values[v] ?? '').trim() === '');
}

/** True while the person's last message is less than 24 hours old: free text may be sent. */
export function windowOpen(lastInboundAt: string | null, now: Date): boolean {
  if (lastInboundAt === null) return false;
  return now.getTime() - Date.parse(lastInboundAt) < WHATSAPP_WINDOW_HOURS * 3_600_000;
}

export interface SendCheck {
  ok: boolean;
  reason: string | null;
}

/** May a message go to this person now? Free text needs an open window; a template needs an approved status. */
export function checkSend(input: {
  optStatus: 'opted_in' | 'opted_out' | 'unknown';
  lastInboundAt: string | null;
  kind: 'text' | 'template';
  templateStatus?: string;
  now: Date;
}): SendCheck {
  if (input.optStatus === 'opted_out')
    return { ok: false, reason: 'This person opted out of messages.' };
  const open = windowOpen(input.lastInboundAt, input.now);
  if (input.optStatus !== 'opted_in' && !open)
    return { ok: false, reason: 'This person has not opted in to messages.' };
  if (input.kind === 'text' && !open)
    return {
      ok: false,
      reason:
        'More than 24 hours passed since the person wrote. Send an approved template instead.',
    };
  if (input.kind === 'template' && input.templateStatus !== 'APPROVED')
    return { ok: false, reason: 'Only an approved template can be sent.' };
  return { ok: true, reason: null };
}

/* ---------- opt-out words ---------- */

const normaliseWord = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ');
export const isOptOutText = (text: string): boolean => OPT_OUT_WORDS.includes(normaliseWord(text));
export const isOptInText = (text: string): boolean => OPT_IN_WORDS.includes(normaliseWord(text));

/* ---------- Graph errors ---------- */

export interface GraphError {
  code: number | null;
  message: string;
  details: string;
}

export function parseGraphError(json: unknown): GraphError {
  const e = (
    json as {
      error?: { code?: unknown; message?: unknown; error_data?: { details?: unknown } };
    } | null
  )?.error;
  const code = typeof e?.code === 'number' ? e.code : null;
  return {
    code,
    message: typeof e?.message === 'string' ? e.message.slice(0, 300) : 'The request was refused.',
    details: typeof e?.error_data?.details === 'string' ? e.error_data.details.slice(0, 300) : '',
  };
}

export function failureText(code: number | null, fallback: string): string {
  return (code !== null ? WHATSAPP_ERROR_TEXT[code] : undefined) ?? fallback;
}

/* ---------- webhooks ---------- */

/** `X-Hub-Signature-256` is `sha256=<hex HMAC-SHA256 of the raw body with the app secret>`. */
export async function verifyMetaSignature(
  appSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (header === null || !header.startsWith('sha256=')) return false;
  return verifyHmacSignature(appSecret, rawBody, header);
}

export interface InboundMessage {
  wabaId: string;
  phoneNumberId: string;
  from: string;
  waMessageId: string;
  timestamp: string;
  type: string;
  text: string;
  profileName: string;
}

export interface StatusUpdate {
  wabaId: string;
  phoneNumberId: string;
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient: string;
  errorCode: number | null;
  errorText: string;
}

export interface TemplateUpdate {
  wabaId: string;
  event: string;
  templateId: string;
  name: string;
  language: string;
  reason: string;
}

export interface ParsedWebhook {
  messages: InboundMessage[];
  statuses: StatusUpdate[];
  templates: TemplateUpdate[];
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Reads the three kinds of update the platform uses; anything else in the payload is ignored. */
export function parseWebhook(json: unknown): ParsedWebhook {
  const out: ParsedWebhook = { messages: [], statuses: [], templates: [] };
  const root = rec(json);
  if (root.object !== 'whatsapp_business_account') return out;
  for (const entryRaw of arr(root.entry)) {
    const entry = rec(entryRaw);
    const wabaId = str(entry.id);
    for (const changeRaw of arr(entry.changes)) {
      const change = rec(changeRaw);
      const value = rec(change.value);
      const field = str(change.field);
      if (field === 'messages') {
        const phoneNumberId = str(rec(value.metadata).phone_number_id);
        const names = new Map<string, string>();
        for (const c of arr(value.contacts))
          names.set(str(rec(c).wa_id), str(rec(rec(c).profile).name));
        for (const mRaw of arr(value.messages)) {
          const m = rec(mRaw);
          const from = str(m.from);
          if (str(m.id) === '' || from === '') continue;
          out.messages.push({
            wabaId,
            phoneNumberId,
            from,
            waMessageId: str(m.id),
            timestamp: str(m.timestamp),
            type: str(m.type) || 'other',
            text: str(rec(m.text).body),
            profileName: names.get(from) ?? '',
          });
        }
        for (const sRaw of arr(value.statuses)) {
          const s = rec(sRaw);
          const status = str(s.status);
          if (
            status !== 'sent' &&
            status !== 'delivered' &&
            status !== 'read' &&
            status !== 'failed'
          )
            continue;
          const first = rec(arr(s.errors)[0]);
          out.statuses.push({
            wabaId,
            phoneNumberId,
            waMessageId: str(s.id),
            status,
            timestamp: str(s.timestamp),
            recipient: str(s.recipient_id),
            errorCode: typeof first.code === 'number' ? first.code : null,
            errorText: (
              str(rec(first.error_data).details) ||
              str(first.message) ||
              str(first.title)
            ).slice(0, 300),
          });
        }
      } else if (field === 'message_template_status_update') {
        out.templates.push({
          wabaId,
          event: str(value.event),
          templateId: str(value.message_template_id),
          name: str(value.message_template_name),
          language: str(value.message_template_language),
          reason: str(value.reason),
        });
      }
    }
  }
  return out;
}

/** The time of a webhook (unix seconds as text) as an ISO string; now when it is missing or not a number. */
export function webhookTime(seconds: string, now: Date): string {
  return /^\d{9,12}$/.test(seconds)
    ? new Date(Number.parseInt(seconds, 10) * 1000).toISOString()
    : now.toISOString();
}

/* ---------- status order ---------- */

export type OutStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
const RANK: Readonly<Record<string, number>> = { queued: 0, sent: 1, delivered: 2, read: 3 };

/** Does a status update change the message? Updates may arrive late or twice; a status never goes back, and failed or read are final. */
export function nextStatus(current: OutStatus, incoming: StatusUpdate['status']): OutStatus | null {
  if (current === 'failed' || current === 'read') return null;
  if (incoming === 'failed') return 'failed';
  const from = RANK[current] ?? 0;
  const to = RANK[incoming] ?? 0;
  return to > from ? incoming : null;
}

/** What the template status webhook means for the stored status. */
export function templateStatusFromEvent(event: string): string | null {
  const known = [
    'APPROVED',
    'REJECTED',
    'PENDING',
    'PAUSED',
    'DISABLED',
    'FLAGGED',
    'IN_APPEAL',
    'LIMIT_EXCEEDED',
    'LOCKED',
    'ARCHIVED',
  ];
  if (known.includes(event)) return event;
  // Reinstated: no longer flagged or disabled, so it can be sent again. Unarchived restores the earlier status, which a sync reads.
  if (event === 'REINSTATED') return 'APPROVED';
  return null;
}
