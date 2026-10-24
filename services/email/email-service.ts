// path: services/email/email-service.ts
// The `email` contract. Messages are rendered, written to the outbox (with the one-minute duplicate guard and the
// suppression list) and then sent: `send` tries at once, `enqueue` waits for its time.
import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { NO_TRACKING_PREFIXES } from '@/config/email';
import { InternalError, ValidationError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { addTracking, newTrackingToken } from '@/lib/email/content';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EmailSendInput, EmailService } from '@/types/contracts';
import { processQueue } from './sender';
import { getTemplate, registerTemplate, renderTemplate } from './templates';

const addressSchema = z.string().trim().toLowerCase().email().max(254);
const enqueueResult = z.object({
  id: z.string().uuid(),
  state: z.enum(['queued', 'suppressed', 'exists', 'duplicate']),
});

/** Stable JSON (sorted keys) so the same data always gives the same hash. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function submit(
  input: EmailSendInput,
  sendAt: Date,
): Promise<{ id: string; state: z.infer<typeof enqueueResult>['state'] }> {
  const to = addressSchema.safeParse(input.to);
  if (!to.success) throw new ValidationError('The recipient address is not valid.');
  if (!getTemplate(input.template))
    throw new ValidationError(`The e-mail template "${input.template}" does not exist.`);
  if (input.idempotencyKey.length < 8)
    throw new ValidationError('The idempotency key is too short.');
  const rendered = await renderTemplate(input.template, input.data, {
    companyId: input.companyId ?? null,
  });
  const token = newTrackingToken();
  const track = !NO_TRACKING_PREFIXES.some((p) => input.template.startsWith(p));
  let html = rendered.html;
  let links: string[] = [];
  if (track) {
    const withTracking = addTracking(html, token, getPublicEnv().NEXT_PUBLIC_APP_URL);
    html = withTracking.html;
    links = withTracking.links;
  }
  const dedupe = createHash('sha256')
    .update(`${input.companyId ?? ''}|${to.data}|${input.template}|${stable(input.data)}`)
    .digest('hex');
  const { data, error } = await getAdminSupabase().rpc('kd_email_enqueue', {
    p_company: input.companyId ?? null,
    p_key: input.idempotencyKey,
    p_dedupe: dedupe,
    p_template: input.template,
    p_to: to.data,
    p_subject: rendered.subject,
    p_html: html,
    p_text: rendered.text,
    p_links: links,
    p_track: track,
    p_token: token,
    p_send_at: sendAt.toISOString(),
  });
  if (error) throw new InternalError(error);
  return enqueueResult.parse(data);
}

export function createEmailService(): EmailService {
  return {
    async send(input) {
      const result = await submit(input, new Date());
      // A repeat (same key or same content inside a minute) and a suppressed address are not sent again.
      if (result.state === 'queued') await processQueue(1, result.id);
    },
    async enqueue(input) {
      await submit(input, input.sendAt ?? new Date());
    },
    registerTemplate(definition) {
      registerTemplate(definition);
    },
  };
}
