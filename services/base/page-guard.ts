// path: services/base/page-guard.ts
// Page-level permission guard for server components. Fails closed: any problem answers 404.
import 'server-only';
import { notFound } from 'next/navigation';
import { getService } from '@/lib/container';
import { PLATFORM_ROLES, type Actor } from '@/types/contracts';

export async function requirePagePermission(
  action: string,
  scope: 'platform' | 'tenant',
  resourceType?: string,
): Promise<Actor> {
  const actor = await getService('auth').getActor();
  if (!actor) notFound();
  if (scope === 'platform' && !PLATFORM_ROLES.includes(actor.role)) notFound();
  if (scope === 'tenant' && (PLATFORM_ROLES.includes(actor.role) || !actor.companyId)) notFound();
  const allowed = await getService('permissions').can(
    actor,
    action,
    resourceType ? { type: resourceType } : undefined,
  );
  if (!allowed) notFound();
  return actor;
}
