// path: scripts/verify/step13-evidence.ts
// Logic checks of the evidence pack (13.9.a) that need no database or network: the nine sections, which ones have content,
// the timeline order and its sources. The PDF itself is drawn by step13-evidence-pdf.mts. Run:
// SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-evidence.ts
import assert from 'node:assert/strict';
import { buildTimeline } from '@/services/evidence/collect';
import {
  PACK_SECTIONS,
  sectionsPresent,
  sortTimeline,
  type EvidencePackData,
  type PackMessage,
} from '@/services/evidence/types';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const message = (at: string, opened: string | null = null): PackMessage => ({
  at,
  template: 'invoice.sent',
  subject: 'Invoice INV-1',
  to: 'c***@example.com',
  document: 'invoice',
  status: 'opened',
  openedAt: opened,
  clickedAt: null,
  contentHash: 'a'.repeat(64),
});

const empty = (): EvidencePackData => ({
  generatedAt: '2026-10-18T10:00:00.000Z',
  dispute: {
    id: 'd',
    processorId: 'stripe',
    processorDisputeId: null,
    status: 'new',
    reasonCode: null,
    reasonCategory: 'general',
    amount: '100.0000',
    openedAt: '2026-10-17T00:00:00.000Z',
    dueAt: '2026-10-24T00:00:00.000Z',
  },
  invoice: {
    number: 'INV-1',
    status: 'paid',
    clientName: 'Client',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    total: '100.0000',
    sentAt: null,
    lines: [],
    snapshotHash: null,
    snapshotFileId: null,
  },
  receipt: null,
  consent: {
    records: [],
    termsVersion: '2026-10-18',
    refundWindowDays: 180,
    refundPolicyText: 'I accept the terms.',
  },
  delivery: { invoiceMessages: [], acceptances: [] },
  communications: [],
  identity: { views: [], payerIp: null, payerCountry: null, cardIdentity: null, threeDs: {} },
  timeline: [],
  audit: { chainOk: true, checkedFrom: '', checkedTo: '', gaps: [], entries: [] },
  platform: { name: 'KD SOLUTION IT', companyName: 'Acme', note: 'x' },
});

async function main(): Promise<void> {
  await check('a pack has exactly nine sections', () => {
    assert.equal(PACK_SECTIONS.length, 9);
    assert.deepEqual(
      [...PACK_SECTIONS],
      [
        'invoice',
        'receipt',
        'consent',
        'delivery',
        'communications',
        'identity',
        'timeline',
        'audit',
        'platform',
      ],
    );
  });

  await check('an empty pack lists only invoice and platform; a full one lists all nine', () => {
    const none = sectionsPresent(empty());
    assert.deepEqual(
      Object.entries(none)
        .filter(([, v]) => v)
        .map(([k]) => k),
      ['invoice', 'platform'],
    );
    const full = empty();
    full.receipt = {
      reference: 'PAY-1',
      paidAt: '2026-09-02T10:00:00.000Z',
      amount: '100',
      surcharge: '0',
      total: '100',
      refunded: '0',
      method: 'Card',
      processorName: 'Stripe',
      processorTransactionId: 'ch_1',
    };
    full.consent.records = [
      {
        at: '2026-09-02T09:59:00.000Z',
        version: 'v1',
        text: 'I accept.',
        textHash: 'b'.repeat(64),
        ipMasked: '203.0.113.0',
        ip: '203.0.113.9',
        device: 'Chrome',
        userAgent: 'x',
      },
    ];
    full.delivery.invoiceMessages = [message('2026-09-01T08:00:00.000Z')];
    full.communications = [message('2026-09-01T08:00:00.000Z')];
    full.identity.views = [
      {
        at: '2026-09-01T09:00:00.000Z',
        event: 'view',
        document: 'invoice',
        ipMasked: '203.0.113.0',
        device: 'Chrome',
      },
    ];
    full.timeline = [{ at: '2026-09-01T08:00:00.000Z', source: 'invoice', text: 'sent' }];
    full.audit.entries = [
      {
        sequence: '1',
        at: '2026-09-01T08:00:00.000Z',
        action: 'invoice.sent',
        entryHash: 'c'.repeat(64),
        prevHash: 'd'.repeat(64),
      },
    ];
    assert.ok(Object.values(sectionsPresent(full)).every(Boolean));
  });

  await check('the timeline is in time order and keeps the order of equal times', () => {
    const sorted = sortTimeline([
      { at: '2026-09-03T00:00:00.000Z', source: 'payment', text: 'c' },
      { at: '2026-09-01T00:00:00.000Z', source: 'invoice', text: 'a' },
      { at: '2026-09-02T00:00:00.000Z', source: 'portal', text: 'b1' },
      { at: '2026-09-02T00:00:00.000Z', source: 'portal', text: 'b2' },
    ]);
    assert.deepEqual(
      sorted.map((e) => e.text),
      ['a', 'b1', 'b2', 'c'],
    );
  });

  await check('the built timeline joins every source, in order, and ends with the dispute', () => {
    const tl = buildTimeline({
      invoiceSentAt: '2026-09-01T08:00:00.000Z',
      invoiceNumber: 'INV-1',
      receipt: { at: '2026-09-02T10:00:00.000Z', text: 'Payment PAY-1 received' },
      messages: [message('2026-09-01T08:01:00.000Z', '2026-09-01T09:00:00.000Z')],
      views: [
        {
          at: '2026-09-01T09:05:00.000Z',
          event: 'view',
          document: 'invoice',
          ipMasked: '203.0.113.0',
          device: 'Chrome',
        },
      ],
      consents: [
        {
          at: '2026-09-02T09:59:00.000Z',
          version: 'v1',
          text: 'x',
          textHash: 'b'.repeat(64),
          ipMasked: '',
          ip: '',
          device: '',
          userAgent: '',
        },
      ],
      refunds: [{ amount: '10', at: '2026-09-05T00:00:00.000Z' }],
      disputeOpenedAt: '2026-10-17T00:00:00.000Z',
      acceptances: [],
    });
    assert.deepEqual([...new Set(tl.map((e) => e.source))].sort(), [
      'consent',
      'dispute',
      'email',
      'invoice',
      'payment',
      'portal',
      'refund',
    ]);
    assert.deepEqual(
      tl.map((e) => Date.parse(e.at)),
      [...tl.map((e) => Date.parse(e.at))].sort((a, b) => a - b),
    );
    assert.equal(tl[tl.length - 1]?.source, 'dispute');
    assert.ok(
      tl.some((e) => e.text.includes('opened')),
      'an opened message is its own event',
    );
  });

  process.stdout.write(`step13-evidence: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
