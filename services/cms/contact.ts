// path: services/cms/contact.ts
// Public contact form: honeypot, Turnstile, rate limit (by the API wrapper), storage and e-mail to the team plus a
// confirmation to the sender. A message is stored first, so a mail problem never loses it.
import 'server-only';
import { z } from 'zod';
import { getService, tryGetService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { hashIp } from '@/services/audit/request-meta';

const log = createLogger({ component: 'contact' });

export const TOPICS = ['sales', 'support', 'security', 'partnership', 'other'] as const;

export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    company: z.string().trim().max(100).default(''),
    topic: z.enum(TOPICS),
    message: z.string().trim().min(10).max(4000),
    /** Honeypot: a person never fills this field. */
    website: z.string().max(200).default(''),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();
export type ContactInput = z.infer<typeof contactSchema>;

export const CONTACT_THANKS = 'Thank you. We received your message and will answer by e-mail.';

function inbox(): string | null {
  const env = getServerEnv();
  if (env.CONTACT_INBOX) return env.CONTACT_INBOX;
  const from = env.SMTP_FROM?.match(/<([^>]+)>/)?.[1] ?? env.SMTP_FROM;
  return from && from.includes('@') ? from.trim() : null;
}

export async function submitContact(input: ContactInput, ip: string): Promise<void> {
  // A bot filled the hidden field: answer as if it worked and store nothing.
  if (input.website.trim() !== '') return;
  const human = await getService('security').verifyTurnstile(input.turnstileToken, ip);
  if (!human) throw new ValidationError('The security check failed. Please try again.');

  const { data, error } = await getAdminSupabase()
    .from('contact_messages')
    .insert({
      name: input.name,
      email: input.email,
      company_name: input.company || null,
      topic: input.topic,
      message: input.message,
      ip_hash: await hashIp(ip).catch(() => null),
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);

  const email = tryGetService('email');
  if (!email) return;
  const id = String(data.id);
  const team = inbox();
  try {
    if (team) {
      await email.send({
        template: 'system.contact-received',
        to: team,
        data: { name: input.name, email: input.email, topic: input.topic, message: input.message },
        idempotencyKey: `contact-team:${id}`,
      });
    }
    await email.send({
      template: 'system.contact-ack',
      to: input.email,
      data: { name: input.name },
      idempotencyKey: `contact-ack:${id}`,
    });
  } catch (e) {
    log.warn('contact e-mail failed', { error: e instanceof Error ? e.message : 'failed' });
  }
}
