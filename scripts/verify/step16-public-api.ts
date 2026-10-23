// path: scripts/verify/step16-public-api.ts
// Logic checks of the public API resources (16.1.b) that need no database: the JSON schema converter, the OpenAPI document (all
// references resolve, unique operation ids, scopes, idempotency header, payments read only), that every route file is described in
// the registry and the other way round, the list queries and the cursor, the filters, sort and paging of a list, the answers of
// the live mappers (internal fields never appear), the sandbox rule for writes and the totals of a priced invoice. Calls with a
// real key, the live queries and the sandbox table need a running app and database.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-public-api.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { buildOpenApi, toJsonSchema } from '@/lib/integrations/openapi';
import { ENDPOINTS } from '@/lib/integrations/public-registry';
import {
  clientCreate,
  clientOut,
  clientsQuery,
  decodeCursor,
  encodeCursor,
  estimateOut,
  invoiceCreate,
  invoiceOut,
  invoicesQuery,
  paymentOut,
  productCreate,
  productOut,
  productUpdate,
} from '@/lib/integrations/public-schemas';
import {
  pageOf,
  priceLines,
  requireSandbox,
  selectRows,
  toClient,
  toEstimate,
  toInvoice,
  toPayment,
  toProduct,
} from '@/services/publicapi/resources';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const doc = buildOpenApi(ENDPOINTS) as {
  openapi: string;
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, unknown> };
};

check('schema converter: objects are strict, defaults and nulls are described', () => {
  const s = toJsonSchema(
    z
      .object({
        a: z.string().max(5),
        b: z.number().int().min(1).default(3),
        c: z.string().nullable(),
        d: z.enum(['x', 'y']).optional(),
        e: z.array(z.string()).max(3),
      })
      .strict(),
  ) as {
    required: string[];
    additionalProperties: boolean;
    properties: Record<string, Record<string, unknown>>;
  };
  assert.deepEqual(s.required, ['a', 'c', 'e']);
  assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.b?.default, 3);
  assert.equal(s.properties.b?.type, 'integer');
  assert.deepEqual(s.properties.c?.type, ['string', 'null']);
  assert.equal(s.properties.e?.maxItems, 3);
});

check('the OpenAPI document is 3.1 with a bearer scheme and one operation per endpoint', () => {
  assert.equal(doc.openapi, '3.1.0');
  const count = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  assert.equal(count, ENDPOINTS.length);
  const ids = ENDPOINTS.map((e) => e.operationId);
  assert.equal(new Set(ids).size, ids.length);
});

check('every $ref in the document resolves', () => {
  const text = JSON.stringify(doc);
  const refs = [...text.matchAll(/#\/components\/schemas\/([A-Za-z]+)/g)].map(
    (m) => m[1] as string,
  );
  assert.ok(refs.length > 10);
  for (const r of refs) assert.ok(r in doc.components.schemas, `missing ${r}`);
});

check('payments are read only and every write endpoint is idempotent or versioned', () => {
  assert.ok(!ENDPOINTS.some((e) => e.path.startsWith('/payments') && e.method !== 'get'));
  for (const e of ENDPOINTS.filter((x) => x.method === 'post'))
    assert.ok(e.idempotent || e.returnsSecret, e.operationId);
  for (const e of ENDPOINTS.filter((x) => x.method === 'patch'))
    assert.ok(e.body?.shape && 'version' in e.body.shape, e.operationId);
  const post = doc.paths['/clients']?.post as { parameters: { name: string }[] } | undefined;
  assert.ok(post?.parameters.some((p) => p.name === 'Idempotency-Key'));
});

check('every endpoint states the scope it needs; only the status endpoint is open', () => {
  const open = ENDPOINTS.filter((e) => e.scope === null).map((e) => e.path);
  assert.deepEqual(open, ['/status']);
  const get = doc.paths['/invoices']?.get;
  assert.equal(get?.['x-required-scope'], 'read:invoices');
});

check('every route file is in the registry and every registry entry has a route', () => {
  const root = path.join(process.cwd(), 'app/api/public/v1');
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (name.name === 'route.ts') {
        const text = fs.readFileSync(full, 'utf8');
        const rel = '/' + path.relative(root, path.dirname(full)).split(path.sep).join('/');
        const apiPath = rel.replace(/\[id\]/g, '{id}');
        for (const m of text.matchAll(/export const (GET|POST|PATCH|DELETE) =/g))
          found.push(`${(m[1] as string).toLowerCase()} ${apiPath === '/' ? '' : apiPath}`);
      }
    }
  };
  walk(root);
  const registry = ENDPOINTS.map((e) => `${e.method} ${e.path}`).sort();
  assert.deepEqual(found.sort(), registry);
});

check('lists: defaults, limit bounds, strict unknown parameters, ids and dates checked', () => {
  const ok = clientsQuery.parse({});
  assert.equal(ok.limit, 25);
  assert.equal(ok.sort, 'created_desc');
  assert.equal(clientsQuery.parse({ limit: '100' }).limit, 100);
  assert.ok(!clientsQuery.safeParse({ limit: '101' }).success);
  assert.ok(!clientsQuery.safeParse({ limit: '0' }).success);
  assert.ok(!clientsQuery.safeParse({ company_id: id(1) }).success);
  assert.ok(!invoicesQuery.safeParse({ client_id: 'x' }).success);
  assert.ok(!invoicesQuery.safeParse({ issued_from: '2026-1-1' }).success);
  assert.ok(!clientsQuery.safeParse({ updated_since: 'yesterday' }).success);
  assert.ok(clientsQuery.safeParse({ updated_since: '2026-01-01T00:00:00Z' }).success);
});

check('cursor: round trip, and a cursor not made by the API is refused', () => {
  assert.equal(decodeCursor(encodeCursor(id(7))), id(7));
  assert.equal(decodeCursor('%%%'), null);
  assert.equal(decodeCursor(encodeCursor('not-a-uuid')), null);
});

const row = (n: number, status: string, client: string): Record<string, unknown> => ({
  id: id(n),
  status,
  client_id: client,
  issue_date: `2026-01-${String(n).padStart(2, '0')}`,
  updated_at: `2026-02-${String(n).padStart(2, '0')}T00:00:00.000Z`,
});
const rows = [1, 2, 3, 4, 5].map((n) =>
  row(n, n % 2 === 0 ? 'paid' : 'sent', n < 3 ? id(100) : id(101)),
);
const base = { limit: 2, sort: 'created_asc' as const };

check('paging walks the whole list without gaps or repeats, in both sorts', () => {
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i += 1) {
    const page = selectRows('invoices', rows, { ...base, cursor });
    seen.push(...page.items.map((x) => String(x.id)));
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  assert.deepEqual(
    seen,
    rows.map((r) => String(r.id)),
  );
  const desc = selectRows('invoices', rows, { limit: 5, sort: 'created_desc' });
  assert.deepEqual(
    desc.items.map((x) => x.id),
    [...rows].reverse().map((r) => r.id),
  );
  assert.equal(desc.nextCursor, null);
  assert.throws(() => selectRows('invoices', rows, { ...base, cursor: 'bad' }));
});

check('filters: equality, date range and updated since', () => {
  assert.equal(
    selectRows('invoices', rows, { limit: 10, sort: 'created_asc', status: 'paid' }).items.length,
    2,
  );
  assert.equal(
    selectRows('invoices', rows, { limit: 10, sort: 'created_asc', client_id: id(101) }).items
      .length,
    3,
  );
  assert.equal(
    selectRows('invoices', rows, {
      limit: 10,
      sort: 'created_asc',
      issued_from: '2026-01-02',
      issued_to: '2026-01-04',
    }).items.length,
    3,
  );
  assert.equal(
    selectRows('invoices', rows, {
      limit: 10,
      sort: 'created_asc',
      updated_since: '2026-02-04T00:00:00Z',
    }).items.length,
    2,
  );
});

check('pageOf gives a next cursor only when more rows follow', () => {
  assert.equal(pageOf([{ id: id(1) }, { id: id(2) }], 2).nextCursor, null);
  assert.equal(
    pageOf([{ id: id(1) }, { id: id(2) }, { id: id(3) }], 2).nextCursor,
    encodeCursor(id(2)),
  );
});

check('live answers never carry internal fields and match their schemas', () => {
  const internal = {
    cost_price: '5',
    notes: 'secret',
    credit_limit: '9',
    internal_notes: 'x',
    processor_id: 'stripe',
    payer_ip: '1.2.3.4',
    card_identity_id: id(9),
    risk_flag: 'high',
  };
  const created = '2026-01-01T00:00:00.000Z';
  const client = toClient({
    ...internal,
    id: id(1),
    kind: 'company',
    name: 'A',
    email: 'a@x.test',
    display_currency: 'USD',
    tags: ['a'],
    status: 'active',
    billing_country: 'US',
    created_at: created,
    updated_at: created,
    version: 3,
  });
  assert.ok(clientOut.safeParse(client).success);
  const product = toProduct({
    ...internal,
    id: id(2),
    kind: 'product',
    name: 'P',
    unit: 'unit',
    unit_price: 12.5,
    tax_category: 'standard',
    tax_rate: 7.5,
    status: 'active',
    created_at: created,
    updated_at: created,
    version: 1,
  });
  assert.ok(productOut.safeParse(product).success);
  assert.equal(product.unit_price, '12.5000');
  const invoice = toInvoice(
    {
      ...internal,
      id: id(3),
      kind: 'invoice',
      status: 'sent',
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      subtotal: 100,
      tax_total: 10,
      total: 110,
      amount_paid: 0,
      amount_due: 110,
      created_at: created,
      updated_at: created,
      version: 1,
    },
    [
      {
        position: 1,
        sku: '',
        description: 'x',
        quantity: 1,
        unit: 'unit',
        unit_price: 100,
        tax: 10,
        line_total: 110,
      },
    ],
  );
  assert.ok(invoiceOut.safeParse(invoice).success);
  assert.equal(invoice.total, '110.0000');
  const estimate = toEstimate({
    ...internal,
    id: id(4),
    status: 'sent',
    subtotal: 1,
    tax_total: 0,
    total: 1,
    valid_until: '2026-03-01',
    created_at: created,
    updated_at: created,
    version: 1,
  });
  assert.ok(estimateOut.safeParse(estimate).success);
  const payment = toPayment({
    ...internal,
    id: id(5),
    invoice_id: id(3),
    status: 'captured',
    amount: 110,
    captured_amount: 110,
    refunded_amount: 0,
    payment_method: 'card',
    created_at: created,
    updated_at: created,
    version: 1,
  });
  assert.ok(paymentOut.safeParse(payment).success);
  const text = JSON.stringify([client, product, invoice, estimate, payment]);
  for (const bad of [
    'secret',
    'stripe',
    '1.2.3.4',
    'cost_price',
    'notes',
    'risk',
    'payer',
    'processor',
    'card_identity',
  ])
    assert.ok(!text.includes(bad), bad);
});

check('a live key cannot write; a sandbox key can', () => {
  assert.throws(
    () => requireSandbox('live'),
    (e: unknown) => (e as { status?: number }).status === 501,
  );
  assert.doesNotThrow(() => requireSandbox('sandbox'));
});

check('sandbox write bodies are strict and checked', () => {
  assert.ok(clientCreate.safeParse({ name: 'Ada' }).success);
  assert.ok(!clientCreate.safeParse({ name: 'Ada', company_id: id(1) }).success);
  assert.ok(!clientCreate.safeParse({ name: '<b>' }).success);
  assert.ok(!clientCreate.safeParse({ name: 'A', billing_address: { country: 'usa' } }).success);
  assert.ok(productCreate.safeParse({ name: 'P', unit_price: '10.5' }).success);
  assert.ok(!productCreate.safeParse({ name: 'P', unit_price: '-1' }).success);
  assert.ok(!productCreate.safeParse({ name: 'P', unit_price: '1.12345' }).success);
  assert.ok(!productUpdate.safeParse({ name: 'x' }).success);
  const items = [{ description: 'Work', quantity: '1', unit_price: '10' }];
  assert.ok(
    invoiceCreate.safeParse({
      client_id: id(1),
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      items,
    }).success,
  );
  assert.ok(
    !invoiceCreate.safeParse({
      client_id: id(1),
      issue_date: '2026-01-01',
      due_date: '2026-01-31',
      items: [],
    }).success,
  );
});

check('priced lines add up exactly with Money', () => {
  const p = priceLines([
    { description: 'A', quantity: '2.5', unit_price: '10', tax_rate: '10' },
    { description: 'B', quantity: '1', unit_price: '0.1', tax_rate: '8.25' },
  ]);
  assert.equal(p.subtotal, '25.1000');
  assert.equal(p.tax_total, '2.5083');
  assert.equal(p.total, '27.6083');
  assert.equal(p.items[0]?.line_total, '27.5000');
  assert.equal(p.items[1]?.tax, '0.0083');
});

process.stdout.write(`step16-public-api: ${checks} checks passed\n`);
