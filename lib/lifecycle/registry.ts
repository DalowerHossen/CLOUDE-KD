// path: lib/lifecycle/registry.ts
// Which tables belong to a tenant export. A STEP that adds tenant data registers its tables here (one call at load
// time, from its own register file). Only registered tables and columns are ever exported, so a new table with a secret
// in it can never leak into an export by accident.

export interface TenantExportTable {
  table: string;
  /** Short name used in the export file. */
  label: string;
  /** Columns that may be exported. Never list a hash, token, key or encrypted column. */
  columns: readonly string[];
}

const tables = new Map<string, TenantExportTable>();

export function registerTenantExport(def: TenantExportTable): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(def.table))
    throw new Error(`export table name "${def.table}" is not valid`);
  for (const col of def.columns) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(col)) throw new Error(`export column "${col}" is not valid`);
    if (/(hash|token|secret|password|key|cipher|encrypted|otp)/.test(col))
      throw new Error(`export column "${col}" looks secret`);
  }
  tables.set(def.table, def);
}

export function tenantExports(): TenantExportTable[] {
  return [...tables.values()];
}
