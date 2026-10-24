// path: lib/transfer/mapping.ts
// Matching spreadsheet columns to the fields of an import target, and turning rows into field values. Pure.
import { z } from 'zod';
import { cleanRows, MAX_ROWS, TransferError } from './csv';

export interface TransferField {
  key: string;
  label: string;
  required: boolean;
  /** Other names a column may carry, for example "e-mail" for "email". */
  aliases: readonly string[];
}

export type ImportTargetId = 'clients' | 'products' | 'suppliers';
export const IMPORT_TARGETS = ['clients', 'products', 'suppliers'] as const;
export const DUPLICATE_MODES = ['skip', 'overwrite', 'create'] as const;
export type DuplicateMode = (typeof DUPLICATE_MODES)[number];

const normal = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Column header for each field key; fields without a match are left out. */
export function suggestMapping(
  headers: readonly string[],
  fields: readonly TransferField[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<number>();
  for (const f of fields) {
    const names = [f.key, f.label, ...f.aliases].map(normal);
    const at = headers.findIndex((h, i) => !used.has(i) && names.includes(normal(h)));
    if (at >= 0) {
      used.add(at);
      out[f.key] = headers[at] ?? '';
    }
  }
  return out;
}

/** Splits a table into its header row and data rows (the first row is the header). */
export function splitTable(rows: readonly string[][]): { headers: string[]; data: string[][] } {
  const clean = cleanRows(rows);
  const head = clean[0];
  if (!head) throw new TransferError('The file is empty.');
  const headers = head.map((h) => h.trim());
  if (new Set(headers.map(normal)).size !== headers.length || headers.some((h) => h === ''))
    throw new TransferError('Every column needs a different, non-empty name in the first row.');
  const data = clean.slice(1);
  if (data.length === 0) throw new TransferError('The file has a header but no rows.');
  if (data.length > MAX_ROWS) throw new TransferError('The file has more than 5000 rows.');
  return { headers, data };
}

/** Removes control characters and angle brackets; limits the length. */
export function cleanCell(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 2000);
}

export function applyMapping(
  headers: readonly string[],
  data: readonly string[][],
  mapping: Readonly<Record<string, string>>,
): Record<string, string>[] {
  const at = new Map<string, number>();
  for (const [key, header] of Object.entries(mapping)) {
    const i = headers.indexOf(header);
    if (i >= 0) at.set(key, i);
  }
  return data.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, i] of at) out[key] = cleanCell(row[i] ?? '');
    return out;
  });
}

/** Names of required fields that have no column. */
export function missingRequired(
  fields: readonly TransferField[],
  mapping: Readonly<Record<string, string>>,
): string[] {
  return fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}

export const importUploadSchema = z
  .object({
    target: z.enum(IMPORT_TARGETS),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/\.(csv|xlsx)$/i, { message: 'Use a .csv or .xlsx file.' })
      .refine((v) => !/[\\/<>]/.test(v), {
        message: 'The file name has characters that are not allowed.',
      }),
    /** Base64 of the file, at most about 7 MB of file data. */
    dataBase64: z
      .string()
      .min(8)
      .max(9_800_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type ImportUpload = z.infer<typeof importUploadSchema>;

export const importActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      mapping: z.record(z.string().max(60), z.string().max(200)),
      duplicateMode: z.enum(DUPLICATE_MODES),
    })
    .strict(),
  z.object({ action: z.literal('run') }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
]);
export type ImportAction = z.infer<typeof importActionSchema>;

export const exportSchema = z
  .object({
    target: z.enum(IMPORT_TARGETS),
    q: z.string().trim().max(80).optional(),
    status: z.string().trim().max(30).optional(),
  })
  .strict();
export type ExportRequest = z.infer<typeof exportSchema>;
