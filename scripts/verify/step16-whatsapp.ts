// path: scripts/verify/step16-whatsapp.ts
// Logic checks of WhatsApp (16.3.a) that need no database or network, using the payload shapes from the Meta documentation
// (docs/integrations/whatsapp.md): phone numbers, the template rules and the create request, the send payloads (text, positional
// and named template), the 24 hour window and the send check (opt-out blocks), stop and start words, the webhook signature, the
// parsing of an incoming message, a status update and a template status event, the order of statuses, the Graph client with a
// fake fetch (accepted answer, error answer, the token never in a message), and the inputs. The tables and the opt-out guard in
// the database are tested in sql/assertions/s16_003_whatsapp.sql. Calls to Meta, the webhook route, the encrypted secrets and
// the pages need a running app and a Meta test account.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-whatsapp.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createTemplate,
  listTemplates,
  phoneHealth,
  sendMessage,
  WhatsAppApiError,
} from '@/lib/whatsapp/client';
import {
  accountInput,
  buildTemplateComponents,
  buildTemplatePayload,
  buildTextPayload,
  checkSend,
  failureText,
  isOptInText,
  isOptOutText,
  missingValues,
  nextStatus,
  parseGraphError,
  parseWebhook,
  placeholders,
  renderTemplate,
  sendTemplateInput,
  sendTextInput,
  templateInput,
  templateStatusFromEvent,
  templateVariables,
  toE164,
  verifyMetaSignature,
  webhookTime,
  windowOpen,
} from '@/lib/whatsapp/rules';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      checks += 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    });

const now = new Date('2026-06-10T12:00:00Z');
const hoursAgo = (h: number): string => new Date(now.getTime() - h * 3_600_000).toISOString();
const TOKEN = 'EAAJBsecrettokenvalue0123456789';

const textWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550783881', phone_number_id: '106540352242922' },
            contacts: [{ profile: { name: 'Sheena Nelson' }, wa_id: '16505551234' }],
            messages: [
              {
                from: '16505551234',
                id: 'wamid.HBgLMTY1',
                timestamp: '1749416383',
                type: 'text',
                text: { body: 'Does it come in another color?' },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};
const statusWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550783881', phone_number_id: '106540352242922' },
            statuses: [
              {
                id: 'wamid.A',
                status: 'delivered',
                timestamp: '1749416400',
                recipient_id: '16505551234',
              },
              {
                id: 'wamid.B',
                status: 'failed',
                timestamp: '1749416401',
                recipient_id: '16505551235',
                errors: [
                  {
                    code: 131049,
                    title: 'Not delivered',
                    message: 'Not delivered',
                    error_data: {
                      details:
                        'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.',
                    },
                  },
                ],
              },
              { id: 'wamid.C', status: 'deleted', timestamp: '1', recipient_id: 'x' },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};
const templateWebhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      time: 1751234563,
      changes: [
        {
          value: {
            event: 'REJECTED',
            message_template_id: 1689556908129832,
            message_template_name: 'order_confirmation',
            message_template_language: 'en-US',
            reason: 'INCORRECT_CATEGORY',
            message_template_category: 'MARKETING',
          },
          field: 'message_template_status_update',
        },
      ],
    },
  ],
};

async function main(): Promise<void> {
  await check('phone numbers become E.164 or are refused', () => {
    assert.equal(toE164('+1 (650) 555-1234'), '+16505551234');
    assert.equal(toE164('0016505551234'), '+16505551234');
    assert.equal(toE164('16505551234'), '+16505551234');
    assert.equal(toE164('+880 1712-345678'), '+8801712345678');
    for (const bad of [
      '',
      '12345',
      '+0123456789',
      '+1234567890123456',
      'abc',
      '+1 650 555 12ab',
      '+',
    ])
      assert.equal(toE164(bad), null, bad);
  });

  await check('placeholders: positional must run 1, 2, 3; named must be snake case', () => {
    assert.deepEqual(placeholders('Hi {{1}}, order {{2}} for {{1}}'), ['1', '2']);
    const ok = (extra: object): boolean =>
      templateInput.safeParse({
        name: 'order_confirmation',
        language: 'en_US',
        category: 'utility',
        body: 'Hi {{1}}! Order {{2}}.',
        bodyExamples: ['Pablo', '860198'],
        ...extra,
      }).success;
    assert.ok(ok({}));
    assert.ok(!ok({ body: 'Hi {{2}}!', bodyExamples: ['a'] }));
    assert.ok(!ok({ bodyExamples: ['Pablo'] }));
    assert.ok(!ok({ name: 'Order Confirmation' }));
    assert.ok(!ok({ name: 'x'.repeat(513) }));
    assert.ok(!ok({ category: 'sales' }));
    assert.ok(!ok({ language: 'English' }));
    assert.ok(!ok({ footer: 'x {{1}}' }));
    assert.ok(!ok({ header: 'a {{1}} {{2}}', headerExample: 'x' }));
    assert.ok(!ok({ header: 'Hi {{1}}' }));
    assert.ok(ok({ header: 'Hi {{1}}', headerExample: 'Pablo' }));
    assert.ok(!ok({ body: 'x'.repeat(1025), bodyExamples: [] }));
    assert.ok(!ok({ body: '<b>{{1}} {{2}}</b>' }));
    const named = {
      name: 'order_confirmation',
      language: 'en_US',
      category: 'utility',
      parameterFormat: 'named',
      body: 'Thank you, {{first_name}}! Order {{order_number}}.',
      bodyExamples: ['Pablo', '860198-230332'],
    };
    assert.ok(templateInput.safeParse(named).success);
    assert.ok(
      !templateInput.safeParse({ ...named, body: 'Hi {{FirstName}}', bodyExamples: ['a'] }).success,
    );
  });

  await check(
    'the create request has the shape of the documentation (named and positional examples)',
    () => {
      const pos = templateInput.parse({
        name: 'order_confirmation',
        language: 'en_US',
        category: 'utility',
        body: 'Hi {{1}}! Your order number is {{2}}. Thank you.',
        bodyExamples: ['Pablo', '860198-230332'],
        footer: 'Thanks',
      });
      assert.deepEqual(buildTemplateComponents(pos), [
        {
          type: 'BODY',
          text: 'Hi {{1}}! Your order number is {{2}}. Thank you.',
          example: { body_text: [['Pablo', '860198-230332']] },
        },
        { type: 'FOOTER', text: 'Thanks' },
      ]);
      const named = templateInput.parse({
        name: 'order_confirmation',
        language: 'en_US',
        category: 'utility',
        parameterFormat: 'named',
        body: 'Thank you, {{first_name}}! Your order number is {{order_number}}.',
        bodyExamples: ['Pablo', '860198-230332'],
        header: 'Hello {{first_name}}',
        headerExample: 'Pablo',
      });
      const parts = buildTemplateComponents(named);
      assert.deepEqual(parts[1], {
        type: 'BODY',
        text: 'Thank you, {{first_name}}! Your order number is {{order_number}}.',
        example: {
          body_text_named_params: [
            { param_name: 'first_name', example: 'Pablo' },
            { param_name: 'order_number', example: '860198-230332' },
          ],
        },
      });
      assert.deepEqual(parts[0], {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Hello {{first_name}}',
        example: { header_text_named_params: [{ param_name: 'first_name', example: 'Pablo' }] },
      });
      const plain = templateInput.parse({
        name: 'greeting',
        language: 'en',
        category: 'marketing',
        body: 'Hello there',
      });
      assert.deepEqual(buildTemplateComponents(plain), [{ type: 'BODY', text: 'Hello there' }]);
    },
  );

  await check('send payloads: text, positional template and named template', () => {
    assert.deepEqual(buildTextPayload('+16505551234', 'As requested', true), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+16505551234',
      type: 'text',
      text: { preview_url: true, body: 'As requested' },
    });
    const comps = [{ type: 'BODY', text: 'Hi {{1}}! Your order number is {{2}}.' }];
    assert.deepEqual(
      buildTemplatePayload(
        '+16505551234',
        {
          name: 'order_confirmation',
          language: 'en_US',
          parameterFormat: 'positional',
          components: comps,
        },
        { '1': 'Jessica', '2': 'SKBUP2-4CPIG9' },
      ),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '+16505551234',
        type: 'template',
        template: {
          name: 'order_confirmation',
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Jessica' },
                { type: 'text', text: 'SKBUP2-4CPIG9' },
              ],
            },
          ],
        },
      },
    );
    const namedComps = [
      { type: 'BODY', text: 'Thank you, {{first_name}}! Order {{order_number}}.' },
    ];
    const payload = buildTemplatePayload(
      '+16505551234',
      {
        name: 'order_confirmation',
        language: 'en_US',
        parameterFormat: 'named',
        components: namedComps,
      },
      { order_number: 'SK1', first_name: 'Jessica' },
    ) as { template: { components: { parameters: unknown[] }[] } };
    assert.deepEqual(payload.template.components[0]?.parameters, [
      { type: 'text', parameter_name: 'first_name', text: 'Jessica' },
      { type: 'text', parameter_name: 'order_number', text: 'SK1' },
    ]);
    const none = buildTemplatePayload(
      '+16505551234',
      {
        name: 'hello',
        language: 'en',
        parameterFormat: 'positional',
        components: [{ type: 'BODY', text: 'Hello' }],
      },
      {},
    ) as { template: Record<string, unknown> };
    assert.ok(!('components' in none.template));
  });

  await check('template values: missing ones are listed and the text is filled in', () => {
    const comps = [{ type: 'BODY', text: 'Hi {{1}}, order {{2}}.' }];
    assert.deepEqual(templateVariables(comps), ['1', '2']);
    assert.deepEqual(missingValues(comps, { '1': 'A' }), ['2']);
    assert.deepEqual(missingValues(comps, { '1': 'A', '2': ' ' }), ['2']);
    assert.equal(renderTemplate(comps, { '1': 'Ann', '2': '42' }), 'Hi Ann, order 42.');
  });

  await check('the 24 hour window: open for 24 hours after the last message of the person', () => {
    assert.ok(windowOpen(hoursAgo(2), now));
    assert.ok(windowOpen(hoursAgo(23.9), now));
    assert.ok(!windowOpen(hoursAgo(24), now));
    assert.ok(!windowOpen(hoursAgo(30), now));
    assert.ok(!windowOpen(null, now));
  });

  await check(
    'send check: an opt-out blocks everything; text needs an open window; a template needs APPROVED',
    () => {
      const base = { now, lastInboundAt: null as string | null };
      assert.equal(
        checkSend({ ...base, optStatus: 'opted_out', kind: 'template', templateStatus: 'APPROVED' })
          .ok,
        false,
      );
      assert.equal(
        checkSend({ ...base, optStatus: 'opted_out', lastInboundAt: hoursAgo(1), kind: 'text' }).ok,
        false,
      );
      assert.equal(
        checkSend({ ...base, optStatus: 'unknown', kind: 'template', templateStatus: 'APPROVED' })
          .ok,
        false,
      );
      assert.equal(
        checkSend({ ...base, optStatus: 'unknown', lastInboundAt: hoursAgo(1), kind: 'text' }).ok,
        true,
      );
      assert.equal(checkSend({ ...base, optStatus: 'opted_in', kind: 'text' }).ok, false);
      assert.equal(
        checkSend({ ...base, optStatus: 'opted_in', lastInboundAt: hoursAgo(3), kind: 'text' }).ok,
        true,
      );
      assert.equal(
        checkSend({ ...base, optStatus: 'opted_in', kind: 'template', templateStatus: 'APPROVED' })
          .ok,
        true,
      );
      assert.equal(
        checkSend({ ...base, optStatus: 'opted_in', kind: 'template', templateStatus: 'PENDING' })
          .ok,
        false,
      );
      assert.equal(
        checkSend({ ...base, optStatus: 'opted_in', kind: 'template', templateStatus: 'REJECTED' })
          .ok,
        false,
      );
    },
  );

  await check('stop and start words', () => {
    for (const w of ['STOP', ' stop ', 'Stop.', 'unsubscribe', 'Opt out', 'STOP ALL'])
      assert.ok(isOptOutText(w), w);
    for (const w of ['please stop sending', 'stopping', 'go on', ''])
      assert.ok(!isOptOutText(w), w);
    for (const w of ['START', 'unstop', 'Subscribe!']) assert.ok(isOptInText(w), w);
    assert.ok(!isOptInText('stop'));
  });

  await check(
    'webhook signature: sha256= plus the HMAC of the raw body with the app secret',
    async () => {
      const secret = 'app-secret-0123456789abcdef';
      const raw = JSON.stringify(textWebhook);
      const header = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
      assert.ok(await verifyMetaSignature(secret, raw, header));
      assert.ok(!(await verifyMetaSignature('another-secret-0123456789', raw, header)));
      assert.ok(!(await verifyMetaSignature(secret, `${raw} `, header)));
      assert.ok(!(await verifyMetaSignature(secret, raw, header.replace('sha256=', ''))));
      assert.ok(!(await verifyMetaSignature(secret, raw, null)));
      assert.ok(!(await verifyMetaSignature(secret, raw, 'sha256=zz')));
    },
  );

  await check('an incoming text message is read with the sender name and number ids', () => {
    const p = parseWebhook(textWebhook);
    assert.equal(p.messages.length, 1);
    assert.deepEqual(p.messages[0], {
      wabaId: '102290129340398',
      phoneNumberId: '106540352242922',
      from: '16505551234',
      waMessageId: 'wamid.HBgLMTY1',
      timestamp: '1749416383',
      type: 'text',
      text: 'Does it come in another color?',
      profileName: 'Sheena Nelson',
    });
    assert.equal(webhookTime('1749416383', now), '2025-06-08T20:59:43.000Z');
    assert.equal(webhookTime('', now), now.toISOString());
    assert.equal(webhookTime('abc', now), now.toISOString());
  });

  await check('status updates are read; unknown statuses and failure details are handled', () => {
    const p = parseWebhook(statusWebhook);
    assert.equal(p.statuses.length, 2);
    assert.equal(p.statuses[0]?.status, 'delivered');
    assert.equal(p.statuses[1]?.errorCode, 131049);
    assert.match(p.statuses[1]?.errorText ?? '', /healthy ecosystem/);
  });

  await check('a template status event is read and mapped', () => {
    const p = parseWebhook(templateWebhook);
    assert.deepEqual(p.templates[0], {
      wabaId: '102290129340398',
      event: 'REJECTED',
      templateId: '1689556908129832',
      name: 'order_confirmation',
      language: 'en-US',
      reason: 'INCORRECT_CATEGORY',
    });
    assert.equal(templateStatusFromEvent('APPROVED'), 'APPROVED');
    assert.equal(templateStatusFromEvent('REJECTED'), 'REJECTED');
    assert.equal(templateStatusFromEvent('REINSTATED'), 'APPROVED');
    assert.equal(templateStatusFromEvent('UNARCHIVED'), null);
    assert.equal(templateStatusFromEvent('SOMETHING_NEW'), null);
  });

  await check('junk payloads give nothing and never throw', () => {
    for (const junk of [
      null,
      5,
      'x',
      [],
      {},
      { object: 'page' },
      { object: 'whatsapp_business_account', entry: 'x' },
      {
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: '', from: '' }] } }] }],
      },
    ])
      assert.deepEqual(parseWebhook(junk), { messages: [], statuses: [], templates: [] });
  });

  await check(
    'statuses only move forward; failed and read are final; late updates are ignored',
    () => {
      assert.equal(nextStatus('queued', 'sent'), 'sent');
      assert.equal(nextStatus('sent', 'delivered'), 'delivered');
      assert.equal(nextStatus('sent', 'read'), 'read');
      assert.equal(nextStatus('delivered', 'sent'), null);
      assert.equal(nextStatus('read', 'delivered'), null);
      assert.equal(nextStatus('read', 'failed'), null);
      assert.equal(nextStatus('failed', 'delivered'), null);
      assert.equal(nextStatus('delivered', 'failed'), 'failed');
      assert.equal(nextStatus('sent', 'sent'), null);
    },
  );

  await check('Graph errors are read by code; known codes get plain words', () => {
    const e = parseGraphError({
      error: {
        message: '(#131047) Re-engagement message',
        type: 'OAuthException',
        code: 131047,
        error_data: {
          messaging_product: 'whatsapp',
          details: 'Message failed to send because more than 24 hours have passed.',
        },
        fbtrace_id: 'A1',
      },
    });
    assert.equal(e.code, 131047);
    assert.match(failureText(e.code, e.details), /24 hours/);
    assert.equal(failureText(999999, 'fallback text'), 'fallback text');
    assert.deepEqual(parseGraphError(null), {
      code: null,
      message: 'The request was refused.',
      details: '',
    });
  });

  await check(
    'the Graph client: send, error, template calls, health, and the token never appears in a message',
    async () => {
      const calls: { url: string; init: RequestInit }[] = [];
      const reply =
        (status: number, json: unknown) =>
        async (url: string, init: RequestInit): Promise<Response> => {
          calls.push({ url, init });
          return new Response(JSON.stringify(json), {
            status,
            headers: { 'content-type': 'application/json' },
          });
        };
      const creds = {
        wabaId: '102290129340398',
        phoneNumberId: '106540352242922',
        accessToken: TOKEN,
      };
      const sent = await sendMessage(
        creds,
        buildTextPayload('+16505551234', 'Hi', false),
        reply(200, {
          messaging_product: 'whatsapp',
          contacts: [{ input: '+16505551234', wa_id: '16505551234' }],
          messages: [{ id: 'wamid.X' }],
        }),
      );
      assert.deepEqual(sent, { messageId: 'wamid.X', waId: '16505551234' });
      assert.equal(calls[0]?.url, 'https://graph.facebook.com/v26.0/106540352242922/messages');
      assert.equal(
        (calls[0]?.init.headers as Record<string, string>).authorization,
        `Bearer ${TOKEN}`,
      );
      await assert.rejects(
        sendMessage(
          creds,
          {},
          reply(400, {
            error: { message: `bad token ${TOKEN}`, code: 131047, error_data: { details: 'x' } },
          }),
        ),
        (e: unknown) =>
          e instanceof WhatsAppApiError &&
          e.code === 131047 &&
          !e.message.includes(TOKEN) &&
          /24 hours/.test(e.message),
      );
      await assert.rejects(
        sendMessage(creds, {}, async () => {
          throw new Error(`network down ${TOKEN}`);
        }),
        (e: unknown) => e instanceof WhatsAppApiError && !e.message.includes(TOKEN),
      );
      await assert.rejects(sendMessage(creds, {}, reply(200, { messages: [] })), WhatsAppApiError);
      const made = await createTemplate(
        creds,
        { name: 'x' },
        reply(200, { id: '1259544702043867', status: 'PENDING', category: 'UTILITY' }),
      );
      assert.deepEqual(made, { id: '1259544702043867', status: 'PENDING', category: 'UTILITY' });
      assert.equal(
        calls[calls.length - 1]?.url,
        'https://graph.facebook.com/v26.0/102290129340398/message_templates',
      );
      let page = 0;
      const listed = await listTemplates(creds, async (url, init) => {
        calls.push({ url, init });
        page += 1;
        return new Response(
          JSON.stringify(
            page === 1
              ? {
                  data: [
                    {
                      id: '1',
                      name: 'a',
                      language: 'en_US',
                      category: 'UTILITY',
                      status: 'APPROVED',
                      parameter_format: 'NAMED',
                      components: [{ type: 'BODY', text: 'Hi' }],
                    },
                  ],
                  paging: { cursors: { after: 'CUR' }, next: 'https://graph.facebook.com/next' },
                }
              : {
                  data: [
                    {
                      id: '2',
                      name: 'b',
                      language: 'de',
                      category: 'MARKETING',
                      status: 'PENDING',
                      components: [],
                    },
                    { id: '3', name: 'Bad Name', language: 'de' },
                  ],
                  paging: { cursors: { after: 'CUR2' } },
                },
          ),
          { status: 200 },
        );
      });
      assert.equal(listed.length, 3);
      assert.equal(listed[0]?.parameterFormat, 'named');
      assert.equal(listed[1]?.category, 'marketing');
      assert.match(calls[calls.length - 1]?.url ?? '', /after=CUR$/);
      const health = await phoneHealth(
        creds,
        reply(200, {
          data: [
            {
              verified_name: "Jasper's Market",
              display_phone_number: '+1 631-555-5555',
              id: '106540352242922',
              quality_rating: 'GREEN',
            },
          ],
        }),
      );
      assert.deepEqual(health, {
        found: true,
        verifiedName: "Jasper's Market",
        displayPhone: '+1 631-555-5555',
        quality: 'GREEN',
      });
      assert.equal(
        (await phoneHealth(creds, reply(200, { data: [{ id: '999', quality_rating: 'GREEN' }] })))
          .found,
        false,
      );
    },
  );

  await check('inputs are strict and checked', () => {
    assert.ok(sendTextInput.safeParse({ to: '+1 650 555 1234', body: 'Hi' }).success);
    assert.equal(sendTextInput.parse({ to: '16505551234', body: 'Hi' }).to, '+16505551234');
    assert.ok(!sendTextInput.safeParse({ to: 'nope', body: 'Hi' }).success);
    assert.ok(!sendTextInput.safeParse({ to: '+16505551234', body: '' }).success);
    assert.ok(!sendTextInput.safeParse({ to: '+16505551234', body: 'x'.repeat(4097) }).success);
    assert.ok(!sendTextInput.safeParse({ to: '+16505551234', body: 'Hi', from: '+1' }).success);
    assert.ok(!sendTemplateInput.safeParse({ to: '+16505551234', templateId: 'x' }).success);
    assert.ok(
      sendTemplateInput.safeParse({
        to: '+16505551234',
        templateId: '11111111-1111-4111-8111-111111111111',
        values: { '1': 'A' },
      }).success,
    );
    assert.ok(
      accountInput.safeParse({
        wabaId: '102290129340398',
        phoneNumberId: '106540352242922',
        accessToken: TOKEN,
        appSecret: 'secret-0123456789abcd',
      }).success,
    );
    assert.equal(
      accountInput.parse({
        wabaId: '102290129340398',
        phoneNumberId: '106540352242922',
        accessToken: TOKEN,
        appSecret: 'secret-0123456789abcd',
      }).sandbox,
      true,
    );
    assert.ok(
      !accountInput.safeParse({
        wabaId: 'abc',
        phoneNumberId: '106540352242922',
        accessToken: TOKEN,
        appSecret: 'secret-0123456789abcd',
      }).success,
    );
    assert.ok(
      !accountInput.safeParse({
        wabaId: '102290129340398',
        phoneNumberId: '106540352242922',
        accessToken: 'short',
        appSecret: 'secret-0123456789abcd',
      }).success,
    );
    assert.ok(
      !accountInput.safeParse({
        wabaId: '102290129340398',
        phoneNumberId: '106540352242922',
        accessToken: 'has space in it token',
        appSecret: 'secret-0123456789abcd',
      }).success,
    );
  });

  process.stdout.write(`step16-whatsapp: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
