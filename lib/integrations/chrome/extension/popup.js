// path: lib/integrations/chrome/extension/popup.js
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JavaScript that runs in the browser, so it has no type annotations */
// The popup of the browser extension. It talks to the public API of the platform with the company's API key, which is kept in
// chrome.storage.local (this browser only). It makes no request to any other address and loads no remote code.
const API = globalThis.KD_API_ORIGIN + '/api/public/v1';
const $ = (id) => document.getElementById(id);
let key = '';

function say(text, bad) {
  const el = $('status');
  el.textContent = text;
  el.className = bad ? 'error' : '';
}

async function call(path, options) {
  const headers = { authorization: 'Bearer ' + key };
  if (options && options.body) headers['content-type'] = 'application/json';
  if (options && options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const response = await fetch(API + path, {
    method: (options && options.method) || 'GET',
    headers,
    body: options && options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json && json.error && json.error.message;
    throw new Error(message || 'The request failed (' + response.status + ').');
  }
  return json.data;
}

function line(label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

async function loadSummary() {
  const box = $('summary');
  box.replaceChildren();
  try {
    const s = await call('/automation/summary');
    const rows = [
      ['Draft invoices', s.draft],
      ['Open invoices', s.sent],
      ['Overdue', s.overdue],
      ['Paid', s.paid],
      ['Still owed (USD)', s.amount_due],
    ];
    for (const [label, value] of rows) box.append(...line(label, String(value)));
  } catch (error) {
    say(error.message, true);
  }
}

let clients = [];
async function loadClients() {
  clients = await call('/clients?limit=100');
  const select = $('client');
  select.replaceChildren();
  for (const c of clients) {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.name;
    select.append(option);
  }
}

function showResults() {
  const term = $('search').value.trim().toLowerCase();
  const list = $('results');
  list.replaceChildren();
  if (term.length < 2) return;
  const found = clients
    .filter((c) => (c.name + ' ' + (c.email || '')).toLowerCase().includes(term))
    .slice(0, 8);
  for (const c of found) {
    const li = document.createElement('li');
    li.textContent = c.name + (c.email ? ' - ' + c.email : '');
    list.append(li);
  }
}

function newKey() {
  return 'ext-' + crypto.randomUUID();
}

async function createDraft() {
  const amount = $('amount').value.trim();
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(amount)) return say('Enter the amount like 120.50.', true);
  const description = $('description').value.trim();
  if (description === '') return say('Say what the invoice is for.', true);
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  try {
    const invoice = await call('/invoices', {
      method: 'POST',
      idempotencyKey: newKey(),
      body: {
        client_id: $('client').value,
        issue_date: today,
        due_date: due,
        items: [{ description, quantity: '1', unit_price: amount, tax_rate: '0' }],
      },
    });
    say('Draft ' + invoice.number + ' created.', false);
    $('description').value = '';
    $('amount').value = '';
    await loadSummary();
  } catch (error) {
    say(error.message, true);
  }
}

async function start() {
  const saved = await chrome.storage.local.get('apiKey');
  key = typeof saved.apiKey === 'string' ? saved.apiKey : '';
  if (key === '') return say('Paste your API key to begin.', false);
  try {
    await loadClients();
    await loadSummary();
    say('', false);
  } catch (error) {
    say(error.message, true);
  }
}

$('save').addEventListener('click', async () => {
  const value = $('key').value.trim();
  if (!/^kd_(live|test)_[0-9A-Za-z]{32}$/.test(value))
    return say('That is not an API key of this platform.', true);
  await chrome.storage.local.set({ apiKey: value });
  $('key').value = '';
  await start();
});
$('forget').addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey');
  key = '';
  $('summary').replaceChildren();
  $('results').replaceChildren();
  say('The key was removed from this browser.', false);
});
$('search').addEventListener('input', showResults);
$('create').addEventListener('click', () => void createDraft());
void start();
