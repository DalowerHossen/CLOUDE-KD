// path: lib/pdf/receipt-pdf.tsx
// A payment receipt as a one-page PDF: who paid whom, for which invoice, how, how much, any refunds, and a checksum of
// the facts shown (so a copy can be compared with the page). It draws only the data it is given.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { fonts, safeText } from '@/lib/pdf/shared/fonts';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface ReceiptPdfData {
  reference: string;
  paidAt: string;
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  amount: string;
  surcharge: string;
  total: string;
  refunded: string;
  method: string;
  processorName: string;
  refunds: { amount: string; at: string }[];
  checksum: string;
}

const T = (s: string): string => safeText(s);
const usd = (value: string): string => `USD ${formatMoney(Money.parse(value))}`;

export function ReceiptPdf({ data }: { data: ReceiptPdfData }): ReactElement {
  const f = fonts();
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: f.regular, color: '#111827' },
    title: { fontSize: 22, fontFamily: f.bold, fontWeight: 700 },
    muted: { color: '#6b7280' },
    block: { marginTop: 18 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottom: '0.5pt solid #e5e7eb',
    },
    strong: { fontFamily: f.bold, fontWeight: 700 },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderTop: '1pt solid #111827',
      marginTop: 4,
    },
    footer: {
      position: 'absolute',
      bottom: 28,
      left: 40,
      right: 40,
      fontSize: 8,
      color: '#6b7280',
    },
  });
  const rows: ReadonlyArray<readonly [string, string]> = [
    ['Invoice', T(data.invoiceNumber)],
    ['Paid on', T(data.paidAt.slice(0, 10))],
    ['Payment method', T([data.method, data.processorName].filter((v) => v !== '').join(' - '))],
    ['Amount', usd(data.amount)],
  ];
  const hasSurcharge = !/^0+(\.0+)?$/.test(data.surcharge);
  const hasRefunds = data.refunds.length > 0;
  return (
    <Document title={`Receipt ${T(data.reference)}`} author={T(data.companyName)}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>RECEIPT</Text>
        <Text style={s.muted}>
          {T(data.companyName)} - Reference {T(data.reference)}
        </Text>
        <View style={s.block}>
          <Text style={s.muted}>Received from</Text>
          <Text style={s.strong}>{T(data.clientName)}</Text>
        </View>
        <View style={s.block}>
          {rows.map(([label, value]) => (
            <View key={label} style={s.row}>
              <Text>{label}</Text>
              <Text>{value}</Text>
            </View>
          ))}
          {hasSurcharge ? (
            <View style={s.row}>
              <Text>Card fee</Text>
              <Text>{usd(data.surcharge)}</Text>
            </View>
          ) : null}
          <View style={s.totalRow}>
            <Text style={s.strong}>Total paid</Text>
            <Text style={s.strong}>{usd(data.total)}</Text>
          </View>
        </View>
        {hasRefunds ? (
          <View style={s.block}>
            <Text style={s.strong}>Refunds</Text>
            {data.refunds.map((refund) => (
              <View key={`${refund.at}-${refund.amount}`} style={s.row}>
                <Text>{T(refund.at.slice(0, 10))}</Text>
                <Text>- {usd(refund.amount)}</Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={s.strong}>Total refunded</Text>
              <Text style={s.strong}>{usd(data.refunded)}</Text>
            </View>
          </View>
        ) : null}
        <Text style={s.footer}>Checksum {T(data.checksum)}</Text>
      </Page>
    </Document>
  );
}
