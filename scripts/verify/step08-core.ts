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
import { supplierInputSchema, supplierListQuery } from '@/lib/procurement/suppliers';
import { poActionSchema, poInputSchema, poListQuery } from '@/lib/procurement/orders';
import { computeTotals } from '@/lib/procurement/totals';
import {
  billActionSchema,
  billInputSchema,
  remittanceInputSchema,
  supplierStatementQuery,
} from '@/lib/procurement/bills';
import { buildStatement } from '@/lib/procurement/statement';
import { cleanRows, csvCell, parseCsv, toCsv, TransferError } from '@/lib/transfer/csv';
import {
  applyMapping,
  exportSchema,
  importActionSchema,
  importUploadSchema,
  missingRequired,
  splitTable,
  suggestMapping,
} from '@/lib/transfer/mapping';
import { readXlsx } from '@/lib/transfer/xlsx';
import { deflateRawSync } from 'node:zlib';
import { PurchaseOrderEmail } from '@/emails/crm/purchase-order';
import { Money } from '@/lib/utils/currency';
import { render } from '@react-email/render';
import { crmEmailTemplates } from '@/emails/crm';
import { StatementEmail } from '@/emails/crm/statement';
import { bulkSchema, privacyRequestSchema, statementMailSchema } from '@/lib/crm/privacy';
import {
  bundleItemSchema,
  clientRateSchema,
  productCreateSchema,
  productInputSchema,
  productListQuery,
  productUpdateSchema,
  variantsSaveSchema,
} from '@/lib/catalog/products';
import { marginPercent, resolveUnitPrice } from '@/lib/catalog/resolve';
import {
  DOCUMENT_PREFIX,
  MOVES_STOCK,
  barcodeQuery,
  countActionSchema,
  countSaveSchema,
  countStartSchema,
  documentActionSchema,
  documentInputSchema,
  documentUpdateSchema,
  formatNumber,
} from '@/lib/stock/documents';
import {
  cogsQuery,
  receiveSchema,
  adjustSchema,
  levelsQuery,
  movementsQuery,
  reorderSchema,
  transferSchema,
  warehouseSchema,
} from '@/lib/stock/stock';
import { checkCustomValues, type CustomFieldDef } from '@/lib/crm/custom-values';
import { permissions as registered } from '@/config/permissions';
import type { PermissionDefinition } from '@/types/contracts';

let failures = 0;
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** A minimal zip writer for the xlsx test file. */
function zip(files: Record<string, string>, stored = false): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const packed = stored ? data : deflateRawSync(data);
    const n = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, packed);
    centrals.push(central, n);
    offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

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
  marketingConsent: false,
  contactPreference: 'email',
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
        confirmDuplicate: false,
      }).success,
    );
    assert.ok(
      !quickClientSchema.safeParse({
        name: 'Walk-in',
        email: '',
        postalCode: '',
        country: 'US',
        confirmDuplicate: false,
      }).success,
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
  await check('privacy, bulk and statement mail input', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    assert.ok(
      privacyRequestSchema.safeParse({
        clientId: id,
        kind: 'anonymize',
        reason: 'The client asked us in writing',
      }).success,
    );
    assert.ok(
      !privacyRequestSchema.safeParse({ clientId: id, kind: 'anonymize', reason: 'short' }).success,
    );
    assert.ok(
      !privacyRequestSchema.safeParse({
        clientId: id,
        kind: 'purge',
        reason: 'The client asked us in writing',
      }).success,
    );
    assert.ok(bulkSchema.safeParse({ action: 'archive', ids: [id, id] }).success);
    assert.deepEqual(
      bulkSchema.parse({ action: 'archive', ids: [id, id] }).ids,
      [id],
      'duplicates dropped',
    );
    assert.ok(!bulkSchema.safeParse({ action: 'archive', ids: [] }).success, 'at least one');
    assert.ok(
      !bulkSchema.safeParse({
        action: 'archive',
        ids: Array.from(
          { length: 201 },
          (_, i) => `0190a1b2-c3d4-7e5f-8a9b-${String(i).padStart(12, '0')}`,
        ),
      }).success,
      '200 at most',
    );
    assert.ok(bulkSchema.safeParse({ action: 'add_tag', ids: [id], value: 'VIP' }).success);
    assert.ok(!bulkSchema.safeParse({ action: 'add_tag', ids: [id] }).success, 'tag needs a value');
    assert.ok(!bulkSchema.safeParse({ action: 'set_terms', ids: [id], value: 999 }).success);
    assert.ok(!bulkSchema.safeParse({ action: 'drop_table', ids: [id] }).success);
    assert.ok(statementMailSchema.safeParse({ from: '2026-01-01', to: '2026-02-01' }).success);
    assert.ok(!statementMailSchema.safeParse({ from: '2026-03-01', to: '2026-02-01' }).success);
  });

  await check('statement e-mail template renders and is registered', async () => {
    const def = crmEmailTemplates.find((t) => t.definition.id === 'invoice.client-statement');
    assert.ok(def, 'registered');
    const html = await render(
      StatementEmail({
        clientName: 'Acme',
        companyName: 'Studio',
        from: '2026-01-01',
        to: '2026-03-31',
        openingBalance: '$0.00',
        balance: '$150.70',
        current: '$100.10',
        d1_30: '$50.30',
        d31_60: '$0.00',
        d61_90: '$0.00',
        d91_plus: '$0.30',
        lines: 'INV-1, due 2026-04-10: $100.10',
      }),
    );
    assert.ok(html.includes('$150.70') && html.includes('Studio'));
    for (const v of def?.definition.variables ?? [])
      assert.ok(typeof v === 'string' && v.length > 0);
  });
  const product = {
    kind: 'product',
    name: 'Blue Widget',
    description: '',
    sku: 'BW-1',
    barcode: '',
    unit: 'piece',
    unitPrice: '12.50',
    costPrice: '7',
    taxCategory: 'standard',
    taxRate: '8.25',
    categoryId: null,
    hsCode: '',
    trackInventory: true,
    valuationMethod: 'fifo',
    status: 'active',
    customFields: {},
    volumeTiers: [
      { minQty: '10', unitPrice: '11' },
      { minQty: '50', unitPrice: '9.5' },
    ],
    bundleItems: [],
  };

  await check('product input: normalised and strict', () => {
    const parsed = productInputSchema.parse(product);
    assert.equal(parsed.barcode, null, 'empty barcode becomes null');
    assert.equal(parsed.sku, 'BW-1');
    assert.equal(productInputSchema.parse({ ...product, sku: '' }).sku, null);
    assert.ok(!productInputSchema.safeParse({ ...product, extra: 1 }).success);
    assert.ok(!productInputSchema.safeParse({ ...product, sku: '-bad' }).success, 'sku shape');
    assert.ok(
      !productInputSchema.safeParse({ ...product, unitPrice: '-1' }).success,
      'price not negative',
    );
    assert.ok(
      !productInputSchema.safeParse({ ...product, unitPrice: '1.00001' }).success,
      'four places at most',
    );
    assert.ok(
      !productInputSchema.safeParse({ ...product, taxRate: '101' }).success,
      'rate is a percentage',
    );
    assert.ok(!productInputSchema.safeParse({ ...product, name: '<i>x</i>' }).success);
    assert.ok(
      !productInputSchema.safeParse({ ...product, kind: 'service' }).success,
      'a service has no stock',
    );
    assert.ok(
      productInputSchema.safeParse({ ...product, kind: 'service', trackInventory: false }).success,
    );
  });

  await check('product input: tiers and bundles', () => {
    assert.ok(
      !productInputSchema.safeParse({
        ...product,
        volumeTiers: [
          { minQty: '50', unitPrice: '9' },
          { minQty: '10', unitPrice: '8' },
        ],
      }).success,
      'tiers rise',
    );
    assert.ok(
      !productInputSchema.safeParse({
        ...product,
        volumeTiers: Array.from({ length: 11 }, (_, i) => ({
          minQty: String(i + 2),
          unitPrice: '1',
        })),
      }).success,
      'ten tiers at most',
    );
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const bundle = {
      ...product,
      kind: 'bundle',
      trackInventory: false,
      bundleItems: [{ productId: id, quantity: '2' }],
    };
    assert.ok(productInputSchema.safeParse(bundle).success);
    assert.ok(
      !productInputSchema.safeParse({ ...bundle, bundleItems: [] }).success,
      'a bundle needs items',
    );
    assert.ok(
      !productInputSchema.safeParse({ ...product, bundleItems: bundle.bundleItems }).success,
      'only a bundle has items',
    );
    assert.ok(
      !productInputSchema.safeParse({
        ...bundle,
        bundleItems: [bundle.bundleItems[0], bundle.bundleItems[0]],
      }).success,
      'each item once',
    );
    assert.ok(
      !bundleItemSchema.safeParse({ productId: id, quantity: '0' }).success,
      'quantity above zero',
    );
    assert.ok(productCreateSchema.safeParse({ product, confirmDuplicate: false }).success);
    assert.ok(
      !productUpdateSchema.safeParse({ product }).success,
      'update needs the loaded version',
    );
    assert.ok(productUpdateSchema.safeParse({ expectedVersion: 2, product }).success);
  });

  await check('product list, variants and client price input', () => {
    assert.equal(productListQuery.parse({}).sort, 'name');
    assert.ok(!productListQuery.safeParse({ sort: 'cost' }).success);
    assert.ok(!productListQuery.safeParse({ category: 'not-a-uuid' }).success);
    assert.ok(
      variantsSaveSchema.safeParse({
        variants: [
          {
            id: null,
            name: 'Large',
            sku: 'BW-1-L',
            barcode: '',
            unitPrice: null,
            attributes: { size: 'L' },
            isActive: true,
          },
        ],
      }).success,
    );
    assert.ok(
      !variantsSaveSchema.safeParse({
        variants: [
          {
            id: null,
            name: 'Large',
            sku: '',
            barcode: '',
            unitPrice: null,
            attributes: { 'Bad Key': 'L' },
            isActive: true,
          },
        ],
      }).success,
      'attribute names are tokens',
    );
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    assert.ok(
      clientRateSchema.safeParse({ clientId: id, productId: id, unitPrice: '9.99' }).success,
    );
    assert.ok(
      clientRateSchema.safeParse({ clientId: id, productId: id, unitPrice: null }).success,
      'null removes',
    );
    assert.ok(
      !clientRateSchema.safeParse({ clientId: id, productId: id, unitPrice: 'free' }).success,
    );
  });

  await check('price resolution: client price, tier, variant, base', () => {
    const tiers = [
      { minQty: '10', unitPrice: '11' },
      { minQty: '50', unitPrice: '9.5' },
    ];
    assert.deepEqual(resolveUnitPrice({ base: '12.5', tiers, quantity: '1' }), {
      unitPrice: '12.5000',
      source: 'base',
    });
    assert.deepEqual(resolveUnitPrice({ base: '12.5', tiers, quantity: '10' }), {
      unitPrice: '11.0000',
      source: 'tier',
    });
    assert.deepEqual(resolveUnitPrice({ base: '12.5', tiers, quantity: '75.5' }), {
      unitPrice: '9.5000',
      source: 'tier',
    });
    assert.deepEqual(
      resolveUnitPrice({ base: '12.5', tiers, quantity: '9.9999' }),
      { unitPrice: '12.5000', source: 'base' },
      'just under the tier',
    );
    assert.deepEqual(
      resolveUnitPrice({ base: '12.5', variantPrice: '14', tiers: [], quantity: '3' }),
      { unitPrice: '14.0000', source: 'variant' },
    );
    assert.deepEqual(
      resolveUnitPrice({
        base: '12.5',
        variantPrice: '14',
        tiers,
        clientPrice: '8',
        quantity: '100',
      }),
      { unitPrice: '8.0000', source: 'client' },
      'the agreed price wins',
    );
    assert.equal(marginPercent('12.5', '10'), '20.0000');
    assert.equal(marginPercent('0', '1'), null);
  });
  await check('stock input: adjustments, transfers, warehouses', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const id2 = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
    const base = {
      productId: id,
      variantId: null,
      warehouseId: id,
      reason: 'correction',
      note: '',
    };
    assert.ok(adjustSchema.safeParse({ ...base, mode: 'set', quantity: '12' }).success);
    assert.ok(
      adjustSchema.safeParse({ ...base, mode: 'set', quantity: '0' }).success,
      'a count of zero is valid',
    );
    assert.ok(
      !adjustSchema.safeParse({ ...base, mode: 'set', quantity: '-1' }).success,
      'a count is not negative',
    );
    assert.ok(adjustSchema.safeParse({ ...base, mode: 'change', quantity: '-3.5' }).success);
    assert.ok(
      !adjustSchema.safeParse({ ...base, mode: 'change', quantity: '0' }).success,
      'a change is not zero',
    );
    assert.ok(
      !adjustSchema.safeParse({ ...base, mode: 'change', quantity: '1.00001' }).success,
      'four places at most',
    );
    assert.ok(
      !adjustSchema.safeParse({ ...base, mode: 'change', quantity: '1', reason: 'fun' }).success,
      'reason from a fixed list',
    );
    assert.ok(
      !adjustSchema.safeParse({ ...base, mode: 'change', quantity: '1', extra: 1 }).success,
    );
    assert.ok(
      transferSchema.safeParse({
        productId: id,
        variantId: null,
        fromWarehouseId: id,
        toWarehouseId: id2,
        quantity: '2',
        note: '',
      }).success,
    );
    assert.ok(
      !transferSchema.safeParse({
        productId: id,
        variantId: null,
        fromWarehouseId: id,
        toWarehouseId: id,
        quantity: '2',
        note: '',
      }).success,
      'two warehouses',
    );
    assert.ok(
      !transferSchema.safeParse({
        productId: id,
        variantId: null,
        fromWarehouseId: id,
        toWarehouseId: id2,
        quantity: '0',
        note: '',
      }).success,
    );
    const wh = {
      id: null,
      expectedVersion: null,
      name: 'Main',
      code: 'MAIN',
      addressLine1: '',
      addressCity: '',
      addressRegion: '',
      addressPostalCode: '',
      addressCountry: 'US',
      isActive: true,
    };
    assert.ok(warehouseSchema.safeParse(wh).success);
    assert.ok(!warehouseSchema.safeParse({ ...wh, code: 'has space' }).success);
    assert.ok(!warehouseSchema.safeParse({ ...wh, addressCountry: 'usa' }).success);
    assert.ok(reorderSchema.safeParse({ productId: id, reorderLevel: null }).success);
    assert.ok(!reorderSchema.safeParse({ productId: id, reorderLevel: '-2' }).success);
    assert.ok(!levelsQuery.safeParse({ low: '0' }).success);
    assert.ok(!movementsQuery.safeParse({ kind: 'theft' }).success);
  });
  await check('receipt input: cost, batch and expiry', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const base = {
      productId: id,
      variantId: null,
      warehouseId: id,
      quantity: '10',
      unitCost: '2.5',
      batchNo: 'LOT-7',
      expiresOn: '2027-06-30',
      note: '',
    };
    const ok = receiveSchema.parse(base);
    assert.equal(ok.batchNo, 'LOT-7');
    assert.equal(
      receiveSchema.parse({ ...base, unitCost: '', batchNo: '', expiresOn: '' }).unitCost,
      null,
      'empty cost uses the item cost',
    );
    assert.equal(receiveSchema.parse({ ...base, batchNo: '', expiresOn: '' }).expiresOn, null);
    assert.ok(!receiveSchema.safeParse({ ...base, quantity: '0' }).success, 'quantity above zero');
    assert.ok(!receiveSchema.safeParse({ ...base, unitCost: '-1' }).success, 'cost not negative');
    assert.ok(!receiveSchema.safeParse({ ...base, unitCost: '1.23456' }).success, 'four places');
    assert.ok(!receiveSchema.safeParse({ ...base, batchNo: 'bad batch!' }).success);
    assert.ok(!receiveSchema.safeParse({ ...base, expiresOn: '30/06/2027' }).success);
    assert.ok(cogsQuery.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success);
    assert.ok(!cogsQuery.safeParse({ from: '2026-02-01', to: '2026-01-31' }).success);
  });
  await check('stock documents, counts and barcode input', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const line = {
      productId: id,
      variantId: null,
      quantity: '5',
      unitCost: '',
      batchNo: 'LOT-1',
      expiresOn: '2027-01-01',
      note: '',
    };
    const doc = {
      kind: 'receipt',
      warehouseId: id,
      partyType: 'supplier',
      partyId: null,
      partyName: 'Acme Supply',
      reference: '',
      note: '',
      lines: [line],
    };
    const parsed = documentInputSchema.parse(doc);
    assert.equal(parsed.lines[0]?.unitCost, null, 'empty cost uses the item cost');
    assert.ok(!documentInputSchema.safeParse({ ...doc, lines: [] }).success, 'at least one line');
    assert.ok(
      !documentInputSchema.safeParse({ ...doc, lines: Array.from({ length: 101 }, () => line) })
        .success,
      '100 lines at most',
    );
    assert.ok(!documentInputSchema.safeParse({ ...doc, kind: 'invoice' }).success);
    assert.ok(
      !documentInputSchema.safeParse({ ...doc, partyType: 'none', partyId: id }).success,
      'no party, no id',
    );
    assert.ok(
      !documentInputSchema.safeParse({ ...doc, lines: [{ ...line, quantity: '0' }] }).success,
    );
    assert.ok(documentUpdateSchema.safeParse({ expectedVersion: 1, document: doc }).success);
    assert.ok(
      !documentUpdateSchema.safeParse({ document: doc }).success,
      'update needs the loaded version',
    );
    assert.ok(
      documentActionSchema.safeParse({ action: 'post' }).success &&
        !documentActionSchema.safeParse({ action: 'delete' }).success,
    );
    assert.equal(formatNumber(DOCUMENT_PREFIX.receipt, 2026, 7), 'GRN-2026-0007');
    assert.equal(
      formatNumber('PO', 2026, 12345),
      'PO-2026-12345',
      'longer numbers keep every digit',
    );
    assert.deepEqual([...MOVES_STOCK].sort(), [
      'issue',
      'purchase_return',
      'receipt',
      'sales_return',
    ]);
    assert.ok(countStartSchema.safeParse({ warehouseId: id, note: '' }).success);
    assert.ok(
      countSaveSchema.safeParse({
        counts: [
          { lineId: id, countedQty: '3' },
          { lineId: id, countedQty: null },
        ],
      }).success,
    );
    assert.ok(
      !countSaveSchema.safeParse({ counts: [{ lineId: id, countedQty: '-3' }] }).success,
      'a count is not negative',
    );
    assert.ok(!countSaveSchema.safeParse({ counts: [] }).success);
    assert.ok(
      countActionSchema.safeParse({ action: 'complete' }).success &&
        !countActionSchema.safeParse({ action: 'reopen' }).success,
    );
    assert.ok(barcodeQuery.safeParse({ code: '4006381333931' }).success);
    assert.ok(barcodeQuery.safeParse({ code: 'BW-1/L' }).success);
    assert.ok(
      !barcodeQuery.safeParse({ code: 'a" or true' }).success,
      'a code cannot carry filter syntax',
    );
    assert.ok(!barcodeQuery.safeParse({ code: '' }).success);
  });

  await check('suppliers and purchase orders: input, totals, permissions, e-mail', async () => {
    const sid = '0190a0a0-0000-7000-8000-000000000001';
    const supplier = {
      name: 'Acme Supply',
      contactName: '',
      email: 'sales@acme.example',
      phone: '+1 555 0100',
      website: 'https://acme.example',
      taxId: '',
      category: 'Parts',
      paymentTermsDays: 30,
      addressLine1: '',
      addressLine2: '',
      addressCity: '',
      addressRegion: '',
      addressPostalCode: '',
      addressCountry: 'US',
      notes: '',
      customFields: {},
    };
    assert.ok(supplierInputSchema.safeParse(supplier).success);
    assert.ok(!supplierInputSchema.safeParse({ ...supplier, website: 'http://x.example' }).success);
    assert.ok(!supplierInputSchema.safeParse({ ...supplier, paymentTermsDays: 400 }).success);
    assert.ok(!supplierInputSchema.safeParse({ ...supplier, extra: 1 }).success);
    assert.ok(supplierListQuery.safeParse({ status: 'archived' }).success);
    const line = {
      productId: sid,
      variantId: null,
      description: '',
      quantity: '3',
      unitCost: '2.5',
      taxRate: '10',
    };
    const po = {
      supplierId: sid,
      warehouseId: sid,
      orderDate: '2026-01-10',
      expectedDate: '2026-01-20',
      supplierReference: '',
      notes: '',
      lines: [line],
    };
    assert.ok(poInputSchema.safeParse(po).success);
    assert.ok(!poInputSchema.safeParse({ ...po, expectedDate: '2026-01-01' }).success);
    assert.ok(!poInputSchema.safeParse({ ...po, lines: [] }).success);
    assert.ok(!poInputSchema.safeParse({ ...po, lines: [{ ...line, unitCost: '-1' }] }).success);
    assert.ok(poActionSchema.safeParse({ action: 'send' }).success);
    assert.ok(!poActionSchema.safeParse({ action: 'delete' }).success);
    assert.ok(
      poActionSchema.safeParse({
        action: 'receive',
        lines: [{ lineId: sid, quantity: '2', batchNo: '', expiresOn: '' }],
      }).success,
    );
    assert.ok(poListQuery.safeParse({ status: 'partial' }).success);
    const totals = computeTotals([
      { quantity: '3', unitCost: '2.5', taxRate: '10' },
      { quantity: '0.1', unitCost: '0.2', taxRate: '0' },
    ]);
    assert.equal(totals.subtotal, '7.5200');
    assert.equal(totals.taxTotal, '0.7500');
    assert.equal(totals.total, '8.2700');
    const names = new Set(registered.map((p) => p.action));
    for (const a of [
      'supplier.read',
      'supplier.write',
      'po.read',
      'po.write',
      'po.send',
      'po.receive',
    ])
      assert.ok(names.has(a), `permission ${a}`);
    const html = await render(
      PurchaseOrderEmail({
        supplierName: 'Acme',
        companyName: 'Demo Co',
        number: 'PO-2026-0001',
        orderDate: '2026-01-10',
        expectedDate: '',
        total: '$8.27',
        shipTo: 'Main',
        notes: '',
        lines: '3 x Widget',
      }),
    );
    assert.ok(html.includes('PO-2026-0001'));
  });

  await check('supplier bills, remittances and statements: input and arithmetic', () => {
    const sid = '0190a0a0-0000-7000-8000-000000000001';
    const line = {
      poLineId: sid,
      productId: sid,
      description: '',
      quantity: '2',
      unitCost: '3',
      taxRate: '0',
    };
    const bill = {
      supplierId: sid,
      purchaseOrderId: sid,
      supplierInvoiceNo: 'INV-77',
      billDate: '2026-02-01',
      dueDate: '2026-03-01',
      notes: '',
      lines: [line],
    };
    assert.ok(billInputSchema.safeParse(bill).success);
    assert.ok(!billInputSchema.safeParse({ ...bill, dueDate: '2026-01-01' }).success);
    assert.ok(
      !billInputSchema.safeParse({ ...bill, lines: [{ ...line, productId: null }] }).success,
      'a line needs an item or a description',
    );
    assert.ok(
      billInputSchema.safeParse({
        ...bill,
        lines: [{ ...line, poLineId: null, productId: null, description: 'Freight' }],
      }).success,
    );
    assert.ok(billActionSchema.safeParse({ action: 'post', override: false }).success);
    assert.ok(!billActionSchema.safeParse({ action: 'post' }).success);
    const remit = {
      supplierId: sid,
      amount: '10.5',
      paidOn: '2026-02-02',
      method: 'bank_transfer',
      reference: '',
      allocations: [
        { billId: sid, amount: '10' },
        { billId: '0190a0a0-0000-7000-8000-000000000002', amount: '0.5' },
      ],
    };
    assert.ok(remittanceInputSchema.safeParse(remit).success);
    assert.ok(!remittanceInputSchema.safeParse({ ...remit, amount: '11' }).success, 'must add up');
    assert.ok(!remittanceInputSchema.safeParse({ ...remit, amount: '0' }).success);
    assert.ok(
      !remittanceInputSchema.safeParse({
        ...remit,
        amount: '20',
        allocations: [
          { billId: sid, amount: '10' },
          { billId: sid, amount: '10' },
        ],
      }).success,
      'a bill appears once',
    );
    assert.ok(!remittanceInputSchema.safeParse({ ...remit, method: 'bitcoin' }).success);
    assert.ok(!supplierStatementQuery.safeParse({ from: '2026-03-01', to: '2026-01-01' }).success);
    const built = buildStatement('100.0000', [
      { on: '2026-02-05', kind: 'remittance', reference: 'RM-1', amount: '40' },
      { on: '2026-02-05', kind: 'bill', reference: 'BILL-2', amount: '0.1' },
      { on: '2026-02-01', kind: 'bill', reference: 'BILL-1', amount: '0.2' },
    ]);
    assert.deepEqual(
      built.lines.map((l) => l.reference),
      ['BILL-1', 'BILL-2', 'RM-1'],
      'bills before payments on the same day',
    );
    assert.equal(built.lines[1]?.balance, '100.3000');
    assert.equal(built.closing, '60.3000');
  });
  await check('spreadsheet reading: csv, xlsx, mapping, limits', () => {
    const rows = parseCsv(
      '' +
        String.fromCharCode(0xfeff) +
        'Name;E-mail;Note\r\n"Acme; Ltd";a@x.test;"line1\nline2 ""q"""\r\n\r\nBeta;b@x.test;\r\n',
    );
    assert.deepEqual(rows[0], ['Name', 'E-mail', 'Note']);
    assert.deepEqual(rows[1], ['Acme; Ltd', 'a@x.test', 'line1\nline2 "q"']);
    assert.equal(cleanRows(rows).length, 3);
    assert.deepEqual(parseCsv('a,b\n1,2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
    assert.deepEqual(parseCsv('a\tb\n1\t2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
    assert.throws(() => parseCsv('a,"b'), TransferError);
    assert.throws(() => parseCsv(`a\n${'x\n'.repeat(5002)}`), TransferError);
    assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(csvCell('-5.0000'), '-5.0000', 'a plain negative number is kept');
    assert.equal(csvCell('+cmd|x'), '"\'+cmd|x"');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.deepEqual(
      parseCsv(
        toCsv([
          ['n', 'x'],
          ['=1+1', 'y"z'],
        ]),
      ),
      [
        ['n', 'x'],
        ["'=1+1", 'y"z'],
      ],
    );
    assert.equal(
      cleanRows([['h'], ['# KD-EXPORT 1 | Co'], ['', '']]).length,
      1,
      'watermark and empty rows go',
    );

    const sheet =
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Qty</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>12.5</v></c></row></sheetData></worksheet>';
    const parts = {
      'xl/workbook.xml':
        '<workbook xmlns:r="x"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/data.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<sst><si><t>Name</t></si><si><r><t>Ac</t></r><r><t>me</t></r></si></sst>',
      'xl/worksheets/data.xml': sheet,
    };
    for (const stored of [false, true]) {
      const table = readXlsx(zip(parts, stored));
      assert.deepEqual(table[0], ['Name', '', 'Qty']);
      assert.deepEqual(table[1], ['Acme', '', '12.5']);
    }
    assert.throws(() => readXlsx(Buffer.from('not a zip file at all, really not')), TransferError);

    const fields = [
      { key: 'name', label: 'Name', required: true, aliases: ['company name'] },
      { key: 'email', label: 'E-mail', required: false, aliases: ['email address'] },
      { key: 'phone', label: 'Phone', required: false, aliases: [] },
    ];
    const mapping = suggestMapping(['Company Name', 'Email Address', 'Other'], fields);
    assert.deepEqual(mapping, { name: 'Company Name', email: 'Email Address' });
    assert.deepEqual(missingRequired(fields, {}), ['Name']);
    const t = splitTable([
      ['Company Name', 'Email Address'],
      ['Acme', 'a@x.test'],
      ['', ''],
    ]);
    assert.equal(t.data.length, 1);
    assert.deepEqual(applyMapping(t.headers, t.data, mapping), [
      { name: 'Acme', email: 'a@x.test' },
    ]);
    assert.deepEqual(
      applyMapping(['n'], [['<b>x</b>\u0007 ']], { name: 'n' }),
      [{ name: 'bx/b' }],
      'angle brackets and control characters are removed',
    );
    assert.throws(
      () =>
        splitTable([
          ['A', 'a'],
          ['1', '2'],
        ]),
      TransferError,
      'same column name twice',
    );
    assert.throws(() => splitTable([['A', 'B']]), TransferError, 'no data rows');
    assert.ok(
      importUploadSchema.safeParse({
        target: 'clients',
        fileName: 'x.csv',
        dataBase64: 'QUJDREVGR0g=',
      }).success,
    );
    assert.ok(
      !importUploadSchema.safeParse({
        target: 'clients',
        fileName: 'x.exe',
        dataBase64: 'QUJDREVGR0g=',
      }).success,
    );
    assert.ok(
      !importUploadSchema.safeParse({
        target: 'invoices',
        fileName: 'x.csv',
        dataBase64: 'QUJDREVGR0g=',
      }).success,
    );
    assert.ok(importActionSchema.safeParse({ action: 'run' }).success);
    assert.ok(
      !importActionSchema.safeParse({ action: 'preview', mapping: {}, duplicateMode: 'merge' })
        .success,
    );
    assert.ok(exportSchema.safeParse({ target: 'products', q: 'a' }).success);
    assert.ok(!exportSchema.safeParse({ target: 'products', all: true }).success);
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
