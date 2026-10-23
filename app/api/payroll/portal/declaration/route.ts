// path: app/api/payroll/portal/declaration/route.ts
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { resolvePortalAccess } from '@/services/portal/access';
import { portalDeclarationBody } from '@/services/payroll/portal-rules';
import { submitDeclaration } from '@/services/payroll/portal';

/** An employee sends a tax declaration from the portal. The link decides who the employee is; a bad link gets the same answer. */
export const POST = withApi(
  {
    id: 'payroll.portal.declaration',
    scope: 'public',
    networkContext: 'other',
    rateLimitPolicy: 'strict',
    body: portalDeclarationBody,
    auditExempt: 'The portal service writes the audit entry.',
  },
  async ({ body }) => {
    const { token, ...declaration } = body;
    const access = await resolvePortalAccess(token, ['payslip']);
    if (access.state !== 'ok') throw new ValidationError('This link cannot be used.');
    await submitDeclaration(access, declaration);
    return { status: 201, data: { ok: true } };
  },
);
