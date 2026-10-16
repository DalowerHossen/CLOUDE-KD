// path: lib/transfer/types.ts
// What an import and export target provides. Each list (clients, products, suppliers) supplies one.
import type { Actor } from '@/types/contracts';
import type { ImportTargetId, TransferField } from './mapping';

export type ParsedRow<V> = { ok: true; value: V } | { ok: false; errors: string[] };

export interface ImportTarget<V = unknown> {
  id: ImportTargetId;
  /** Permission needed to import (also needed for the preview). */
  writePermission: string;
  resourceType: string;
  readPermission: string;
  fields: readonly TransferField[];
  /** Turns one mapped row (field key to text) into a checked value, or lists what is wrong. */
  parse(row: Record<string, string>): ParsedRow<V>;
  /** A key that is the same for rows that mean the same record inside one file (for example the e-mail); null if none. */
  fileKey(value: V): string | null;
  /** Id of an existing record that the value duplicates, or null. */
  findDuplicate(companyId: string, value: V): Promise<string | null>;
  create(actor: Actor, value: V): Promise<string>;
  update(actor: Actor, id: string, value: V): Promise<void>;
  exportColumns: readonly { key: string; label: string }[];
  exportRows(
    companyId: string,
    filter: { q?: string; status?: string },
  ): Promise<Record<string, string>[]>;
}
