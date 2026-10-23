// path: services/compliance/queries.ts
import 'server-only';
import { z } from 'zod';
import { ConflictError, InternalError } from '@/lib/errors';
import { getService } from '@/lib/container';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { updateWithVersion } from '@/services/base/optimistic-lock';
import type { Actor } from '@/types/contracts';
import { isJurisdiction } from '@/lib/compliance/jurisdictions';
import { ValidationError } from '@/lib/errors';

const retentionRow = z
  .object({
    id: z.string().uuid(),
    data_type: z.string(),
    jurisdiction: z.string(),
    retention_days: z.number().int(),
    action: z.enum(['delete', 'anonymize', 'archive']),
    legal_basis: z.string(),
    enabled: z.boolean(),
    version: z.number().int(),
  })
  .strip();
const classificationRow = z
  .object({
    id: z.string().uuid(),
    table_name: z.string(),
    column_name: z.string(),
    classification: z.string(),
    contains_pii: z.boolean(),
    retention_data_type: z.string().nullable(),
    origin: z.string(),
  })
  .strip();

export interface RetentionItem {
  id: string;
  dataType: string;
  jurisdiction: string;
  retentionDays: number;
  action: 'delete' | 'anonymize' | 'archive';
  legalBasis: string;
  enabled: boolean;
  version: number;
}

export interface ClassificationItem {
  id: string;
  tableName: string;
  columnName: string;
  classification: string;
  containsPii: boolean;
  retentionDataType: string | null;
  origin: string;
}

export async function listRetention(): Promise<RetentionItem[]> {
  const { data, error } = await getAdminSupabase()
    .from('retention_policies')
    .select('id, data_type, jurisdiction, retention_days, action, legal_basis, enabled, version')
    .is('company_id', null)
    .is('deleted_at', null)
    .order('data_type');
  if (error) throw new InternalError(error);
  return z
    .array(retentionRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      dataType: r.data_type,
      jurisdiction: r.jurisdiction,
      retentionDays: r.retention_days,
      action: r.action,
      legalBasis: r.legal_basis,
      enabled: r.enabled,
      version: r.version,
    }));
}

export async function listClassifications(): Promise<ClassificationItem[]> {
  const { data, error } = await getAdminSupabase()
    .from('data_classifications')
    .select(
      'id, table_name, column_name, classification, contains_pii, retention_data_type, origin',
    )
    .is('company_id', null)
    .is('deleted_at', null)
    .order('table_name')
    .order('column_name');
  if (error) throw new InternalError(error);
  return z
    .array(classificationRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      tableName: r.table_name,
      columnName: r.column_name,
      classification: r.classification,
      containsPii: r.contains_pii,
      retentionDataType: r.retention_data_type,
      origin: r.origin,
    }));
}

export const retentionUpsertSchema = z
  .object({
    dataType: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(60),
    jurisdiction: z.string().min(2).max(20).default('global'),
    retentionDays: z.number().int().min(1).max(36500),
    action: z.enum(['delete', 'anonymize', 'archive']),
    legalBasis: z.string().trim().max(500).default(''),
    enabled: z.boolean().default(true),
    /** Required when the policy already exists. */
    expectedVersion: z.number().int().min(1).nullable().default(null),
  })
  .strict();

export async function upsertRetention(
  actor: Actor,
  input: z.infer<typeof retentionUpsertSchema>,
): Promise<{ id: string; version: number }> {
  if (!isJurisdiction(input.jurisdiction)) throw new ValidationError('Unknown jurisdiction.');
  const admin = getAdminSupabase();
  const existing = await admin
    .from('retention_policies')
    .select('id, version')
    .is('company_id', null)
    .eq('data_type', input.dataType)
    .eq('jurisdiction', input.jurisdiction)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const values = {
    retention_days: input.retentionDays,
    action: input.action,
    legal_basis: input.legalBasis,
    enabled: input.enabled,
  };
  let id: string;
  let version: number;
  if (existing.data) {
    if (input.expectedVersion === null)
      throw new ConflictError('Reload the policy before changing it.');
    id = String(existing.data.id);
    version = (
      await updateWithVersion(admin, 'retention_policies', id, input.expectedVersion, values)
    ).version;
  } else {
    const created = await admin
      .from('retention_policies')
      .insert({ ...values, data_type: input.dataType, jurisdiction: input.jurisdiction })
      .select('id, version')
      .single();
    if (created.error) throw new InternalError(created.error);
    id = String(created.data.id);
    version = Number(created.data.version);
  }
  await getService('audit').record({
    action: 'retention.changed',
    resourceType: 'retention_policy',
    resourceId: id,
    companyId: null,
    metadata: {
      data_type: input.dataType,
      jurisdiction: input.jurisdiction,
      retention_days: input.retentionDays,
      actor: actor.userId,
    },
  });
  return { id, version };
}
