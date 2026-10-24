// path: scripts/create-platform-user.mjs
// Creates a platform user (super_admin, ceo or admin_staff) in Supabase: the sign-in account, and the profile row that makes the
// account a platform user (no company). Run it once from your own computer for the first super admin; later platform users are
// made in the admin pages by a super admin.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
//   PLATFORM_USER_PASSWORD='<a strong password>' \
//   node scripts/create-platform-user.mjs --email you@example.com --name "Your Name" --role super_admin
//
// Add --dry-run to check the input without calling Supabase. For admin_staff add --sub-role kyc_reviewer (or another sub-role).
// The password is read from the environment, never from the command line, and is never printed.
const ROLES = ['super_admin', 'ceo', 'admin_staff'];
const SUB_ROLES = [
  'kyc_reviewer',
  'payment_processor',
  'support_agent',
  'content_manager',
  'compliance_officer',
  'fraud_analyst',
  'finance_analyst',
];

function say(text) {
  process.stdout.write(`${text}\n`);
}

function fail(text) {
  process.stderr.write(`${text}\n`);
  process.exit(1);
}

function option(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? '') : '';
}

/** The same rules as the sign-up page (lib/auth/password.ts): 12 to 128 characters, upper, lower, digit, special, no part of the e-mail. */
function passwordProblems(password, email) {
  const problems = [];
  if (password.length < 12) problems.push('at least 12 characters');
  if (password.length > 128) problems.push('at most 128 characters');
  if (!/[A-Z]/.test(password)) problems.push('an upper-case letter');
  if (!/[a-z]/.test(password)) problems.push('a lower-case letter');
  if (!/[0-9]/.test(password)) problems.push('a digit');
  if (!/[^A-Za-z0-9\s]/.test(password)) problems.push('a special character');
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && password.toLowerCase().includes(local))
    problems.push('no part of the e-mail address');
  return problems;
}

const email = option('email').trim().toLowerCase();
const name = option('name').trim();
const role = option('role').trim();
const subRole = option('sub-role').trim();
const dryRun = process.argv.includes('--dry-run');
const password = process.env.PLATFORM_USER_PASSWORD ?? '';
const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail('Give a valid --email.');
if (name.length < 2 || name.length > 200) fail('Give --name (2 to 200 characters).');
if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(', ')}.`);
if (role === 'admin_staff' && !SUB_ROLES.includes(subRole))
  fail(`For admin_staff give --sub-role, one of: ${SUB_ROLES.join(', ')}.`);
if (role !== 'admin_staff' && subRole !== '') fail('--sub-role is only for admin_staff.');
const problems = passwordProblems(password, email);
if (problems.length > 0)
  fail(
    `PLATFORM_USER_PASSWORD needs: ${problems.join(', ')}. Set it in the environment of this command.`,
  );
if (dryRun) {
  say(`Input is valid: ${role}${subRole ? ` (${subRole})` : ''} for ${email}. Nothing was sent.`);
  process.exit(0);
}
if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(baseUrl) &&
  !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)
)
  fail(
    'NEXT_PUBLIC_SUPABASE_URL must be the address of your Supabase project (https://<project>.supabase.co).',
  );
if (serviceKey.length < 20) fail('Set SUPABASE_SERVICE_ROLE_KEY (Project settings > API).');

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function call(method, path, body, extra = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...headers, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json };
}

const made = await call('POST', '/auth/v1/admin/users', {
  email,
  password,
  email_confirm: true,
  app_metadata: { role },
  user_metadata: { full_name: name },
});
if (!made.ok || !made.json?.id)
  fail(
    `Supabase did not create the account (status ${made.status}): ${made.json?.msg ?? made.json?.message ?? 'no detail'}`,
  );
const userId = made.json.id;

const profile = await call(
  'POST',
  '/rest/v1/profiles',
  {
    user_id: userId,
    email,
    full_name: name,
    platform_role: role,
    admin_sub_role: role === 'admin_staff' ? subRole : null,
  },
  { prefer: 'return=minimal' },
);
if (!profile.ok) {
  // Do not leave an account without a profile behind.
  await call('DELETE', `/auth/v1/admin/users/${userId}`);
  fail(
    `The profile row could not be written (status ${profile.status}), so the account was removed again. Check that the migrations were applied.`,
  );
}
say(
  `Created ${role} ${email}. Log in at <your address>/login. You will be asked to set up two-factor sign-in.`,
);
