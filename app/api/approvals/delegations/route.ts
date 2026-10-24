// path: app/api/approvals/delegations/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

const routes = buildApprovalRoutes('tenant');
export const POST = routes.delegate;
export const DELETE = routes.undelegate;
