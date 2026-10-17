// path: lib/pdf/invoice-pdf.tsx
// The invoice document: one layout with four looks (classic, modern, minimal, detailed), Letter or A4, a watermark,
// a repeated table header and "Page X of Y". Rows never split across pages. It only draws `PdfInvoiceData`.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { fonts, safeText } from '@/lib/pdf/shared/fonts';
import { REVERSE_CHARGE_NOTE, type PdfInvoiceData } from '@/lib/pdf/invoice/data';
import { formatMoney } from '@/lib/utils/formatting';
import { Money } from '@/lib/utils/currency';

const money = (v: string): string => formatMoney(Money.parse(v));
const T = (s: string): string => safeText(s);

function addressLines(a: {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string | null;
}): string[] {
  const cityLine = [a.city, a.region, a.postalCode].filter((p) => p !== '').join(', ');
  return [a.line1, a.line2, cityLine, a.country ?? ''].filter((l) => l !== '');
}

export interface InvoicePdfProps {
  data: PdfInvoiceData;
  logo: { bytes: Uint8Array; mimeType: string } | null;
}

export function InvoicePdf({ data, logo }: InvoicePdfProps): ReactElement {
  const f = fonts();
  const primary = data.seller.primaryColor;
  const accent = data.seller.accentColor;
  const modern = data.template === 'modern';
  const minimal = data.template === 'minimal';
  const detailed = data.template === 'detailed';
  const s = StyleSheet.create({
    page: { padding: 40, paddingBottom: 56, fontSize: 9, fontFamily: f.regular, color: '#111827' },
    head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
    band: modern
      ? { backgroundColor: primary, color: '#ffffff', padding: 14, marginBottom: 16 }
      : { marginBottom: 6 },
    title: {
      fontSize: minimal ? 16 : 22,
      fontFamily: f.bold,
      fontWeight: 700,
      color: modern ? '#ffffff' : primary,
    },
    bold: { fontFamily: f.bold, fontWeight: 700 },
    muted: { color: '#6b7280' },
    cols: { flexDirection: 'row', gap: 20, marginBottom: 14 },
    col: { flexGrow: 1, flexBasis: 0 },
    label: {
      fontSize: 8,
      color: accent,
      fontFamily: f.bold,
      fontWeight: 700,
      marginBottom: 3,
      textTransform: 'uppercase',
    },
    po: { fontFamily: f.bold, fontWeight: 700, fontSize: 11, color: primary },
    th: {
      flexDirection: 'row',
      backgroundColor: minimal ? '#ffffff' : primary,
      color: minimal ? '#111827' : '#ffffff',
      padding: 5,
      borderBottom: minimal ? '1pt solid #111827' : undefined,
      fontFamily: f.bold,
      fontWeight: 700,
    },
    tr: { flexDirection: 'row', padding: 5, borderBottom: '0.5pt solid #e5e7eb' },
    cDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
    cQty: { width: 44, textAlign: 'right' },
    cPrice: { width: 62, textAlign: 'right' },
    cDisc: { width: 44, textAlign: 'right' },
    cTax: { width: 44, textAlign: 'right' },
    cTotal: { width: 70, textAlign: 'right' },
    totals: { marginTop: 10, alignSelf: 'flex-end', width: 230 },
    trow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
    due: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
      marginTop: 4,
      borderTop: `1.5pt solid ${primary}`,
      fontFamily: f.bold,
      fontWeight: 700,
      fontSize: 11,
    },
    box: { marginTop: 12, padding: 8, backgroundColor: '#f9fafb' },
    footer: {
      position: 'absolute',
      bottom: 22,
      left: 40,
      right: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 8,
      color: '#6b7280',
    },
    watermark: {
      position: 'absolute',
      top: 300,
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 90,
      color: '#e5e7eb',
      transform: 'rotate(-30deg)',
      fontFamily: f.bold,
      fontWeight: 700,
    },
    logo: { width: 80, height: 48, objectFit: 'contain', marginBottom: 6 },
  });
  const seller = data.seller;
  const logoSrc = logo
    ? { data: Buffer.from(logo.bytes), format: logo.mimeType === 'image/png' ? 'png' : 'jpg' }
    : null;
  return (
    <Document
      title={`${data.title} ${data.number}`}
      author={T(seller.name)}
      creator="KD SOLUTION IT"
    >
      <Page size={data.paper} style={s.page} wrap>
        {data.watermark ? (
          <Text style={s.watermark} fixed>
            {data.watermark}
          </Text>
        ) : null}
        <View style={s.band}>
          <View style={s.head}>
            <View>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- a react-pdf image has no alt attribute */}
              {logoSrc ? <Image src={logoSrc as never} style={s.logo} /> : null}
              <Text style={[s.bold, { fontSize: 12, color: modern ? '#ffffff' : '#111827' }]}>
                {T(seller.name)}
              </Text>
              {addressLines(seller).map((l) => (
                <Text key={l} style={modern ? undefined : s.muted}>
                  {T(l)}
                </Text>
              ))}
              {seller.taxId !== '' ? (
                <Text>
                  {T(seller.taxLabel || 'Tax ID')}: {T(seller.taxId)}
                </Text>
              ) : null}
              {seller.registrationNumber !== '' ? (
                <Text>Reg. no: {T(seller.registrationNumber)}</Text>
              ) : null}
              {[seller.email, seller.phone, seller.website]
                .filter((x) => x !== '')
                .map((x) => (
                  <Text key={x}>{T(x)}</Text>
                ))}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.title}>{data.title}</Text>
              <Text style={s.bold}>{T(data.number)}</Text>
              <Text>Issued: {data.issueDate}</Text>
              <Text>Due: {data.dueDate}</Text>
              <Text>{T(data.termsLabel)}</Text>
              {data.poNumber !== '' ? <Text style={s.po}>PO: {T(data.poNumber)}</Text> : null}
            </View>
          </View>
        </View>
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.bold}>{T(data.billTo.name)}</Text>
            {data.billTo.contactName !== '' ? <Text>{T(data.billTo.contactName)}</Text> : null}
            {addressLines(data.billTo).map((l) => (
              <Text key={l}>{T(l)}</Text>
            ))}
            {data.billTo.taxId !== '' ? (
              <Text>
                {T(data.billTo.taxLabel || 'Tax ID')}: {T(data.billTo.taxId)}
              </Text>
            ) : null}
          </View>
          {data.shipTo ? (
            <View style={s.col}>
              <Text style={s.label}>Ship to</Text>
              <Text style={s.bold}>{T(data.shipTo.name)}</Text>
              {addressLines(data.shipTo).map((l) => (
                <Text key={l}>{T(l)}</Text>
              ))}
            </View>
          ) : null}
        </View>
        <View style={s.th} fixed>
          <Text style={s.cDesc}>Description</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cPrice}>Unit price</Text>
          <Text style={s.cDisc}>Disc.</Text>
          <Text style={s.cTax}>Tax</Text>
          <Text style={s.cTotal}>Amount</Text>
        </View>
        {data.lines.map((l) => (
          <View key={l.position} style={s.tr} wrap={false}>
            <View style={s.cDesc}>
              <Text>{T(l.description)}</Text>
              {detailed && (l.sku !== '' || l.hsCode !== '') ? (
                <Text style={s.muted}>
                  {[l.sku !== '' ? `SKU ${l.sku}` : '', l.hsCode !== '' ? `HS ${l.hsCode}` : '']
                    .filter((x) => x !== '')
                    .join('  ')}
                </Text>
              ) : null}
            </View>
            <Text style={s.cQty}>
              {l.quantity} {T(l.unit)}
            </Text>
            <Text style={s.cPrice}>{money(l.unitPrice)}</Text>
            <Text style={s.cDisc}>{l.discount}</Text>
            <Text style={s.cTax}>{l.tax}</Text>
            <Text style={s.cTotal}>{money(l.total)}</Text>
          </View>
        ))}
        <View style={s.totals} wrap={false}>
          <View style={s.trow}>
            <Text>Subtotal</Text>
            <Text>{money(data.totals.subtotal)}</Text>
          </View>
          {!Money.parse(data.totals.discounts).isZero() ? (
            <View style={s.trow}>
              <Text>Discounts</Text>
              <Text>-{money(data.totals.discounts)}</Text>
            </View>
          ) : null}
          {!Money.parse(data.totals.shipping).isZero() ? (
            <View style={s.trow}>
              <Text>Shipping</Text>
              <Text>{money(data.totals.shipping)}</Text>
            </View>
          ) : null}
          {data.taxBreakdown.map((t) => (
            <View key={`${t.code}-${t.rate}`} style={s.trow}>
              <Text>
                {T(t.code)} {t.rate}%
              </Text>
              <Text>{money(t.amount)}</Text>
            </View>
          ))}
          {!Money.parse(data.totals.rounding).isZero() ? (
            <View style={s.trow}>
              <Text>Rounding</Text>
              <Text>{money(data.totals.rounding)}</Text>
            </View>
          ) : null}
          <View style={[s.trow, s.bold]}>
            <Text>Total</Text>
            <Text>{money(data.totals.total)}</Text>
          </View>
          {!Money.parse(data.totals.withheld).isZero() ? (
            <View style={s.trow}>
              <Text>Tax withheld</Text>
              <Text>-{money(data.totals.withheld)}</Text>
            </View>
          ) : null}
          {!Money.parse(data.totals.paid).isZero() ? (
            <View style={s.trow}>
              <Text>Paid</Text>
              <Text>-{money(data.totals.paid)}</Text>
            </View>
          ) : null}
          <View style={s.due}>
            <Text>Amount due</Text>
            <Text>{money(data.totals.amountDue)}</Text>
          </View>
          {data.display ? (
            <Text style={s.muted}>
              About {data.display.amountDue} {data.display.currency} at {data.display.rate}
            </Text>
          ) : null}
        </View>
        <View wrap={false}>
          <Text style={[s.muted, { marginTop: 8 }]}>{T(data.amountInWords)}</Text>
          {data.reverseCharge ? <Text style={{ marginTop: 6 }}>{REVERSE_CHARGE_NOTE}</Text> : null}
          {data.notes !== '' ? (
            <View style={s.box}>
              <Text style={s.label}>Notes</Text>
              <Text>{T(data.notes)}</Text>
            </View>
          ) : null}
          {seller.remitTo ? (
            <View style={s.box}>
              <Text style={s.label}>Remit to</Text>
              {[
                ['Bank', seller.remitTo.bankName],
                ['Account name', seller.remitTo.accountName],
                ['Account number', seller.remitTo.accountNumber],
                ['Routing number', seller.remitTo.routingNumber],
                ['SWIFT', seller.remitTo.swift],
                ['IBAN', seller.remitTo.iban],
              ]
                .filter(([, v]) => v !== '')
                .map(([k, v]) => (
                  <Text key={k}>
                    {k}: {T(v ?? '')}
                  </Text>
                ))}
              {seller.remitTo.instructions !== '' ? (
                <Text>{T(seller.remitTo.instructions)}</Text>
              ) : null}
            </View>
          ) : null}
          {seller.terms !== '' ? (
            <View style={s.box}>
              <Text style={s.label}>Terms</Text>
              <Text>{T(seller.terms)}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.footer} fixed>
          <Text>{T(seller.footer || seller.name)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
