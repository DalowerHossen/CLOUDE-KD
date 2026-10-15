// path: components/layout/shell-user.ts
// Resolves the signed-in user for the dashboard and admin shells (server only).
import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { tryGetService } from '@/lib/container';
import { ServiceNotRegisteredError } from '@/lib/errors';
import { isShellPreviewEnabled } from '@/lib/env';
import { PLATFORM_ROLES, type Role } from '@/types/contracts/common';
import type { ShellUser } from './user-menu';

export type ShellArea = 'dashboard' | 'admin';

export interface ShellContext {
  user: ShellUser;
  role: Role;
}

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super admin',
  ceo: 'CEO',
  admin_staff: 'Admin staff',
  owner: 'Owner',
  staff: 'Staff',
};

/**
 * Uses the auth service (STEP 03). Fails closed when it is not registered.
 * Only in development with SHELL_PREVIEW=1 a fixed preview user is returned so the shells can be reviewed.
 */
export async function getShellContext(area: ShellArea): Promise<ShellContext> {
  const auth = tryGetService('auth');
  if (auth) {
    const actor = await auth.getActor();
    if (!actor) redirect('/login');
    if (area === 'admin' && !PLATFORM_ROLES.includes(actor.role)) notFound();
    if (
      area === 'dashboard' &&
      PLATFORM_ROLES.includes(actor.role) &&
      actor.impersonatedBy === null
    )
      redirect('/admin');
    return {
      role: actor.role,
      user: {
        name: actor.email.split('@')[0] ?? actor.email,
        email: actor.email,
        roleLabel: ROLE_LABELS[actor.role],
      },
    };
  }
  if (isShellPreviewEnabled()) {
    const role: Role = area === 'admin' ? 'super_admin' : 'owner';
    return {
      role,
      user: { name: 'Preview User', email: 'preview@example.com', roleLabel: ROLE_LABELS[role] },
    };
  }
  throw new ServiceNotRegisteredError('auth');
}
