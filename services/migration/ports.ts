// path: services/migration/ports.ts
// The only place where the migration wizard calls into STEP 08 (request R7): the import targets of the clients, products and
// suppliers lists (how a row is checked, how a duplicate is found, how a record is made through the owning service), the file
// readers of the import framework, and the delete operations used by a rollback. Everything the wizard writes goes through the
// owning services this way, never into their tables. If the Integrator replaces these calls with a contract, this is the only file
// that changes.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import { parseCsv, TransferError } from '@/lib/transfer/csv';
import {
  applyMapping,
  missingRequired,
  splitTable,
  type TransferField,
} from '@/lib/transfer/mapping';
import type { ImportTarget } from '@/lib/transfer/types';
import { readXlsx } from '@/lib/transfer/xlsx';
import type { Actor } from '@/types/contracts';
import { deleteClient } from '@/services/client/clients';
import { getImportTarget } from '@/services/import/registry';
import { deleteProduct } from '@/services/product/products';
import { deleteSupplier } from '@/services/supplier/suppliers';
import type { MigrationTarget } from '@/config/s16-migration';

export type { TransferField };
export { applyMapping, missingRequired };

export function targetOf(id: MigrationTarget): ImportTarget {
  return getImportTarget(id);
}

/** The header row and the data rows of a .csv or .xlsx file. */
export function readTable(
  bytes: Uint8Array,
  kind: 'csv' | 'xlsx',
): { headers: string[]; data: string[][] } {
  try {
    return splitTable(
      kind === 'xlsx'
        ? readXlsx(bytes)
        : parseCsv(new TextDecoder('utf-8', { fatal: false }).decode(bytes)),
    );
  } catch (error) {
    if (error instanceof TransferError) throw new ValidationError(error.message);
    throw error;
  }
}

/** Removes a record the wizard made (a soft delete by the owning service, which refuses when the record is in use). */
export async function removeRecord(
  actor: Actor,
  target: MigrationTarget,
  id: string,
): Promise<void> {
  if (target === 'clients') return deleteClient(actor, id);
  if (target === 'products') return deleteProduct(actor, id);
  return deleteSupplier(actor, id);
}
