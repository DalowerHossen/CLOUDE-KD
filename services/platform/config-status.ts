// path: services/platform/config-status.ts
// Which settings of the server are configured. Names and state only: a value is never read into the answer, so nothing
// secret can leak through this screen. Secrets are changed where the site runs (the host's environment settings), not here.
import 'server-only';
import { serverSchema } from '@/lib/env/schema.generated';

export interface ConfigItem {
  name: string;
  required: boolean;
  set: boolean;
}

export interface ConfigGroup {
  group: string;
  items: ConfigItem[];
}

const GROUPS: readonly { group: string; test: RegExp }[] = [
  { group: 'Database and sign-in', test: /^(SUPABASE|DATABASE|AUTH|SESSION|NEXTAUTH|JWT|CRON)/ },
  { group: 'E-mail', test: /^(SMTP|EMAIL|MAIL)/ },
  { group: 'Payments', test: /^(STRIPE|PAYPAL|ADYEN|NMI|SQUARE|RAPYD|PAYMENT|PROCESSOR|PAYOUT)/ },
  { group: 'Security', test: /^(TURNSTILE|NETWORK|ENCRYPTION|CSRF|KMS|HMAC|PEPPER)/ },
  { group: 'Social and messaging', test: /^(META|WHATSAPP|GOOGLE|FACEBOOK|INSTAGRAM)/ },
  { group: 'Monitoring', test: /^(SENTRY|LOG|SIEM|ALERT)/ },
];

function groupOf(name: string): string {
  return GROUPS.find((g) => g.test.test(name))?.group ?? 'Other';
}

export function configStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ConfigGroup[] {
  const shape = serverSchema.shape as Record<
    string,
    { safeParse: (v: unknown) => { success: boolean } }
  >;
  const byGroup = new Map<string, ConfigItem[]>();
  for (const [name, field] of Object.entries(shape)) {
    const item: ConfigItem = {
      name,
      required: !field.safeParse(undefined).success,
      set: typeof env[name] === 'string' && env[name] !== '',
    };
    const g = groupOf(name);
    byGroup.set(g, [...(byGroup.get(g) ?? []), item]);
  }
  return [...byGroup.entries()]
    .map(([group, items]) => ({ group, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.group.localeCompare(b.group));
}
