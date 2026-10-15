// path: components/shared/data-table.tsx
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils/cn';

export interface DataColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** The main field of the mobile card (shown large, without a label). One column should set this. */
  primary?: boolean;
  /** Hide this column in the mobile card. */
  hideOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  caption: string;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  onRowClickHref?: (row: Row) => string | null;
}

/**
 * Table from the md breakpoint up; on phones each row becomes a card (label : value list).
 * Sorting and filtering are done on the server, never in this component.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  caption,
  empty,
}: DataTableProps<Row>): JSX.Element {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} scope="col" className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowId(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-sp-12 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={getRowId(row)} className="rounded-lg border bg-card p-sp-16">
            {primary ? (
              <div className="mb-sp-8 text-lead font-semibold">{primary.cell(row)}</div>
            ) : null}
            <dl className="space-y-1">
              {secondary.map((c) => (
                <div
                  key={c.key}
                  className={cn('flex items-baseline justify-between gap-4', c.className)}
                >
                  <dt className="text-caption text-muted-foreground">{c.header}</dt>
                  <dd className="text-right text-base">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
