// path: scripts/verify/step13-estimates.ts
// Logic checks of the estimate, receipt and hub pages (13.3) that need no database or network: the (the receipt PDF is drawn by step13-receipt-pdf.mts)
// the receipt checksum is stable, the decision and hub requests are strict, and the hub summary adds only open balances.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-estimates.ts
import assert from 'node:assert/strict';
import { summarizeHub, type HubRow } from '@/services/portal/hub';
import { receiptChecksum } from '@/services/portal/receipt-checksum';
import { decideBody, hubOpenBody } from '@/services/portal/schemas';
import type { ReceiptData } from '@/services/payment/receipt-data';

const TOKEN = 'A'.repeat(22) + '.' + 'B'.repeat(22);
let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const receipt: ReceiptData = {
  paymentId: '0192f1c0-0000-7000-8000-000000000001',
  reference: 'PAY-0001',
  paidAt: '2026-10-18',
  companyName: 'Acme Ltd',
  clientName: 'Client One',
  invoiceNumber: 'INV-0001',
  amount: '100.0000',
  surcharge: '0.0000',
  total: '100.0000',
  refunded: '0.0000',
  method: 'Card',
  processorName: 'Stripe',
  refunds: [],
  currency: 'USD',
};

const row = (id: string, status: HubRow['status'], balance: string, late = false): HubRow => ({
  id,
  number: `INV-${id}`,
  status,
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  total: '100.0000',
  balance,
  late,
});

async function main(): Promise<void> {
  await check('receipt checksum is stable and changes with the facts', async () => {
    const first = await receiptChecksum(receipt);
    assert.equal(first, await receiptChecksum({ ...receipt }));
    assert.match(first, /^[0-9a-f]{16}$/);
    assert.notEqual(first, await receiptChecksum({ ...receipt, total: '101.0000' }));
  });

  await check('decision request is strict', () => {
    const ok = {
      token: TOKEN,
      decision: 'accepted',
      signerName: 'Jane Doe',
      note: '',
      agree: true,
    };
    assert.ok(decideBody.safeParse(ok).success);
    assert.ok(!decideBody.safeParse({ ...ok, extra: 1 }).success);
    assert.ok(!decideBody.safeParse({ ...ok, decision: 'maybe' }).success);
    assert.ok(!decideBody.safeParse({ ...ok, signerName: 'J' }).success);
  });

  await check('hub open request needs a uuid', () => {
    assert.ok(hubOpenBody.safeParse({ token: TOKEN, invoiceId: receipt.paymentId }).success);
    assert.ok(!hubOpenBody.safeParse({ token: TOKEN, invoiceId: '1; drop table' }).success);
  });

  await check('hub summary adds only open balances', () => {
    const hub = summarizeHub(
      [
        row('1', 'sent', '40.0000'),
        row('2', 'overdue', '60.5000', true),
        row('3', 'paid', '0.0000'),
      ],
      false,
    );
    assert.equal(hub.openBalance, '100.5000');
    assert.equal(hub.openCount, 2);
    assert.equal(hub.paidCount, 1);
    assert.equal(hub.overdueCount, 1);
  });

  process.stdout.write(`step13-estimates: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
