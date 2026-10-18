// path: scripts/verify/step13-emails.ts
// Logic checks of the client emails (13.4) that need no database or network: every client template renders, carries the
// forward warning exactly when it holds a private link, names USD only, and its subject variables are all declared.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step13-emails.ts
import assert from 'node:assert/strict';
import { render } from '@react-email/render';
import { createElement, type ComponentType } from 'react';
import { clientEmailTemplates } from '@/emails/client';
import { emailCatalog } from '@/emails/catalog';
import { NO_TRACKING_PREFIXES } from '@/config/email';

const LINK = 'https://app.example.com/i/' + 'A'.repeat(22) + '.' + 'B'.repeat(22);
let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve(fn()).then(
    () => void (checks += 1),
    (error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    },
  );

function sample(variables: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    variables.map((v) => [
      v,
      v === 'link' ? LINK : v === 'message' || v === 'lateFee' ? '' : `${v}-value`,
    ]),
  );
}

async function main(): Promise<void> {
  await check('twelve client templates are in the platform catalogue', () => {
    assert.equal(clientEmailTemplates.length, 12);
    const ids = new Set(emailCatalog.map((t) => t.definition.id));
    for (const t of clientEmailTemplates) assert.ok(ids.has(t.definition.id), t.definition.id);
  });

  await check(
    'ids start with client. and are tracked (open and click feed the delivery proof)',
    () => {
      for (const t of clientEmailTemplates) {
        assert.ok(t.definition.id.startsWith('client.'));
        assert.ok(!NO_TRACKING_PREFIXES.some((p) => t.definition.id.startsWith(p)));
      }
    },
  );

  await check('every template renders, with the forward warning when it has a link', async () => {
    for (const t of clientEmailTemplates) {
      const data = sample(t.definition.variables);
      const html = await render(
        createElement(t.component as ComponentType<Record<string, string>>, data),
      );
      assert.ok(html.length > 200, t.definition.id);
      const hasLink = t.definition.variables.includes('link');
      assert.equal(
        html.includes('do not forward it'),
        hasLink,
        `${t.definition.id} forward warning`,
      );
      if (hasLink) assert.ok(html.includes(LINK), `${t.definition.id} link`);
    }
  });

  await check(
    'subject placeholders are declared variables and money is US dollars only',
    async () => {
      for (const t of clientEmailTemplates) {
        for (const m of t.definition.subject.matchAll(/\{(\w+)\}/g))
          assert.ok(t.definition.variables.includes(m[1] ?? ''), `${t.definition.id} ${m[1]}`);
        const html = await render(
          createElement(
            t.component as ComponentType<Record<string, string>>,
            sample(t.definition.variables),
          ),
        );
        assert.ok(
          !/EUR|GBP|BDT|INR|[\u20ac\u00a3\u00a5]/.test(html),
          `${t.definition.id} currency`,
        );
      }
    },
  );

  await check('a note from the sender appears only when given', async () => {
    const t = clientEmailTemplates.find((x) => x.definition.id === 'client.final-notice');
    assert.ok(t);
    const base = sample(t.definition.variables);
    const component = t.component as ComponentType<Record<string, string>>;
    const without = await render(createElement(component, base));
    const withNote = await render(
      createElement(component, { ...base, message: 'Please call me.' }),
    );
    assert.ok(!without.includes('Please call me.'));
    assert.ok(withNote.includes('Please call me.'));
  });

  process.stdout.write(`step13-emails: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
