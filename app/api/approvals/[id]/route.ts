// path: app/api/approvals/[id]/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const GET = buildApprovalRoutes('tenant').history;
