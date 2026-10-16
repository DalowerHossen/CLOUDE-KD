// path: services/email/brand.ts
// Brand variables of a message: product name, color, logo, footer. Companies start with their own name; the branding
// settings of a later STEP can add color and logo through `registerBrandResolver`.
import 'server-only';
import { DEFAULT_BRAND, type BrandVariables } from '@/lib/email/template-body';
import { getAdminSupabase } from '@/lib/supabase/admin';

export type BrandResolver = (companyId: string) => Promise<Partial<BrandVariables> | null>;

const KEY = Symbol.for('kd.solution.it.email.brand');
function resolvers(): BrandResolver[] {
  const holder = globalThis as unknown as Record<symbol, BrandResolver[] | undefined>;
  const existing = holder[KEY];
  if (existing) return existing;
  const created: BrandResolver[] = [];
  holder[KEY] = created;
  return created;
}

export function registerBrandResolver(resolver: BrandResolver): void {
  if (!resolvers().includes(resolver)) resolvers().push(resolver);
}

export async function resolveBrand(companyId: string | null): Promise<BrandVariables> {
  if (!companyId) return DEFAULT_BRAND;
  const brand: BrandVariables = { ...DEFAULT_BRAND };
  const { data } = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (data?.name) brand.productName = String(data.name).slice(0, 80);
  for (const resolver of resolvers()) {
    const extra = await resolver(companyId).catch(() => null);
    if (extra)
      Object.assign(
        brand,
        Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
      );
  }
  return brand;
}
