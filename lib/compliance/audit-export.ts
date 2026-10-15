// path: lib/compliance/audit-export.ts
// Pure formatters for audit exports: JSON lines, CSV and ArcSight CEF. No database access.
export interface AuditExportRow {
  id: string;
  companyId: string | null;
  chainKey: string;
  sequence: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipMasked: string | null;
  correlationId: string | null;
  createdAt: string;
  entryHash: string;
}

export type AuditExportFormat = 'json' | 'csv' | 'cef';

const CSV_COLUMNS: readonly (keyof AuditExportRow)[] = [
  'createdAt',
  'sequence',
  'chainKey',
  'companyId',
  'actorUserId',
  'actorRole',
  'action',
  'resourceType',
  'resourceId',
  'ipMasked',
  'correlationId',
  'entryHash',
  'id',
];

/** Quotes a CSV field and neutralises spreadsheet formulas (a leading = + - @ tab or CR gets an apostrophe). */
export function csvField(value: string | null): string {
  if (value === null) return '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly AuditExportRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvField(row[c])).join(','));
  return `${lines.join('\n')}\n`;
}

export function toJsonLines(rows: readonly AuditExportRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : '');
}

function cefHeaderEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function cefExtensionEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/[\r\n]+/g, ' ');
}

/** CEF:Version|Vendor|Product|Version|SignatureID|Name|Severity|Extension */
export function toCef(rows: readonly AuditExportRow[]): string {
  return rows
    .map((r) => {
      const ext: [string, string | null][] = [
        ['rt', r.createdAt],
        ['suser', r.actorUserId],
        ['spriv', r.actorRole],
        ['cs1Label', 'companyId'],
        ['cs1', r.companyId],
        ['cs2Label', 'resource'],
        ['cs2', r.resourceId === null ? r.resourceType : `${r.resourceType}/${r.resourceId}`],
        ['src', r.ipMasked],
        ['externalId', r.correlationId],
        ['cn1Label', 'sequence'],
        ['cn1', r.sequence],
        ['cs3Label', 'entryHash'],
        ['cs3', r.entryHash],
      ];
      const extension = ext
        .filter((e): e is [string, string] => e[1] !== null)
        .map(([k, v]) => `${k}=${cefExtensionEscape(v)}`)
        .join(' ');
      return `CEF:0|KD SOLUTION IT|Platform|1.0|${cefHeaderEscape(r.action)}|${cefHeaderEscape(r.action)}|3|${extension}`;
    })
    .join('\n')
    .concat(rows.length > 0 ? '\n' : '');
}

export function formatAuditExport(rows: readonly AuditExportRow[], format: AuditExportFormat): string {
  if (format === 'csv') return toCsv(rows);
  if (format === 'cef') return toCef(rows);
  return toJsonLines(rows);
}

export const AUDIT_EXPORT_CONTENT_TYPES: Readonly<Record<AuditExportFormat, string>> = {
  json: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  cef: 'text/plain; charset=utf-8',
};
