// path: lib/i18n/strings/en/s16-developers.ts
// Strings of the developer pages and API keys (STEP 16). English only.
export const strings = {
  nav: { developers: 'Developers' },
  common: {
    loadError: 'The data could not be loaded. Try again.',
    done: 'Saved.',
    failed: 'The action failed. Try again.',
    needStepUp:
      'Confirm it is you first with the box on the account security page, then try again.',
    none: 'None',
  },
  scopes: {
    'read:clients': 'Read clients',
    'write:clients': 'Create and change clients',
    'read:products': 'Read products',
    'write:products': 'Create and change products',
    'read:invoices': 'Read invoices',
    'write:invoices': 'Create and change invoices',
    'read:payments': 'Read payments',
    'read:estimates': 'Read estimates',
    'write:estimates': 'Create and change estimates',
    'read:webhooks': 'Read webhook endpoints',
    'write:webhooks': 'Manage webhook endpoints',
  },
  keys: {
    title: 'API keys',
    description:
      'Keys let your own software read your data. A key is shown once, when it is made. Use a sandbox key to try the API on test data.',
    states: { active: 'Active', expired: 'Expired', revoked: 'Revoked' },
    modes: { live: 'Live', sandbox: 'Sandbox' },
    secretOnce: 'Copy the key now. It is shown only once.',
    copy: 'Copy',
    copied: 'Copied.',
    empty: 'No keys yet.',
    newTitle: 'Make a key',
    name: 'Name',
    mode: 'Mode',
    scopes: 'What the key may do',
    rateLimit: 'Requests per minute',
    expiresIn: 'Expires after (days, empty for never)',
    make: 'Make the key',
    columns: {
      name: 'Name',
      key: 'Key',
      mode: 'Mode',
      state: 'State',
      lastUsed: 'Last used',
      expires: 'Expires',
    },
    never: 'Never',
    rotate: 'Rotate',
    rotateOverlap: 'The old key works for 24 more hours.',
    revoke: 'Revoke',
    revoked: 'The key was revoked.',
    details: 'Details',
    usageTitle: 'Usage',
    usageEmpty: 'No requests yet.',
    usageColumns: { day: 'Day', requests: 'Requests', errors: 'Errors' },
    back: 'Back to the keys',
    docsLink: 'Read the API documentation',
    openapiLink: 'OpenAPI document',
    scopesLabel: 'Scopes',
    limitLabel: 'Limit per minute',
  },
  docs: {
    title: 'API documentation',
    description: 'Version 1 of the public API.',
    authTitle: 'Authentication',
    authBody:
      'Send your key in the Authorization header: Authorization: Bearer <key>. A key that is missing, wrong, expired or revoked always gets the same answer (401). A key without the needed scope gets 403.',
    limitsTitle: 'Rate limits',
    limitsBody:
      'Each key has a limit per minute. Every answer has X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset. Over the limit the answer is 429 with a Retry-After header.',
    paginationTitle: 'Pagination, filters and sort',
    paginationBody:
      'Lists return up to limit items (1 to 100, 25 by default). When more items follow, meta.next_cursor holds the cursor; send it as the cursor parameter to get the next page. Use sort=created_asc or created_desc and updated_since to read only what changed.',
    idempotencyTitle: 'Idempotency',
    idempotencyBody:
      'Calls that create records need an Idempotency-Key header (8 to 128 characters). Sending the same key with the same body again returns the first answer; the same key with a different body is refused.',
    sandboxTitle: 'Sandbox',
    sandboxBody:
      'A sandbox key (it starts with kd_test_) works on separate test data and never touches your real records. Creating and changing records works with sandbox keys only for now; live keys can read.',
    errorsTitle: 'Errors',
    errorsBody:
      'Errors have the form { "error": { "code", "message", "details", "correlation_id" } }. Quote the correlation_id when you ask for support.',
    moneyTitle: 'Money and dates',
    moneyBody:
      'All amounts are USD, written as text with up to four decimals, for example "12.5000". Dates are YYYY-MM-DD and times are ISO 8601.',
    endpointsTitle: 'Endpoints',
    columns: { method: 'Method', path: 'Path', scope: 'Scope', summary: 'What it does' },
    open: 'Open',
    changelogTitle: 'Changelog',
    changelog: {
      v100: '1.0.0: clients, products, invoices, payments and estimates can be read; sandbox keys can create test records.',
    },
  },
} as const;
