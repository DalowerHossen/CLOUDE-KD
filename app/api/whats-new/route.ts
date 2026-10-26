// path: app/api/whats-new/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { seenSchema } from '@/lib/platform/release-notes';
import { markReads, notesForReader } from '@/services/platform/release-notes';

const permission = { action: 'release.read', resourceType: 'release_note' } as const;

export const GET = withApi(
  { id: 'whatsnew.list', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await notesForReader(actor) };
  },
);

export const POST = withApi(
  {
    id: 'whatsnew.seen',
    scope: 'tenant',
    permission,
    body: seenSchema,
    auditExempt: 'Records only that the reader has seen a note; it changes nothing of the company.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await markReads(actor, body);
    return { data: { done: true } };
  },
);
