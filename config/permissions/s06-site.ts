// path: config/permissions/s06-site.ts
import type { PermissionDefinition } from '@/types/contracts';

const staff = ['super_admin', 'ceo', 'admin_staff'] as const;

export const permissions: PermissionDefinition[] = [
  {
    action: 'cms.read',
    description: 'See pages, versions and previews of the public site',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'cms.edit',
    description: 'Edit drafts of public pages and upload page media',
    defaultRoles: [...staff],
    approvalLevel: 'L0',
  },
  {
    action: 'cms.publish',
    description: 'Publish public pages (content managers need approval)',
    defaultRoles: [...staff],
    approvalLevel: 'L2',
  },
];
