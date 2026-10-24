// path: lib/pdf/evidence-pack-pdf.tsx
// The evidence pack of a dispute as a PDF with nine sections. It draws only the data it is given; a section with nothing
// recorded says so, so a reader can tell "no record" from "left out".
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { fonts, safeText } from '@/lib/pdf/shared/fonts';
import type { EvidencePackData, PackMessage } from '@/services/evidence/types';

const T = (s: string): string => safeText(s);
const day = (iso: string): string => iso.replace('T', ' ').slice(0, 19);
const usd = (value: string): string => `USD ${value}`;

type Styles = ReturnType<typeof StyleSheet.create>;

function makeStyles(): ReturnType<typeof StyleSheet.create> {
  const f = fonts();
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 9, fontFamily: f.regular, color: '#111827', lineHeight: 1.4 },
    title: { fontSize: 20, fontFamily: f.bold, fontWeight: 700 },
    h2: {
      fontSize: 12,
      fontFamily: f.bold,
      fontWeight: 700,
      marginTop: 16,
      paddingBottom: 3,
      borderBottom: '0.75pt solid #111827',
    },
    muted: { color: '#6b7280' },
    row: { flexDirection: 'row', marginTop: 2 },
    label: { width: 120, color: '#6b7280' },
    value: { flex: 1 },
    item: { marginTop: 5, paddingBottom: 4, borderBottom: '0.5pt solid #e5e7eb' },
    mono: { fontSize: 7, color: '#374151' },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 40,
      right: 40,
      fontSize: 7,
      color: '#6b7280',
    },
  });
  return s;
}

function Row({ s, k, v }: { s: Styles; k: string; v: string }): ReactElement {
  return (
    <View style={s.row}>
      <Text style={s.label}>{T(k)}</Text>
      <Text style={s.value}>{T(v)}</Text>
    </View>
  );
}

function None({ s }: { s: Styles }): ReactElement {
  return <Text style={s.muted}>Nothing was recorded for this section.</Text>;
}

function Messages({ s, list }: { s: Styles; list: PackMessage[] }): ReactElement {
  if (list.length === 0) return <None s={s} />;
  return (
    <View>
      {list.map((m, i) => (
        <View key={i} style={s.item} wrap={false}>
          <Text>{T(`${day(m.at)} - ${m.subject}`)}</Text>
          <Text style={s.muted}>
            {T(
              `To ${m.to}; ${m.document}; status ${m.status}${m.openedAt ? `; opened ${day(m.openedAt)}` : ''}${m.clickedAt ? `; link clicked ${day(m.clickedAt)}` : ''}`,
            )}
          </Text>
          <Text style={s.mono}>{`Body checksum ${m.contentHash}`}</Text>
        </View>
      ))}
    </View>
  );
}

export function EvidencePackPdf({ data }: { data: EvidencePackData }): ReactElement {
  const s = makeStyles();
  const d = data;
  return (
    <Document
      title={T(`Evidence pack - ${d.invoice.number}`)}
      author={T(d.platform.companyName)}
      creator="KD SOLUTION IT"
    >
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>Evidence pack</Text>
        <Text style={s.muted}>
          {T(
            `${d.platform.companyName} - invoice ${d.invoice.number} - made ${day(d.generatedAt)} UTC`,
          )}
        </Text>
        <View style={{ marginTop: 8 }}>
          <Row
            s={s}
            k="Dispute"
            v={`${d.dispute.processorId} ${d.dispute.processorDisputeId ?? ''} (${d.dispute.status})`}
          />
          <Row s={s} k="Amount" v={usd(d.dispute.amount)} />
          <Row
            s={s}
            k="Reason"
            v={`${d.dispute.reasonCategory}${d.dispute.reasonCode ? ` (${d.dispute.reasonCode})` : ''}`}
          />
          <Row
            s={s}
            k="Opened / answer due"
            v={`${day(d.dispute.openedAt)} / ${day(d.dispute.dueAt)} UTC`}
          />
        </View>

        <Text style={s.h2}>1. Invoice (as it was sent)</Text>
        <Row s={s} k="Number" v={d.invoice.number} />
        <Row s={s} k="Client" v={d.invoice.clientName} />
        <Row s={s} k="Issued / due" v={`${d.invoice.issueDate} / ${d.invoice.dueDate}`} />
        <Row
          s={s}
          k="Sent"
          v={d.invoice.sentAt ? `${day(d.invoice.sentAt)} UTC` : 'not recorded'}
        />
        <Row s={s} k="Total" v={usd(d.invoice.total)} />
        {d.invoice.lines.map((l, i) => (
          <Text key={i}>{T(`${l.description} - ${l.quantity} x ${l.unitPrice} = ${l.total}`)}</Text>
        ))}
        <Text style={s.mono}>
          {d.invoice.snapshotHash
            ? `Stored PDF checksum ${d.invoice.snapshotHash}`
            : 'No stored PDF of the sent invoice was found.'}
        </Text>

        <Text style={s.h2}>2. Payment receipt</Text>
        {d.receipt ? (
          <View>
            <Row s={s} k="Reference" v={d.receipt.reference} />
            <Row s={s} k="Paid" v={`${day(d.receipt.paidAt)} UTC`} />
            <Row
              s={s}
              k="Amount / surcharge / total"
              v={`${d.receipt.amount} / ${d.receipt.surcharge} / ${d.receipt.total}`}
            />
            <Row s={s} k="Refunded" v={usd(d.receipt.refunded)} />
            <Row s={s} k="Method" v={`${d.receipt.method} (${d.receipt.processorName})`} />
            <Row
              s={s}
              k="Processor transaction"
              v={d.receipt.processorTransactionId ?? 'not recorded'}
            />
          </View>
        ) : (
          <None s={s} />
        )}

        <Text style={s.h2}>3. Consent, terms and refund policy</Text>
        <Text style={s.muted}>
          {T(
            `Terms version ${d.consent.termsVersion}; refund period ${d.consent.refundWindowDays} days.`,
          )}
        </Text>
        <Text>{T(d.consent.refundPolicyText)}</Text>
        {d.consent.records.length === 0 ? (
          <None s={s} />
        ) : (
          d.consent.records.map((c, i) => (
            <View key={i} style={s.item} wrap={false}>
              <Text>{T(`Accepted ${day(c.at)} UTC (version ${c.version})`)}</Text>
              <Text style={s.muted}>
                {T(
                  `Network address ${c.ip || c.ipMasked || 'not recorded'}; device ${c.device || 'not recorded'}`,
                )}
              </Text>
              <Text>{T(`"${c.text}"`)}</Text>
              <Text style={s.mono}>{`Text checksum ${c.textHash}`}</Text>
            </View>
          ))
        )}

        <Text style={s.h2}>4. Delivery proof</Text>
        <Messages s={s} list={d.delivery.invoiceMessages} />
        {d.delivery.acceptances.map((a, i) => (
          <Text key={i}>{T(a)}</Text>
        ))}

        <Text style={s.h2}>5. Communication log</Text>
        <Messages s={s} list={d.communications} />

        <Text style={s.h2}>6. Client identity: network address, device, country, 3D Secure</Text>
        <Row s={s} k="Payer address" v={d.identity.payerIp ?? 'not recorded'} />
        <Row s={s} k="Payer country" v={d.identity.payerCountry ?? 'not recorded'} />
        <Row s={s} k="Card" v={d.identity.cardIdentity ?? 'not recorded'} />
        <Row
          s={s}
          k="3D Secure"
          v={
            Object.keys(d.identity.threeDs).length === 0
              ? 'not used or not recorded'
              : JSON.stringify(d.identity.threeDs)
          }
        />
        {d.identity.views.length === 0 ? (
          <None s={s} />
        ) : (
          d.identity.views.map((v, i) => (
            <Text key={i} style={s.muted}>
              {T(
                `${day(v.at)} - ${v.document}: ${v.event}; ${v.ipMasked || 'address not recorded'}; ${v.device || 'device not recorded'}`,
              )}
            </Text>
          ))
        )}

        <Text style={s.h2}>7. Timeline</Text>
        {d.timeline.map((e, i) => (
          <Text key={i}>{T(`${day(e.at)} UTC - ${e.source}: ${e.text}`)}</Text>
        ))}

        <Text style={s.h2}>8. Audit chain proof</Text>
        <Text>
          {T(
            `The tamper-evident audit chain of this company was checked: ${d.audit.chainOk ? 'intact' : 'BROKEN'} (entries ${d.audit.checkedFrom || '-'} to ${d.audit.checkedTo || '-'}${d.audit.gaps.length > 0 ? `; gaps: ${d.audit.gaps.join(', ')}` : ''}).`,
          )}
        </Text>
        {d.audit.entries.length === 0 ? (
          <None s={s} />
        ) : (
          d.audit.entries.map((e) => (
            <View key={e.sequence} style={s.item} wrap={false}>
              <Text>{T(`#${e.sequence} ${day(e.at)} - ${e.action}`)}</Text>
              <Text style={s.mono}>{`entry ${e.entryHash}`}</Text>
              <Text style={s.mono}>{`previous ${e.prevHash}`}</Text>
            </View>
          ))
        )}

        <Text style={s.h2}>9. Platform details</Text>
        <Row s={s} k="Platform" v={d.platform.name} />
        <Row s={s} k="Merchant" v={d.platform.companyName} />
        <Text style={s.muted}>{T(d.platform.note)}</Text>
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Evidence pack ${T(d.invoice.number)} - page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
