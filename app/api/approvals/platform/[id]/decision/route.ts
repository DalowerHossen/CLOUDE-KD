// path: app/api/approvals/platform/[id]/decision/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const POST = buildApprovalRoutes('platform').decide;
