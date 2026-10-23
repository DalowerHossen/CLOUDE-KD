// path: config/permissions/s16-whatsapp.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'whatsapp.read',
    description:
      'See the WhatsApp connection (never the token), templates, contacts and the message log',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'whatsapp.manage',
    description:
      'Connect WhatsApp, change the connection, make and remove templates (needs a fresh identity check for the connection)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'whatsapp.send',
    description: 'Send WhatsApp messages to people who agreed to receive them',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'whatsapp.contacts.manage',
    description: 'Record that a person agreed or declined to receive WhatsApp messages',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'whatsapp.campaigns.manage',
    description:
      'Make, start, pause, cancel and repeat WhatsApp campaigns (starting needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
