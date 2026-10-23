// path: services/client/tenant-export.ts
// Registers the tables of STEP 08 for tenant exports (the owner's data export and backup). Only these columns are ever
// exported; nothing secret is listed.
import { registerTenantExport } from '@/lib/lifecycle/registry';

const std = ['id', 'created_at', 'updated_at', 'version'] as const;

registerTenantExport({
  table: 'clients',
  label: 'clients',
  columns: [
    ...std,
    'kind',
    'name',
    'contact_name',
    'email',
    'billing_email',
    'phone',
    'website',
    'tax_id',
    'payment_terms_days',
    'notes',
    'tags',
    'status',
    'billing_line1',
    'billing_line2',
    'billing_city',
    'billing_region',
    'billing_postal_code',
    'billing_country',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_region',
    'shipping_postal_code',
    'shipping_country',
    'opening_balance',
    'credit_limit',
    'risk_flag',
    'marketing_consent',
  ],
});
registerTenantExport({
  table: 'client_contacts',
  label: 'client_contacts',
  columns: [...std, 'client_id', 'name', 'role', 'email', 'phone', 'is_primary'],
});
registerTenantExport({
  table: 'product_categories',
  label: 'product_categories',
  columns: [...std, 'name', 'position'],
});
registerTenantExport({
  table: 'products',
  label: 'products',
  columns: [
    ...std,
    'kind',
    'name',
    'description',
    'sku',
    'barcode',
    'unit',
    'unit_price',
    'cost_price',
    'tax_category',
    'tax_rate',
    'category_id',
    'hs_code',
    'track_inventory',
    'reorder_level',
    'valuation_method',
    'status',
    'volume_tiers',
  ],
});
registerTenantExport({
  table: 'product_variants',
  label: 'product_variants',
  columns: [
    ...std,
    'product_id',
    'name',
    'sku',
    'barcode',
    'unit_price',
    'attributes',
    'is_active',
  ],
});
registerTenantExport({
  table: 'product_bundle_items',
  label: 'product_bundle_items',
  columns: [...std, 'bundle_id', 'item_product_id', 'quantity'],
});
registerTenantExport({
  table: 'client_prices',
  label: 'client_prices',
  columns: [...std, 'client_id', 'product_id', 'unit_price'],
});
registerTenantExport({
  table: 'warehouses',
  label: 'warehouses',
  columns: [...std, 'name', 'code', 'is_default', 'is_active'],
});
registerTenantExport({
  table: 'stock_levels',
  label: 'stock_levels',
  columns: [...std, 'product_id', 'variant_id', 'warehouse_id', 'quantity', 'avg_cost'],
});
registerTenantExport({
  table: 'stock_movements',
  label: 'stock_movements',
  columns: [
    ...std,
    'product_id',
    'variant_id',
    'warehouse_id',
    'kind',
    'quantity_delta',
    'balance_after',
    'unit_cost',
    'cost_total',
    'reason',
    'reference_type',
    'reference_id',
    'note',
  ],
});
registerTenantExport({
  table: 'inventory_documents',
  label: 'inventory_documents',
  columns: [
    ...std,
    'kind',
    'number',
    'status',
    'warehouse_id',
    'party_type',
    'party_name',
    'reference',
    'note',
    'posted_at',
  ],
});
registerTenantExport({
  table: 'inventory_document_lines',
  label: 'inventory_document_lines',
  columns: [
    ...std,
    'document_id',
    'position',
    'product_id',
    'variant_id',
    'quantity',
    'unit_cost',
    'batch_no',
    'expires_on',
    'note',
  ],
});
registerTenantExport({
  table: 'suppliers',
  label: 'suppliers',
  columns: [
    ...std,
    'name',
    'contact_name',
    'email',
    'phone',
    'website',
    'tax_id',
    'category',
    'payment_terms_days',
    'address_line1',
    'address_line2',
    'address_city',
    'address_region',
    'address_postal_code',
    'address_country',
    'notes',
    'status',
  ],
});
registerTenantExport({
  table: 'purchase_orders',
  label: 'purchase_orders',
  columns: [
    ...std,
    'number',
    'supplier_id',
    'status',
    'order_date',
    'expected_date',
    'warehouse_id',
    'supplier_reference',
    'notes',
    'subtotal',
    'tax_total',
    'total',
    'sent_at',
  ],
});
registerTenantExport({
  table: 'purchase_order_lines',
  label: 'purchase_order_lines',
  columns: [
    ...std,
    'purchase_order_id',
    'position',
    'product_id',
    'variant_id',
    'description',
    'quantity',
    'unit_cost',
    'tax_rate',
    'line_total',
    'received_qty',
  ],
});
registerTenantExport({
  table: 'supplier_bills',
  label: 'supplier_bills',
  columns: [
    ...std,
    'number',
    'supplier_id',
    'purchase_order_id',
    'supplier_invoice_no',
    'bill_date',
    'due_date',
    'status',
    'subtotal',
    'tax_total',
    'total',
    'paid_total',
    'match_status',
    'notes',
  ],
});
registerTenantExport({
  table: 'supplier_bill_lines',
  label: 'supplier_bill_lines',
  columns: [
    ...std,
    'bill_id',
    'position',
    'po_line_id',
    'product_id',
    'description',
    'quantity',
    'unit_cost',
    'tax_rate',
    'line_total',
  ],
});
registerTenantExport({
  table: 'supplier_remittances',
  label: 'supplier_remittances',
  columns: [...std, 'number', 'supplier_id', 'amount', 'paid_on', 'method', 'reference', 'status'],
});
registerTenantExport({
  table: 'supplier_remittance_allocations',
  label: 'supplier_remittance_allocations',
  columns: [...std, 'remittance_id', 'bill_id', 'amount'],
});
