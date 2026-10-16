// path: lib/email/dns.ts
// SPF, DKIM and DMARC evaluation from DNS text records (features 470, 471, 472, 476-478). Pure: the records are passed in.
export interface DnsFinding {
  ok: boolean;
  detail: string;
}

export interface DomainReport {
  domain: string;
  spf: DnsFinding;
  dkim: DnsFinding & { selector: string | null };
  dmarc: DnsFinding & { policy: 'none' | 'quarantine' | 'reject' | null };
  /** 0 to 100. */
  score: number;
}

/** What a provider asks for in the sender's SPF record and where its DKIM keys live. */
export const PROVIDER_DNS: Readonly<
  Record<string, { spfInclude: string; dkimSelectors: readonly string[] }>
> = {
  ses: { spfInclude: 'amazonses.com', dkimSelectors: [] },
  resend: { spfInclude: 'amazonses.com', dkimSelectors: ['resend'] },
  sendgrid: { spfInclude: 'sendgrid.net', dkimSelectors: ['s1', 's2'] },
  mailgun: { spfInclude: 'mailgun.org', dkimSelectors: ['mailo', 'krs', 'smtp', 'k1', 'mg'] },
  postmark: { spfInclude: 'spf.mtasv.net', dkimSelectors: ['20240101pm', 'pm'] },
  brevo: { spfInclude: 'spf.brevo.com', dkimSelectors: ['mail', 'brevo1', 'brevo2'] },
  sparkpost: { spfInclude: 'sparkpostmail.com', dkimSelectors: ['scph0121', 'sparkpost'] },
  google: { spfInclude: '_spf.google.com', dkimSelectors: ['google'] },
  microsoft365: {
    spfInclude: 'spf.protection.outlook.com',
    dkimSelectors: ['selector1', 'selector2'],
  },
  zoho: { spfInclude: 'zoho.com', dkimSelectors: ['zoho', 'zmail'] },
  smtp: {
    spfInclude: '',
    dkimSelectors: ['default', 'mail', 'dkim', 'selector1', 'k1', 's1', 'smtp'],
  },
};

const joined = (record: string[]): string => record.join('');

export function evaluateSpf(records: string[][], include: string): DnsFinding {
  const spf = records.map(joined).filter((r) => /^v=spf1\s/i.test(r.trim()));
  if (spf.length === 0)
    return { ok: false, detail: 'No SPF record. Add a TXT record that starts with v=spf1.' };
  if (spf.length > 1) return { ok: false, detail: 'More than one SPF record. Keep only one.' };
  const record = spf[0]?.trim() ?? '';
  if (/\s\+all\b|\s\?all\b/i.test(record))
    return { ok: false, detail: 'The SPF record allows every sender (+all or ?all).' };
  if (
    include &&
    !new RegExp(
      `(^|\\s)include:${include.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`,
      'i',
    ).test(record)
  ) {
    return { ok: false, detail: `The SPF record does not include ${include}.` };
  }
  const lookups = (record.match(/\b(include:|a\b|mx\b|ptr\b|exists:|redirect=)/gi) ?? []).length;
  if (lookups > 10)
    return {
      ok: false,
      detail: 'The SPF record needs more than 10 DNS lookups, which receivers reject.',
    };
  return { ok: true, detail: 'SPF is set.' };
}

export function evaluateDkim(
  found: { selector: string; records: string[][] }[],
): DnsFinding & { selector: string | null } {
  for (const f of found) {
    const text = f.records.map(joined).join('');
    if (/v=DKIM1/i.test(text) && /p=[A-Za-z0-9+/=]{20,}/.test(text))
      return {
        ok: true,
        selector: f.selector,
        detail: `A DKIM key was found for the selector ${f.selector}.`,
      };
  }
  return {
    ok: false,
    selector: null,
    detail:
      'No DKIM key was found for the usual selectors. Add the DKIM records your provider shows.',
  };
}

export function evaluateDmarc(
  records: string[][],
): DnsFinding & { policy: 'none' | 'quarantine' | 'reject' | null } {
  const dmarc = records.map(joined).filter((r) => /^v=DMARC1/i.test(r.trim()));
  if (dmarc.length === 0)
    return {
      ok: false,
      policy: null,
      detail: 'No DMARC record. Add a TXT record at _dmarc with v=DMARC1; p=none to start.',
    };
  const policy = /\bp=(none|quarantine|reject)\b/i.exec(dmarc[0] ?? '')?.[1]?.toLowerCase() as
    'none' | 'quarantine' | 'reject' | undefined;
  if (!policy)
    return { ok: false, policy: null, detail: 'The DMARC record has no valid policy (p=).' };
  return {
    ok: true,
    policy,
    detail:
      policy === 'none'
        ? 'DMARC is set in monitoring mode. Move to quarantine or reject once reports look clean.'
        : `DMARC policy is ${policy}.`,
  };
}

/** SPF 40, DKIM 30, DMARC 15, a policy of quarantine or reject 15 more. */
export function scoreReport(
  spf: DnsFinding,
  dkim: DnsFinding,
  dmarc: { ok: boolean; policy: string | null },
): number {
  return (
    (spf.ok ? 40 : 0) +
    (dkim.ok ? 30 : 0) +
    (dmarc.ok ? 15 : 0) +
    (dmarc.policy === 'quarantine' || dmarc.policy === 'reject' ? 15 : 0)
  );
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

/** A registrable-looking domain name: labels, at least one dot, no address literal. */
export function isValidDomain(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.length < 4 || v.length > 253 || /^\d+(\.\d+){3}$/.test(v)) return false;
  const labels = v.split('.');
  return (
    labels.length >= 2 &&
    labels.every((l) => LABEL.test(l)) &&
    /^[a-z]{2,}$/.test(labels[labels.length - 1] ?? '')
  );
}
