// path: app/api/account/profile/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { profileInput } from '@/lib/profile/schema';
import { getOwnProfile, saveOwnProfile } from '@/services/account/profile';

export const GET = withApi({ id: 'account.profile.get', scope: 'tenant' }, async ({ actor }) => {
  if (!actor) throw new ForbiddenError();
  return { data: await getOwnProfile(actor) };
});

export const PUT = withApi(
  {
    id: 'account.profile.save',
    scope: 'tenant',
    body: profileInput,
    auditExempt: 'The profile service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveOwnProfile(actor, body) };
  },
);
