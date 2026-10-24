// path: services/client/statement.ts
// Statement data of a client for a date range: opening balance, open documents with aging, payments. The documents
// and payments come from the invoice and payment STEPs through registered providers; without them the statement
// shows only the opening balance.
import 'server-only';
import { ageDocuments, AGING_BUCKETS, type AgingBucket } from '@/lib/crm/aging';
import { clientStatementProviders, type OpenDocument } from '@/lib/crm/hooks';
import { Money } from '@/lib/utils/currency';
import { getClient } from './clients';

export interface StatementData {
  client: { id: string; name: string; email: string | null; displayCurrency: string };
  range: { from: string; to: string };
  openingBalance: string;
  documents: { number: string; issuedOn: string; dueOn: string; due: string }[];
  payments: { on: string; reference: string; amount: string }[];
  aging: Record<AgingBucket | 'total', string>;
  balance: string;
}

export async function statementData(
  companyId: string,
  clientId: string,
  range: { from: string; to: string },
): Promise<StatementData> {
  const client = await getClient(companyId, clientId);
  const docs: OpenDocument[] = [];
  const pays: { on: string; reference: string; amount: Money }[] = [];
  for (const provider of clientStatementProviders()) {
    const got = await provider(companyId, clientId, range);
    docs.push(...got.documents);
    pays.push(...got.payments);
  }
  docs.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  pays.sort((a, b) => a.on.localeCompare(b.on));
  const aged = ageDocuments(docs, range.to);
  const aging = { total: aged.total.toDbString() } as StatementData['aging'];
  for (const b of AGING_BUCKETS) aging[b] = aged[b].toDbString();
  const opening = Money.parse(client.openingBalance);
  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      displayCurrency: client.displayCurrency,
    },
    range,
    openingBalance: opening.toDbString(),
    documents: docs.map((d) => ({
      number: d.number,
      issuedOn: d.issuedOn,
      dueOn: d.dueOn,
      due: d.due.toDbString(),
    })),
    payments: pays.map((p) => ({
      on: p.on,
      reference: p.reference,
      amount: p.amount.toDbString(),
    })),
    aging,
    balance: opening.add(aged.total).toDbString(),
  };
}
