// path: lib/pdf/payslip-pdf.tsx
// A payslip as a one-page PDF: employee, period, earnings, deductions and taxes, net pay and the year to date. It draws only
// the data it is given. The file is stored encrypted through the storage contract by the pay run service.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { fonts, safeText } from '@/lib/pdf/shared/fonts';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface PayslipPdfLine {
  code: string;
  name: string;
  kind: 'earning' | 'deduction' | 'tax' | 'employer';
  amount: string;
}

export interface PayslipPdfData {
  company: string;
  employeeName: string;
  employeeNumber: string;
  runNumber: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  lines: PayslipPdfLine[];
  gross: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  ytdGross: string;
  ytdNet: string;
}

const T = (s: string): string => safeText(s);
const usd = (value: string): string => `USD ${formatMoney(Money.parse(value))}`;

export function PayslipPdf({ data }: { data: PayslipPdfData }): ReactElement {
  const f = fonts();
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: f.regular, color: '#111827' },
    title: { fontSize: 22, fontFamily: f.bold, fontWeight: 700 },
    muted: { color: '#6b7280' },
    block: { marginTop: 16 },
    heading: { fontFamily: f.bold, fontWeight: 700, marginBottom: 4 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      borderBottom: '0.5pt solid #e5e7eb',
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
      borderTop: '1pt solid #111827',
      fontFamily: f.bold,
      fontWeight: 700,
    },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      fontSize: 8,
      color: '#6b7280',
    },
  });
  const group = (kinds: readonly PayslipPdfLine['kind'][]): PayslipPdfLine[] =>
    data.lines.filter((l) => kinds.includes(l.kind));
  const section = (
    title: string,
    lines: PayslipPdfLine[],
    total: string,
    totalLabel: string,
  ): ReactElement | null =>
    lines.length === 0 ? null : (
      <View style={s.block}>
        <Text style={s.heading}>{title}</Text>
        {lines.map((l) => (
          <View key={`${l.kind}-${l.code}`} style={s.row}>
            <Text>{T(l.name)}</Text>
            <Text>{usd(l.amount)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text>{totalLabel}</Text>
          <Text>{usd(total)}</Text>
        </View>
      </View>
    );
  return (
    <Document
      title={`Payslip ${T(data.employeeNumber)} ${data.periodEnd}`}
      author={T(data.company)}
      creator="KD SOLUTION IT"
    >
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>PAYSLIP</Text>
        <Text style={s.muted}>
          {T(data.company)} - {T(data.runNumber)}
        </Text>
        <View style={s.block}>
          <Text style={s.heading}>{T(data.employeeName)}</Text>
          <Text style={s.muted}>
            {T(data.employeeNumber)} - Period {data.periodStart} to {data.periodEnd} - Paid on{' '}
            {data.payDate}
          </Text>
        </View>
        {section('Earnings', group(['earning']), data.gross, 'Gross pay')}
        {section('Deductions', group(['deduction']), data.deductions, 'Total deductions')}
        {section('Taxes withheld', group(['tax']), data.employeeTaxes, 'Total taxes')}
        <View style={s.block}>
          <View style={s.totalRow}>
            <Text>Net pay</Text>
            <Text>{usd(data.net)}</Text>
          </View>
        </View>
        <View style={s.block}>
          <Text style={s.heading}>Year to date</Text>
          <View style={s.row}>
            <Text>Gross pay</Text>
            <Text>{usd(data.ytdGross)}</Text>
          </View>
          <View style={s.row}>
            <Text>Net pay</Text>
            <Text>{usd(data.ytdNet)}</Text>
          </View>
        </View>
        <Text style={s.footer}>This payslip is confidential. Amounts are in US dollars.</Text>
      </Page>
    </Document>
  );
}
