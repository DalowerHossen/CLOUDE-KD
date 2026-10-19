// path: config/approval-rules.generated.ts
// GENERATED - do not edit. Source: config/approval/* (run: npm run gen)

import type { ApprovalRuleDefinition } from '@/types/contracts';
import { approvalRules as s02Core } from './approval/s02-core';
import { approvalRules as s06Cms } from './approval/s06-cms';
import { approvalRules as s07Admin } from './approval/s07-admin';
import { approvalRules as s07Kyc } from './approval/s07-kyc';
import { approvalRules as s07Lifecycle } from './approval/s07-lifecycle';
import { approvalRules as s08Clients } from './approval/s08-clients';
import { approvalRules as s08Purchasing } from './approval/s08-purchasing';
import { approvalRules as s09Invoices } from './approval/s09-invoices';
import { approvalRules as s10Refunds } from './approval/s10-refunds';
import { approvalRules as s13Portal } from './approval/s13-portal';
import { approvalRules as s14Wallet } from './approval/s14-wallet';

export const approvalRules: ApprovalRuleDefinition[] = [...s02Core, ...s06Cms, ...s07Admin, ...s07Kyc, ...s07Lifecycle, ...s08Clients, ...s08Purchasing, ...s09Invoices, ...s10Refunds, ...s13Portal, ...s14Wallet];
