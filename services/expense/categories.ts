// path: services/expense/categories.ts
// Expense categories: nested, each can post to an expense account of the chart and says whether the spending is tax
// deductible. A company without categories gets the usual ones (travel, meals, office, software and so on) on first use.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { categoryInput, categoryUpdate } from './expense-rules';

export interface CategoryView {
  id: string;
  name: string;
  parentId: string | null;
  accountId: string | null;
  taxDeductible: boolean;
  status: 'active' | 'inactive';
  version: number;
}

const COLUMNS = 'id, name, parent_id, account_id, tax_deductible, status, version';

interface Row {
  id: string;
  name: string;
  parent_id: string | null;
  account_id: string | null;
  tax_deductible: boolean;
  status: string;
  version: number;
}

const view = (r: Row): CategoryView => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id,
  accountId: r.account_id,
  taxDeductible: r.tax_deductible,
  status: r.status === 'inactive' ? 'inactive' : 'active',
  version: r.version,
});

/** The ids of a category and of all the categories above it. */
export function chainOf(
  categories: readonly Pick<CategoryView, 'id' | 'parentId'>[],
  id: string | null,
): string[] {
  const by = new Map(categories.map((c) => [c.id, c]));
  const out: string[] = [];
  let cur = id ? by.get(id) : undefined;
  while (cur && out.length < 6) {
    out.push(cur.id);
    cur = cur.parentId ? by.get(cur.parentId) : undefined;
  }
  return out;
}

/** The account a category posts to: its own, or the nearest one above it; null means the default expense account. */
export function accountOf(categories: readonly CategoryView[], id: string | null): string | null {
  const by = new Map(categories.map((c) => [c.id, c]));
  for (const cid of chainOf(categories, id)) {
    const a = by.get(cid)?.accountId;
    if (a) return a;
  }
  return null;
}

export async function listCategories(companyId: string): Promise<CategoryView[]> {
  const { data, error } = await getAdminSupabase()
    .from('expense_categories')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(1000);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

const DEFAULTS: readonly {
  name: string;
  code: string | null;
  deductible?: boolean;
  children?: readonly string[];
}[] = [
  { name: 'Travel', code: '6540', children: ['Flights', 'Hotels', 'Ground transport'] },
  { name: 'Meals', code: '6100', children: ['Business meals', 'Team events'] },
  { name: 'Office', code: '6550' },
  { name: 'Software', code: '6520' },
  { name: 'Marketing', code: '6530' },
  { name: 'Rent and utilities', code: '6500' },
  { name: 'Professional fees', code: '6560' },
  { name: 'Entertainment', code: '6100', deductible: false },
  { name: 'Other', code: null },
];

export async function ensureCategories(actor: Actor): Promise<number> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if ((await listCategories(companyId)).length > 0) return 0;
  const admin = getAdminSupabase();
  const accounts = await admin
    .from('accounts')
    .select('id, code')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('type', 'expense');
  if (accounts.error) throw new InternalError(accounts.error);
  const byCode = new Map((accounts.data ?? []).map((a) => [String(a.code), String(a.id)]));
  let made = 0;
  for (const d of DEFAULTS) {
    const { data, error } = await admin
      .from('expense_categories')
      .insert({
        company_id: companyId,
        name: d.name,
        account_id: d.code ? (byCode.get(d.code) ?? null) : null,
        tax_deductible: d.deductible ?? true,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') continue;
      mapAccountingError(error);
    }
    made += 1;
    for (const child of d.children ?? []) {
      const c = await admin.from('expense_categories').insert({
        company_id: companyId,
        name: child,
        parent_id: (data as { id: string }).id,
        tax_deductible: d.deductible ?? true,
      });
      if (c.error && c.error.code !== '23505') mapAccountingError(c.error);
      else made += 1;
    }
  }
  await getService('audit').record({
    action: 'expense.categories_seeded',
    resourceType: 'expense_category',
    resourceId: null,
    companyId,
    metadata: { made },
  });
  return made;
}

export async function createCategory(actor: Actor, input: unknown): Promise<CategoryView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = categoryInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The category is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('expense_categories')
    .insert({
      company_id: companyId,
      name: d.name,
      parent_id: d.parentId,
      account_id: d.accountId,
      tax_deductible: d.taxDeductible,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A category with this name exists here.');
    mapAccountingError(error);
  }
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'expense.category_created',
    resourceType: 'expense_category',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<CategoryView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = categoryUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.accountId !== undefined) patch.account_id = d.accountId;
  if (d.taxDeductible !== undefined) patch.tax_deductible = d.taxDeductible;
  if (d.status !== undefined) patch.status = d.status;
  const { data, error } = await getAdminSupabase()
    .from('expense_categories')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) {
    if (error.code === '23505') throw new ConflictError('A category with this name exists here.');
    mapAccountingError(error);
  }
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: 'expense.category_changed',
    resourceType: 'expense_category',
    resourceId: id,
    companyId,
    metadata: { fields: Object.keys(patch) },
  });
  return view(row);
}

/** Categories in tree order with their depth shown as dashes. */
export function categoryOptions(list: readonly CategoryView[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const c of list
      .filter((x) => x.parentId === parent && x.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ id: c.id, label: `${'- '.repeat(depth)}${c.name}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
