// path: app/api/inventory/warehouses/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { warehouseActionSchema, warehouseSchema } from '@/lib/stock/stock';
import {
  deleteWarehouse,
  ensureDefaultWarehouse,
  listWarehouses,
  makeDefault,
  saveWarehouse,
} from '@/services/inventory/warehouses';

const read = { action: 'inventory.read', resourceType: 'warehouse' } as const;
const manage = { action: 'inventory.warehouses', resourceType: 'warehouse' } as const;

export const GET = withApi(
  { id: 'warehouses.list', scope: 'tenant', permission: read },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await ensureDefaultWarehouse(actor.companyId);
    return { data: await listWarehouses(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'warehouses.save',
    scope: 'tenant',
    permission: manage,
    body: warehouseSchema,
    auditExempt: 'The warehouse service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveWarehouse(actor, body) };
  },
);

export const POST = withApi(
  {
    id: 'warehouses.action',
    scope: 'tenant',
    permission: manage,
    body: warehouseActionSchema,
    auditExempt: 'The warehouse service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    if (body.action === 'make_default') await makeDefault(actor, body.id);
    else await deleteWarehouse(actor, body.id);
    return { data: await listWarehouses(actor.companyId as string) };
  },
);
