// path: app/api/approvals/platform/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const GET = buildApprovalRoutes('platform').list;
