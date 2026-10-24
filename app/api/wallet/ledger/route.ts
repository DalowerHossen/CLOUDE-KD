// path: app/api/wallet/ledger/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { ledgerCsv, loadStatement } from '@/services/wallet/statement';
import { getWallet } from '@/services/wallet/wallet-service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31.');

export const GET = withApi(
  {
    id: 'wallet.ledger',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'wallet' },
    query: z.strictObject({ from: day, to: day, format: z.enum(['json', 'csv']).default('json') }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (query.from >= query.to)
      throw new ValidationError('The end date must be after the start date.');
    const wallet = await getWallet(actor.companyId);
    if (!wallet) throw new ValidationError('The company has no wallet yet.');
    const statement = await loadStatement(actor.companyId, wallet.id, query.from, query.to);
    return {
      data: {
        from: statement.from,
        to: statement.to,
        opening: {
          available: statement.opening.available.toDbString(),
          held: statement.opening.held.toDbString(),
        },
        closing: {
          available: statement.closing.available.toDbString(),
          held: statement.closing.held.toDbString(),
        },
        totals: { in: statement.totals.in.toDbString(), out: statement.totals.out.toDbString() },
        filename: `ledger-${query.from}-${query.to}.csv`,
        csv: query.format === 'csv' ? ledgerCsv(statement.lines) : null,
        lines:
          query.format === 'csv'
            ? []
            : statement.lines.map((l) => ({ ...l, amount: l.amount.toDbString() })),
      },
    };
  },
);
