// path: services/project/expense-hook.ts
// Reimbursable expenses on a project invoice. The expense STEP registers a provider here (from its own register file);
// until then no expenses are offered. STEP 09 never reads expense tables.
export interface BillableExpense {
  id: string;
  date: string;
  description: string;
  /** US dollars, four decimals. */
  amount: string;
}

export interface BillableExpenseProvider {
  /** Approved, reimbursable expenses of the project that no invoice has taken yet. */
  list(companyId: string, projectId: string): Promise<BillableExpense[]>;
  /** Marks the expenses as billed on the invoice (atomic: all or none). */
  markBilled(companyId: string, expenseIds: string[], invoiceId: string): Promise<void>;
  /** Gives the expenses of an invoice back (the invoice was voided or deleted). */
  release(companyId: string, invoiceId: string): Promise<void>;
}

let provider: BillableExpenseProvider | null = null;

export function registerBillableExpenseProvider(p: BillableExpenseProvider): void {
  provider = p;
}

export function billableExpenseProvider(): BillableExpenseProvider | null {
  return provider;
}
