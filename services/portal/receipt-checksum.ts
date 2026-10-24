// path: services/portal/receipt-checksum.ts
// The checksum printed on a receipt (page and PDF). No document or database code here, so scripts can load it alone.
import { sha256Hex } from '@/lib/utils/hash';
import type { ReceiptData } from '@/services/payment/receipt-data';

/** The facts in a fixed order, so the same receipt always has the same checksum. */
export async function receiptChecksum(data: ReceiptData): Promise<string> {
  const facts = [
    data.paymentId,
    data.reference,
    data.paidAt,
    data.companyName,
    data.clientName,
    data.invoiceNumber,
    data.amount,
    data.surcharge,
    data.total,
    data.refunded,
    data.method,
    data.processorName,
    ...data.refunds.map((r) => `${r.at}=${r.amount}`),
  ];
  return (await sha256Hex(facts.join('|'))).slice(0, 16);
}
