// path: services/kyc/settings.ts
// How the platform verifies a business: by hand or through an online verification service, which documents and business
// questions the form asks. Only the super admin changes it (fresh identity check, version lock, audit entry). The keys of
// the verification service are encrypted and never leave the server.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import {
  DEFAULT_PROFILE,
  KYC_DOC_CATALOG,
  type KycDocType,
  type KycProfile,
  type ProfileInput,
} from '@/lib/kyc/profile';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { cached, invalidatePlanCache } from '@/services/entitlement/cache';
import type { Actor, EncryptedPayload } from '@/types/contracts';

const CACHE = 'kyc-profile';

const keysSchema = z
  .object({
    appToken: z.string(),
    secretKey: z.string(),
    levelName: z.string(),
    webhookSecret: z.string(),
  })
  .strict();
export type ProviderKeys = z.infer<typeof keysSchema>;

const docs = (v: unknown): KycDocType[] =>
  (Array.isArray(v) ? v : []).filter((d): d is KycDocType =>
    (KYC_DOC_CATALOG as readonly string[]).includes(String(d)),
  );

async function readRow(): Promise<Record<string, unknown> | null> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_platform_settings')
    .select('*')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data;
}

/** The profile in force. Without a saved row the defaults apply: manual review of the four standard documents. */
export async function getKycProfile(): Promise<KycProfile> {
  return cached(CACHE, 'profile', async () => {
    const row = await readRow();
    if (!row) return DEFAULT_PROFILE;
    return {
      mode: row.mode === 'automatic' ? 'automatic' : 'manual',
      provider: row.provider === 'sumsub' ? 'sumsub' : 'none',
      presentation: row.presentation === 'embedded' ? 'embedded' : 'hosted',
      requiredDocuments: docs(row.required_documents),
      optionalDocuments: docs(row.optional_documents),
      businessFields: Array.isArray(row.business_fields) ? row.business_fields.map(String) : [],
      providerConfigured: row.provider_config !== null && row.provider_config !== undefined,
      version: Number(row.version),
    };
  });
}

/** The saved keys of the verification service, for the server only. Null when none are saved. */
export async function getProviderKeys(): Promise<ProviderKeys | null> {
  const row = await readRow();
  if (!row?.provider_config) return null;
  const bytes = await getService('encryption').decrypt(
    'processor-credentials',
    row.provider_config as EncryptedPayload,
    'platform',
  );
  const parsed = keysSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  return parsed.success ? parsed.data : null;
}

export async function saveKycProfile(actor: Actor, input: ProfileInput): Promise<KycProfile> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const row = await readRow();
  const typed = input.providerKeys;
  const anyTyped = Object.values(typed).some((v) => v.length > 0);
  let sealed: EncryptedPayload | null = null;
  if (anyTyped) {
    const old = (await getProviderKeys()) ?? {
      appToken: '',
      secretKey: '',
      levelName: '',
      webhookSecret: '',
    };
    const next: ProviderKeys = {
      appToken: typed.appToken || old.appToken,
      secretKey: typed.secretKey || old.secretKey,
      levelName: typed.levelName || old.levelName,
      webhookSecret: typed.webhookSecret || old.webhookSecret,
    };
    sealed = await getService('encryption').encrypt(
      'processor-credentials',
      JSON.stringify(next),
      'platform',
    );
  }
  const willHaveKeys = sealed !== null || (row?.provider_config ?? null) !== null;
  if (input.mode === 'automatic' && !willHaveKeys)
    throw new ValidationError('Save the keys of the verification service before you switch it on.');
  const values = {
    mode: input.mode,
    provider: input.provider,
    presentation: input.presentation,
    required_documents: input.requiredDocuments,
    optional_documents: input.optionalDocuments,
    business_fields: input.businessFields,
    updated_by: actor.userId,
    ...(sealed ? { provider_config: sealed } : {}),
  };
  const admin = getAdminSupabase();
  if (row) {
    if (Number(row.version) !== input.version) throw new ConflictError();
    const r = await admin
      .from('kyc_platform_settings')
      .update(values)
      .eq('id', String(row.id))
      .eq('version', input.version)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  } else {
    if (input.version !== 0) throw new ConflictError();
    const r = await admin.from('kyc_platform_settings').insert(values);
    if (r.error) {
      if (r.error.code === '23505') throw new ConflictError();
      throw new InternalError(r.error);
    }
  }
  await getService('audit').record({
    action: 'kyc.settings_saved',
    resourceType: 'kyc_platform_settings',
    resourceId: row ? String(row.id) : 'new',
    companyId: null,
    metadata: {
      by: actor.userId,
      mode: input.mode,
      provider: input.provider,
      presentation: input.presentation,
      required: input.requiredDocuments,
      optional: input.optionalDocuments,
      questions: input.businessFields,
      keysChanged: sealed !== null,
    },
  });
  invalidatePlanCache();
  return getKycProfile();
}
