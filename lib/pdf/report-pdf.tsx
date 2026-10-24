// path: lib/pdf/report-pdf.tsx
// A report as a PDF table: landscape, repeated header row, totals row in bold, page numbers. Amounts are shown with
// thousands separators and two decimals; counts as they are. It draws only the `ReportResult` it is given.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { fonts, safeText } from '@/lib/pdf/shared/fonts';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const T = (s: string): string => safeText(s);

function show(column: ReportColumn, value: string): string {
  if (value === '') return '';
  if (column.type === 'money') return formatMoney(Money.parse(value));
  if (column.type === 'percent') return `${value}%`;
  return T(value);
}

export interface ReportPdfProps {
  company: string;
  generatedOn: string;
  result: ReportResult;
}

export function ReportPdf({ company, generatedOn, result }: ReportPdfProps): ReactElement {
  const f = fonts();
  const s = StyleSheet.create({
    page: { padding: 32, paddingBottom: 48, fontSize: 8, fontFamily: f.regular, color: '#111827' },
    title: { fontSize: 16, fontFamily: f.bold, fontWeight: 700, marginBottom: 2 },
    muted: { color: '#6b7280' },
    head: {
      flexDirection: 'row',
      backgroundColor: '#111827',
      color: '#ffffff',
      padding: 4,
      marginTop: 10,
      fontFamily: f.bold,
      fontWeight: 700,
    },
    row: { flexDirection: 'row', padding: 4, borderBottom: '0.5pt solid #e5e7eb' },
    total: {
      flexDirection: 'row',
      padding: 4,
      borderTop: '1pt solid #111827',
      fontFamily: f.bold,
      fontWeight: 700,
    },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 32,
      right: 32,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: '#6b7280',
    },
    note: { marginTop: 8, color: '#6b7280' },
  });
  const widths = result.columns.map((c) => (c.type === 'text' ? 2 : 1));
  const cellStyle = (
    c: ReportColumn,
    i: number,
  ): {
    flexGrow: number;
    flexBasis: number;
    paddingRight: number;
    textAlign: 'left' | 'right';
  } => ({
    flexGrow: widths[i] ?? 1,
    flexBasis: 0,
    paddingRight: 4,
    textAlign: c.type === 'text' || c.type === 'date' ? 'left' : 'right',
  });
  return (
    <Document title={`${result.title}`} author={T(company)} creator="KD SOLUTION IT">
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <Text style={s.title}>{T(result.title)}</Text>
        <Text style={s.muted}>
          {T(company)}
          {result.period ? ` - ${result.period.from} to ${result.period.to}` : ''} - made on{' '}
          {generatedOn}
        </Text>
        <View style={s.head} fixed>
          {result.columns.map((c, i) => (
            <Text key={c.key} style={cellStyle(c, i)}>
              {T(c.label)}
            </Text>
          ))}
        </View>
        {result.rows.map((r, n) => (
          <View key={n} style={s.row} wrap={false}>
            {result.columns.map((c, i) => (
              <Text key={c.key} style={cellStyle(c, i)}>
                {show(c, r[c.key] ?? '')}
              </Text>
            ))}
          </View>
        ))}
        {result.totals ? (
          <View style={s.total} wrap={false}>
            {result.columns.map((c, i) => (
              <Text key={c.key} style={cellStyle(c, i)}>
                {show(c, result.totals?.[c.key] ?? '')}
              </Text>
            ))}
          </View>
        ) : null}
        {result.notes.map((n) => (
          <Text key={n} style={s.note}>
            {T(n)}
          </Text>
        ))}
        <View style={s.footer} fixed>
          <Text>{T(result.title)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
