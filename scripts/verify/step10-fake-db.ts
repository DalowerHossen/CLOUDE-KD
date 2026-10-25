// path: scripts/verify/step10-fake-db.ts
// An in-memory stand-in for the Supabase client, only for the STEP 10 flow check. It keeps rows in arrays, applies the
// same defaults, unique rules and payment status guard as migrations/S10_001, and supports the calls the payment
// services use. It is not a general database.
import { randomUUID } from 'node:crypto';
import { PAYMENT_TRANSITIONS } from '@/lib/payment/state-machine';

type Row = Record<string, unknown>;
type Result = {
  data: unknown;
  error: { code: string; message: string } | null;
  count?: number | null;
};

const UNIQUE: Record<string, { name: string; cols: string[]; where?: (r: Row) => boolean }[]> = {
  payments: [
    { name: 'uq_payments_idempotency', cols: ['company_id', 'idempotency_key'] },
    {
      name: 'uq_payments_open_invoice',
      cols: ['invoice_id'],
      where: (r) =>
        ['created', 'requires_action', 'authorized', 'pending_review'].includes(String(r.status)),
    },
  ],
  webhook_events: [{ name: 'uq_webhook_events_event', cols: ['processor_id', 'event_id'] }],
  payment_reviews: [{ name: 'uq_payment_reviews_payment', cols: ['payment_id'] }],
  card_identities: [{ name: 'uq_card_identities_hmac', cols: ['processor_id', 'identity_hmac'] }],
  card_blacklist: [{ name: 'uq_card_blacklist_hmac', cols: ['processor_id', 'identity_hmac'] }],
  payment_allocations: [{ name: 'uq_payment_allocations', cols: ['payment_id', 'invoice_id'] }],
  refunds: [{ name: 'uq_refunds_idempotency', cols: ['company_id', 'idempotency_key'] }],
  checkout_sessions: [{ name: 'uq_checkout_sessions_order', cols: ['company_id', 'external_ref'] }],
};

export class FakeDb {
  tables = new Map<string, Row[]>();
  rpcs = new Map<string, (args: Record<string, unknown>) => unknown>();

  rows(table: string): Row[] {
    let list = this.tables.get(table);
    if (!list) {
      list = [];
      this.tables.set(table, list);
    }
    return list;
  }

  seed(table: string, row: Row): Row {
    const full = this.defaults(table, row);
    this.rows(table).push(full);
    return full;
  }

  private defaults(table: string, row: Row): Row {
    const now = new Date().toISOString();
    const base: Row = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1,
      ...row,
    };
    if (table === 'payments') {
      return {
        captured_amount: '0.0000',
        refunded_amount: '0.0000',
        surcharge_amount: '0.0000',
        status: 'created',
        payment_method: 'card',
        three_ds: {},
        ...base,
      };
    }
    if (table === 'webhook_events') return { status: 'received', attempts: 0, ...base };
    if (table === 'payment_links') return { use_count: 0, max_uses: 1, status: 'active', ...base };
    if (table === 'refunds') return { status: 'requested', ...base };
    return base;
  }

  conflict(table: string, candidate: Row, ignoreId?: unknown): string | null {
    for (const rule of UNIQUE[table] ?? []) {
      if (rule.where && !rule.where(candidate)) continue;
      const hit = this.rows(table).find(
        (r) =>
          r.id !== ignoreId &&
          (!rule.where || rule.where(r)) &&
          rule.cols.every((c) => r[c] === candidate[c] && candidate[c] !== undefined),
      );
      if (hit) return rule.name;
    }
    return null;
  }

  from(table: string): Builder {
    return new Builder(this, table);
  }

  rpc(name: string, args: Record<string, unknown>): Promise<Result> {
    const fn = this.rpcs.get(name);
    if (!fn)
      return Promise.resolve({ data: null, error: { code: 'XX000', message: `no rpc ${name}` } });
    try {
      return Promise.resolve({ data: fn(args), error: null });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return Promise.resolve({
        data: null,
        error: { code: err.code ?? 'XX000', message: err.message ?? 'error' },
      });
    }
  }
}

type Filter = (r: Row) => boolean;

class Builder implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private head = false;
  private wantCount = false;
  private orderBy: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private returning = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string, options?: { count?: string; head?: boolean }): this {
    if (this.op === 'select') this.op = 'select';
    else this.returning = true;
    if (options?.count) this.wantCount = true;
    if (options?.head) this.head = true;
    return this;
  }
  insert(values: Row | Row[]): this {
    this.op = 'insert';
    this.payload = values;
    return this;
  }
  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.op = 'upsert';
    this.payload = values;
    this.opts = options ?? {};
    return this;
  }
  eq(col: string, v: unknown): this {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown): this {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  is(col: string, v: unknown): this {
    this.filters.push((r) => (v === null ? r[col] === null || r[col] === undefined : r[col] === v));
    return this;
  }
  in(col: string, list: unknown[]): this {
    this.filters.push((r) => list.includes(r[col]));
    return this;
  }
  gte(col: string, v: unknown): this {
    this.filters.push(
      (r) => r[col] !== null && r[col] !== undefined && String(r[col]) >= String(v),
    );
    return this;
  }
  lt(col: string, v: unknown): this {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && String(r[col]) < String(v));
    return this;
  }
  lte(col: string, v: unknown): this {
    this.filters.push(
      (r) => r[col] !== null && r[col] !== undefined && String(r[col]) <= String(v),
    );
    return this;
  }
  or(expr: string): this {
    const groups = [...expr.matchAll(/and\(([^)]*)\)/g)].map((m) => m[1] ?? '');
    const tests = groups.map((g) =>
      g.split(',').map((c) => {
        const first = c.indexOf('.');
        const second = c.indexOf('.', first + 1);
        return {
          col: c.slice(0, first),
          op: c.slice(first + 1, second),
          value: c.slice(second + 1),
        };
      }),
    );
    this.filters.push((r) =>
      tests.some((conds) =>
        conds.every(({ col, op, value }) => {
          const cell = r[col];
          if (cell === null || cell === undefined) return false;
          if (op === 'eq') return String(cell) === value;
          if (op === 'lt') return String(cell) < value;
          if (op === 'lte') return String(cell) <= value;
          return false;
        }),
      ),
    );
    return this;
  }
  order(col: string, o?: { ascending?: boolean }): this {
    this.orderBy.push({ col, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  maybeSingle(): Promise<Result> {
    return this.run().then((r) =>
      r.error ? r : { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null },
    );
  }
  single(): Promise<Result> {
    return this.run().then((r) => {
      if (r.error) return r;
      const first = Array.isArray(r.data) ? r.data[0] : r.data;
      return first
        ? { data: first, error: null }
        : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    });
  }
  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private async run(): Promise<Result> {
    const table = this.table;
    if (this.op === 'select') {
      let rows = this.matching().map((r) => ({ ...r }));
      for (const o of [...this.orderBy].reverse()) {
        rows.sort((a, b) =>
          String(a[o.col] ?? '') < String(b[o.col] ?? '')
            ? o.asc
              ? -1
              : 1
            : String(a[o.col] ?? '') > String(b[o.col] ?? '')
              ? o.asc
                ? 1
                : -1
              : 0,
        );
      }
      const count = rows.length;
      if (this.max !== null) rows = rows.slice(0, this.max);
      return { data: this.head ? null : rows, error: null, count: this.wantCount ? count : null };
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const out: Row[] = [];
      for (const raw of list) {
        const candidate = (this.db as unknown as { defaults(t: string, r: Row): Row }).defaults(
          table,
          raw,
        );
        if (this.op === 'upsert' && this.opts.onConflict) {
          const keys = this.opts.onConflict.split(',');
          const hit = this.db.rows(table).find((r) => keys.every((k) => r[k] === raw[k]));
          if (hit) {
            if (!this.opts.ignoreDuplicates) Object.assign(hit, raw);
            out.push({ ...hit });
            continue;
          }
        }
        const clash = this.db.conflict(table, candidate);
        if (clash)
          return {
            data: null,
            error: {
              code: '23505',
              message: `duplicate key value violates unique constraint "${clash}"`,
            },
          };
        this.db.rows(table).push(candidate);
        out.push({ ...candidate });
      }
      return { data: this.returning ? out : null, error: null };
    }
    if (this.op === 'update') {
      const rows = this.matching();
      const out: Row[] = [];
      for (const r of rows) {
        const next = { ...r, ...(this.payload as Row) };
        if (table === 'payments') {
          for (const col of ['amount', 'currency', 'invoice_id', 'company_id', 'idempotency_key']) {
            if (next[col] !== r[col])
              return {
                data: null,
                error: {
                  code: '42501',
                  message: 'the amount, invoice and key of a payment cannot change',
                },
              };
          }
          if (
            next.status !== r.status &&
            !PAYMENT_TRANSITIONS[r.status as keyof typeof PAYMENT_TRANSITIONS].includes(
              next.status as never,
            )
          ) {
            return {
              data: null,
              error: {
                code: '42501',
                message: `illegal payment status change ${String(r.status)} -> ${String(next.status)}`,
              },
            };
          }
        }
        const clash = this.db.conflict(table, next, r.id);
        if (clash)
          return {
            data: null,
            error: {
              code: '23505',
              message: `duplicate key value violates unique constraint "${clash}"`,
            },
          };
        Object.assign(r, next, {
          version: Number(r.version) + 1,
          updated_at: new Date().toISOString(),
        });
        out.push({ ...r });
      }
      return { data: this.returning ? out : null, error: null };
    }
    return { data: null, error: { code: 'XX000', message: 'unsupported' } };
  }
}
