// path: app/api/storage/migrations/route.ts
import { withApi } from '@/lib/api/with-api';
import {
  listMigrations,
  migrationControlSchema,
  controlMigration,
  startMigration,
  startMigrationSchema,
} from '@/services/storage/migrate';

const permission = { action: 'storage.migrate', resourceType: 'storage' } as const;

export const GET = withApi(
  { id: 'storage.migration.list', scope: 'tenant', permission },
  async ({ tenant }) => {
    if (!tenant) throw new Error('unreachable');
    return { data: await listMigrations(tenant.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'storage.migration.start',
    scope: 'tenant',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: startMigrationSchema,
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new Error('unreachable');
    return { status: 201, data: { id: await startMigration(actor, body) } };
  },
);

export const PATCH = withApi(
  {
    id: 'storage.migration.control',
    scope: 'tenant',
    permission,
    body: migrationControlSchema,
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new Error('unreachable');
    await controlMigration(actor, body);
    return { data: { done: true } };
  },
);
