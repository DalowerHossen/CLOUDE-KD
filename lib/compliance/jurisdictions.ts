// path: lib/compliance/jurisdictions.ts
// Privacy law catalogue: response deadline for data subject requests and the default data region.
export const DATA_REGIONS = ['global', 'us', 'eu', 'sg', 'in', 'jp'] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];

export interface JurisdictionRule {
  code: string;
  law: string;
  /** Calendar days to answer a data subject request. */
  dsarDays: number;
  defaultRegion: DataRegion;
}

export const JURISDICTIONS: readonly JurisdictionRule[] = [
  { code: 'global', law: 'Platform default', dsarDays: 30, defaultRegion: 'global' },
  { code: 'EU', law: 'GDPR (European Union)', dsarDays: 30, defaultRegion: 'eu' },
  { code: 'US-CA', law: 'CCPA / CPRA (California)', dsarDays: 45, defaultRegion: 'us' },
  { code: 'BR', law: 'LGPD (Brazil)', dsarDays: 15, defaultRegion: 'global' },
  { code: 'SG', law: 'PDPA (Singapore)', dsarDays: 30, defaultRegion: 'sg' },
  { code: 'TH', law: 'PDPA (Thailand)', dsarDays: 30, defaultRegion: 'global' },
  { code: 'CA', law: 'PIPEDA (Canada)', dsarDays: 30, defaultRegion: 'us' },
  { code: 'JP', law: 'APPI (Japan)', dsarDays: 30, defaultRegion: 'jp' },
  {
    code: 'IN',
    law: 'Digital Personal Data Protection (India)',
    dsarDays: 30,
    defaultRegion: 'in',
  },
  { code: 'ZA', law: 'POPIA (South Africa)', dsarDays: 30, defaultRegion: 'global' },
  { code: 'AE', law: 'DIFC Data Protection (UAE)', dsarDays: 30, defaultRegion: 'global' },
  { code: 'CN', law: 'PIPL (China)', dsarDays: 15, defaultRegion: 'global' },
];

export function jurisdictionRule(code: string): JurisdictionRule | undefined {
  return JURISDICTIONS.find((j) => j.code === code);
}

export function isJurisdiction(code: string): boolean {
  return jurisdictionRule(code) !== undefined;
}

/** Due date (UTC) of a request received at `from`. Unknown jurisdictions use the platform default. */
export function dsarDueDate(jurisdiction: string, from: Date): Date {
  const days = (jurisdictionRule(jurisdiction) ?? JURISDICTIONS[0])?.dsarDays ?? 30;
  return new Date(from.getTime() + days * 86_400_000);
}
