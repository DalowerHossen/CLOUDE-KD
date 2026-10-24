// path: services/email/dns-check.ts
// SPF, DKIM and DMARC check of a sending domain through DNS.
import 'server-only';
import { resolveTxt } from 'node:dns/promises';
import { ValidationError } from '@/lib/errors';
import {
  PROVIDER_DNS,
  evaluateDkim,
  evaluateDmarc,
  evaluateSpf,
  isValidDomain,
  scoreReport,
  type DomainReport,
} from '@/lib/email/dns';

async function txt(name: string): Promise<string[][]> {
  try {
    return await resolveTxt(name);
  } catch {
    return [];
  }
}

export async function checkDomain(domain: string, providerKey: string): Promise<DomainReport> {
  const clean = domain.trim().toLowerCase();
  if (!isValidDomain(clean)) throw new ValidationError('Enter a domain name such as example.com.');
  const dns = PROVIDER_DNS[providerKey] ?? PROVIDER_DNS.smtp;
  const selectors = dns?.dkimSelectors ?? [];
  const [spfRecords, dmarcRecords, dkimFound] = await Promise.all([
    txt(clean),
    txt(`_dmarc.${clean}`),
    Promise.all(
      selectors.map(async (selector) => ({
        selector,
        records: await txt(`${selector}._domainkey.${clean}`),
      })),
    ),
  ]);
  const spf = evaluateSpf(spfRecords, dns?.spfInclude ?? '');
  const dkim = evaluateDkim(dkimFound);
  const dmarc = evaluateDmarc(dmarcRecords);
  return { domain: clean, spf, dkim, dmarc, score: scoreReport(spf, dkim, dmarc) };
}
