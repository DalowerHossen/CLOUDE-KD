// path: services/security/network-service.ts
// checkNetwork (security contract): whitelist, address blocks, cached reputation, Tor exit list, provider lookup and the
// context policy of REQ-NETWORK. Unreachable providers block signup, payment, KYC and admin (fail closed).
import 'server-only';
import { isIP } from 'node:net';
import { NETWORK_FAIL_CLOSED, REPUTATION_TTL_SECONDS } from '@/config/security';
import { getServerEnv } from '@/lib/env';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { evaluateNetwork } from '@/lib/security/network/evaluate';
import { createIpqsProvider, createMaxmindProvider } from '@/lib/security/network/providers';
import {
  EMPTY_SIGNALS,
  type NetworkProvider,
  type NetworkSignals,
} from '@/lib/security/network/types';
import { isNonPublicIp } from '@/lib/security/ip';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { maskIp } from '@/services/audit/mask-ip';
import { hashIp } from '@/services/audit/request-meta';
import type { NetworkCheckResult, NetworkContext } from '@/types/contracts';
import { blockedCountryCodes } from '@/services/compliance/countries';
import { raiseEvent } from './events';
import { isIpBlocked } from './rate-limit';

const log = createLogger({ component: 'network' });

function provider(): NetworkProvider | null {
  const env = getServerEnv();
  if (!env.NETWORK_INTEL_API_KEY) return null;
  if (env.NETWORK_INTEL_PROVIDER === 'ipqualityscore')
    return createIpqsProvider(env.NETWORK_INTEL_API_KEY);
  if (env.NETWORK_INTEL_PROVIDER === 'maxmind')
    return createMaxmindProvider(env.NETWORK_INTEL_API_KEY);
  return null;
}

interface Cached {
  kind: string;
  score: number;
  flags: Partial<NetworkSignals>;
  countryCode: string | null;
}

async function readCache(ipHash: string): Promise<Cached | null> {
  const { data, error } = await getAdminSupabase().rpc('kd_reputation_get', { p_ip_hash: ipHash });
  if (error) throw new InternalError(error);
  if (data === null || typeof data !== 'object') return null;
  const row = data as {
    kind: string;
    score: number;
    flags: Partial<NetworkSignals>;
    countryCode: string | null;
  };
  return row;
}

function fromCache(c: Cached): NetworkSignals {
  return {
    ...EMPTY_SIGNALS,
    vpn: c.flags.vpn === true,
    proxy: c.flags.proxy === true,
    tor: c.kind === 'tor_exit' || c.flags.tor === true,
    datacenter: c.flags.datacenter === true,
    residentialProxy: c.flags.residentialProxy === true,
    providerScore: c.score,
    countryCode: c.countryCode,
  };
}

async function lookupSignals(
  ip: string,
  ipHash: string,
): Promise<{ signals: NetworkSignals; failed: boolean }> {
  const cached = await readCache(ipHash);
  if (cached) return { signals: fromCache(cached), failed: false };
  const active = provider();
  // Without a provider no VPN, proxy or country signal exists. In production that is a setup error, so the sensitive
  // contexts are refused (fail closed) instead of letting every request pass unchecked.
  if (!active) return { signals: EMPTY_SIGNALS, failed: getServerEnv().APP_ENV === 'production' };
  try {
    const signals = await active.lookup(ip);
    await getAdminSupabase().rpc('kd_reputation_put', {
      p_ip_hash: ipHash,
      p_score: signals.providerScore ?? 0,
      p_flags: {
        vpn: signals.vpn,
        proxy: signals.proxy,
        tor: signals.tor,
        datacenter: signals.datacenter,
        residentialProxy: signals.residentialProxy,
      },
      p_country: signals.countryCode ?? '',
      p_source: active.name,
      p_ttl_seconds: REPUTATION_TTL_SECONDS,
    });
    return { signals, failed: false };
  } catch (error) {
    log.error('network intelligence provider failed', { provider: active.name, error });
    return { signals: EMPTY_SIGNALS, failed: true };
  }
}

export async function checkNetwork(
  ip: string,
  context: NetworkContext,
): Promise<NetworkCheckResult> {
  const production = getServerEnv().APP_ENV === 'production';
  const valid = isIP(ip) !== 0 && ip !== '0.0.0.0' && !isNonPublicIp(ip);
  if (!valid) {
    // Local and private addresses are normal in development. In production an address like this means the proxy
    // chain is wrong, so the sensitive contexts are refused.
    const refuse = production && NETWORK_FAIL_CLOSED.includes(context);
    const result = evaluateNetwork({
      context,
      signals: EMPTY_SIGNALS,
      whitelisted: false,
      ipBlocked: false,
      providerFailed: production,
      failClosedContexts: NETWORK_FAIL_CLOSED,
    });
    if (refuse) await raiseEvent('network_blocked', { context, reason: 'address_unknown' });
    return refuse
      ? { ...result, allowed: false, reason: 'address_unknown' }
      : { ...result, allowed: true, reason: result.reason ?? null };
  }

  const admin = getAdminSupabase();
  const ipHash = await hashIp(ip);
  const white = await admin.rpc('kd_network_whitelisted', { p_ip: ip });
  if (white.error) throw new InternalError(white.error);
  const blocked = white.data === true ? false : await isIpBlocked(ipHash);
  let looked: { signals: NetworkSignals; failed: boolean } = {
    signals: EMPTY_SIGNALS,
    failed: false,
  };
  if (white.data !== true && !blocked) looked = await lookupSignals(ip, ipHash);

  const result = evaluateNetwork({
    context,
    signals: looked.signals,
    whitelisted: white.data === true,
    ipBlocked: blocked,
    providerFailed: looked.failed,
    failClosedContexts: NETWORK_FAIL_CLOSED,
    extraBlockedCountries: await blockedCountryCodes(),
  });
  if (!result.allowed)
    await raiseEvent('network_blocked', {
      context,
      reason: result.reason,
      countryCode: result.countryCode,
      masked: maskIp(ip),
    });
  return result;
}
