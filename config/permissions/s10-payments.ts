// path: config/permissions/s10-payments.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'payment.read',
    description: 'See payments, receipts and payment reports of the company',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.create',
    description: 'Take a payment for an invoice through the secure form',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.refund',
    description: 'Refund a payment (a staff refund waits for the owner)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L1',
  },
  {
    action: 'payment.refund.large',
    description: 'Refund a payment above the large refund threshold (waits for the CEO)',
    defaultRoles: ['owner'],
    approvalLevel: 'L2',
  },
  {
    action: 'payment.link.manage',
    description: 'Create and cancel payment links',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.review.read',
    description: 'See payments held for manual review',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.review.decide',
    description: 'Capture or void a payment held for manual review',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.card.block',
    description: 'Put a card on the blocked list or take it off',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.webhook.read',
    description: 'See processor webhook deliveries and the dead-letter list',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.webhook.retry',
    description: 'Process a failed webhook delivery again',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'fraud.payment_review.read',
    description: 'See payments held for manual review (fraud analysts)',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'fraud.payment_review.decide',
    description: 'Capture or void a payment held for manual review (fraud analysts)',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
];
