// path: services/client/custom-fields.ts
// Custom fields a company adds to clients, products and suppliers: the definitions, and the check of the values
// against them. Values are stored as small JSON on the record itself.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
export { checkCustomValues } from '@/lib/crm/custom-values';
import type { CustomFieldDefInput } from '@/lib/crm/clients';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export type { CustomEntity, CustomFieldDef } from '@/lib/crm/custom-values';
import type { CustomEntity, CustomFieldDef } from '@/lib/crm/custom-values';

export async function listDefs(companyId: string, entity: CustomEntity): Promise<CustomFieldDef[]> {
  const { data, error } = await getAdminSupabase()
    .from('custom_field_defs')
    .select('id, entity, key, label, kind, options, required, position, version')
    .eq('company_id', companyId)
    .eq('entity', entity)
    .is('deleted_at', null)
    .order('position')
    .order('label');
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    entity,
    key: String(r.key),
    label: String(r.label),
    kind: String(r.kind) as CustomFieldDef['kind'],
    options: (r.options as string[] | null) ?? [],
    required: r.required === true,
    position: Number(r.position),
    version: Number(r.version),
  }));
}

/** Replaces the definitions of one entity: keys not in the list are removed, the rest are added or updated. */
export async function saveDefs(
  actor: Actor,
  entity: CustomEntity,
  fields: CustomFieldDefInput[],
): Promise<CustomFieldDef[]> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const current = await listDefs(companyId, entity);
  const keep = new Set(fields.map((f) => f.key));
  for (const old of current.filter((d) => !keep.has(d.key))) {
    const r = await admin
      .from('custom_field_defs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', old.id)
      .eq('company_id', companyId);
    if (r.error) throw new InternalError(r.error);
  }
  for (const f of fields) {
    const row = {
      label: f.label,
      kind: f.kind,
      options: f.kind === 'select' ? f.options : [],
      required: f.required,
      position: f.position,
    };
    const existing = current.find((d) => d.key === f.key);
    const r = existing
      ? await admin
          .from('custom_field_defs')
          .update(row)
          .eq('id', existing.id)
          .eq('company_id', companyId)
      : await admin
          .from('custom_field_defs')
          .insert({ company_id: companyId, entity, key: f.key, ...row });
    if (r.error) throw new InternalError(r.error);
  }
  await getService('audit').record({
    action: 'custom_fields.saved',
    resourceType: 'custom_field_defs',
    resourceId: null,
    companyId,
    metadata: { entity, count: fields.length, by: actor.userId },
  });
  return listDefs(companyId, entity);
}
