// path: app/api/approvals/bulk/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const POST = buildApprovalRoutes('tenant').bulk;
