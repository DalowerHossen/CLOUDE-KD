// path: lib/security/signals.ts
// Pure detectors for device and behaviour signals. They return a signal name or null; the service records the signal.
import { FINGERPRINT_EXCLUDED_PREFIXES, SIGNAL_THRESHOLDS } from '@/config/security';

export type SignalName =
  | 'country_jump'
  | 'multi_account_ip'
  | 'device_reuse'
  | 'trial_abuse'
  | 'insider_bulk_activity'
  | 'new_device';

/** Another country within the minimum gap is impossible travel. Unknown countries never raise the signal. */
export function detectCountryJump(
  previous: { country: string; at: string } | null,
  current: { country: string | null; at: Date },
): SignalName | null {
  if (!previous || !current.country || previous.country === current.country) return null;
  const gapMinutes = (current.at.getTime() - Date.parse(previous.at)) / 60_000;
  return gapMinutes >= 0 && gapMinutes < SIGNAL_THRESHOLDS.countryJumpMinutes
    ? 'country_jump'
    : null;
}

export function detectMultiAccountIp(usersOnIp: number): SignalName | null {
  return usersOnIp >= SIGNAL_THRESHOLDS.usersPerIp ? 'multi_account_ip' : null;
}

export function detectDeviceReuse(usersOnFingerprint: number): SignalName | null {
  return usersOnFingerprint >= SIGNAL_THRESHOLDS.usersPerFingerprint ? 'device_reuse' : null;
}

export function detectTrialAbuse(signupsOnIp: number): SignalName | null {
  return signupsOnIp >= SIGNAL_THRESHOLDS.signupsPerIp ? 'trial_abuse' : null;
}

export function shouldRefuseSignup(signupsOnIp: number): boolean {
  return signupsOnIp >= SIGNAL_THRESHOLDS.signupsPerIpRefuse;
}

export function detectInsiderActivity(role: string, actionsLastHour: number): SignalName | null {
  return role === 'admin_staff' && actionsLastHour > SIGNAL_THRESHOLDS.adminActionsPerHour
    ? 'insider_bulk_activity'
    : null;
}

/** No fingerprint on payment, card and password pages. Keystrokes are never recorded anywhere. */
export function isFingerprintExcluded(pathname: string): boolean {
  return FINGERPRINT_EXCLUDED_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}
