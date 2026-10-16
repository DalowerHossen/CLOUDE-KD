// path: lib/security/network/types.ts
export interface NetworkSignals {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  datacenter: boolean;
  residentialProxy: boolean;
  /** 0 (clean) to 100 (high risk) as reported by the provider, or null when the provider gives none. */
  providerScore: number | null;
  countryCode: string | null;
}

export const EMPTY_SIGNALS: NetworkSignals = {
  vpn: false,
  proxy: false,
  tor: false,
  datacenter: false,
  residentialProxy: false,
  providerScore: null,
  countryCode: null,
};

export interface NetworkProvider {
  readonly name: 'ipqualityscore' | 'maxmind';
  lookup(ip: string): Promise<NetworkSignals>;
}
