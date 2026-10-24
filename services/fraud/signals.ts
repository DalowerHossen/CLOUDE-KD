// path: services/fraud/signals.ts
// Records fraud signals and evaluates device and behaviour signals. Scores decay in the database (10 percent a day).
import 'server-only';
import { z } from 'zod';
import { SIGNAL_THRESHOLDS, SIGNAL_WEIGHTS } from '@/config/security';
import { InternalError } from '@/lib/errors';
import {
  detectCountryJump,
  detectDeviceReuse,
  detectInsiderActivity,
  detectMultiAccountIp,
  detectTrialAbuse,
  type SignalName,
} from '@/lib/security/signals';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';
import { currentDeviceHash } from '@/services/auth/device';

export type SubjectType = 'user' | 'device' | 'ip' | 'company';

export async function recordSignal(
  type: string,
  subjectType: SubjectType,
  ref: string,
  options: { delta?: number; companyId?: string | null; details?: Record<string, unknown> } = {},
): Promise<number> {
  const delta = options.delta ?? SIGNAL_WEIGHTS[type] ?? 5;
  const { data, error } = await getAdminSupabase().rpc('kd_risk_add', {
    p_type: type,
    p_subject_type: subjectType,
    p_ref: ref.slice(0, 100),
    p_delta: Math.max(-100, Math.min(100, Math.round(delta))),
    p_company: options.companyId ?? null,
    p_details: options.details ?? {},
  });
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data);
}

export async function riskOf(subjectType: SubjectType, ref: string): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_risk_get', {
    p_subject_type: subjectType,
    p_ref: ref,
  });
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data);
}

const seenSchema = z
  .object({
    isNew: z.boolean(),
    trusted: z.boolean(),
    usersOnFingerprint: z.number().int(),
    seenCount: z.number().int(),
  })
  .strip();
const countrySchema = z.object({ country: z.string(), at: z.string() }).strip().nullable();

/** Called with the browser fingerprint of a signed-in user. Returns the signals that were raised. */
export async function onDeviceSeen(
  userId: string,
  companyId: string | null,
  fingerprint: string,
): Promise<SignalName[]> {
  const admin = getAdminSupabase();
  const meta = await readRequestMeta();
  const device = await currentDeviceHash();
  let country: string | null = null;
  if (meta.ipHash) {
    const rep = await admin.rpc('kd_reputation_get', { p_ip_hash: meta.ipHash });
    const code = (rep.data as { countryCode?: string | null } | null)?.countryCode;
    country = code ? code.toUpperCase() : null;
  }
  const previous = countrySchema.parse(
    (await admin.rpc('kd_last_country', { p_user: userId })).data ?? null,
  );
  const seen = seenSchema.parse(
    (
      await admin.rpc('kd_device_seen', {
        p_user: userId,
        p_company: companyId,
        p_device_hash: device.hash,
        p_fingerprint: fingerprint,
        p_ip_hash: meta.ipHash,
        p_country: country ?? '',
      })
    ).data,
  );
  const raised: SignalName[] = [];
  const add = async (name: SignalName | null): Promise<void> => {
    if (!name) return;
    raised.push(name);
    await recordSignal(name, 'user', userId, { companyId });
    if (meta.ipHash) {
      await recordSignal(name, 'ip', meta.ipHash, {
        companyId,
        delta: Math.round((SIGNAL_WEIGHTS[name] ?? 5) / 2),
      });
    }
  };
  if (seen.isNew && seen.seenCount === 1) await add('new_device');
  await add(detectDeviceReuse(seen.usersOnFingerprint));
  await add(detectCountryJump(previous, { country, at: new Date() }));
  if (meta.ipHash) {
    const users = await admin.rpc('kd_users_for_ip', { p_ip_hash: meta.ipHash, p_hours: 24 });
    await add(detectMultiAccountIp(z.coerce.number().parse(users.data ?? 0)));
  }
  return raised;
}

export async function signupsFromThisAddress(): Promise<number> {
  const meta = await readRequestMeta();
  if (!meta.ipHash) return 0;
  const { data, error } = await getAdminSupabase().rpc('kd_signups_for_ip', {
    p_ip_hash: meta.ipHash,
    p_hours: 24,
  });
  if (error) throw new InternalError(error);
  return z.coerce.number().parse(data ?? 0);
}

export async function noteTrialAbuse(signups: number): Promise<void> {
  const name = detectTrialAbuse(signups);
  if (!name) return;
  const meta = await readRequestMeta();
  if (meta.ipHash) await recordSignal(name, 'ip', meta.ipHash, { details: { signups } });
}

/** Insider threat check for platform staff; called at most once a minute per session. */
export async function checkInsiderActivity(userId: string, role: string): Promise<void> {
  if (role !== 'admin_staff') return;
  const { data, error } = await getAdminSupabase().rpc('kd_actor_actions', {
    p_actor: userId,
    p_minutes: 60,
  });
  if (error) return;
  const name = detectInsiderActivity(role, z.coerce.number().parse(data ?? 0));
  if (name) {
    await recordSignal(name, 'user', userId, {
      details: { window_minutes: 60, limit: SIGNAL_THRESHOLDS.adminActionsPerHour },
    });
  }
}
