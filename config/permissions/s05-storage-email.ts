// path: config/permissions/s05-storage-email.ts
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
    description: 'Move the files of a company between storage providers',
    defaultRoles: ['owner', 'ceo', 'super_admin'],
    approvalLevel: 'L0',
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
  {
    action: 'email.settings.manage',
    description:
      'Set the e-mail provider, sender name and suppression list of the own company and read its e-mail log',
    defaultRoles: ['owner', 'ceo', 'super_admin'],
    approvalLevel: 'L0',
  },
  {
    action: 'email.platform.manage',
    description: 'Set the platform e-mail providers and see the platform e-mail log',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
  {
    action: 'email.template.manage',
    description: 'Edit e-mail templates of the platform and send test messages',
    defaultRoles: ['ceo', 'super_admin'],
    approvalLevel: 'L0',
  },
];
