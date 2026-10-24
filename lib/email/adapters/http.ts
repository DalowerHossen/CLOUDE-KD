// path: lib/email/adapters/http.ts
// Provider APIs over HTTPS: Resend, SendGrid, Mailgun, Postmark. The request shapes follow each provider's public
// send API; they are checked with the "send test" button when the provider is set up.
import {
  PermanentEmailError,
  TemporaryEmailError,
  formatAddress,
  type EmailAdapter,
  type EmailProviderKind,
  type OutgoingMessage,
  type ProviderSettings,
  type SendResult,
} from '../types';

type Fetch = typeof fetch;

async function call(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
): Promise<{ status: number; headers: Headers; body: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TemporaryEmailError('The mail provider could not be reached.');
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status === 429 || response.status >= 500)
    throw new TemporaryEmailError(`The mail provider is busy (${response.status}).`);
  if (response.status === 401 || response.status === 403)
    throw new PermanentEmailError('The mail provider refused the key.', 'config');
  if (response.status >= 400) {
    throw new PermanentEmailError(
      `The mail provider refused the message (${response.status}).`,
      response.status === 422 || response.status === 400 ? 'message' : 'config',
    );
  }
  return { status: response.status, headers: response.headers, body };
}

const field = (body: unknown, key: string): string | null =>
  typeof body === 'object' &&
  body !== null &&
  typeof (body as Record<string, unknown>)[key] === 'string'
    ? String((body as Record<string, unknown>)[key])
    : null;

export function createHttpAdapter(
  kind: Exclude<EmailProviderKind, 'smtp' | 'ses'>,
  settings: ProviderSettings,
  secret: string,
  fetchImpl: Fetch = fetch,
): EmailAdapter {
  const json = { 'content-type': 'application/json' };
  switch (kind) {
    case 'resend':
      return {
        kind,
        async send(m: OutgoingMessage): Promise<SendResult> {
          const r = await call(fetchImpl, 'https://api.resend.com/emails', {
            method: 'POST',
            headers: { ...json, authorization: `Bearer ${secret}` },
            body: JSON.stringify({
              from: formatAddress(m.from),
              to: [m.to],
              subject: m.subject,
              html: m.html,
              text: m.text,
              ...(m.replyTo ? { reply_to: m.replyTo } : {}),
              headers: m.headers,
            }),
          });
          return { providerMessageId: field(r.body, 'id') };
        },
        async verify(): Promise<void> {
          await call(fetchImpl, 'https://api.resend.com/domains', {
            method: 'GET',
            headers: { authorization: `Bearer ${secret}` },
          });
        },
      };
    case 'sendgrid':
      return {
        kind,
        async send(m: OutgoingMessage): Promise<SendResult> {
          const r = await call(fetchImpl, 'https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { ...json, authorization: `Bearer ${secret}` },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: m.to }] }],
              from: { email: m.from.email, ...(m.from.name ? { name: m.from.name } : {}) },
              ...(m.replyTo ? { reply_to: { email: m.replyTo } } : {}),
              subject: m.subject,
              content: [
                { type: 'text/plain', value: m.text },
                { type: 'text/html', value: m.html },
              ],
              headers: m.headers,
            }),
          });
          return { providerMessageId: r.headers.get('x-message-id') };
        },
        async verify(): Promise<void> {
          await call(fetchImpl, 'https://api.sendgrid.com/v3/scopes', {
            method: 'GET',
            headers: { authorization: `Bearer ${secret}` },
          });
        },
      };
    case 'mailgun': {
      const base = settings.eu ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
      const auth = `Basic ${Buffer.from(`api:${secret}`).toString('base64')}`;
      return {
        kind,
        async send(m: OutgoingMessage): Promise<SendResult> {
          if (!settings.domain)
            throw new PermanentEmailError('The Mailgun domain is not set.', 'config');
          const form = new URLSearchParams({
            from: formatAddress(m.from),
            to: m.to,
            subject: m.subject,
            html: m.html,
            text: m.text,
          });
          if (m.replyTo) form.set('h:Reply-To', m.replyTo);
          for (const [k, v] of Object.entries(m.headers)) form.set(`h:${k}`, v);
          const r = await call(
            fetchImpl,
            `${base}/v3/${encodeURIComponent(settings.domain)}/messages`,
            {
              method: 'POST',
              headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
              body: form,
            },
          );
          return { providerMessageId: field(r.body, 'id') };
        },
        async verify(): Promise<void> {
          if (!settings.domain)
            throw new PermanentEmailError('The Mailgun domain is not set.', 'config');
          await call(fetchImpl, `${base}/v3/domains/${encodeURIComponent(settings.domain)}`, {
            method: 'GET',
            headers: { authorization: auth },
          });
        },
      };
    }
    case 'postmark':
      return {
        kind,
        async send(m: OutgoingMessage): Promise<SendResult> {
          const r = await call(fetchImpl, 'https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: { ...json, accept: 'application/json', 'x-postmark-server-token': secret },
            body: JSON.stringify({
              From: formatAddress(m.from),
              To: m.to,
              Subject: m.subject,
              HtmlBody: m.html,
              TextBody: m.text,
              ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
              Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })),
              MessageStream: settings.messageStream ?? 'outbound',
            }),
          });
          return { providerMessageId: field(r.body, 'MessageID') };
        },
        async verify(): Promise<void> {
          await call(fetchImpl, 'https://api.postmarkapp.com/server', {
            method: 'GET',
            headers: { accept: 'application/json', 'x-postmark-server-token': secret },
          });
        },
      };
  }
}
