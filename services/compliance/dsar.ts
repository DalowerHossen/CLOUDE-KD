// path: services/compliance/dsar.ts
// Data subject requests: create, list, export (machine readable), erase (tombstone) and reject.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { dsarDueDate, isJurisdiction } from '@/lib/compliance/jurisdictions';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { subjectHash } from './subject';

export const dsarCreateSchema = z
  .object({
    requestType: z.enum(['export', 'erase', 'rectify', 'restrict', 'object']),
    subjectUserId: z.string().uuid(),
    jurisdiction: z.string().min(2).max(20).default('global'),
  })
  .strict();

export const dsarActionSchema = z
  .object({
    action: z.enum(['export', 'erase', 'reject']),
    reason: z.string().trim().max(1000).nullable().default(null),
  })
  .strict();

const dsarRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    request_type: z.string(),
    subject_user_id: z.string().uuid().nullable(),
    jurisdiction: z.string(),
    status: z.string(),
    due_at: z.string(),
    completed_at: z.string().nullable(),
    certificate_hash: z.string().nullable(),
    created_at: z.string(),
  })
  .strip();

export type DsarItem = {
  id: string;
  companyId: string | null;
  requestType: string;
  subjectUserId: string | null;
  jurisdiction: string;
  status: string;
  dueAt: string;
  completedAt: string | null;
  certificateHash: string | null;
  createdAt: string;
  overdue: boolean;
};

export async function createDsar(
  actor: Actor,
  input: z.infer<typeof dsarCreateSchema>,
): Promise<string> {
  if (!isJurisdiction(input.jurisdiction)) throw new ValidationError('Unknown jurisdiction.');
  const admin = getAdminSupabase();
  const profile = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', input.subjectUserId)
    .is('deleted_at', null)
    .maybeSingle();
  if (profile.error) throw new InternalError(profile.error);
  if (!profile.data) throw new NotFoundError();
  const { data, error } = await admin
    .from('dsar_requests')
    .insert({
      company_id: profile.data.company_id,
      request_type: input.requestType,
      subject_user_id: input.subjectUserId,
      subject_hash: await subjectHash(input.subjectUserId),
      jurisdiction: input.jurisdiction,
      due_at: dsarDueDate(input.jurisdiction, new Date()).toISOString(),
      requested_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = z.string().uuid().parse(data.id);
  await getService('audit').record({
    action: 'dsar.created',
    resourceType: 'dsar_request',
    resourceId: id,
    companyId: profile.data.company_id,
    metadata: { request_type: input.requestType, jurisdiction: input.jurisdiction },
  });
  return id;
}

export async function listDsar(limit = 100): Promise<DsarItem[]> {
  const { data, error } = await getAdminSupabase()
    .from('dsar_requests')
    .select(
      'id, company_id, request_type, subject_user_id, jurisdiction, status, due_at, completed_at, certificate_hash, created_at',
    )
    .is('deleted_at', null)
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  const now = Date.now();
  return z
    .array(dsarRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      companyId: r.company_id,
      requestType: r.request_type,
      subjectUserId: r.subject_user_id,
      jurisdiction: r.jurisdiction,
      status: r.status,
      dueAt: r.due_at,
      completedAt: r.completed_at,
      certificateHash: r.certificate_hash,
      createdAt: r.created_at,
      overdue: r.completed_at === null && new Date(r.due_at).getTime() < now,
    }));
}

async function loadRequest(id: string): Promise<z.infer<typeof dsarRow>> {
  const { data, error } = await getAdminSupabase()
    .from('dsar_requests')
    .select(
      'id, company_id, request_type, subject_user_id, jurisdiction, status, due_at, completed_at, certificate_hash, created_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return dsarRow.parse(data);
}

/** Machine readable export of the data this platform keeps about one user (GDPR Article 20). */
export async function exportSubjectData(
  actor: Actor,
  id: string,
): Promise<Record<string, unknown>> {
  const request = await loadRequest(id);
  if (request.request_type !== 'export' || !request.subject_user_id)
    throw new ConflictError('This is not an export request.');
  if (request.status === 'completed' || request.status === 'rejected')
    throw new ConflictError('This request is already closed.');
  const admin = getAdminSupabase();
  const [profile, memberships, consent] = await Promise.all([
    admin
      .from('profiles')
      .select('email, full_name, locale, timezone, platform_role, admin_sub_role, created_at')
      .eq('user_id', request.subject_user_id)
      .is('deleted_at', null),
    admin
      .from('memberships')
      .select('company_id, role, status, granted_permissions, created_at')
      .eq('user_id', request.subject_user_id)
      .is('deleted_at', null),
    admin
      .from('consent_records_platform')
      .select('purpose, policy_version, granted, recorded_at, withdrawn_at')
      .eq('subject_hash', await subjectHash(request.subject_user_id)),
  ]);
  for (const part of [profile, memberships, consent])
    if (part.error) throw new InternalError(part.error);
  const generatedAt = new Date();
  const result = {
    format: 'kd-subject-export-v1',
    requestId: request.id,
    generatedAt: generatedAt.toISOString(),
    expiresAt: new Date(generatedAt.getTime() + 7 * 86_400_000).toISOString(),
    watermark: `DSAR ${request.id}`,
    profile: profile.data ?? [],
    memberships: memberships.data ?? [],
    consent: consent.data ?? [],
  };
  const done = await getAdminSupabase()
    .from('dsar_requests')
    .update({
      status: 'completed',
      handled_by: actor.userId,
      completed_at: generatedAt.toISOString(),
    })
    .eq('id', request.id);
  if (done.error) throw new InternalError(done.error);
  await getService('audit').record({
    action: 'dsar.exported',
    resourceType: 'dsar_request',
    resourceId: request.id,
    companyId: request.company_id,
  });
  return result;
}

/** Erases personal data (tombstone). The audit chain stays valid because audit rows hold ids only. */
export async function eraseSubject(actor: Actor, id: string): Promise<{ certificateHash: string }> {
  const request = await loadRequest(id);
  if (request.request_type !== 'erase' || !request.subject_user_id)
    throw new ConflictError('This is not an erase request.');
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_dsar_erase_profile', {
    p_request: id,
    p_handler: actor.userId,
  });
  if (error) throw new InternalError(error);
  const certificateHash = z.string().length(64).parse(data);
  const auth = await admin.auth.admin.updateUserById(request.subject_user_id, {
    email: `erased+${request.subject_user_id}@invalid.example`,
    ban_duration: '876000h',
    user_metadata: {},
  });
  if (auth.error) throw new InternalError(auth.error);
  await getService('audit').record({
    action: 'dsar.erased',
    resourceType: 'dsar_request',
    resourceId: id,
    companyId: request.company_id,
    metadata: { certificate_hash: certificateHash },
  });
  return { certificateHash };
}

export async function rejectDsar(actor: Actor, id: string, reason: string | null): Promise<void> {
  if (!reason || reason.length < 3)
    throw new ValidationError('A reason of at least 3 characters is required.');
  const request = await loadRequest(id);
  if (request.status === 'completed' || request.status === 'rejected')
    throw new ConflictError('This request is already closed.');
  const { error } = await getAdminSupabase()
    .from('dsar_requests')
    .update({
      status: 'rejected',
      handled_by: actor.userId,
      rejection_reason: reason,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'dsar.rejected',
    resourceType: 'dsar_request',
    resourceId: id,
    companyId: request.company_id,
  });
}
