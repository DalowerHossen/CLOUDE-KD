// path: scripts/verify/step16-ocr.ts
// Logic checks of receipt OCR (16.8) that need no database or network: amounts in several spellings, a case table of sample
// receipt texts with the expected vendor, date, total and tax and their confidence, the reading of a Google Cloud Vision answer
// into lines (built with the response structure of the API description), the Vision request (the key stays in the address only,
// base64 image, DOCUMENT_TEXT_DETECTION, language hints), errors (final or temporary, the key never in a message), the strict
// settings and correction inputs. The queue, the claim, the hand-over to the expense service, the pages and calls to Google are
// not run here (the claim is tested in sql/assertions/s16_009_ocr.sql).
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-ocr.ts
import assert from 'node:assert/strict';
import { OCR_LOW_CONFIDENCE } from '@/config/s16-ocr';
import { amountsIn, dateIn, extractReceipt, normaliseAmount } from '@/lib/ocr/extract-rules';
import { correctionInput, lowConfidence, settingsInput } from '@/lib/ocr/rules';
import { buildRequest, OcrApiError, parseResponse, readImage } from '@/lib/ocr/vision';

let checks = 0;
const check = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const TODAY = '2026-06-30';
const lines = (
  texts: readonly string[],
  confidence = 0.98,
): { text: string; confidence: number }[] => texts.map((text) => ({ text, confidence }));

/** A Vision answer for the lines, built the way the API description shows: symbols with detected breaks. */
function visionAnswer(texts: readonly string[], conf = 0.97): unknown {
  const words = (line: string, last: boolean): unknown[] =>
    line.split(' ').map((w, wi, all) => ({
      confidence: conf,
      symbols: [...w].map((ch, ci) => ({
        text: ch,
        confidence: conf,
        ...(ci === w.length - 1
          ? {
              property: {
                detectedBreak: {
                  type: wi === all.length - 1 ? (last ? 'LINE_BREAK' : 'EOL_SURE_SPACE') : 'SPACE',
                },
              },
            }
          : {}),
      })),
    }));
  return {
    responses: [
      {
        fullTextAnnotation: {
          text: texts.join('\n'),
          pages: [
            {
              confidence: 0.96,
              blocks: [
                {
                  blockType: 'TEXT',
                  paragraphs: [
                    { words: texts.flatMap((l, i) => words(l, i === texts.length - 1)) },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

const KEY = 'AIzaSyFAKEKEYFORTESTS0123456789abcdef';
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

async function main(): Promise<void> {
  await check(
    'amounts: several spellings, percentages and words left out, USD text with four decimals',
    () => {
      assert.equal(normaliseAmount('1,234.56'), '1234.5600');
      assert.equal(normaliseAmount('1.234,56'), '1234.5600');
      assert.equal(normaliseAmount('12,50'), '12.5000');
      assert.equal(normaliseAmount('1,234'), '1234.0000');
      assert.equal(normaliseAmount('1.234.567'), '1234567.0000');
      assert.equal(normaliseAmount('$12'), '12.0000');
      assert.equal(normaliseAmount('abc'), null);
      assert.equal(normaliseAmount('123456789012345'), null);
      assert.deepEqual(amountsIn('Sales Tax 8% 0.52'), ['0.5200']);
      assert.deepEqual(amountsIn('Milk 3.49  Bread 2.99'), ['3.4900', '2.9900']);
      assert.deepEqual(amountsIn('Order A123 total 5.00'), ['5.0000']);
      assert.deepEqual(amountsIn('VAT 10 % 2,05'), ['2.0500']);
    },
  );

  await check(
    'dates: ISO, month names, day first or month first by the company order, impossible and future dates refused',
    () => {
      assert.deepEqual(dateIn('2026-02-28 10:00', 'dmy', TODAY), {
        value: '2026-02-28',
        strength: 0.95,
      });
      assert.deepEqual(dateIn('12 Mar 2026', 'dmy', TODAY), { value: '2026-03-12', strength: 0.9 });
      assert.deepEqual(dateIn('March 12, 2026', 'dmy', TODAY), {
        value: '2026-03-12',
        strength: 0.9,
      });
      assert.deepEqual(dateIn('25/12/2025', 'mdy', TODAY), { value: '2025-12-25', strength: 0.9 });
      assert.deepEqual(dateIn('12/25/2025', 'dmy', TODAY), { value: '2025-12-25', strength: 0.9 });
      assert.deepEqual(dateIn('03/04/2026', 'dmy', TODAY), { value: '2026-04-03', strength: 0.65 });
      assert.deepEqual(dateIn('03/04/2026', 'mdy', TODAY), { value: '2026-03-04', strength: 0.65 });
      assert.deepEqual(dateIn('05/05/26', 'dmy', TODAY), { value: '2026-05-05', strength: 0.9 });
      assert.equal(dateIn('31/02/2026', 'dmy', TODAY), null);
      assert.equal(dateIn('2099-01-01', 'dmy', TODAY), null);
      assert.equal(dateIn('1999-01-01', 'dmy', TODAY), null);
      assert.equal(dateIn('no date here', 'dmy', TODAY), null);
    },
  );

  const cases: {
    name: string;
    texts: string[];
    order?: 'dmy' | 'mdy';
    fields: Record<string, string>;
    lowOn?: string[];
  }[] = [
    {
      name: 'US grocery receipt',
      texts: [
        'FRESH MART',
        '123 Main Street',
        'Tel 555-0100',
        '03/14/2026 10:22',
        'Milk 3.49',
        'Bread 2.99',
        'Subtotal 6.48',
        'Sales Tax 8% 0.52',
        'TOTAL 7.00',
        'VISA 7.00',
      ],
      fields: { vendor: 'FRESH MART', date: '2026-03-14', total: '7.0000', tax: '0.5200' },
    },
    {
      name: 'restaurant with decimal commas and a labelled date',
      texts: [
        'Cafe Roma',
        'Date: 12 Mar 2026',
        'Pasta 12,50',
        'Wine 8,00',
        'VAT 10% 2,05',
        'Total 22,55',
      ],
      fields: { vendor: 'Cafe Roma', date: '2026-03-12', total: '22.5500', tax: '2.0500' },
    },
    {
      name: 'tax invoice: titles, tax numbers and invoice numbers are not fields',
      texts: [
        'ACME SUPPLIES LTD',
        'TAX INVOICE',
        'VAT No 123456789',
        'Invoice No 000123',
        'Date 2026-02-28',
        'Item A 100.00',
        'Total VAT 15.00',
        'Grand Total 115.00',
        'Amount paid 115.00',
      ],
      fields: {
        vendor: 'ACME SUPPLIES LTD',
        date: '2026-02-28',
        total: '115.0000',
        tax: '15.0000',
      },
    },
    {
      name: 'an ambiguous date follows the company order and is marked uncertain',
      texts: ['Corner Shop', '05/06/2026', 'Total 9.99'],
      fields: { vendor: 'Corner Shop', date: '2026-06-05', total: '9.9900' },
      lowOn: ['date'],
    },
    {
      name: 'the same date with month first',
      texts: ['Corner Shop', '05/06/2026', 'Total 9.99'],
      order: 'mdy',
      fields: { vendor: 'Corner Shop', date: '2026-05-06', total: '9.9900' },
      lowOn: ['date'],
    },
    {
      name: 'no label: the largest amount with cents, marked uncertain',
      texts: ['Kiosk Express', 'Coffee 3.50', 'Cake 4.25', '7.75'],
      fields: { vendor: 'Kiosk Express', total: '7.7500' },
      lowOn: ['total'],
    },
    {
      name: 'the total is on the line after its label',
      texts: ['Hardware Hub', 'Grand Total', '45.20'],
      fields: { vendor: 'Hardware Hub', total: '45.2000' },
    },
    {
      name: 'two taxes are added together',
      texts: ['Spice Garden', 'Subtotal 100.00', 'CGST 9% 9.00', 'SGST 9% 9.00', 'Total 118.00'],
      fields: { vendor: 'Spice Garden', total: '118.0000', tax: '18.0000' },
    },
    {
      name: 'a tax larger than the total is dropped',
      texts: ['Odd Shop', 'Total 5.00', 'Tax 9.00'],
      fields: { vendor: 'Odd Shop', total: '5.0000' },
    },
    {
      name: 'a future date is not used',
      texts: ['Time Store', '2099-01-01', 'Total 3.00'],
      fields: { vendor: 'Time Store', total: '3.0000' },
    },
    { name: 'nothing readable gives no fields', texts: ['xx', '12', '--'], fields: {} },
  ];
  for (const c of cases) {
    await check(`receipt: ${c.name}`, () => {
      const r = extractReceipt(lines(c.texts), { dateOrder: c.order ?? 'dmy', today: TODAY });
      assert.deepEqual(r.fields, c.fields);
      assert.deepEqual(Object.keys(r.confidence).sort(), Object.keys(c.fields).sort());
      for (const k of Object.keys(c.fields)) {
        const v = r.confidence[k as 'vendor'];
        assert.ok(v !== undefined && v > 0 && v <= 1, k);
        assert.equal(lowConfidence(v), (c.lowOn ?? []).includes(k), `${k} ${String(v)}`);
      }
    });
  }

  await check(
    'confidence is the lower of the rule and the OCR: blurry words lower every field',
    () => {
      const r = extractReceipt(lines(['Blur Cafe', 'Date 2026-03-12', 'Total 10.00'], 0.4), {
        dateOrder: 'dmy',
        today: TODAY,
      });
      assert.equal(r.confidence.total, 0.4);
      assert.equal(r.confidence.date, 0.4);
      assert.equal(r.confidence.vendor, 0.4);
      const sharp = extractReceipt(lines(['Sharp Cafe', 'Date 2026-03-12', 'Total 10.00'], 0.99), {
        dateOrder: 'dmy',
        today: TODAY,
      });
      assert.equal(sharp.confidence.total, 0.85);
      assert.equal(sharp.confidence.date, 0.95);
      assert.ok(OCR_LOW_CONFIDENCE === 0.7);
    },
  );

  await check(
    'Vision answer: lines rebuilt from symbols and breaks, mean confidence, page confidence',
    () => {
      const read = parseResponse(visionAnswer(['FRESH MART', 'Total 7.00']));
      assert.deepEqual(
        read.lines.map((l) => l.text),
        ['FRESH MART', 'Total 7.00'],
      );
      assert.equal(read.lines[0]?.confidence, 0.97);
      assert.equal(read.pageConfidence, 0.96);
      assert.equal(read.text, 'FRESH MART\nTotal 7.00');
      const empty = parseResponse({ responses: [{}] });
      assert.equal(empty.lines.length, 0);
      assert.equal(empty.pageConfidence, null);
      assert.throws(
        () => parseResponse({ responses: [{ error: { code: 3, message: 'Bad image' } }] }),
        (e: unknown) => e instanceof OcrApiError && !e.retryable,
      );
      assert.throws(
        () => parseResponse({ responses: [{ error: { code: 14, message: 'x' } }] }),
        (e: unknown) => e instanceof OcrApiError && e.retryable,
      );
      assert.throws(
        () => parseResponse({ responses: [{ error: { code: 8, message: 'x' } }] }),
        (e: unknown) => e instanceof OcrApiError && e.retryable,
      );
      assert.deepEqual(parseResponse(null).lines, []);
    },
  );

  await check(
    'Vision request: one image as base64, DOCUMENT_TEXT_DETECTION, language hints only when given',
    () => {
      const body = buildRequest(png, []) as {
        requests: {
          image: { content: string };
          features: { type: string }[];
          imageContext?: unknown;
        }[];
      };
      assert.equal(body.requests.length, 1);
      assert.equal(body.requests[0]?.image.content, Buffer.from(png).toString('base64'));
      assert.deepEqual(body.requests[0]?.features, [{ type: 'DOCUMENT_TEXT_DETECTION' }]);
      assert.equal(body.requests[0]?.imageContext, undefined);
      const hinted = buildRequest(png, ['en', 'bn']) as {
        requests: { imageContext: { languageHints: string[] } }[];
      };
      assert.deepEqual(hinted.requests[0]?.imageContext.languageHints, ['en', 'bn']);
    },
  );

  await check(
    'readImage: POST to images:annotate with the key in the address only; the answer is read',
    async () => {
      const seen: { url: string; init: RequestInit }[] = [];
      const read = await readImage(KEY, png, 'image/png', ['en'], async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify(visionAnswer(['Shop Name', 'Total 1.00'])), {
          status: 200,
        });
      });
      assert.equal(read.lines.length, 2);
      assert.equal(seen[0]?.url, `https://vision.googleapis.com/v1/images:annotate?key=${KEY}`);
      assert.equal(seen[0]?.init.method, 'POST');
      assert.ok(!String(seen[0]?.init.body).includes(KEY));
      assert.ok(!JSON.stringify(seen[0]?.init.headers).includes(KEY));
    },
  );

  await check(
    'readImage errors: refusal is final, busy and network are temporary, the key is never in a message',
    async () => {
      const answer = (status: number, body: unknown) => async (): Promise<Response> =>
        new Response(JSON.stringify(body), { status });
      const run = async (f: () => Promise<Response>): Promise<OcrApiError> => {
        try {
          await readImage(KEY, png, 'image/png', [], f);
        } catch (e) {
          if (e instanceof OcrApiError) return e;
        }
        throw new Error('expected an OcrApiError');
      };
      const refused = await run(
        answer(403, {
          error: { code: 403, message: `API key ${KEY} not valid`, status: 'PERMISSION_DENIED' },
        }),
      );
      assert.equal(refused.retryable, false);
      assert.ok(!refused.message.includes(KEY));
      assert.equal((await run(answer(400, { error: { message: 'bad' } }))).retryable, false);
      assert.equal((await run(answer(429, {}))).retryable, true);
      assert.equal((await run(answer(503, {}))).retryable, true);
      const net = await run(async () => {
        throw new TypeError(`fetch failed for ${KEY}`);
      });
      assert.equal(net.retryable, true);
      assert.ok(!net.message.includes(KEY));
      await assert.rejects(
        readImage(KEY, png, 'application/pdf', [], async () => new Response('{}')),
        (e: unknown) => e instanceof OcrApiError && !e.retryable && /PDF/.test(e.message),
      );
      await assert.rejects(
        readImage(KEY, new Uint8Array(0), 'image/png', [], async () => new Response('{}')),
      );
      await assert.rejects(
        readImage(
          KEY,
          new Uint8Array(4 * 1024 * 1024 + 1),
          'image/png',
          [],
          async () => new Response('{}'),
        ),
      );
    },
  );

  await check('inputs: settings and corrections are strict', () => {
    const ok = {
      enabled: true,
      apiKey: KEY,
      dateOrder: 'dmy',
      languageHints: ['en'],
      dailyLimit: 200,
      consent: true,
    };
    assert.ok(settingsInput.safeParse(ok).success);
    assert.ok(!settingsInput.safeParse({ ...ok, apiKey: 'short' }).success);
    assert.ok(!settingsInput.safeParse({ ...ok, apiKey: `${KEY} x` }).success);
    assert.ok(!settingsInput.safeParse({ ...ok, dateOrder: 'ymd' }).success);
    assert.ok(!settingsInput.safeParse({ ...ok, dailyLimit: 0 }).success);
    assert.ok(!settingsInput.safeParse({ ...ok, languageHints: ['english'] }).success);
    assert.ok(
      !settingsInput.safeParse({ ...ok, languageHints: ['en', 'bn', 'hi', 'ar', 'th', 'vi'] })
        .success,
    );
    assert.ok(!settingsInput.safeParse({ ...ok, extra: 1 }).success);
    assert.ok(correctionInput.safeParse({ total: '12.50' }).success);
    assert.ok(correctionInput.safeParse({ vendor: null }).success);
    assert.ok(!correctionInput.safeParse({}).success);
    assert.ok(!correctionInput.safeParse({ total: '12,50' }).success);
    assert.ok(!correctionInput.safeParse({ date: '2026-02-30' }).success);
    assert.ok(!correctionInput.safeParse({ vendor: '<b>x</b>' }).success);
    assert.ok(!correctionInput.safeParse({ currency: 'EUR' }).success);
  });

  process.stdout.write(`step16-ocr: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
