// path: scripts/verify/step13-contracts.ts
// Logic checks of contracts (13.6.a) that need no database or network: the status machine, merge fields (escaping,
// missing and unknown names), the pre-built library, the strict request shapes and the contract number format.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step13-contracts.ts
import assert from 'node:assert/strict';
import { CONTRACT_LIBRARY } from '@/services/contract/library';
import {
  MERGE_FIELDS,
  mergeFields,
  placeholdersIn,
  unknownFields,
} from '@/services/contract/merge';
import {
  contractInputSchema,
  contractUpdateSchema,
  sendSchema,
  templateInputSchema,
  voidSchema,
} from '@/services/contract/schemas';
import {
  CONTRACT_STATUSES,
  canMove,
  contractNumber,
  isEditable,
  isOpen,
} from '@/services/contract/status';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

const input = {
  title: 'Service agreement',
  clientId: null,
  templateKey: 'service-agreement',
  bodyHtml: '<p>Hello {{client_name}}</p>',
  amount: '1500.50',
  effectiveOn: '2026-11-01',
  endsOn: '2027-10-31',
  signBy: '2026-10-31',
  renewalNoticeDays: 30,
  signingOrder: 'sequential',
  terms: 'Net 30.',
  signers: [
    { name: 'Jane Doe', email: 'Jane@Example.com', roleLabel: 'Client' },
    { name: 'John Roe', email: 'john@example.com', roleLabel: '' },
  ],
} as const;

async function main(): Promise<void> {
  await check('status machine: only forward moves, final states are final', () => {
    assert.ok(canMove('draft', 'sent'));
    assert.ok(canMove('sent', 'viewed'));
    assert.ok(canMove('partly_signed', 'signed'));
    assert.ok(!canMove('draft', 'signed'), 'cannot sign a draft');
    assert.ok(!canMove('sent', 'draft'), 'cannot go back to draft');
    for (const final of ['signed', 'declined', 'void', 'expired'] as const)
      for (const to of CONTRACT_STATUSES) assert.ok(!canMove(final, to), `${final} -> ${to}`);
    assert.ok(isEditable('draft') && !isEditable('sent'));
    assert.ok(isOpen('viewed') && !isOpen('signed') && !isOpen('draft'));
  });

  await check('contract numbers are padded', () => {
    assert.equal(contractNumber(7), 'CT-000007');
    assert.equal(contractNumber(123456), 'CT-123456');
  });

  await check('merge fields fill known names and escape the values', () => {
    const out = mergeFields('<p>{{client_name}} owes {{ amount }}</p>', {
      client_name: 'A <b>&</b> Co',
      amount: '10.00',
    });
    assert.equal(out.html, '<p>A &lt;b&gt;&amp;&lt;/b&gt; Co owes 10.00</p>');
    assert.deepEqual(out.missing, []);
    assert.deepEqual(out.unknown, []);
  });

  await check('missing and unknown fields are reported and left in place', () => {
    const out = mergeFields('{{client_name}} {{end_date}} {{secret_key}} {{end_date}}', {
      client_name: 'X',
      end_date: '  ',
    });
    assert.deepEqual(out.missing, ['end_date']);
    assert.deepEqual(out.unknown, ['secret_key']);
    assert.ok(out.html.includes('{{secret_key}}'));
    assert.deepEqual(placeholdersIn('{{a}} {{b}} {{a}}'), ['a', 'b']);
    assert.deepEqual(unknownFields('{{amount}} {{nope}}'), ['nope']);
  });

  await check('every pre-built template uses only known merge fields', () => {
    assert.equal(CONTRACT_LIBRARY.length, 4);
    for (const t of CONTRACT_LIBRARY) {
      assert.deepEqual(unknownFields(t.html), [], t.key);
      for (const name of placeholdersIn(t.html))
        assert.ok((MERGE_FIELDS as readonly string[]).includes(name));
      assert.ok(!/<script|onerror|javascript:/i.test(t.html));
    }
    assert.equal(new Set(CONTRACT_LIBRARY.map((t) => t.key)).size, 4);
  });

  await check('contract request is strict and checks dates and signers', () => {
    const ok = contractInputSchema.safeParse(input);
    assert.ok(ok.success);
    if (ok.success) assert.equal(ok.data.signers[0]?.email, 'jane@example.com');
    assert.ok(!contractInputSchema.safeParse({ ...input, extra: 1 }).success);
    assert.ok(!contractInputSchema.safeParse({ ...input, endsOn: '2026-01-01' }).success);
    assert.ok(!contractInputSchema.safeParse({ ...input, amount: '1,500' }).success);
    assert.ok(!contractInputSchema.safeParse({ ...input, signers: [] }).success);
    assert.ok(
      !contractInputSchema.safeParse({
        ...input,
        signers: [input.signers[0], { ...input.signers[0], name: 'Again Jane' }],
      }).success,
      'same e-mail twice',
    );
    assert.ok(!contractInputSchema.safeParse({ ...input, signingOrder: 'random' }).success);
    assert.ok(!contractInputSchema.safeParse({ ...input, title: '<script>' }).success);
  });

  await check('update, send, void and template requests are strict', () => {
    assert.ok(contractUpdateSchema.safeParse({ expectedVersion: 1, contract: input }).success);
    assert.ok(!contractUpdateSchema.safeParse({ expectedVersion: 0, contract: input }).success);
    assert.ok(sendSchema.safeParse({ message: '' }).success);
    assert.ok(!sendSchema.safeParse({ message: '', extra: 1 }).success);
    assert.ok(!voidSchema.safeParse({ reason: 'x' }).success);
    assert.ok(voidSchema.safeParse({ reason: 'Client withdrew' }).success);
    assert.ok(templateInputSchema.safeParse({ name: 'My NDA', bodyHtml: '<p>x</p>' }).success);
    assert.ok(!templateInputSchema.safeParse({ name: 'My NDA', bodyHtml: '' }).success);
  });

  process.stdout.write(`step13-contracts: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
