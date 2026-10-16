// path: config/permissions/s07-kyc.ts
import type { PermissionDefinition } from '@/types/contracts';

// kyc.file.read (STEP 05) opens the stored documents to reviewers. The actions below are the KYC workflow itself.
export const permissions: PermissionDefinition[] = [
  {
    action: 'kyc.status',
    description: 'See the state of the business verification',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'kyc.submit',
    description: 'Upload verification documents and submit them for review',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'kyc.review',
    description: 'Open the verification queue, view documents and recommend a decision',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'kyc.approve',
    description: 'Give the final approval of a business verification',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L2',
  },
];
