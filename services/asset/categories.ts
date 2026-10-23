// path: services/asset/categories.ts
// Asset categories (equipment, furniture, vehicles, software, buildings): the usual depreciation method and life, and the accounts
// the assets of the category post to (empty means the company's default accounts). A company without categories gets the usual ones.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { categoryInput, categoryUpdate, type Method } from './depreciation-rules';

export interface AssetCategoryView {
  id: string;
  name: string;
  method: Method;
  lifeMonths: number;
  assetAccountId: string | null;
  accumulatedAccountId: string | null;
  expenseAccountId: string | null;
  status: 'active' | 'inactive';
  version: number;
}

const COLUMNS =
  'id, name, method, life_months, asset_account_id, accumulated_account_id, expense_account_id, status, version';

interface Row {
  id: string;
  name: string;
  method: string;
  life_months: number;
  asset_account_id: string | null;
  accumulated_account_id: string | null;
  expense_account_id: string | null;
  status: string;
  version: number;
}

export const asMethod = (m: string): Method =>
  m === 'declining_balance' || m === 'units_of_production' || m === 'sum_of_years'
    ? m
    : 'straight_line';

const view = (r: Row): AssetCategoryView => ({
  id: r.id,
  name: r.name,
  method: asMethod(r.method),
  lifeMonths: toInt(r.life_months),
  assetAccountId: r.asset_account_id,
  accumulatedAccountId: r.accumulated_account_id,
  expenseAccountId: r.expense_account_id,
  status: r.status === 'inactive' ? 'inactive' : 'active',
  version: r.version,
});

export async function listAssetCategories(companyId: string): Promise<AssetCategoryView[]> {
  const { data, error } = await getAdminSupabase()
    .from('asset_categories')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

const DEFAULTS: readonly { name: string; method: Method; lifeMonths: number }[] = [
  { name: 'Computer equipment', method: 'straight_line', lifeMonths: 36 },
  { name: 'Office equipment', method: 'straight_line', lifeMonths: 60 },
  { name: 'Furniture and fittings', method: 'straight_line', lifeMonths: 84 },
  { name: 'Vehicles', method: 'declining_balance', lifeMonths: 60 },
  { name: 'Software', method: 'straight_line', lifeMonths: 36 },
  { name: 'Buildings', method: 'straight_line', lifeMonths: 480 },
];

/** Adds the usual categories to a company that has none. */
export async function ensureAssetCategories(actor: Actor): Promise<number> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if ((await listAssetCategories(companyId)).length > 0) return 0;
  let made = 0;
  for (const d of DEFAULTS) {
    const { error } = await getAdminSupabase().from('asset_categories').insert({
      company_id: companyId,
      name: d.name,
      method: d.method,
      life_months: d.lifeMonths,
    });
    if (error) {
      if (error.code === '23505') continue;
      mapAccountingError(error);
    }
    made += 1;
  }
  await getService('audit').record({
    action: 'asset.categories_seeded',
    resourceType: 'asset_category',
    resourceId: null,
    companyId,
    metadata: { made },
  });
  return made;
}

export async function createAssetCategory(
  actor: Actor,
  input: unknown,
): Promise<AssetCategoryView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = categoryInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The category is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('asset_categories')
    .insert({
      company_id: companyId,
      name: d.name,
      method: d.method,
      life_months: d.lifeMonths,
      asset_account_id: d.assetAccountId,
      accumulated_account_id: d.accumulatedAccountId,
      expense_account_id: d.expenseAccountId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A category with this name exists.');
    mapAccountingError(error);
  }
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'asset.category_created',
    resourceType: 'asset_category',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function updateAssetCategory(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<AssetCategoryView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = categoryUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.method !== undefined) patch.method = d.method;
  if (d.lifeMonths !== undefined) patch.life_months = d.lifeMonths;
  if (d.assetAccountId !== undefined) patch.asset_account_id = d.assetAccountId;
  if (d.accumulatedAccountId !== undefined) patch.accumulated_account_id = d.accumulatedAccountId;
  if (d.expenseAccountId !== undefined) patch.expense_account_id = d.expenseAccountId;
  if (d.status !== undefined) patch.status = d.status;
  const { data, error } = await getAdminSupabase()
    .from('asset_categories')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) {
    if (error.code === '23505') throw new ConflictError('A category with this name exists.');
    mapAccountingError(error);
  }
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: 'asset.category_changed',
    resourceType: 'asset_category',
    resourceId: id,
    companyId,
    metadata: { fields: Object.keys(patch) },
  });
  return view(row);
}
