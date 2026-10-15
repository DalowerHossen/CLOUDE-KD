// path: lib/env/s01.ts
// Environment fragment of STEP 01: application, Supabase, secrets, Turnstile, SMTP, Google OAuth, network intelligence, Sentry.
import { z } from 'zod';
import { publicShape } from './s01-public';

const bool = z.enum(['0', '1', 'true', 'false']).transform((v) => v === '1' || v === 'true');

/** Base64 text that decodes to exactly `bytes` bytes. */
const base64Key = (bytes: number): z.ZodEffects<z.ZodString, string, string> =>
  z.string().refine(
    (v) => {
      try {
        return atob(v).length === bytes;
      } catch {
        return false;
      }
    },
    { message: `must be base64 text that decodes to ${bytes} bytes` },
  );

export const serverShape = {
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SKIP_ENV_VALIDATION: bool.optional(),
  SHELL_PREVIEW: bool.optional(),

  ...publicShape,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().url().optional(),

  ENCRYPTION_KEY: base64Key(32),
  HMAC_TOKEN_SECRET: z.string().min(43),
  AUDIT_SIGNING_KEY: base64Key(32),
  CRON_SECRET: z.string().min(32),

  TURNSTILE_SECRET_KEY: z.string().min(1),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(3).optional(),

  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),

  NETWORK_INTEL_PROVIDER: z.enum(['none', 'ipqualityscore', 'maxmind']).default('none'),
  NETWORK_INTEL_API_KEY: z.string().min(1).optional(),
  MAXMIND_DB_PATH: z.string().min(1).optional(),

  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
};
