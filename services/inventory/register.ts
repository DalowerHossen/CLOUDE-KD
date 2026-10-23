// path: services/inventory/register.ts
// Registers the stock guards in the catalog: an item or variant that still has stock cannot be deleted or removed.
import { registerProductDeleteGuard } from '@/lib/catalog/hooks';
import { registerVariantRemoveGuard } from '@/lib/catalog/variant-hooks';
import { getAdminSupabase } from '@/lib/supabase/admin';

export default async function register(): Promise<void> {
  registerProductDeleteGuard('inventory', async (companyId, productId) => {
    const { data } = await getAdminSupabase()
      .from('stock_levels')
      .select('quantity')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .gt('quantity', 0)
      .is('deleted_at', null)
      .limit(1);
    return data && data.length > 0 ? 'The item still has stock.' : null;
  });
  registerVariantRemoveGuard('inventory', async (companyId, variantId) => {
    const { data } = await getAdminSupabase()
      .from('stock_levels')
      .select('quantity')
      .eq('company_id', companyId)
      .eq('variant_id', variantId)
      .gt('quantity', 0)
      .is('deleted_at', null)
      .limit(1);
    return data && data.length > 0 ? 'It still has stock.' : null;
  });
}
