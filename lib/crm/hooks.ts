// path: lib/crm/hooks.ts
// Extension points for the client record. STEP 08 never reads the tables of later STEPs. A later STEP registers a
// function here when it loads (from its own register file); STEP 08 asks the registered functions when it needs an
// answer. Without a registration the answer is "nothing", so STEP 08 works alone.
import type { Money } from '@/lib/utils/currency';

/** Returns a sentence when the client may not be deleted (for example "The client has invoices"), else null. */
export type ClientDeleteGuard = (companyId: string, clientId: string) => Promise<string | null>;

/** Moves everything that points at the removed client to the kept client. Runs inside the merge. */
export type ClientMergeHandler = (
  companyId: string,
  fromClientId: string,
  intoClientId: string,
) => Promise<void>;

export interface TimelineEntry {
  at: string;
  kind: string;
  title: string;
  detail: string;
  href: string | null;
}
export type ClientTimelineProvider = (
  companyId: string,
  clientId: string,
  limit: number,
) => Promise<TimelineEntry[]>;

export interface OpenDocument {
  number: string;
  issuedOn: string;
  dueOn: string;
  /** Amount still unpaid, USD. */
  due: Money;
}
export type ClientStatementProvider = (
  companyId: string,
  clientId: string,
  range: { from: string; to: string },
) => Promise<{
  documents: OpenDocument[];
  payments: { on: string; reference: string; amount: Money }[];
}>;

/** Data kept about one client by another STEP, for the personal data export. */
export type ClientExportProvider = (
  companyId: string,
  clientId: string,
) => Promise<{ section: string; rows: Record<string, unknown>[] }>;

/** Replaces personal data of the client in another STEP's tables (anonymize). */
export type ClientAnonymizeHandler = (companyId: string, clientId: string) => Promise<void>;

const deleteGuards = new Map<string, ClientDeleteGuard>();
const mergeHandlers = new Map<string, ClientMergeHandler>();
const timelineProviders = new Map<string, ClientTimelineProvider>();
const statementProviders = new Map<string, ClientStatementProvider>();
const exportProviders = new Map<string, ClientExportProvider>();
const anonymizeHandlers = new Map<string, ClientAnonymizeHandler>();

export const registerClientDeleteGuard = (id: string, fn: ClientDeleteGuard): void =>
  void deleteGuards.set(id, fn);
export const registerClientMergeHandler = (id: string, fn: ClientMergeHandler): void =>
  void mergeHandlers.set(id, fn);
export const registerClientTimeline = (id: string, fn: ClientTimelineProvider): void =>
  void timelineProviders.set(id, fn);
export const registerClientStatement = (id: string, fn: ClientStatementProvider): void =>
  void statementProviders.set(id, fn);
export const registerClientExport = (id: string, fn: ClientExportProvider): void =>
  void exportProviders.set(id, fn);
export const registerClientAnonymize = (id: string, fn: ClientAnonymizeHandler): void =>
  void anonymizeHandlers.set(id, fn);

export const clientDeleteGuards = (): ClientDeleteGuard[] => [...deleteGuards.values()];
export const clientMergeHandlers = (): ClientMergeHandler[] => [...mergeHandlers.values()];
export const clientTimelineProviders = (): ClientTimelineProvider[] => [
  ...timelineProviders.values(),
];
export const clientStatementProviders = (): ClientStatementProvider[] => [
  ...statementProviders.values(),
];
export const clientExportProviders = (): ClientExportProvider[] => [...exportProviders.values()];
export const clientAnonymizeHandlers = (): ClientAnonymizeHandler[] => [
  ...anonymizeHandlers.values(),
];
