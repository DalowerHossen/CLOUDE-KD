// path: services/help/status.ts
// Data of the public status page. It reads the incident list of the incident service and the database check of the
// health service, and keeps only the public-safe fields (see lib/support/status.ts).
import 'server-only';
import { createLogger } from '@/lib/logger';
import { publicState, type PublicIncident } from '@/lib/support/status';
import { databaseReady } from '@/services/alerting/health';
import { incidentOverview } from '@/services/incident/incident-service';

const log = createLogger({ component: 'status' });

export interface StatusData {
  checkedAt: string;
  databaseOk: boolean;
  /** False when the incident list could not be read: the page then says the history is unavailable. */
  historyOk: boolean;
  incidents: PublicIncident[];
}

export async function loadStatus(): Promise<StatusData> {
  const db = await databaseReady();
  let incidents: PublicIncident[] = [];
  let historyOk = true;
  try {
    const overview = await incidentOverview();
    incidents = overview.incidents
      .filter((i) => i.severity !== 'SEV4')
      .map((i) => ({
        number: i.number,
        title: i.title,
        severity: i.severity as PublicIncident['severity'],
        state: publicState(i.status),
        startedAt: i.detectedAt,
        resolvedAt: i.resolvedAt,
      }));
  } catch (error) {
    historyOk = false;
    log.error('incident history could not be read', { error });
  }
  return { checkedAt: new Date().toISOString(), databaseOk: db.ok, historyOk, incidents };
}
