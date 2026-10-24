// path: services/security/admin-ops.ts
// Administration of the network controls: whitelist, address blocks and the recent security events.
import 'server-only';
import { isIP } from 'node:net';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { maskIp } from '@/services/audit/mask-ip';
import { hashIp } from '@/services/audit/request-meta';
import type { Actor } from '@/types/contracts';

export const whitelistSchema = z
  .object({ cidr: z.string().trim().min(7).max(64), note: z.string().trim().max(300).default('') })
  .strict();
export const blockSchema = z
  .object({
    ip: z.string().trim().min(2).max(64),
    reason: z.string().trim().min(3).max(200),
    hours: z.number().int().min(1).max(8760).nullable().default(24),
    permanent: z.boolean().default(false),
  })
  .strict();
export const idSchema = z.object({ id: z.string().uuid() }).strict();
export const unblockSchema = z.object({ ipHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export interface SecurityOverview {
  provider: string;
  providerConfigured: boolean;
  whitelist: { id: string; cidr: string; note: string; createdAt: string }[];
  blocks: {
    ipHash: string;
    ipMasked: string | null;
    reason: string;
    blockedUntil: string | null;
    permanent: boolean;
  }[];
  events: {
    id: string;
    type: string;
    severity: string;
    source: string;
    ipMasked: string | null;
    createdAt: string;
  }[];
}

export async function overview(): Promise<SecurityOverview> {
  const admin = getAdminSupabase();
  const env = getServerEnv();
  const [white, blocks, events] = await Promise.all([
    admin
      .from('ip_reputation')
      .select('id, cidr, note, created_at')
      .eq('kind', 'whitelist')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('ip_blocks')
      .select('ip_hash, ip_masked, reason, blocked_until, permanent')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('security_events')
      .select('id, event_type, severity, source, ip_masked, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  for (const part of [white, blocks, events]) if (part.error) throw new InternalError(part.error);
  return {
    provider: env.NETWORK_INTEL_PROVIDER,
    providerConfigured: env.NETWORK_INTEL_PROVIDER !== 'none' && Boolean(env.NETWORK_INTEL_API_KEY),
    whitelist: (white.data ?? []).map((r) => ({
      id: String(r.id),
      cidr: String(r.cidr),
      note: String(r.note),
      createdAt: String(r.created_at),
    })),
    blocks: (blocks.data ?? []).map((r) => ({
      ipHash: String(r.ip_hash),
      ipMasked: r.ip_masked ? String(r.ip_masked) : null,
      reason: String(r.reason),
      blockedUntil: r.blocked_until ? String(r.blocked_until) : null,
      permanent: r.permanent === true,
    })),
    events: (events.data ?? []).map((r) => ({
      id: String(r.id),
      type: String(r.event_type),
      severity: String(r.severity),
      source: String(r.source),
      ipMasked: r.ip_masked ? String(r.ip_masked) : null,
      createdAt: String(r.created_at),
    })),
  };
}

export async function addWhitelist(
  actor: Actor,
  input: z.infer<typeof whitelistSchema>,
): Promise<string> {
  const { data, error } = await getAdminSupabase().rpc('kd_whitelist_add', {
    p_cidr: input.cidr,
    p_note: input.note,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        'Enter a valid network such as 203.0.113.0/24 (not wider than /8 for IPv4 or /32 for IPv6).',
      );
    throw new InternalError(error);
  }
  const id = z.string().uuid().parse(data);
  await getService('audit').record({
    action: 'security.whitelist_added',
    resourceType: 'ip_whitelist',
    resourceId: id,
    companyId: null,
    metadata: { cidr: input.cidr },
  });
  return id;
}

export async function removeWhitelist(id: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('ip_reputation')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kind', 'whitelist')
    .is('deleted_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'security.whitelist_removed',
    resourceType: 'ip_whitelist',
    resourceId: id,
    companyId: null,
  });
}

export async function addBlock(actor: Actor, input: z.infer<typeof blockSchema>): Promise<string> {
  if (isIP(input.ip) === 0) throw new ValidationError('Enter a valid IP address.');
  const hash = await hashIp(input.ip);
  const { error } = await getAdminSupabase().rpc('kd_ip_block', {
    p_ip_hash: hash,
    p_ip_masked: maskIp(input.ip),
    p_reason: input.reason,
    p_seconds: (input.hours ?? 24) * 3600,
    p_permanent: input.permanent,
    p_by: actor.userId,
  });
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'security.ip_blocked',
    resourceType: 'ip_block',
    resourceId: null,
    companyId: null,
    metadata: { masked: maskIp(input.ip), permanent: input.permanent },
  });
  return hash;
}

export async function removeBlock(ipHash: string): Promise<void> {
  const { data, error } = await getAdminSupabase().rpc('kd_ip_unblock', { p_ip_hash: ipHash });
  if (error) throw new InternalError(error);
  if (data !== true) throw new NotFoundError();
  await getService('audit').record({
    action: 'security.ip_unblocked',
    resourceType: 'ip_block',
    resourceId: null,
    companyId: null,
  });
}
