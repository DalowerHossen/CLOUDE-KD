// path: scripts/verify/step16-kyc-profile.ts
// Checks of the KYC profile rules: what the platform team may save and what makes a submission ready.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-kyc-profile.ts
import assert from 'node:assert/strict';
import {
  BUSINESS_FIELDS,
  DEFAULT_PROFILE,
  businessAnswersSchema,
  missingDocuments,
  profileInput,
} from '@/lib/kyc/profile';
import { uploadSchema } from '@/lib/kyc/rules';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const base = {
  mode: 'manual',
  provider: 'none',
  presentation: 'hosted',
  requiredDocuments: ['id_front', 'id_back'],
  optionalDocuments: ['bank_proof'],
  businessFields: ['legalName'],
  version: 0,
};

check('a valid manual profile is accepted', () => {
  assert.equal(profileInput.safeParse(base).success, true);
});
check('automatic mode needs a verification service', () => {
  assert.equal(profileInput.safeParse({ ...base, mode: 'automatic' }).success, false);
  assert.equal(
    profileInput.safeParse({ ...base, mode: 'automatic', provider: 'sumsub' }).success,
    true,
  );
});
check('manual mode needs at least one required document', () => {
  assert.equal(profileInput.safeParse({ ...base, requiredDocuments: [] }).success, false);
});
check('a document cannot be both required and optional or listed twice', () => {
  assert.equal(profileInput.safeParse({ ...base, optionalDocuments: ['id_front'] }).success, false);
  assert.equal(
    profileInput.safeParse({ ...base, requiredDocuments: ['id_front', 'id_front'] }).success,
    false,
  );
});
check('unknown documents, questions and extra keys are refused', () => {
  assert.equal(profileInput.safeParse({ ...base, requiredDocuments: ['passport'] }).success, false);
  assert.equal(
    profileInput.safeParse({ ...base, businessFields: ['favoriteColor'] }).success,
    false,
  );
  assert.equal(profileInput.safeParse({ ...base, extra: 1 }).success, false);
});
check('the default profile is the four standard documents on manual review', () => {
  assert.equal(DEFAULT_PROFILE.mode, 'manual');
  assert.deepEqual(DEFAULT_PROFILE.requiredDocuments, [
    'id_front',
    'id_back',
    'business_registration',
    'address_proof',
  ]);
});
check('missing documents follow the profile, not a fixed list', () => {
  const profile = { requiredDocuments: ['id_front', 'bank_proof'] as const };
  assert.deepEqual(
    missingDocuments({ requiredDocuments: [...profile.requiredDocuments] }, new Set(['id_front'])),
    ['bank_proof'],
  );
});
check('the owner upload accepts the extra document types only', () => {
  const body = {
    name: 'a.pdf',
    mimeType: 'application/pdf',
    dataBase64: 'AAAAAAAA',
    expiresOn: null,
  };
  assert.equal(uploadSchema.safeParse({ ...body, docType: 'bank_proof' }).success, true);
  assert.equal(uploadSchema.safeParse({ ...body, docType: 'selfie' }).success, false);
});
check('business answers must match the asked questions and reject markup', () => {
  const schema = businessAnswersSchema(['legalName', 'incorporationCountry', 'website']);
  const good = {
    legalName: 'Acme Ltd',
    incorporationCountry: 'SG',
    website: 'https://acme.example',
  };
  assert.equal(schema.safeParse(good).success, true);
  assert.equal(schema.safeParse({ ...good, legalName: '<b>x</b>' }).success, false);
  assert.equal(schema.safeParse({ ...good, incorporationCountry: 'sg' }).success, false);
  assert.equal(schema.safeParse({ ...good, website: 'javascript:alert(1)' }).success, false);
  assert.equal(schema.safeParse({ ...good, phone: '1' }).success, false);
  assert.equal(schema.safeParse({ legalName: 'Acme Ltd' }).success, false);
});
check('every question has a unique id', () => {
  assert.equal(new Set(BUSINESS_FIELDS.map((f) => f.id)).size, BUSINESS_FIELDS.length);
});

process.stdout.write(`step16-kyc-profile: ${checks} checks passed\n`);
