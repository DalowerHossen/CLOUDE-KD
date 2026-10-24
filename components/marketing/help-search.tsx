// path: components/marketing/help-search.tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { Illustration } from './art/illustrations';

export interface HelpListItem {
  slug: string;
  title: string;
  description: string;
  category: string;
}

/** Search box and article list of the help center. Filters the list in the browser; no query leaves the page. */
export function HelpSearch({
  groups,
}: {
  groups: { key: string; name: string; text: string; articles: HelpListItem[] }[];
}): JSX.Element {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      articles: g.articles.filter(
        (a) => !needle || `${a.title} ${a.description}`.toLowerCase().includes(needle),
      ),
    }))
    .filter((g) => g.articles.length > 0);
  return (
    <div className="space-y-sp-24">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-xl">
        <label className="sr-only" htmlFor="help-q">
          {t('s06Public.help.search')}
        </label>
        <Input
          id="help-q"
          type="search"
          value={query}
          maxLength={80}
          placeholder={t('s06Public.help.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <p aria-live="polite" className="sr-only">
        {t('s06Public.help.results', { count: shown.reduce((n, g) => n + g.articles.length, 0) })}
      </p>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Illustration kind="search" />
          <p>{t('s06Public.help.none')}</p>
        </div>
      ) : (
        shown.map((g) => (
          <section key={g.key} aria-labelledby={`cat-${g.key}`} className="space-y-sp-12">
            <h2 id={`cat-${g.key}`} className="text-h3 font-semibold">
              {g.name}
            </h2>
            {g.text ? <p className="text-muted-foreground">{g.text}</p> : null}
            <ul className="grid gap-sp-12 md:grid-cols-2">
              {g.articles.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/${a.slug}`}
                    className="block h-full rounded-lg border bg-card p-sp-16 hover:bg-muted/50"
                  >
                    <span className="font-medium">{a.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {a.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
