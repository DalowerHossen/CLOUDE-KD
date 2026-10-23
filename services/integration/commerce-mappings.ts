// path: services/integration/commerce-mappings.ts
// The SKU of a store and the product it stands for. A SKU is mapped once per store (not case sensitive); the product is checked
// through the product service. Mapping a SKU handles the orders of the store that waited for it.
import 'server-only';
import { MAX_MAPPINGS_PER_CONNECTION } from '@/config/s16-commerce';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { mappingInput } from '@/lib/integrations/mapping-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getConnection } from './connections';
import { need, record, writeLog } from './commerce-db';
import { processOrder } from './commerce-orders';
import { productExists } from './commerce-ports';

export interface MappingView {
  id: string;
  integrationId: string;
  externalSku: string;
  productId: string;
  createdAt: string;
}

interface Row {
  id: string;
  integration_id: string;
  external_sku: string;
  product_id: string;
  created_at: string;
}

const COLUMNS = 'id, integration_id, external_sku, product_id, created_at';
const toView = (r: Row): MappingView => ({
  id: r.id,
  integrationId: r.integration_id,
  externalSku: r.external_sku,
  productId: r.product_id,
  createdAt: r.created_at,
});

export async function listMappings(
  companyId: string,
  integrationId: string,
): Promise<MappingView[]> {
  await getConnection(companyId, integrationId);
  const { data, error } = await getAdminSupabase()
    .from('integration_mappings')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .is('deleted_at', null)
    .order('external_sku')
    .limit(MAX_MAPPINGS_PER_CONNECTION);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function putMapping(
  actor: Actor,
  integrationId: string,
  input: unknown,
): Promise<MappingView> {
  const companyId = need(actor);
  const parsed = mappingInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The mapping is not valid.');
  await getConnection(companyId, integrationId);
  if (!(await productExists(companyId, parsed.data.productId)))
    throw new NotFoundError('The product was not found.');
  const admin = getAdminSupabase();
  const existing = await admin
    .from('integration_mappings')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .ilike('external_sku', parsed.data.externalSku.replace(/[\\%_]/g, '\\$&'))
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  let view: MappingView;
  if (existing.data) {
    const row = existing.data as unknown as Row;
    const { error } = await admin
      .from('integration_mappings')
      .update({ product_id: parsed.data.productId })
      .eq('company_id', companyId)
      .eq('id', row.id);
    if (error) mapIntegrationError(error);
    view = { ...toView(row), productId: parsed.data.productId };
  } else {
    if ((await listMappings(companyId, integrationId)).length >= MAX_MAPPINGS_PER_CONNECTION)
      throw new ConflictError(`A store can have ${MAX_MAPPINGS_PER_CONNECTION} mappings at most.`);
    const { data, error } = await admin
      .from('integration_mappings')
      .insert({
        company_id: companyId,
        integration_id: integrationId,
        external_sku: parsed.data.externalSku,
        product_id: parsed.data.productId,
        created_by: actor.userId,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') throw new ConflictError('This SKU is already mapped.');
      mapIntegrationError(error);
    }
    view = toView(data as unknown as Row);
  }
  await record(companyId, 'commerce.mapping_saved', 'integration_mapping', view.id, {
    sku: view.externalSku,
  });
  await writeLog(
    companyId,
    integrationId,
    null,
    'mapping',
    'info',
    `SKU ${view.externalSku} is mapped.`,
  );
  await handleWaiting(companyId, integrationId);
  return view;
}

/** The orders of the store that wait in conflict are looked at again (a conflict that is gone closes itself). */
async function handleWaiting(companyId: string, integrationId: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('integration_orders')
    .select('id')
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .eq('status', 'conflict')
    .is('deleted_at', null)
    .limit(25);
  if (error) throw new InternalError(error);
  for (const o of (data ?? []) as { id: string }[]) {
    const moved = await getAdminSupabase()
      .from('integration_orders')
      .update({ status: 'received', attempts: 0, last_error: null })
      .eq('company_id', companyId)
      .eq('id', o.id)
      .eq('status', 'conflict');
    if (moved.error) mapIntegrationError(moved.error);
    await processOrder(companyId, o.id);
  }
}

export async function removeMapping(
  actor: Actor,
  integrationId: string,
  id: string,
): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('integration_mappings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, external_sku');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'commerce.mapping_removed', 'integration_mapping', id, {});
}
