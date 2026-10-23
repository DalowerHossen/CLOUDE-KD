// path: services/security/token-service.ts
// Implements the tokens contract (tokenized links for clients). Verification checks the signature first, so guessed or
// altered tokens never reach the database; failures feed the abuse counters; leaked links show as many addresses.
import 'server-only';
import { z } from 'zod';
import {
  OTP_TTL_SECONDS,
  generateOtp,
  generateToken,
  hasValidSignature,
  hashOtp,
  hashToken,
  maskToken,
  normalizeTtlDays,
} from '@/lib/auth/tokens';
import { getService, tryGetService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomHex } from '@/lib/utils/hash';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { TokenDocumentType, TokenService, TokenVerification } from '@/types/contracts';
import { raiseEvent } from './events';
import { rateLimit } from './rate-limit';

const log = createLogger({ component: 'tokens' });
const LEAK_ADDRESS_LIMIT = 5;

const rowSchema = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid(),
    doc_type: z.string(),
    doc_id: z.string().uuid(),
    expires_at: z.string(),
    revoked_at: z.string().nullable(),
    otp_required: z.boolean(),
    ttl_days: z.number().int(),
  })
  .strip();

type OtpRecipientResolver = (companyId: string, docId: string) => Promise<string | null>;
const resolvers = new Map<string, OtpRecipientResolver>();

/** Other STEPs register how the e-mail address behind a document type is found (for example estimates, receipts). */
export function registerOtpRecipientResolver(
  docType: TokenDocumentType,
  resolver: OtpRecipientResolver,
): void {
  resolvers.set(docType, resolver);
}

registerOtpRecipientResolver('invoice', async (_company, docId) => {
  const invoice = await getService('invoices').getForPayment(docId);
  return (await getService('clients').getBilling(invoice.clientId)).email;
});
// The client hub token carries the client id as document id.
registerOtpRecipientResolver(
  'hub',
  async (_company, docId) => (await getService('clients').getBilling(docId)).email,
);

async function event(
  companyId: string | null,
  tokenId: string | null,
  name: string,
  ipHash: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await getAdminSupabase().rpc('kd_token_event', {
    p_company: companyId,
    p_token: tokenId,
    p_event: name,
    p_ip_hash: ipHash,
    p_details: details,
  });
  if (error) log.error('token event not stored', { error });
}

async function loadRow(id: string): Promise<z.infer<typeof rowSchema>> {
  const { data, error } = await getAdminSupabase()
    .from('access_tokens')
    .select('id, company_id, doc_type, doc_id, expires_at, revoked_at, otp_required, ttl_days')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return rowSchema.parse(data);
}

async function issueInternal(input: {
  docType: TokenDocumentType;
  docId: string;
  companyId: string;
  ttlDays: number;
  otpRequired: boolean;
  reissuedFrom?: string;
}): Promise<{ id: string; token: string; expiresAt: string }> {
  const entitlement = tryGetService('entitlement');
  const planLimit = entitlement
    ? await entitlement.limit(input.companyId, 'token.expiry_days').catch(() => null)
    : null;
  const ttl = normalizeTtlDays(input.ttlDays, planLimit);
  const { token, hash } = await generateToken(getServerEnv().HMAC_TOKEN_SECRET);
  const expiresAt = new Date(Date.now() + ttl * 86_400_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('access_tokens')
    .insert({
      company_id: input.companyId,
      doc_type: input.docType,
      doc_id: input.docId,
      token_hash: hash,
      expires_at: expiresAt,
      ttl_days: ttl,
      otp_required: input.otpRequired,
      reissued_from: input.reissuedFrom ?? null,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  await event(input.companyId, id, input.reissuedFrom ? 'reissued' : 'issued', null, {
    doc_type: input.docType,
    ttl_days: ttl,
  });
  await getService('audit').record({
    action: input.reissuedFrom ? 'token.reissued' : 'token.issued',
    resourceType: 'access_token',
    resourceId: id,
    companyId: input.companyId,
    metadata: { doc_type: input.docType, ttl_days: ttl, otp_required: input.otpRequired },
  });
  return { id, token, expiresAt };
}

export function createTokenService(): TokenService {
  return {
    issue: (input) => issueInternal({ ...input, otpRequired: input.otpRequired === true }),

    async verify(token): Promise<TokenVerification> {
      const meta = await readRequestMeta();
      const secret = getServerEnv().HMAC_TOKEN_SECRET;
      if (!(await hasValidSignature(token, secret))) {
        await event(null, null, 'invalid', meta.ipHash, { masked: maskToken(token) });
        const limit = await rateLimit(`token-invalid:${meta.ipHash ?? 'unknown'}`, 'strict');
        if (!limit.allowed)
          await raiseEvent('token_abuse', {
            reason: 'invalid_tokens_repeated',
            masked: maskToken(token),
          });
        return { valid: false, reason: 'invalid' };
      }
      const { data, error } = await getAdminSupabase()
        .from('access_tokens')
        .select('id, company_id, doc_type, doc_id, expires_at, revoked_at, otp_required, ttl_days')
        .eq('token_hash', await hashToken(token))
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new InternalError(error);
      if (!data) {
        await event(null, null, 'invalid', meta.ipHash, { masked: maskToken(token) });
        return { valid: false, reason: 'invalid' };
      }
      const row = rowSchema.parse(data);
      if (row.revoked_at) {
        await event(row.company_id, row.id, 'revoked', meta.ipHash);
        return { valid: false, reason: 'revoked' };
      }
      if (Date.parse(row.expires_at) <= Date.now()) {
        await event(row.company_id, row.id, 'expired', meta.ipHash);
        return { valid: false, reason: 'expired' };
      }
      const touched = await getAdminSupabase().rpc('kd_token_touch', {
        p_token: row.id,
        p_ip_hash: meta.ipHash,
      });
      if (!touched.error && typeof touched.data === 'number' && touched.data > LEAK_ADDRESS_LIMIT) {
        await event(row.company_id, row.id, 'leak_suspected', meta.ipHash, {
          addresses: touched.data,
        });
        await raiseEvent('token_abuse', {
          reason: 'link_used_from_many_addresses',
          addresses: touched.data,
          token: row.id,
        });
      }
      return {
        valid: true,
        id: row.id,
        docType: row.doc_type as TokenDocumentType,
        docId: row.doc_id,
        companyId: row.company_id,
        otpRequired: row.otp_required,
      };
    },

    async revoke(id) {
      const row = await loadRow(id);
      const { data, error } = await getAdminSupabase().rpc('kd_token_revoke', { p_token: id });
      if (error) throw new InternalError(error);
      if (data === true) {
        await event(row.company_id, id, 'revoked', null, { by: 'issuer' });
        await getService('audit').record({
          action: 'token.revoked',
          resourceType: 'access_token',
          resourceId: id,
          companyId: row.company_id,
        });
      }
    },

    async reissue(id) {
      const row = await loadRow(id);
      await getAdminSupabase().rpc('kd_token_revoke', { p_token: id });
      const created = await issueInternal({
        docType: row.doc_type as TokenDocumentType,
        docId: row.doc_id,
        companyId: row.company_id,
        ttlDays: row.ttl_days,
        otpRequired: row.otp_required,
        reissuedFrom: id,
      });
      return { id: created.id, token: created.token, expiresAt: created.expiresAt };
    },

    async sendOtp(id) {
      const row = await loadRow(id);
      if (!row.otp_required) throw new ValidationError('This link does not use a one-time code.');
      const resolver = resolvers.get(row.doc_type);
      const email = tryGetService('email');
      if (!resolver || !email)
        throw new ValidationError('A one-time code cannot be sent for this document.');
      const limit = await rateLimit(`token-otp:${id}`, 'strict');
      if (!limit.allowed) return;
      const to = await resolver(row.company_id, row.doc_id);
      if (!to) throw new ValidationError('There is no e-mail address for this document.');
      const code = generateOtp();
      const stored = await getAdminSupabase().rpc('kd_token_otp_set', {
        p_token: id,
        p_otp_hash: await hashOtp(code, id, getServerEnv().HMAC_TOKEN_SECRET),
        p_ttl_seconds: OTP_TTL_SECONDS,
      });
      if (stored.error) throw new InternalError(stored.error);
      if (stored.data !== true) return;
      await email.send({
        template: 'security.token-otp',
        to,
        companyId: row.company_id,
        data: { code },
        idempotencyKey: `otp-${randomHex(16)}`,
      });
      await event(row.company_id, id, 'otp_sent', (await readRequestMeta()).ipHash);
    },

    async verifyOtp(id, code) {
      if (!/^\d{6}$/.test(code)) return false;
      const meta = await readRequestMeta();
      const row = await loadRow(id).catch(() => null);
      if (!row) return false;
      const { data, error } = await getAdminSupabase().rpc('kd_token_otp_check', {
        p_token: id,
        p_otp_hash: await hashOtp(code, id, getServerEnv().HMAC_TOKEN_SECRET),
      });
      if (error) throw new InternalError(error);
      if (data === 'ok') {
        await event(row.company_id, id, 'otp_verified', meta.ipHash);
        return true;
      }
      await event(row.company_id, id, data === 'locked' ? 'otp_locked' : 'otp_failed', meta.ipHash);
      if (data === 'locked')
        await raiseEvent('token_abuse', { reason: 'otp_gate_locked', token: id });
      return false;
    },
  };
}
