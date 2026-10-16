// path: lib/email/adapters/index.ts
import { presetById } from '../presets';
import type { EmailAdapter, EmailProviderKind, ProviderSettings } from '../types';
import { createHttpAdapter } from './http';
import { createSmtpAdapter } from './smtp';

/** Amazon SES is used through its SMTP interface (host from the region), so no request signing is needed. */
export function createAdapter(
  kind: EmailProviderKind,
  settings: ProviderSettings,
  secret: string,
): EmailAdapter {
  switch (kind) {
    case 'smtp':
      return createSmtpAdapter(settings, secret, 'smtp');
    case 'ses': {
      const p = presetById('ses');
      return createSmtpAdapter(
        {
          host: p?.host(settings.region),
          port: 587,
          security: 'starttls',
          username: settings.username,
          region: settings.region,
        },
        secret,
        'ses',
      );
    }
    default:
      return createHttpAdapter(kind, settings, secret);
  }
}
