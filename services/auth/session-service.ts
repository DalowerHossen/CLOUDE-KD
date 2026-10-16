// path: services/auth/session-service.ts
// Platform session records (user_sessions, user_devices). Supabase keeps the token session; this table adds the
// device list, end times, revocation and the mid-session change detection used by the security page.
import 'server-only';
import { headers } from 'next/headers';
import { sessionExpiry, deviceLabel } from '@/lib/auth/session';
import { tryGetService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';
import { currentDeviceHash } from './device';
import { recordLoginEvent } from './login-events';

export interface SessionOpenInput {
  userId: string;
  email: string;
  companyId: string | null;
  authSessionId: string | null;
  identifier: string;
  rememberMe: boolean;
  aal: 'aal1' | 'aal2';
  impersonatedBy?: string | null;
}

/** Records the session and the device. Returns true when the device was not known before (new device). */
export async function openSessionRecord(
  input: SessionOpenInput,
): Promise<{ newDevice: boolean; sessionId: string }> {
  const admin = getAdminSupabase();
  const meta = await readRequestMeta();
  const device = await currentDeviceHash();
  const userAgent = (await headers()).get('user-agent');
  const label = deviceLabel(userAgent);

  const existing = await admin
    .from('user_devices')
    .select('id')
    .eq('user_id', input.userId)
    .eq('device_hash', device.hash)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const knownDeviceId = existing.data?.id ?? null;
  const newDevice = knownDeviceId === null;
  if (newDevice) {
    const created = await admin.from('user_devices').insert({
      user_id: input.userId,
      company_id: input.companyId,
      device_hash: device.hash,
      label,
      last_ip_masked: meta.ipMasked,
    });
    if (created.error) throw new InternalError(created.error);
  } else {
    await admin
      .from('user_devices')
      .update({ last_seen_at: new Date().toISOString(), last_ip_masked: meta.ipMasked, label })
      .eq('id', knownDeviceId);
  }

  const inserted = await admin
    .from('user_sessions')
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      auth_session_id: input.authSessionId,
      device_hash: device.hash,
      ip_masked: meta.ipMasked,
      ip_hash: meta.ipHash,
      user_agent_label: label,
      aal: input.aal,
      expires_at: sessionExpiry(new Date(), input.rememberMe).toISOString(),
      impersonated_by: input.impersonatedBy ?? null,
    })
    .select('id')
    .single();
  if (inserted.error) throw new InternalError(inserted.error);

  if (newDevice) {
    await recordLoginEvent({
      identifierHash: input.identifier,
      type: 'new_device',
      userId: input.userId,
      companyId: input.companyId,
      deviceHash: device.hash,
    });
    await tryGetService('events')
      ?.publish({
        name: 'auth.new_device',
        companyId: input.companyId,
        payload: { userId: input.userId, device: label },
      })
      .catch(() => undefined);
    const email = tryGetService('email');
    if (email) {
      await email.send({
        template: 'auth.new-device',
        to: input.email,
        companyId: input.companyId,
        data: {
          device: label,
          network: meta.ipMasked ?? 'unknown',
          time: new Date().toISOString(),
        },
        idempotencyKey: `newdev-${String(inserted.data.id).replace(/-/g, '')}`,
      });
    }
  }
  return { newDevice, sessionId: String(inserted.data.id) };
}
