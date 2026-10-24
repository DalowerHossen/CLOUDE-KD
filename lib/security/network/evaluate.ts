// path: lib/security/network/evaluate.ts
// Policy decision of the network check (REQ-NETWORK): block anonymizing networks on signup, payment, KYC and admin;
// flag them on login and elsewhere. Pure function: the service gathers the inputs.
import { COUNTRY_BLOCKLIST, GEO_FENCE, NETWORK_POLICY } from '@/config/security';
import type { NetworkCheckResult, NetworkContext } from '@/types/contracts';
import type { NetworkSignals } from './types';

export function riskFromSignals(s: NetworkSignals): number {
  let score = s.providerScore ?? 0;
  if (s.tor) score = Math.max(score, 100);
  if (s.vpn) score = Math.max(score, 80);
  if (s.proxy) score = Math.max(score, 80);
  if (s.residentialProxy) score = Math.max(score, 70);
  if (s.datacenter) score = Math.max(score, 60);
  return Math.min(100, score);
}

export interface EvaluateInput {
  context: NetworkContext;
  signals: NetworkSignals;
  whitelisted: boolean;
  ipBlocked: boolean;
  /** True when no provider answer could be obtained (provider down or not configured and no cache). */
  providerFailed: boolean;
  failClosedContexts: readonly NetworkContext[];
  /** Countries a platform admin switched on at run time (config COUNTRY_BLOCKLIST is the fixed part). */
  extraBlockedCountries?: readonly string[];
}

function result(
  signals: NetworkSignals,
  allowed: boolean,
  reason: string | null,
): NetworkCheckResult {
  return {
    vpn: signals.vpn,
    proxy: signals.proxy,
    tor: signals.tor,
    datacenter: signals.datacenter,
    countryCode: signals.countryCode,
    score: riskFromSignals(signals),
    allowed,
    reason,
  };
}

export function evaluateNetwork(input: EvaluateInput): NetworkCheckResult {
  const { signals, context } = input;
  if (input.whitelisted) return result(signals, true, 'whitelisted');
  if (input.ipBlocked) return result(signals, false, 'address_blocked');
  const country = signals.countryCode;
  if (
    country &&
    (COUNTRY_BLOCKLIST.includes(country) || input.extraBlockedCountries?.includes(country))
  )
    return result(signals, false, 'country_blocked');
  const fence = GEO_FENCE[context];
  if (fence && fence.length > 0 && (!country || !fence.includes(country)))
    return result(signals, false, 'outside_allowed_countries');

  const anonymizing =
    signals.tor || signals.vpn || signals.proxy || signals.datacenter || signals.residentialProxy;
  if (anonymizing) {
    // Tor is never allowed where the policy is "block"; a flag-only context lets the person continue with extra checks.
    return NETWORK_POLICY[context] === 'block'
      ? result(signals, false, 'anonymizing_network')
      : result(signals, true, 'flagged_anonymizing_network');
  }
  if (input.providerFailed && input.failClosedContexts.includes(context))
    return result(signals, false, 'provider_unavailable');
  return result(signals, true, null);
}
