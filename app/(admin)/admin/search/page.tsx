// path: app/(admin)/admin/search/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { MAX_SEARCH, searchQuery } from '@/lib/platform/global-search';
import { requirePagePermission } from '@/services/base/page-guard';
import { globalSearch, type SearchResult } from '@/services/platform/global-search';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search' };

const p = (k: string): string => t(`s16System.search.${k}` as never);
const KINDS = ['company', 'user', 'client', 'invoice', 'payment', 'ticket'] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('people.read', 'platform', 'user');
  const raw = (await searchParams).q;
  const parsed = searchQuery.safeParse({ q: Array.isArray(raw) ? raw[0] : (raw ?? '') });
  let result: SearchResult | null = null;
  let failed = false;
  if (parsed.success) {
    try {
      result = await globalSearch(actor, parsed.data.q);
    } catch {
      failed = true;
    }
  }
  const q = parsed.success ? parsed.data.q : '';
  return (
    <div className="space-y-sp-16">
      <PageHeader title={p('title')} description={p('description')} />
      <form
        action="/admin/search"
        method="get"
        role="search"
        className="flex flex-col gap-sp-8 sm:flex-row"
      >
        <Input
          name="q"
          defaultValue={q}
          maxLength={MAX_SEARCH}
          placeholder={p('placeholder')}
          aria-label={p('title')}
        />
        <Button type="submit">{p('go')}</Button>
      </form>
      {failed ? <ErrorState description={p('error')} /> : null}
      {!parsed.success && raw ? (
        <p className="text-sm text-muted-foreground">{p('short')}</p>
      ) : null}
      {result ? (
        result.hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p('none')}</p>
        ) : (
          KINDS.map((kind) => {
            const rows = result.hits.filter((h) => h.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind} className="space-y-sp-8">
                <h2 className="text-h4 font-semibold">{p(kind)}</h2>
                <ul className="divide-y rounded-lg border bg-card text-sm">
                  {rows.map((h) => (
                    <li
                      key={`${h.kind}-${h.id}`}
                      className="flex flex-wrap items-center justify-between gap-sp-8 p-sp-12"
                    >
                      <span className="min-w-0 break-words">
                        {h.href ? (
                          <Link className="underline" href={h.href}>
                            {h.title}
                          </Link>
                        ) : (
                          h.title
                        )}
                        <span className="block text-muted-foreground">{h.detail}</span>
                      </span>
                      {h.companyId && h.kind !== 'company' ? (
                        <Link
                          className="text-muted-foreground underline"
                          href={`/admin/tenants/${h.companyId}`}
                        >
                          {h.companyName || p('company')}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )
      ) : null}
      {result && result.failedKinds.length > 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {p('partial')}: {result.failedKinds.join(', ')}
        </p>
      ) : null}
    </div>
  );
}
