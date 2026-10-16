// path: services/alerting/health.ts
// Health checks. The public endpoints say only ok or not ok; details are for platform staff.
import 'server-only';
import { tryGetService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function databaseReady(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    const { error } = await getAdminSupabase()
      .from('companies')
      .select('id', { head: true })
      .limit(1);
    return { ok: !error, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

export interface HealthReport {
  database: { ok: boolean; latencyMs: number };
  alertsOpen: { critical: number; high: number; other: number };
  incidentsOpen: number;
  siemFailing: number;
  securityEventsLastHour: number;
  integrations: { name: string; configured: boolean }[];
}

export async function healthReport(): Promise<HealthReport> {
  const admin = getAdminSupabase();
  const env = getServerEnv();
  const database = await databaseReady();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const [alerts, incidents, siem, events] = await Promise.all([
    admin
      .from('alerts')
      .select('severity')
      .is('deleted_at', null)
      .neq('status', 'resolved')
      .limit(1000),
    admin
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', ['detected', 'acknowledged', 'mitigating']),
    admin
      .from('siem_destinations')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('enabled', true)
      .gt('failures', 0),
    admin
      .from('security_events')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since),
  ]);
  const severities = (alerts.data ?? []).map((a) => String(a.severity));
  return {
    database,
    alertsOpen: {
      critical: severities.filter((s) => s === 'critical').length,
      high: severities.filter((s) => s === 'high').length,
      other: severities.filter((s) => s !== 'critical' && s !== 'high').length,
    },
    incidentsOpen: incidents.count ?? 0,
    siemFailing: siem.count ?? 0,
    securityEventsLastHour: events.count ?? 0,
    integrations: [
      {
        name: 'Network intelligence provider',
        configured: env.NETWORK_INTEL_PROVIDER !== 'none' && Boolean(env.NETWORK_INTEL_API_KEY),
      },
      { name: 'Error reporting (Sentry)', configured: Boolean(env.SENTRY_DSN) },
      { name: 'Encryption service', configured: tryGetService('encryption') !== null },
      { name: 'E-mail service', configured: tryGetService('email') !== null },
    ],
  };
}
