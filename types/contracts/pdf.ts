// path: types/contracts/pdf.ts

export type PdfKind = 'invoice' | 'estimate' | 'receipt' | 'payslip' | 'report' | 'evidence-pack';

export interface PdfService {
  render(kind: PdfKind, data: Record<string, unknown>): Promise<Uint8Array>;
}
