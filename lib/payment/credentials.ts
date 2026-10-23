// path: lib/payment/credentials.ts
// Credential vault logic (REQ-ADMIN-CONNECT items 3 and 4). Credentials are encrypted through the `encryption`
// contract (purpose `processor-credentials`, scope = processor id) before they are stored. Only ciphertext, iv, tag, key
// version, the field names and the last characters of secret fields are kept. A secret is never returned after saving;
// decrypted values live in memory for the duration of one adapter call.
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { parseCredentials } from '@/schemas/payment/credentials';
import type { EncryptedPayload, ProcessorAdapter, ProcessorId } from '@/types/contracts';

const PURPOSE = 'processor-credentials';
/** A secret shorter than this shows no characters at all: its tail would reveal too much of it. */
const MIN_LENGTH_FOR_TAIL = 12;
const TAIL_LENGTH = 4;
const MASK = String.fromCharCode(0x2022).repeat(4);

export interface SealedCredentials {
  payload: EncryptedPayload;
  fieldKeys: string[];
  /** Secret fields: the last characters (or null for short values). Other fields: the value itself. */
  lastChars: Record<string, string | null>;
}

export interface StoredCredentialRow {
  ciphertext: string;
  iv: string;
  tag: string;
  key_version: number;
}

export function tailOf(value: string): string | null {
  return value.length >= MIN_LENGTH_FOR_TAIL ? value.slice(-TAIL_LENGTH) : null;
}

/** Validates the values against the adapter's fields and encrypts them. */
export async function sealCredentials(
  adapter: ProcessorAdapter,
  input: unknown,
): Promise<SealedCredentials> {
  const values = parseCredentials(adapter, input);
  const secretKeys = new Set(adapter.credentialFields.filter((f) => f.secret).map((f) => f.key));
  const lastChars: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(values)) {
    lastChars[key] = secretKeys.has(key) ? tailOf(value) : value;
  }
  const payload = await getService('encryption').encrypt(
    PURPOSE,
    JSON.stringify(values),
    adapter.id,
  );
  return { payload, fieldKeys: Object.keys(values).sort(), lastChars };
}

/** Decrypts a stored version. The caller keeps the result in a local variable for one call only. */
export async function openCredentials(
  processorId: ProcessorId,
  row: StoredCredentialRow,
): Promise<Record<string, string>> {
  const bytes = await getService('encryption').decrypt(
    PURPOSE,
    { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyVersion: row.key_version },
    processorId,
  );
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InternalError('Stored credentials are unreadable.');
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export interface CredentialFieldStatus {
  key: string;
  label: string;
  secret: boolean;
  saved: boolean;
  /** Four mask characters plus the last characters for long secrets, null for short ones. Non-secret fields show their value. */
  display: string | null;
}

/** What the dashboard shows after saving. Never contains a secret. */
export function describeCredentials(
  adapter: ProcessorAdapter,
  fieldKeys: readonly string[],
  lastChars: Readonly<Record<string, string | null>>,
): CredentialFieldStatus[] {
  return adapter.credentialFields.map((f) => {
    const saved = fieldKeys.includes(f.key);
    const raw = saved ? (lastChars[f.key] ?? null) : null;
    const display = raw === null ? null : f.secret ? `${MASK}${raw}` : raw;
    return { key: f.key, label: f.label, secret: f.secret, saved, display };
  });
}
