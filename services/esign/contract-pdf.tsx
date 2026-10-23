// path: services/esign/contract-pdf.tsx
// The signed contract as a PDF: the frozen wording, a signature block for each signer, and a certificate page with the
// evidence (time, masked address, device, method, checksums). It draws only the data it is given.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { fonts, safeText } from '@/lib/pdf/shared/fonts';

export interface SignedSigner {
  position: number;
  name: string;
  email: string;
  roleLabel: string;
  method: 'typed' | 'drawn' | 'uploaded';
  typedName: string;
  signedAt: string;
  ipMasked: string;
  device: string;
  /** Checksum of the signature record. */
  recordHash: string;
  image: { data: Buffer; format: 'png' } | null;
}

export interface SignedContractPdfData {
  number: string;
  title: string;
  companyName: string;
  clientName: string;
  /** The wording as plain paragraphs. */
  paragraphs: string[];
  docHash: string;
  sentAt: string;
  signedAt: string;
  statement: string;
  statementHash: string;
  signers: SignedSigner[];
}

const T = (s: string): string => safeText(s);

export function SignedContractPdf({ data }: { data: SignedContractPdfData }): ReactElement {
  const f = fonts();
  const s = StyleSheet.create({
    page: { padding: 48, fontSize: 10, fontFamily: f.regular, color: '#111827', lineHeight: 1.45 },
    title: { fontSize: 20, fontFamily: f.bold, fontWeight: 700 },
    muted: { color: '#6b7280' },
    para: { marginTop: 8 },
    h2: { fontSize: 13, fontFamily: f.bold, fontWeight: 700, marginTop: 18 },
    block: { marginTop: 14, paddingTop: 8, borderTop: '0.5pt solid #9ca3af' },
    sigName: { fontSize: 16, fontFamily: f.regular, marginTop: 4 },
    image: { width: 160, height: 54, objectFit: 'contain', marginTop: 4 },
    row: { flexDirection: 'row', marginTop: 3 },
    label: { width: 110, color: '#6b7280' },
    value: { flex: 1 },
    mono: { fontSize: 8, color: '#374151' },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 48,
      right: 48,
      fontSize: 8,
      color: '#6b7280',
    },
  });
  return (
    <Document
      title={T(`${data.title} ${data.number}`)}
      author={T(data.companyName)}
      creator="KD SOLUTION IT"
    >
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>{T(data.title)}</Text>
        <Text style={s.muted}>
          {T(`${data.number} - ${data.companyName} and ${data.clientName}`)}
        </Text>
        {data.paragraphs.map((p, i) => (
          <Text key={i} style={s.para}>
            {T(p)}
          </Text>
        ))}
        <Text style={s.h2}>Signatures</Text>
        {data.signers.map((sg) => (
          <View key={sg.position} style={s.block} wrap={false}>
            <Text>{T(`${sg.name}${sg.roleLabel ? ` (${sg.roleLabel})` : ''}`)}</Text>
            {/* A PDF picture is not an HTML image; the signer's name is printed under it. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {sg.image ? <Image src={sg.image as never} style={s.image} /> : null}
            <Text style={s.sigName}>{T(sg.typedName)}</Text>
            <Text style={s.muted}>
              {T(`Signed ${sg.signedAt.replace('T', ' ').slice(0, 19)} UTC`)}
            </Text>
          </View>
        ))}
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${T(data.number)} - page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>Certificate of signing</Text>
        <Text style={s.muted}>{T(`${data.title} (${data.number})`)}</Text>
        <View style={s.block}>
          <View style={s.row}>
            <Text style={s.label}>Sent</Text>
            <Text style={s.value}>{T(data.sentAt.replace('T', ' ').slice(0, 19))} UTC</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Fully signed</Text>
            <Text style={s.value}>{T(data.signedAt.replace('T', ' ').slice(0, 19))} UTC</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Wording checksum</Text>
            <Text style={[s.value, s.mono]}>{data.docHash}</Text>
          </View>
        </View>
        <Text style={s.h2}>Statement every signer accepted</Text>
        <Text style={s.para}>{T(data.statement)}</Text>
        <Text style={[s.mono, s.para]}>{`Statement checksum ${data.statementHash}`}</Text>
        <Text style={s.h2}>Signers</Text>
        {data.signers.map((sg) => (
          <View key={sg.position} style={s.block} wrap={false}>
            <Text>{T(`${sg.position}. ${sg.name} <${sg.email}>`)}</Text>
            <View style={s.row}>
              <Text style={s.label}>Signed</Text>
              <Text style={s.value}>{T(sg.signedAt.replace('T', ' ').slice(0, 19))} UTC</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Method</Text>
              <Text style={s.value}>{sg.method}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Network address</Text>
              <Text style={s.value}>{T(sg.ipMasked || 'not recorded')}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Device</Text>
              <Text style={s.value}>{T(sg.device || 'not recorded')}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Record checksum</Text>
              <Text style={[s.value, s.mono]}>{sg.recordHash}</Text>
            </View>
          </View>
        ))}
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${T(data.number)} - page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
