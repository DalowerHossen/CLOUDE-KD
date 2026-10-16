// path: scripts/verify/step08-core.ts
// Logic checks of STEP 08 that need no database or network. Run: npx tsx scripts/verify/step08-core.ts
import assert from 'node:assert/strict';
import {
  clientInputSchema,
  clientUpdateSchema,
  customFieldsSaveSchema,
  initials,
  quickClientSchema,
} from '@/lib/crm/clients';
import { ageDocuments, bucketOf, daysLate } from '@/lib/crm/aging';
import {
  activitySchema,
  clientListQuery,
  decodeCursor,
  duplicateQuery,
  encodeCursor,
  mergeSchema,
  statementQuery,
  viewCreateSchema,
} from '@/lib/crm/search';
import { Money } from '@/lib/utils/currency';
import { checkCustomValues, type CustomFieldDef } from '@/lib/crm/custom-values';
import { permissions as registered } from '@/config/permissions';
import type { PermissionDefinition } from '@/types/contracts';

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

const address = {
  line1: '1 Main St',
  line2: '',
  city: 'Austin',
  region: 'TX',
  postalCode: '78701',
  country: 'US',
};
const client = {
  kind: 'company',
  name: 'Acme Ltd',
  contactName: 'Ann',
  email: 'Billing@Acme.test',
  billingEmail: '',
  phone: '+1 555 0100',
  website: 'https://acme.test',
  taxId: 'TX-1',
  displayCurrency: 'USD',
  paymentTermsDays: 30,
  notes: '',
  tags: ['VIP', 'vip', 'retail'],
  customFields: {},
  billing: address,
  shipping: { ...address, postalCode: '', country: null },
  openingBalance: '0',
  creditLimit: null,
  riskFlag: 'none',
  doNotContact: false,
  remindersOptOut: false,
  portalPrefs: { notifyByEmail: true, showStatement: true },
  contacts: [{ name: 'Ann', role: 'Finance', email: 'ann@acme.test', phone: '' }],
};

const defs: CustomFieldDef[] = [
  {
    id: '1',
    version: 1,
    entity: 'client',
    key: 'manager',
    label: 'Account manager',
    kind: 'text',
    options: [],
    required: true,
    position: 0,
  },
  {
    id: '2',
    version: 1,
    entity: 'client',
    key: 'tier',
    label: 'Tier',
    kind: 'select',
    options: ['gold', 'silver'],
    required: false,
    position: 1,
  },
  {
    id: '3',
    version: 1,
    entity: 'client',
    key: 'since',
    label: 'Client since',
    kind: 'date',
    options: [],
    required: false,
    position: 2,
  },
  {
    id: '4',
    version: 1,
    entity: 'client',
    key: 'seats',
    label: 'Seats',
    kind: 'number',
    options: [],
    required: false,
    position: 3,
  },
];

async function main(): Promise<void> {
  await check('client input: normalised and strict', () => {
    const parsed = clientInputSchema.parse(client);
    assert.equal(parsed.email, 'billing@acme.test', 'e-mail lower-cased');
    assert.equal(parsed.billingEmail, null, 'empty e-mail becomes null');
    assert.deepEqual(parsed.tags, ['vip', 'retail'], 'tags lower-cased and unique');
    assert.ok(
      !clientInputSchema.safeParse({ ...client, extra: 1 }).success,
      'unknown field refused',
    );
  });

  await check('client input: billing postal code and country are required', () => {
    assert.ok(
      !clientInputSchema.safeParse({ ...client, billing: { ...address, postalCode: '' } }).success,
    );
    assert.ok(
      !clientInputSchema.safeParse({ ...client, billing: { ...address, country: null } }).success,
    );
    assert.ok(
      !clientInputSchema.safeParse({ ...client, billing: { ...address, country: 'usa' } }).success,
    );
    assert.ok(
      clientInputSchema.safeParse({
        ...client,
        shipping: { ...address, postalCode: '', country: null },
      }).success,
      'shipping optional',
    );
  });

  await check('client input: text, money and links are checked', () => {
    assert.ok(
      !clientInputSchema.safeParse({ ...client, name: '<b>Acme</b>' }).success,
      'angle brackets',
    );
    assert.ok(!clientInputSchema.safeParse({ ...client, name: '' }).success);
    assert.ok(
      !clientInputSchema.safeParse({ ...client, website: 'http://acme.test' }).success,
      'https only',
    );
    assert.ok(!clientInputSchema.safeParse({ ...client, email: 'not an email' }).success);
    assert.ok(
      !clientInputSchema.safeParse({ ...client, openingBalance: '1.23456' }).success,
      'four places at most',
    );
    assert.ok(!clientInputSchema.safeParse({ ...client, creditLimit: 'abc' }).success);
    assert.ok(clientInputSchema.safeParse({ ...client, creditLimit: '5000.5' }).success);
    assert.ok(!clientInputSchema.safeParse({ ...client, paymentTermsDays: 400 }).success);
    assert.ok(!clientInputSchema.safeParse({ ...client, displayCurrency: 'XYZ' }).success);
    assert.ok(
      !clientInputSchema.safeParse({
        ...client,
        contacts: Array.from({ length: 11 }, () => client.contacts[0]),
      }).success,
      'ten contacts at most',
    );
    assert.ok(
      !clientInputSchema.safeParse({
        ...client,
        tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }).success,
    );
  });

  await check('client update needs the loaded version; quick create is short', () => {
    assert.ok(!clientUpdateSchema.safeParse(client).success);
    assert.ok(clientUpdateSchema.safeParse({ ...client, expectedVersion: 3 }).success);
    assert.ok(
      quickClientSchema.safeParse({
        name: 'Walk-in',
        email: '',
        postalCode: '12345',
        country: 'US',
      }).success,
    );
    assert.ok(
      !quickClientSchema.safeParse({ name: 'Walk-in', email: '', postalCode: '', country: 'US' })
        .success,
    );
    assert.equal(initials('Acme Ltd'), 'AL');
    assert.equal(initials('madonna'), 'MA');
  });

  await check('custom fields: definitions and values', () => {
    assert.ok(
      customFieldsSaveSchema.safeParse({
        entity: 'client',
        fields: [
          {
            entity: 'client',
            key: 'tier',
            label: 'Tier',
            kind: 'select',
            options: ['a'],
            required: false,
            position: 0,
          },
        ],
      }).success,
    );
    assert.ok(
      !customFieldsSaveSchema.safeParse({
        entity: 'client',
        fields: [
          {
            entity: 'client',
            key: 'tier',
            label: 'Tier',
            kind: 'select',
            options: [],
            required: false,
            position: 0,
          },
        ],
      }).success,
      'choice needs options',
    );
    assert.ok(
      !customFieldsSaveSchema.safeParse({
        entity: 'client',
        fields: [
          {
            entity: 'product',
            key: 'tier',
            label: 'Tier',
            kind: 'text',
            options: [],
            required: false,
            position: 0,
          },
        ],
      }).success,
      'one entity',
    );
    const ok = checkCustomValues(defs, {
      manager: 'Sam',
      tier: 'gold',
      since: '2026-01-31',
      seats: 4,
    });
    assert.equal(ok.manager, 'Sam');
    assert.throws(() => checkCustomValues(defs, {}), 'required missing');
    assert.throws(
      () => checkCustomValues(defs, { manager: 'Sam', tier: 'bronze' }),
      'not an option',
    );
    assert.throws(
      () => checkCustomValues(defs, { manager: 'Sam', since: '31/01/2026' }),
      'date format',
    );
    assert.throws(() => checkCustomValues(defs, { manager: 'Sam', seats: 'many' }), 'number');
    assert.throws(
      () => checkCustomValues(defs, { manager: 'Sam', unknown_key: 'x' }),
      'unknown key',
    );
  });

  await check('client permissions are registered', () => {
    const byAction = new Map(registered.map((d: PermissionDefinition) => [d.action, d]));
    for (const a of [
      'client.read',
      'client.create',
      'client.update',
      'client.archive',
      'client.delete',
      'catalog.fields',
    ])
      assert.ok(byAction.has(a), a);
    assert.ok(byAction.get('client.delete')?.defaultRoles.includes('owner'));
    assert.ok(
      !byAction.get('client.delete')?.defaultRoles.includes('staff'),
      'staff cannot delete by default',
    );
  });
  await check('client list query, cursor and saved views', () => {
    const q = clientListQuery.parse({});
    assert.equal(q.sort, 'name');
    assert.equal(q.desc, '0');
    assert.ok(
      !clientListQuery.safeParse({ sort: 'password' }).success,
      'sort names are a fixed list',
    );
    assert.ok(!clientListQuery.safeParse({ country: 'usa' }).success);
    assert.ok(!clientListQuery.safeParse({ unknown: '1' }).success);
    const cursor = { v: 'acme ltd', id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' };
    assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
    assert.equal(decodeCursor('not a cursor'), null);
    assert.equal(decodeCursor(encodeCursor({ v: 'x', id: 'nope' })), null, 'id must be a uuid');
    assert.equal(decodeCursor(undefined), null);
    assert.ok(
      viewCreateSchema.safeParse({ listKey: 'clients', name: 'VIP', filters: { tag: 'vip' } })
        .success,
    );
    assert.ok(!viewCreateSchema.safeParse({ listKey: 'orders', name: 'VIP', filters: {} }).success);
    assert.ok(
      !viewCreateSchema.safeParse({ listKey: 'clients', name: '<b>', filters: {} }).success,
    );
  });

  await check('activity, duplicate and merge input', () => {
    assert.ok(activitySchema.safeParse({ kind: 'call', title: 'Called', body: '' }).success);
    assert.ok(
      !activitySchema.safeParse({ kind: 'call', title: '', body: '' }).success,
      'needs text',
    );
    assert.ok(
      !activitySchema.safeParse({ kind: 'status', title: 'x', body: '' }).success,
      'system kinds cannot be written',
    );
    assert.ok(duplicateQuery.safeParse({ name: 'Acme', email: 'a@b.co' }).success);
    assert.ok(!duplicateQuery.safeParse({ name: '' }).success);
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    assert.ok(
      !mergeSchema.safeParse({ keepId: id, removeId: id }).success,
      'two different clients',
    );
    assert.ok(
      mergeSchema.safeParse({ keepId: id, removeId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c' })
        .success,
    );
    assert.ok(statementQuery.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success);
    assert.ok(!statementQuery.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success);
    assert.ok(!statementQuery.safeParse({ from: '01/01/2026', to: '2026-12-31' }).success);
  });

  await check('aging buckets add up exactly', () => {
    assert.equal(daysLate('2026-03-01', '2026-03-31'), 30);
    assert.equal(bucketOf(0), 'current');
    assert.equal(bucketOf(-5), 'current');
    assert.equal(bucketOf(1), 'd1_30');
    assert.equal(bucketOf(30), 'd1_30');
    assert.equal(bucketOf(31), 'd31_60');
    assert.equal(bucketOf(90), 'd61_90');
    assert.equal(bucketOf(91), 'd91_plus');
    const docs = [
      { number: 'A', issuedOn: '2026-01-01', dueOn: '2026-04-10', due: Money.parse('100.10') },
      { number: 'B', issuedOn: '2026-01-01', dueOn: '2026-03-20', due: Money.parse('50.20') },
      { number: 'C', issuedOn: '2026-01-01', dueOn: '2025-12-01', due: Money.parse('0.30') },
      { number: 'D', issuedOn: '2026-01-01', dueOn: '2026-03-25', due: Money.parse('0.10') },
    ];
    const aged = ageDocuments(docs, '2026-03-31');
    assert.equal(aged.current.toDbString(), '100.1000');
    assert.equal(aged.d1_30.toDbString(), '50.3000');
    assert.equal(aged.d91_plus.toDbString(), '0.3000');
    assert.equal(aged.total.toDbString(), '150.7000', 'no floating point drift');
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step08-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step08-core crashed: ${String(error)}\n`);
    process.exit(1);
  });
