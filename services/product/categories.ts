// path: services/product/categories.ts
// Product categories: a flat, ordered list per company.
import 'server-only';
import { getService } from '@/lib/container';
import { DuplicateError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface CategoryView {
  id: string;
  name: string;
  position: number;
  products: number;
}

export async function listCategories(companyId: string): Promise<CategoryView[]> {
  const admin = getAdminSupabase();
  const [cats, used] = await Promise.all([
    admin
      .from('product_categories')
      .select('id, name, position')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('position')
      .order('name'),
    admin
      .from('products')
      .select('category_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('category_id', 'is', null)
      .limit(5000),
  ]);
  if (cats.error) throw new InternalError(cats.error);
  const count = new Map<string, number>();
  for (const r of used.data ?? [])
    count.set(String(r.category_id), (count.get(String(r.category_id)) ?? 0) + 1);
  return (cats.data ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    position: Math.trunc(Number(c.position)),
    products: count.get(String(c.id)) ?? 0,
  }));
}

export async function saveCategory(
  actor: Actor,
  input: { id: string | null; name: string; position: number },
): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const r = input.id
    ? await admin
        .from('product_categories')
        .update({ name: input.name, position: input.position })
        .eq('id', input.id)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .select('id')
    : await admin
        .from('product_categories')
        .insert({ company_id: companyId, name: input.name, position: input.position })
        .select('id');
  if (r.error) {
    if (r.error.code === '23505')
      throw new DuplicateError('You already have a category with this name.');
    throw new InternalError(r.error);
  }
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: input.id ? 'category.updated' : 'category.created',
    resourceType: 'product_category',
    resourceId: String(r.data[0]?.id ?? ''),
    companyId,
    metadata: { by: actor.userId },
  });
}

export async function deleteCategory(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const used = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('category_id', id)
    .is('deleted_at', null);
  if ((used.count ?? 0) > 0)
    throw new ValidationError('Items still use this category. Move them first.');
  const r = await admin
    .from('product_categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'category.deleted',
    resourceType: 'product_category',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}
