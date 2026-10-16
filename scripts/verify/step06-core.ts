// path: scripts/verify/step06-core.ts
// Logic checks of STEP 06 that need no database or network. Run: npx tsx scripts/verify/step06-core.ts
import assert from 'node:assert/strict';
import { pageContentSchema, pageMetaSchema, hrefSchema } from '@/lib/cms/blocks';
import { DEFAULT_PAGES, LEGAL_PAGES, defaultPage, pathOf } from '@/lib/cms/defaults';
import { ACCEPTABLE_PAGES, LEGAL_LINKS } from '@/lib/cms/legal-pages';
import { pricingColumns } from '@/lib/cms/pricing';
import { BLOCK_LABELS, ITEM_TEMPLATES, newBlock } from '@/lib/cms/templates';
import { sanitizeBlocks } from '@/lib/cms/sanitize-blocks';
import type { BlockType } from '@/lib/cms/blocks';
import { plainText, readMinutes, slugify } from '@/lib/blog/text';
import { postActionSchema, postSaveSchema, publicListQuery } from '@/services/blog/schemas';
import { PLAN_KEYS } from '@/config/plans';
import {
  COOKIE_POLICY_VERSION,
  consentFromCookieString,
  parseConsent,
  serializeConsent,
} from '@/lib/analytics/consent';

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

async function main(): Promise<void> {
  await check('consent cookie: round trip, version change asks again, junk is not a choice', () => {
    for (const analytics of [true, false]) {
      for (const marketing of [true, false]) {
        assert.deepEqual(parseConsent(serializeConsent({ analytics, marketing })), {
          analytics,
          marketing,
        });
      }
    }
    assert.equal(parseConsent('v1999-01.a1.m1'), null, 'an older policy version');
    for (const bad of [
      '',
      'a1.m1',
      `v${COOKIE_POLICY_VERSION}.a2.m0`,
      `v${COOKIE_POLICY_VERSION}.a1`,
      null,
      undefined,
    ])
      assert.equal(parseConsent(bad), null, String(bad));
    const header = `theme=dark; kd_consent=${serializeConsent({ analytics: true, marketing: false })}; other=1`;
    assert.deepEqual(consentFromCookieString(header), { analytics: true, marketing: false });
    assert.equal(consentFromCookieString('theme=dark'), null);
    assert.equal(consentFromCookieString('kd_consent_other=v1'), null);
  });
  await check(
    'default pages: valid blocks, unique titles and descriptions, safe links, no brand names',
    () => {
      const titles = new Set<string>();
      const descriptions = new Set<string>();
      for (const [slug, page] of Object.entries(DEFAULT_PAGES)) {
        pageMetaSchema.parse({ title: page.title, description: page.description });
        const blocks = pageContentSchema.parse(page.blocks);
        assert.ok(blocks.length >= 2, slug);
        assert.ok(
          !titles.has(page.title) && !descriptions.has(page.description),
          `${slug} repeats a title or description`,
        );
        titles.add(page.title);
        descriptions.add(page.description);
        const text = JSON.stringify(page);
        for (const brand of [
          'bKash',
          'Nagad',
          'GCash',
          'UPI',
          `TO${'DO'}`,
          'lorem',
          `Coming ${'soon'}`,
        ])
          assert.ok(!new RegExp(brand, 'i').test(text), `${slug} mentions ${brand}`);
        assert.ok(
          /[\x00-\x7f]/.test(text) && !/[^\x00-\x7f]/.test(text),
          `${slug} has non-ASCII text`,
        );
        for (const m of text.matchAll(/"href":"([^"]+)"/g)) hrefSchema.parse(m[1]);
        assert.equal(pathOf(slug), slug === 'home' ? '/' : `/${slug}`);
      }
      assert.equal(Object.keys(DEFAULT_PAGES).length, 8);
      assert.ok(
        !hrefSchema.safeParse('javascript:alert(1)').success &&
          !hrefSchema.safeParse('//evil.test').success &&
          !hrefSchema.safeParse('data:text/html,x').success,
      );
      assert.ok(
        hrefSchema.safeParse('/pricing').success &&
          hrefSchema.safeParse('https://example.com/a').success,
      );
      assert.ok(
        !pageContentSchema.safeParse([
          { id: 'a', type: 'cta', heading: 'x', button: { label: 'y', href: '/z' }, extra: 1 },
        ]).success,
        'unknown fields are refused',
      );
      assert.ok(
        !pageContentSchema.safeParse([
          { id: 'a', type: 'cta', heading: 'x', button: { label: 'y', href: '/z' } },
          { id: 'a', type: 'cta', heading: 'x', button: { label: 'y', href: '/z' } },
        ]).success,
        'block ids are unique',
      );
    },
  );

  await check('editor templates: every new block is valid; item templates fit their lists', () => {
    for (const type of Object.keys(BLOCK_LABELS) as BlockType[]) {
      const block = newBlock(type);
      const parsed = pageContentSchema.safeParse([block]);
      // The image block needs a real file id, everything else must validate as created.
      if (type !== 'image')
        assert.ok(parsed.success, `${type}: ${parsed.success ? '' : parsed.error.message}`);
    }
    assert.ok(newBlock('faq').id !== newBlock('faq').id, 'ids are unique');
    for (const key of Object.keys(ITEM_TEMPLATES)) {
      const [type, field] = key.split('.');
      const block = newBlock(type as BlockType) as Record<string, unknown>;
      assert.ok(Array.isArray(block[field ?? '']), `${key} is a list`);
    }
  });

  await check('rich text in saved blocks is cleaned', () => {
    const blocks = sanitizeBlocks(
      pageContentSchema.parse([
        {
          id: 'r',
          type: 'richtext',
          heading: '',
          html: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>',
        },
      ]),
    );
    const html = JSON.stringify(blocks);
    assert.ok(!/script|onerror/i.test(html), html);
    assert.ok(html.includes('ok'));
  });

  await check('legal pages: twelve, valid, unique, ASCII, no brand names, listed in links', () => {
    const slugs = Object.keys(LEGAL_PAGES);
    assert.equal(slugs.length, 12);
    assert.deepEqual(
      LEGAL_LINKS.map((l) => `legal/${l.slug}`).sort(),
      [...slugs].sort(),
      'every legal page is listed',
    );
    for (const a of ACCEPTABLE_PAGES) assert.ok(`legal/${a}` in LEGAL_PAGES, a);
    const titles = new Set<string>();
    for (const [slug, page] of Object.entries(LEGAL_PAGES)) {
      pageMetaSchema.parse({ title: page.title, description: page.description });
      const blocks = pageContentSchema.parse(page.blocks);
      assert.equal(blocks[0]?.type, 'hero', slug);
      assert.ok(!titles.has(page.title), `${slug} repeats a title`);
      titles.add(page.title);
      const text = JSON.stringify(page);
      assert.ok(!/[^\x00-\x7f]/.test(text), `${slug} has non-ASCII text`);
      for (const brand of ['bKash', 'Nagad', 'GCash', 'UPI', 'lorem'])
        assert.ok(!new RegExp(brand, 'i').test(text), `${slug} mentions ${brand}`);
      assert.equal(defaultPage(slug), page);
      assert.equal(pathOf(slug), `/${slug}`);
    }
  });

  await check('blog helpers and input shapes', () => {
    assert.equal(slugify('  Hello, World! 2026 '), 'hello-world-2026');
    assert.equal(slugify('!!!'), '');
    assert.equal(
      plainText('<h2>Title</h2><p>One &amp; two</p><ul><li>a</li><li>b</li></ul>'),
      'Title One & two a b',
    );
    assert.equal(readMinutes(''), 1);
    assert.equal(readMinutes(Array(401).fill('word').join(' ')), 3);
    const base = {
      slug: 'my-post',
      title: 'My post',
      bodyHtml: '<p>x</p>',
      authorId: '018f0000-0000-7000-8000-000000000001',
    };
    assert.ok(postSaveSchema.safeParse(base).success);
    assert.ok(!postSaveSchema.safeParse({ ...base, slug: 'Bad Slug' }).success, 'slug rule');
    assert.ok(!postSaveSchema.safeParse({ ...base, extra: 1 }).success, 'unknown field');
    assert.ok(
      !postSaveSchema.safeParse({ ...base, tagIds: Array(11).fill(base.authorId) }).success,
      'tag limit',
    );
    assert.ok(!postActionSchema.safeParse({ action: 'publish', id: 'x' }).success);
    assert.ok(publicListQuery.safeParse({ page: '2', month: '2026-03' }).success);
    assert.ok(!publicListQuery.safeParse({ month: '2026-13' }).success);
    assert.ok(!publicListQuery.safeParse({ q: 'a' }).success, 'search needs two letters');
  });

  await check('pricing table is built from the plan catalogue', () => {
    const columns = pricingColumns();
    assert.deepEqual(
      columns.map((c) => c.key),
      [...PLAN_KEYS],
    );
    const free = columns[0];
    assert.ok(free && free.cells.length >= 15);
    assert.equal(free.cells.find((c) => c.label === 'Payroll')?.value, 'Not included');
    const enterprise = columns[columns.length - 1];
    assert.ok(enterprise?.cells.some((c) => c.value === 'Unlimited'));
  });
}

main()
  .then(() => {
    if (failures > 0) process.exit(1);
    process.stdout.write('step06-core: ok\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`step06-core crashed: ${String(error)}\n`);
    process.exit(1);
  });
