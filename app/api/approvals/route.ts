// path: app/api/approvals/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const GET = buildApprovalRoutes('tenant').list;
