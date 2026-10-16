// path: scripts/verify/step06-seo.ts
// Checks of the search-engine layer of STEP 06 that need no database or network. Run: npx tsx scripts/verify/step06-seo.ts
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { PRIVATE_PREFIXES } from '@/config/seo';
import { DEFAULT_PAGES, LEGAL_PAGES, pathOf } from '@/lib/cms/defaults';
import { pageContentSchema } from '@/lib/cms/blocks';
import {
  article,
  breadcrumbs,
  faqPage,
  itemList,
  jobPosting,
  organization,
  softwareApplication,
  toScriptText,
  webSite,
} from '@/lib/seo/jsonld';
import { pageJsonLd } from '@/lib/seo/page-jsonld';
import { EMPTY_SEO_SETTINGS, seoSettingsSchema } from '@/lib/seo/settings';

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    process.stdout.write(`ok    ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

const ORIGIN = 'https://example.test';

async function main(): Promise<void> {
  await check('the eight structured-data types are built with the right type and fields', () => {
    const settings = {
      ...EMPTY_SEO_SETTINGS,
      social: { ...EMPTY_SEO_SETTINGS.social, x: 'https://x.com/example' },
    };
    const built = {
      Organization: organization(ORIGIN, settings),
      WebSite: webSite(ORIGIN),
      BreadcrumbList: breadcrumbs(ORIGIN, [
        { name: 'Home', path: '/' },
        { name: 'Pricing', path: '/pricing' },
      ]),
      Article: article(ORIGIN, {
        slug: 'a-post',
        title: 'A post',
        description: 'About a post',
        publishedAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
        authorName: 'Jane',
        coverUrl: null,
      }),
      FAQPage: faqPage([{ question: 'Why?', answer: 'Because.' }]),
      SoftwareApplication: softwareApplication(ORIGIN),
      JobPosting: jobPosting(
        ORIGIN,
        { title: 'Engineer', text: 'Build', location: 'Remote', type: 'Full time' },
        '2026-10-01',
      ),
      ItemList: itemList(ORIGIN, [{ name: 'One', path: '/blog/one' }]),
    };
    assert.equal(Object.keys(built).length, 8);
    for (const [type, data] of Object.entries(built)) {
      assert.equal(data['@context'], 'https://schema.org', type);
      assert.equal(data['@type'], type);
      assert.ok(!JSON.stringify(data).includes('undefined'), type);
    }
    assert.deepEqual((built.Organization as { sameAs?: string[] }).sameAs, [
      'https://x.com/example',
    ]);
    assert.ok(!('offers' in built.SoftwareApplication), 'no invented price');
    const crumbs = built.BreadcrumbList.itemListElement as { position: number; item: string }[];
    assert.deepEqual(
      crumbs.map((c) => c.position),
      [1, 2],
    );
    assert.equal(crumbs[1]?.item, `${ORIGIN}/pricing`);
  });

  await check('script text cannot close the tag or start a comment', () => {
    const text = toScriptText({
      '@type': 'Thing',
      name: '</script><script>alert(1)</script> <!-- & ',
    });
    assert.ok(!/[<>&]/.test(text), text);
    assert.equal(
      (JSON.parse(text) as { name: string }).name,
      '</script><script>alert(1)</script> <!-- & ',
      'the data is unchanged after parsing',
    );
  });

  await check('page data: home, pricing, legal and FAQ pages carry the expected types', () => {
    const types = (slug: string): string[] => {
      const page = DEFAULT_PAGES[slug] ?? LEGAL_PAGES[slug];
      assert.ok(page, slug);
      return pageJsonLd(
        ORIGIN,
        slug,
        page.title,
        pageContentSchema.parse(page.blocks),
        EMPTY_SEO_SETTINGS,
        null,
      ).map((d) => String(d['@type']));
    };
    assert.deepEqual(types('home').slice(0, 3), ['Organization', 'WebSite', 'SoftwareApplication']);
    assert.ok(
      types('pricing').includes('BreadcrumbList') &&
        types('pricing').includes('SoftwareApplication'),
    );
    assert.ok(types('legal/terms').includes('BreadcrumbList'));
    const withFaq = Object.keys(DEFAULT_PAGES).filter((s) => types(s).includes('FAQPage'));
    assert.ok(withFaq.length >= 1, 'at least one page has FAQ data');
  });

  await check('search settings: tokens and https profiles only', () => {
    assert.ok(seoSettingsSchema.safeParse(EMPTY_SEO_SETTINGS).success);
    const bad = (patch: object): boolean =>
      seoSettingsSchema.safeParse({ ...EMPTY_SEO_SETTINGS, ...patch }).success;
    assert.ok(
      !bad({ social: { ...EMPTY_SEO_SETTINGS.social, x: 'http://x.com/a' } }),
      'http profile',
    );
    assert.ok(
      !bad({ social: { ...EMPTY_SEO_SETTINGS.social, x: 'javascript:alert(1)' } }),
      'script address',
    );
    assert.ok(
      !bad({ verification: { ...EMPTY_SEO_SETTINGS.verification, google: '"><script>' } }),
      'token characters',
    );
    assert.ok(
      bad({ verification: { ...EMPTY_SEO_SETTINGS.verification, google: 'abcDEF_1234-xyz' } }),
    );
    assert.ok(!bad({ extra: 1 }), 'unknown field');
  });

  await check('crawler rules: every product route group is disallowed, no public page is', () => {
    const covered = (path: string): boolean =>
      PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(p));
    for (const group of ['(auth)', '(client-portal)', '(dashboard)']) {
      for (const name of readdirSync(`app/${group}`)) {
        if (
          name.startsWith('_') ||
          name.includes('.') ||
          !statSync(`app/${group}/${name}`).isDirectory()
        )
          continue;
        if (
          !existsSync(`app/${group}/${name}/page.tsx`) &&
          readdirSync(`app/${group}/${name}`).length === 0
        )
          continue;
        assert.ok(covered(`/${name}`), `/${name} (${group}) is not disallowed`);
      }
    }
    assert.ok(covered('/admin/cms'));
    assert.ok(covered('/api/cms/media/x'));
    for (const slug of [...Object.keys(DEFAULT_PAGES), ...Object.keys(LEGAL_PAGES)])
      assert.ok(!covered(pathOf(slug)), `${slug} is public but disallowed`);
    assert.ok(!covered('/blog') && !covered('/legal') && !covered('/pricing'));
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step06-seo: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step06-seo crashed: ${String(error)}\n`);
    process.exit(1);
  });
