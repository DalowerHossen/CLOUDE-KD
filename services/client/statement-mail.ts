// path: services/client/statement-mail.ts
// Sends the statement of a client by e-mail. A client marked "do not contact" never receives it.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getClient } from './clients';
import { statementData } from './statement';

export async function emailStatement(
  actor: Actor,
  clientId: string,
  range: { from: string; to: string },
): Promise<{ sentTo: string }> {
  const companyId = actor.companyId as string;
  const client = await getClient(companyId, clientId);
  if (client.doNotContact) throw new ValidationError('This client asked not to be contacted.');
  const to = client.billingEmail ?? client.email;
  if (!to) throw new ValidationError('This client has no e-mail address.');
  const data = await statementData(companyId, clientId, range);
  const company = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (company.error) throw new InternalError(company.error);
  const m = (v: string): string => formatMoney(Money.parse(v));
  const lines = data.documents
    .slice(0, 25)
    .map((d) => `${d.number}, due ${d.dueOn}: ${m(d.due)}`)
    .join('\n');
  await getService('email').send({
    template: 'invoice.client-statement',
    to,
    companyId,
    data: {
      clientName: client.name,
      companyName: String(company.data?.name ?? 'your supplier'),
      from: range.from,
      to: range.to,
      openingBalance: m(data.openingBalance),
      balance: m(data.balance),
      current: m(data.aging.current),
      d1_30: m(data.aging.d1_30),
      d31_60: m(data.aging.d31_60),
      d61_90: m(data.aging.d61_90),
      d91_plus: m(data.aging.d91_plus),
      lines,
    },
    idempotencyKey: `statement-${clientId}-${range.from}-${range.to}-${new Date().toISOString().slice(0, 13)}`,
  });
  await getService('audit').record({
    action: 'client.statement_emailed',
    resourceType: 'client',
    resourceId: clientId,
    companyId,
    metadata: { by: actor.userId },
  });
  return { sentTo: to };
}
