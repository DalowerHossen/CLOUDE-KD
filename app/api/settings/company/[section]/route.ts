// path: app/api/settings/company/[section]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { EDITABLE_SECTIONS } from '@/lib/company/forms';
import { getService } from '@/lib/container';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { getSection, saveSection } from '@/services/company/settings';

/** Security and approval rules need team.security (owner only); staff may not even read them. */
async function assertSectionAccess(
  actor: Parameters<ReturnType<typeof getService<'permissions'>>['can']>[0],
  section: string,
): Promise<void> {
  if (
    (section === 'security' || section === 'approval') &&
    !(await getService('permissions').can(actor, 'team.security', { type: 'team' }))
  )
    throw new NotFoundError();
}

const params = z.object({ section: z.enum(EDITABLE_SECTIONS) }).strict();

export const GET = withApi(
  {
    id: 'company.settings.get',
    scope: 'tenant',
    permission: { action: 'company.read', resourceType: 'company' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await assertSectionAccess(actor, p.section);
    return { data: await getSection(actor.companyId, p.section) };
  },
);

export const PUT = withApi(
  {
    id: 'company.settings.save',
    scope: 'tenant',
    permission: { action: 'company.manage', resourceType: 'company' },
    params,
    body: z
      .object({
        value: z.record(z.string(), z.unknown()),
        expectedVersion: z.number().int().min(0),
      })
      .strict(),
    auditExempt: 'The settings service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await assertSectionAccess(actor, p.section);
    return { data: await saveSection(actor, p.section, body.value, body.expectedVersion) };
  },
);
