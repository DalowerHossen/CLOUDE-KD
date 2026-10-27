// path: lib/email/adapters/smtp.ts
// Generic SMTP through nodemailer. The host is resolved first and must be a public address (SSRF guard); the
// connection then goes to that exact address, so a DNS change between check and connect cannot redirect it.
import nodemailer, { type Transporter } from 'nodemailer';
import { resolvePublicAddresses } from '@/lib/security/ssrf';
import {
  PermanentEmailError,
  TemporaryEmailError,
  formatAddress,
  type EmailAdapter,
  type OutgoingMessage,
  type ProviderSettings,
  type SendResult,
} from '../types';

interface SmtpError extends Error {
  code?: string;
  responseCode?: number;
  command?: string;
  response?: string;
}

/** What the server said, without addresses or links, so a refusal can be read from the outbox without leaking anyone's data. */
function serverSaid(e: SmtpError): string {
  const raw = typeof e.response === 'string' ? e.response : '';
  return raw
    .replace(/\S+@\S+/g, '(address)')
    .replace(/https?:\/\/\S+/gi, '(link)')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export function mapSmtpError(error: unknown): Error {
  const e = error as SmtpError;
  const code = e.responseCode ?? 0;
  if (e.code === 'EAUTH' || code === 535 || code === 534 || code === 530) {
    return new PermanentEmailError('The mail server refused the sign-in.', 'config');
  }
  if (code >= 500 && code < 600) {
    const recipient = code === 550 || code === 551 || code === 553 || code === 552;
    const said = serverSaid(e);
    const where = typeof e.command === 'string' && e.command !== '' ? ` at ${e.command}` : '';
    return new PermanentEmailError(
      `The mail server refused the message (${code}${where}${said !== '' ? `: ${said}` : ''}).`,
      recipient ? 'message' : 'config',
    );
  }
  return new TemporaryEmailError(
    code >= 400 ? `The mail server is busy (${code}).` : 'The mail server could not be reached.',
  );
}

export function createSmtpAdapter(
  settings: ProviderSettings,
  secret: string,
  kind: 'smtp' | 'ses' = 'smtp',
): EmailAdapter {
  async function transport(): Promise<Transporter> {
    const host = settings.host;
    if (!host || !settings.port)
      throw new PermanentEmailError('The mail server is not set.', 'config');
    let addresses: string[];
    try {
      addresses = await resolvePublicAddresses(host);
    } catch {
      throw new PermanentEmailError('The mail server address is not allowed.', 'config');
    }
    const security = settings.security ?? 'starttls';
    return nodemailer.createTransport({
      host: addresses[0] ?? host,
      port: settings.port,
      secure: security === 'ssl',
      requireTLS: security === 'starttls',
      ignoreTLS: security === 'none',
      tls: { servername: host, minVersion: 'TLSv1.2' },
      auth: settings.username ? { user: settings.username, pass: secret } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return {
    kind,
    async send(message: OutgoingMessage): Promise<SendResult> {
      const t = await transport();
      try {
        const info = await t.sendMail({
          from: formatAddress(message.from),
          to: message.to,
          replyTo: message.replyTo ?? undefined,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        });
        return { providerMessageId: info.messageId ? String(info.messageId) : null };
      } catch (error) {
        throw mapSmtpError(error);
      } finally {
        t.close();
      }
    },
    async verify(): Promise<void> {
      const t = await transport();
      try {
        await t.verify();
      } catch (error) {
        throw mapSmtpError(error);
      } finally {
        t.close();
      }
    },
  };
}
