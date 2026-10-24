// path: services/gateway/routes.ts
// The routes a sub-merchant may call: a method and a path template such as GET /orders/{id}. Anything that matches no enabled route
// is answered with 404 by the gateway.
import 'server-only';
import { GATEWAY_MAX_ROUTES } from '@/config/s16-gateway';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { routeInput, routeUpdate } from '@/lib/gateway/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';

const COLUMNS = 'id, name, method, path_template, enabled, version, created_at';

interface Row {
  id: string;
  name: string;
  method: string;
  path_template: string;
  enabled: boolean;
  version: number;
  created_at: string;
}

export interface RouteView {
  id: string;
  name: string;
  method: string;
  pathTemplate: string;
  enabled: boolean;
  version: number;
  createdAt: string;
}

const toView = (r: Row): RouteView => ({
  id: r.id,
  name: r.name,
  method: r.method,
  pathTemplate: r.path_template,
  enabled: r.enabled,
  version: r.version,
  createdAt: r.created_at,
});

export async function listRoutes(companyId: string): Promise<RouteView[]> {
  const { data, error } = await getAdminSupabase()
    .from('gateway_routes')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('path_template')
    .order('method')
    .limit(GATEWAY_MAX_ROUTES + 1);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function createRoute(actor: Actor, input: unknown): Promise<RouteView> {
  const companyId = need(actor);
  const parsed = routeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The route is not valid.');
  if ((await listRoutes(companyId)).length >= GATEWAY_MAX_ROUTES)
    throw new ConflictError(`A company can have ${GATEWAY_MAX_ROUTES} routes at most.`);
  const { data, error } = await getAdminSupabase()
    .from('gateway_routes')
    .insert({
      company_id: companyId,
      name: parsed.data.name,
      method: parsed.data.method,
      path_template: parsed.data.pathTemplate,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toView(data as unknown as Row);
  await record(companyId, 'gateway.route_created', 'gateway_route', view.id, {
    method: view.method,
    pathTemplate: view.pathTemplate,
  });
  return view;
}

export async function updateRoute(actor: Actor, id: string, input: unknown): Promise<RouteView> {
  const companyId = need(actor);
  const parsed = routeUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
  const { data, error } = await getAdminSupabase()
    .from('gateway_routes')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', parsed.data.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0)
    throw new ConflictError('The route changed or was removed. Reload and try again.');
  await record(companyId, 'gateway.route_changed', 'gateway_route', id, {
    fields: Object.keys(patch),
  });
  return toView(data[0] as unknown as Row);
}

export async function deleteRoute(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('gateway_routes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await record(companyId, 'gateway.route_removed', 'gateway_route', id, {});
}
