// path: services/accounting/attachments.ts
// Files kept with a journal entry (receipts, documents). The file goes through the storage contract (validated, encrypted,
// in the company's Drive or Supabase Storage); this table row links it to the entry. Files can be added to any entry; a
// file can be removed only while the entry is a draft.
import 'server-only';
import { z } from 'zod';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BODY_BYTES,
  MAX_ATTACHMENT_BYTES,
} from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export const attachmentInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((v) => !/[<>/\\]/.test(v), {
        message: 'The file name has characters that are not allowed.',
      }),
    mimeType: z.string().refine((v) => ATTACHMENT_TYPES.includes(v), {
      message: 'Use a PDF, PNG, JPEG or CSV file.',
    }),
    dataBase64: z
      .string()
      .min(8)
      .max(MAX_ATTACHMENT_BODY_BYTES)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

async function entryStatus(companyId: string, entryId: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('journal_entries')
    .select('status')
    .eq('company_id', companyId)
    .eq('id', entryId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return String(data.status);
}

export async function addAttachment(
  actor: Actor,
  entryId: string,
  input: unknown,
): Promise<{ id: string; fileId: string; name: string }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = attachmentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The file is not valid.');
  await entryStatus(companyId, entryId);
  const bytes = new Uint8Array(Buffer.from(parsed.data.dataBase64, 'base64'));
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new ValidationError('The file is too large.');
  const record = await getService('storage').put({
    companyId,
    category: 'attachment',
    name: parsed.data.name,
    bytes,
    mimeType: parsed.data.mimeType,
  });
  const { data, error } = await getAdminSupabase()
    .from('journal_attachments')
    .insert({
      company_id: companyId,
      entry_id: entryId,
      file_id: record.id,
      name: parsed.data.name,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String((data as { id: string }).id);
  await getService('audit').record({
    action: 'accounting.attachment_added',
    resourceType: 'journal_entry',
    resourceId: entryId,
    companyId,
    metadata: { attachmentId: id },
  });
  return { id, fileId: record.id, name: parsed.data.name };
}

/** A short-lived download link for an attachment of this company. */
export async function attachmentLink(companyId: string, attachmentId: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('journal_attachments')
    .select('file_id')
    .eq('company_id', companyId)
    .eq('id', attachmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return getService('storage').signedUrl(String(data.file_id), 300);
}

export async function removeAttachment(actor: Actor, attachmentId: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('journal_attachments')
    .select('entry_id')
    .eq('company_id', companyId)
    .eq('id', attachmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if ((await entryStatus(companyId, String(data.entry_id))) !== 'draft')
    throw new ConflictError('A file of a posted entry cannot be removed.');
  const up = await admin
    .from('journal_attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', attachmentId);
  if (up.error) throw new InternalError(up.error);
  await getService('audit').record({
    action: 'accounting.attachment_removed',
    resourceType: 'journal_entry',
    resourceId: String(data.entry_id),
    companyId,
    metadata: { attachmentId },
  });
}
