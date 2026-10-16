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
