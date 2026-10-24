// path: lib/security/network/providers.ts
// Provider adapters for VPN, proxy and Tor detection. The parse functions are pure so they can be checked without a
// network. Request URL and authentication of both providers follow their published web services; confirm them on the
// provider pages when the key is set up (DECISIONS D5 of STEP 04).
import { z } from 'zod';
import { EMPTY_SIGNALS, type NetworkProvider, type NetworkSignals } from './types';

const TIMEOUT_MS = 3000;

const ipqsSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    fraud_score: z.number().optional(),
    country_code: z.string().optional(),
    proxy: z.boolean().optional(),
    vpn: z.boolean().optional(),
    tor: z.boolean().optional(),
    active_vpn: z.boolean().optional(),
    active_tor: z.boolean().optional(),
    recent_abuse: z.boolean().optional(),
    connection_type: z.string().optional(),
  })
  .passthrough();

export function parseIpqs(json: unknown): NetworkSignals {
  const d = ipqsSchema.parse(json);
  if (d.success === false) throw new Error(d.message ?? 'provider refused the request');
  const country =
    d.country_code && /^[A-Za-z]{2}$/.test(d.country_code) ? d.country_code.toUpperCase() : null;
  return {
    ...EMPTY_SIGNALS,
    vpn: d.vpn === true || d.active_vpn === true,
    proxy: d.proxy === true,
    tor: d.tor === true || d.active_tor === true,
    datacenter: d.connection_type === 'Data Center',
    providerScore:
      typeof d.fraud_score === 'number'
        ? Math.min(100, Math.max(0, Math.round(d.fraud_score)))
        : null,
    countryCode: country,
  };
}

const maxmindSchema = z
  .object({
    country: z.object({ iso_code: z.string().optional() }).passthrough().optional(),
    traits: z
      .object({
        is_anonymous: z.boolean().optional(),
        is_anonymous_vpn: z.boolean().optional(),
        is_hosting_provider: z.boolean().optional(),
        is_public_proxy: z.boolean().optional(),
        is_residential_proxy: z.boolean().optional(),
        is_tor_exit_node: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function parseMaxmind(json: unknown): NetworkSignals {
  const d = maxmindSchema.parse(json);
  const t = d.traits ?? {};
  const iso = d.country?.iso_code;
  return {
    ...EMPTY_SIGNALS,
    vpn: t.is_anonymous_vpn === true,
    proxy:
      t.is_public_proxy === true ||
      t.is_residential_proxy === true ||
      (t.is_anonymous === true &&
        t.is_anonymous_vpn !== true &&
        t.is_tor_exit_node !== true &&
        t.is_hosting_provider !== true),
    tor: t.is_tor_exit_node === true,
    datacenter: t.is_hosting_provider === true,
    residentialProxy: t.is_residential_proxy === true,
    countryCode: iso && /^[A-Za-z]{2}$/.test(iso) ? iso.toUpperCase() : null,
  };
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`provider answered ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function createIpqsProvider(apiKey: string): NetworkProvider {
  return {
    name: 'ipqualityscore',
    async lookup(ip) {
      const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(apiKey)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
      return parseIpqs(await getJson(url, {}));
    },
  };
}

/** `credential` is "accountId:licenseKey". */
export function createMaxmindProvider(credential: string): NetworkProvider {
  return {
    name: 'maxmind',
    async lookup(ip) {
      const auth = Buffer.from(credential).toString('base64');
      return parseMaxmind(
        await getJson(`https://geoip.maxmind.com/geoip/v2.1/insights/${encodeURIComponent(ip)}`, {
          authorization: `Basic ${auth}`,
        }),
      );
    },
  };
}
