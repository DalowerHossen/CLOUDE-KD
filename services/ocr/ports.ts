// path: services/ocr/ports.ts
// The only direct call of the OCR service into another STEP (request R2 of STEP 16, R6 of STEP 15): the expense service takes
// what was read from a receipt, or `null` when the receipt could not be read. If the Integrator replaces this with an event, this is
// the only file that changes.
import 'server-only';
import { applyOcrResult } from '@/services/expense/receipts';

export interface ReadFields {
  vendor?: string;
  date?: string;
  total?: string;
  tax?: string;
}

export async function reportToExpenses(
  companyId: string,
  receiptId: string,
  fields: ReadFields | null,
): Promise<void> {
  await applyOcrResult(companyId, receiptId, fields);
}
