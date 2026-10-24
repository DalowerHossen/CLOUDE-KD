// path: lib/email/types.ts
export const EMAIL_PROVIDERS = [
  'smtp',
  'resend',
  'sendgrid',
  'ses',
  'mailgun',
  'postmark',
] as const;
export type EmailProviderKind = (typeof EMAIL_PROVIDERS)[number];

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface OutgoingMessage {
  from: EmailAddress;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string | null;
}

/** The provider is busy or unreachable: try again later or with the next provider. */
export class TemporaryEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemporaryEmailError';
  }
}

/**
 * The provider refused. `scope` "message" means this message can never be delivered (bad address, rejected content);
 * "config" means the provider settings are wrong (key, password, sender), so the next provider should be tried.
 */
export class PermanentEmailError extends Error {
  readonly scope: 'message' | 'config';
  constructor(message: string, scope: 'message' | 'config') {
    super(message);
    this.name = 'PermanentEmailError';
    this.scope = scope;
  }
}

export interface EmailAdapter {
  readonly kind: EmailProviderKind;
  send(message: OutgoingMessage): Promise<SendResult>;
  /** Proves the credentials work without sending a message. */
  verify(): Promise<void>;
}

/** Settings of one provider that are not secret. */
export interface ProviderSettings {
  host?: string;
  port?: number;
  security?: 'none' | 'ssl' | 'starttls';
  username?: string;
  region?: string;
  domain?: string;
  eu?: boolean;
  messageStream?: string;
}

export const formatAddress = (a: EmailAddress): string =>
  a.name ? `"${a.name.replace(/["\\\r\n]/g, ' ')}" <${a.email}>` : a.email;
