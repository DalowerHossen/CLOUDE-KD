// path: app/api/approvals/platform/[id]/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const GET = buildApprovalRoutes('platform').history;
