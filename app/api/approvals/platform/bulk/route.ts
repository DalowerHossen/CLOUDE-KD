// path: app/api/approvals/platform/bulk/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const POST = buildApprovalRoutes('platform').bulk;
