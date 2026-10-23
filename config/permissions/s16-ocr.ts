// path: config/permissions/s16-ocr.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'integrations.ocr.read',
    description: 'See the OCR settings (never the key) and the receipts that were read',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'integrations.ocr.manage',
    description:
      'Switch receipt OCR on, set the Google API key (needs a fresh identity check), and correct or repeat a reading',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
