// path: services/storage/prepare.ts
// Everything an upload must pass before the bytes are encrypted and stored: rate limit, integrity hash, known-malware
// list, file validation, malware scanner. Suspicious files are recorded in quarantine (metadata only, never the bytes).
import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { AppError, InternalError, RateLimitError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { createHttpScanner, type MalwareScanner } from '@/lib/storage/scanner';
import { validateUpload } from '@/lib/storage/validate/pipeline';
import type { CleanFile, RejectCode } from '@/lib/storage/validate/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { FileCategory } from '@/types/contracts';

const log = createLogger({ component: 'upload-prepare' });

/** Reasons that point to an attack or a careless sender and deserve a review record and a security event. */
const SUSPICIOUS: ReadonlySet<RejectCode> = new Set([
  'executable',
  'polyglot',
  'script_content',
  'macro',
  'archive_bomb',
  'archive_path',
  'pdf_active_content',
]);

export interface PrepareInput {
  companyId: string | null;
  /** Null for system callers (generated documents); the per-user rate limit is skipped then. */
  userId: string | null;
  category: FileCategory;
  name: string;
  bytes: Uint8Array;
  declaredMime?: string | null;
  /** SHA-256 (hex) the browser computed over the bytes it sent. */
  clientHash?: string | null;
}

export interface PreparedUpload {
  file: CleanFile;
  scanStatus: 'clean' | 'skipped';
}

let scanner: MalwareScanner | null | undefined;
export function setScanner(next: MalwareScanner | null): void {
  scanner = next;
}
function activeScanner(): MalwareScanner | null {
  if (scanner !== undefined) return scanner;
  const env = getServerEnv();
  scanner = env.MALWARE_SCANNER_URL
    ? createHttpScanner(env.MALWARE_SCANNER_URL, env.MALWARE_SCANNER_TOKEN)
    : null;
  return scanner;
}

async function quarantine(
  input: PrepareInput,
  code: string,
  reason: string,
  hash: string | null,
): Promise<void> {
  try {
    const { error } = await getAdminSupabase()
      .from('file_quarantine')
      .insert({
        company_id: input.companyId,
        uploaded_by: input.userId,
        category: input.category,
        name: input.name.slice(0, 160),
        declared_mime: input.declaredMime?.slice(0, 120) ?? null,
        size_bytes: input.bytes.length,
        content_hash: hash,
        reason_code: code,
        reason: reason.slice(0, 300),
      });
    if (error) throw error;
    await getService('security').raiseSecurityEvent('other', {
      source: 'upload',
      reason: 'upload_quarantined',
      code,
    });
  } catch (error) {
    log.error('quarantine record could not be written', { error });
  }
}

async function isKnownMalware(hash: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_known_malware', { p_hash: hash });
  if (error) throw new InternalError(error);
  return z.boolean().parse(data);
}

export async function prepareUpload(input: PrepareInput): Promise<PreparedUpload> {
  if (input.userId) {
    const rate = await getService('security').rateLimit(input.userId, 'upload');
    if (!rate.allowed) throw new RateLimitError(rate.retryAfterSeconds);
  }

  const rawHash = createHash('sha256').update(input.bytes).digest('hex');
  if (input.clientHash && input.clientHash.toLowerCase() !== rawHash) {
    throw new ValidationError('The file was damaged during the upload. Please try again.');
  }
  if (await isKnownMalware(rawHash)) {
    await quarantine(input, 'known_malware', 'The file matches a known malware hash.', rawHash);
    throw new ValidationError('This file is not accepted.');
  }

  const result = await validateUpload({
    bytes: input.bytes,
    name: input.name,
    declaredMime: input.declaredMime ?? null,
    category: input.category,
  });
  if (!result.ok) {
    if (SUSPICIOUS.has(result.code)) await quarantine(input, result.code, result.message, rawHash);
    throw new ValidationError(result.message, [{ path: 'file', message: result.code }]);
  }
  const file = result.file;
  if (file.contentHash !== rawHash && (await isKnownMalware(file.contentHash))) {
    await quarantine(
      input,
      'known_malware',
      'The cleaned file matches a known malware hash.',
      file.contentHash,
    );
    throw new ValidationError('This file is not accepted.');
  }

  const active = activeScanner();
  if (!active) return { file, scanStatus: 'skipped' };
  const verdict = await active.scan(file.bytes);
  if (verdict.status === 'infected') {
    await quarantine(input, 'malware', `Scanner signature: ${verdict.signature}`, file.contentHash);
    throw new ValidationError('This file is not accepted.');
  }
  if (verdict.status === 'error') {
    // Fail closed: an unchecked file is not stored while a scanner is configured.
    log.error('malware scanner failed', { message: verdict.message });
    throw new AppError(
      'service_unavailable',
      503,
      'The file check is not available. Please try again later.',
    );
  }
  return { file, scanStatus: 'clean' };
}
