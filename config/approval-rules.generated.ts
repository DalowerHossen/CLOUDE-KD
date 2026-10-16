// path: config/approval-rules.generated.ts
// GENERATED - do not edit. Source: config/approval/* (run: npm run gen)

import type { ApprovalRuleDefinition } from '@/types/contracts';
import { approvalRules as s02Core } from './approval/s02-core';
import { approvalRules as s06Cms } from './approval/s06-cms';

export const approvalRules: ApprovalRuleDefinition[] = [...s02Core, ...s06Cms];
