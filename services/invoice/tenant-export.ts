// path: services/invoice/tenant-export.ts
// Registers the tables of STEP 09 for tenant exports (the owner's data export and backup). Only these columns are ever
// exported. Nothing secret is listed: no bank details of the seller, no signature checksums, no network addresses of
// people who signed.
import { registerTenantExport } from '@/lib/lifecycle/registry';

const std = ['id', 'created_at', 'updated_at', 'version'] as const;

registerTenantExport({
  table: 'invoices',
  label: 'invoices',
  columns: [
    ...std,
    'kind',
    'number',
    'status',
    'client_id',
    'walk_in_name',
    'bill_to',
    'ship_to',
    'issue_date',
    'due_date',
    'payment_terms',
    'po_number',
    'notes',
    'tags',
    'category',
    'project_id',
    'parent_invoice_id',
    'subtotal',
    'line_discount_total',
    'document_discount',
    'shipping',
    'tax_total',
    'tax_breakdown',
    'rounding_adjustment',
    'total',
    'withholding',
    'amount_due',
    'amount_paid',
    'display_currency',
    'fx_rate',
    'sent_at',
    'viewed_at',
    'paid_at',
    'voided_at',
    'void_reason',
  ],
});
registerTenantExport({
  table: 'invoice_items',
  label: 'invoice_items',
  columns: [
    ...std,
    'invoice_id',
    'position',
    'product_id',
    'variant_id',
    'sku',
    'description',
    'hs_code',
    'quantity',
    'unit',
    'unit_price',
    'discount_kind',
    'discount_value',
    'tax_exempt',
    'taxes',
    'gross',
    'line_discount',
    'net',
    'tax',
    'line_total',
  ],
});
registerTenantExport({
  table: 'invoice_payment_links',
  label: 'invoice_payment_links',
  columns: [...std, 'invoice_id', 'payment_id', 'amount', 'applied_at'],
});
registerTenantExport({
  table: 'invoice_events',
  label: 'invoice_events',
  columns: [...std, 'invoice_id', 'kind', 'message', 'actor_id'],
});
registerTenantExport({
  table: 'estimates',
  label: 'estimates',
  columns: [
    ...std,
    'client_id',
    'walk_in_name',
    'number',
    'status',
    'input',
    'subtotal',
    'tax_total',
    'total',
    'valid_until',
    'sent_at',
    'viewed_at',
    'decided_at',
    'decision_note',
    'signer_name',
    'converted_invoice_id',
    'void_reason',
  ],
});
registerTenantExport({
  table: 'credit_notes',
  label: 'credit_notes',
  columns: [
    ...std,
    'client_id',
    'walk_in_name',
    'invoice_id',
    'number',
    'status',
    'reason',
    'reason_note',
    'issue_date',
    'bill_to',
    'lines',
    'tax_breakdown',
    'subtotal',
    'tax_total',
    'total',
    'applied_amount',
    'return_to_stock',
    'void_reason',
  ],
});
registerTenantExport({
  table: 'credit_applications',
  label: 'credit_applications',
  columns: [...std, 'source_type', 'source_id', 'invoice_id', 'amount'],
});
registerTenantExport({
  table: 'invoice_writeoffs',
  label: 'invoice_writeoffs',
  columns: [...std, 'invoice_id', 'amount', 'reason', 'created_by'],
});
registerTenantExport({
  table: 'installment_plans',
  label: 'installment_plans',
  columns: [...std, 'invoice_id', 'status'],
});
registerTenantExport({
  table: 'installments',
  label: 'installments',
  columns: [...std, 'plan_id', 'invoice_id', 'number', 'due_date', 'amount'],
});
registerTenantExport({
  table: 'recurring_schedules',
  label: 'recurring_schedules',
  columns: [
    ...std,
    'client_id',
    'name',
    'template',
    'unit',
    'every',
    'month_end',
    'start_date',
    'end_date',
    'max_occurrences',
    'occurrences_done',
    'status',
    'auto_send',
    'next_run_date',
    'last_run_on',
  ],
});
registerTenantExport({
  table: 'late_fees',
  label: 'late_fees',
  columns: [
    ...std,
    'invoice_id',
    'period_key',
    'amount',
    'status',
    'debit_note_id',
    'waived_reason',
  ],
});
registerTenantExport({
  table: 'tax_rates',
  label: 'tax_rates',
  columns: [
    ...std,
    'code',
    'name',
    'rate',
    'kind',
    'country',
    'region',
    'compound',
    'is_active',
    'sort_order',
  ],
});
registerTenantExport({
  table: 'client_tax_exemptions',
  label: 'client_tax_exemptions',
  columns: [
    ...std,
    'client_id',
    'tax_exempt',
    'reason',
    'certificate_expires_on',
    'client_tax_id',
    'client_tax_label',
  ],
});
registerTenantExport({
  table: 'fx_rates',
  label: 'fx_rates',
  columns: [...std, 'currency', 'rate', 'as_of', 'source'],
});
registerTenantExport({
  table: 'projects',
  label: 'projects',
  columns: [
    ...std,
    'client_id',
    'name',
    'code',
    'description',
    'status',
    'billing_type',
    'default_rate',
    'fixed_fee',
    'retainer_hours',
    'budget_hours',
    'budget_amount',
    'start_date',
    'end_date',
  ],
});
registerTenantExport({
  table: 'project_members',
  label: 'project_members',
  columns: [...std, 'project_id', 'user_id', 'role', 'rate'],
});
registerTenantExport({
  table: 'project_milestones',
  label: 'project_milestones',
  columns: [...std, 'project_id', 'name', 'due_date', 'amount', 'status', 'invoice_id', 'position'],
});
registerTenantExport({
  table: 'time_entries',
  label: 'time_entries',
  columns: [
    ...std,
    'project_id',
    'user_id',
    'work_date',
    'hours',
    'description',
    'billable',
    'rate',
    'milestone_id',
    'status',
    'approved_by',
    'approved_at',
    'invoice_id',
  ],
});
registerTenantExport({
  table: 'report_schedules',
  label: 'report_schedules',
  columns: [
    ...std,
    'report_key',
    'name',
    'params',
    'format',
    'frequency',
    'weekday',
    'month_day',
    'enabled',
  ],
});
