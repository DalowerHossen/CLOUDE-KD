// path: config/boot/s04-alerting.ts
// Connects security events and SIEM findings to the alert engine once per process.
import { raiseAlert } from '@/services/alerting/alert-service';
import { onSiemFinding } from '@/services/siem/siem-service';
import { onSecurityEvent } from '@/services/security/events';

export async function boot(): Promise<void> {
  onSecurityEvent(async (event) => {
    if (event.severity !== 'high' && event.severity !== 'critical') return;
    const subject = event.ipHash ?? event.actorId ?? event.companyId ?? 'platform';
    await raiseAlert({
      ruleId: `security.${event.type}`,
      severity: event.severity,
      title: `Security event: ${event.type.replace(/_/g, ' ')}`,
      body: 'A security event with high impact was recorded. See the SIEM page for the evidence.',
      dedupeKey: `security.${event.type}:${subject}`,
      companyId: event.companyId,
    });
  });
  onSiemFinding(async (finding) => {
    await raiseAlert({
      ruleId: `siem.${finding.ruleId}`,
      severity:
        finding.severity === 'low' ? 'low' : finding.severity === 'info' ? 'low' : finding.severity,
      title: `SIEM finding: ${finding.ruleId}`,
      body: `${finding.count} related events were correlated.`,
      dedupeKey: `siem.${finding.ruleId}:${finding.subject}`,
    });
  });
}
