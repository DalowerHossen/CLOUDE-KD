// path: services/expense/receipts.ts
// Receipt files of expenses. The file goes through the storage contract (validated, encrypted, in the company's Drive or
// Supabase Storage); the row keeps its SHA-256 checksum so the same receipt used twice is found. `applyOcrResult` is the
// connection point for the OCR service of another STEP: it stores what was read, which the expense form offers as a suggestion.
import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { attachmentInput } from '@/services/accounting/attachments';
import { dayText } from '@/services/accounting/journal-rules';

export interface ReceiptView {
  id: string;
  expenseId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  ocrStatus: 'none' | 'pending' | 'done' | 'failed';
  ocr: OcrFields | null;
}

export interface OcrFields {
  vendor?: string;
  date?: string;
  total?: string;
  tax?: string;
}

const COLUMNS = 'id, expense_id, name, mime_type, size_bytes, sha256, ocr_status, ocr_data';

interface Row {
  id: string;
  expense_id: string | null;
  name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  ocr_status: string;
  ocr_data: OcrFields | null;
}

const view = (r: Row): ReceiptView => ({
  id: r.id,
  expenseId: r.expense_id,
  name: r.name,
  mimeType: r.mime_type,
  sizeBytes: toInt(r.size_bytes),
  sha256: r.sha256,
  ocrStatus:
    r.ocr_status === 'done'
      ? 'done'
      : r.ocr_status === 'pending'
        ? 'pending'
        : r.ocr_status === 'failed'
          ? 'failed'
          : 'none',
  ocr:
    r.ocr_status === 'done' && r.ocr_data && Object.keys(r.ocr_data).length > 0 ? r.ocr_data : null,
});

export async function uploadReceipt(
  actor: Actor,
  input: unknown,
): Promise<ReceiptView & { sameReceiptOn: string[] }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = attachmentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The file is not valid.');
  const bytes = new Uint8Array(Buffer.from(parsed.data.dataBase64, 'base64'));
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    !ATTACHMENT_TYPES.includes(parsed.data.mimeType)
  )
    throw new ValidationError('Use a PDF, PNG, JPEG or CSV file of at most 8 MB.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const admin = getAdminSupabase();
  const same = await admin
    .from('expenses')
    .select('id')
    .eq('company_id', companyId)
    .eq('receipt_hash', sha256)
    .is('deleted_at', null)
    .limit(5);
  if (same.error) throw new InternalError(same.error);
  const record = await getService('storage').put({
    companyId,
    category: 'receipt',
    name: parsed.data.name,
    bytes,
    mimeType: parsed.data.mimeType,
  });
  const { data, error } = await admin
    .from('receipts')
    .insert({
      company_id: companyId,
      file_id: record.id,
      name: parsed.data.name,
      mime_type: parsed.data.mimeType,
      size_bytes: bytes.length,
      sha256,
      uploaded_by: actor.userId,
      ocr_status: 'pending',
    })
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'expense.receipt_uploaded',
    resourceType: 'receipt',
    resourceId: created.id,
    companyId,
    metadata: { name: created.name },
  });
  return { ...created, sameReceiptOn: (same.data ?? []).map((r) => String(r.id)) };
}

export async function getReceipt(companyId: string, id: string): Promise<ReceiptView> {
  const { data, error } = await getAdminSupabase()
    .from('receipts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return view(data as unknown as Row);
}

export async function receiptsOf(companyId: string, expenseId: string): Promise<ReceiptView[]> {
  const { data, error } = await getAdminSupabase()
    .from('receipts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('expense_id', expenseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

/** A short-lived signed link to the file of a receipt of this company. */
export async function receiptLink(companyId: string, id: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('receipts')
    .select('file_id')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return getService('storage').signedUrl(String(data.file_id), 300);
}

const ocrInput = z
  .object({
    vendor: z
      .string()
      .trim()
      .max(120)
      .refine((v) => !/[<>]/.test(v))
      .optional(),
    date: dayText.optional(),
    total: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .optional(),
    tax: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .optional(),
  })
  .strict();

/** Called by the OCR service with what it read from a receipt (or `null` when it could not read it). */
export async function applyOcrResult(
  companyId: string,
  receiptId: string,
  fields: unknown | null,
): Promise<ReceiptView> {
  const parsed = fields === null ? null : ocrInput.safeParse(fields);
  if (parsed && !parsed.success) throw new ValidationError('The OCR result is not valid.');
  const { data, error } = await getAdminSupabase()
    .from('receipts')
    .update(parsed ? { ocr_status: 'done', ocr_data: parsed.data } : { ocr_status: 'failed' })
    .eq('company_id', companyId)
    .eq('id', receiptId)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) throw new InternalError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  return view(row);
}

export function assertFree(r: ReceiptView): void {
  if (r.expenseId) throw new ConflictError('This receipt belongs to another expense.');
}
