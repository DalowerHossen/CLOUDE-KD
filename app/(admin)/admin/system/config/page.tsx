// path: app/(admin)/admin/system/config/page.tsx
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { configStatus } from '@/services/platform/config-status';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Configuration' };

const p = (k: string): string => t(`s16System.system.${k}` as never);

export default async function ConfigPage(): Promise<JSX.Element> {
  await requirePagePermission('system.read', 'platform', 'platform');
  const groups = configStatus();
  return (
    <div className="space-y-sp-16">
      <PageHeader title={p('configTitle')} description={p('configDescription')} />
      {groups.map((g) => (
        <section key={g.group} className="space-y-sp-8">
          <h2 className="text-h4 font-semibold">{g.group}</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {g.items.map((i) => (
              <li
                key={i.name}
                className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
              >
                <code className="break-all">{i.name}</code>
                <span className="flex gap-sp-8">
                  <Badge variant="outline">{i.required ? p('required') : p('optional')}</Badge>
                  <Badge variant={i.set || !i.required ? 'outline' : 'destructive'}>
                    {i.set ? p('set') : p('missing')}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
