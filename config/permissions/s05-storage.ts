// path: config/permissions/s05-storage.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'storage.manage',
    description: 'Link or unlink Google Drive and see storage use of the own company',
    defaultRoles: ['owner', 'ceo', 'super_admin'],
    approvalLevel: 'L0',
  },
  {
    action: 'storage.migrate',
    description: 'Move files between storage providers',
    defaultRoles: ['ceo', 'super_admin'],
    approvalLevel: 'L2',
  },
  {
    action: 'storage.admin',
    description: 'See storage health, quarantine and migrations of all companies',
    defaultRoles: ['ceo', 'super_admin'],
    approvalLevel: 'L0',
  },
  {
    action: 'kyc.file.read',
    description: 'Open KYC documents',
    defaultRoles: ['ceo', 'super_admin', 'admin_staff'],
    approvalLevel: 'L0',
  },
];
