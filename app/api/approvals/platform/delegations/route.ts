// path: app/api/approvals/platform/delegations/route.ts
import { buildApprovalRoutes } from '@/services/approval/routes';

const routes = buildApprovalRoutes('platform');
export const POST = routes.delegate;
export const DELETE = routes.undelegate;
