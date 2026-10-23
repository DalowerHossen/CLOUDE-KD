// path: app/api/approvals/[id]/decision/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

export const POST = buildApprovalRoutes('tenant').decide;
