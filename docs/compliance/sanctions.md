# Country restrictions and sanctions screening

## What exists

1. **Country switch** (`/admin/compliance/restrictions`, routes `/api/admin/compliance/countries`). A platform admin (permission `compliance.manage`, fresh identity check) adds a country and turns it on or off.
   - Mode `block`: every request from the country is refused at the network check (all contexts). The change is live within 30 seconds on every server instance.
   - Mode `review`: the service stays open; KYC screening reports a match for a person whose nationality is that country, so a reviewer decides.
   - The source field records why (`un_security_council` or `manual`) and the reference field keeps the resolution or notice number. Every change is in the audit log.
   - The platform does **not** read United Nations notices by itself. A person records the measure here. The United Nations does not publish a list of "countries to switch off"; its measures are regimes with listed persons and entities, and a few sectoral measures, so a human must decide what a measure means for the service.
   - An address with no known country is not blocked by this switch. Platform staff on a whitelisted address are not blocked either (so an admin cannot lock the team out).
2. **Sanctions lists** (tables `sanctions_entries`, `sanctions_sources`). The lists of OFAC (`ofac`) and the UN Security Council (`un`) are kept in the platform database in a normalized form. When a KYC review starts, the company name and every owner are checked against them (`services/compliance/sanctions.ts`). A possible match (score 0.88 or more) makes the result `hits`, which blocks the recommendation until the reviewer rejects or asks for changes. When no list is imported, the result is `error` with the text that the names were not checked, and the reviewer checks by hand.
3. **Import** (`POST /api/admin/compliance/sanctions`, permission `compliance.manage`, fresh identity check). The body holds one whole list: `source` (`ofac` or `un`), `entries` (`sourceUid`, `kind`, `name`, `aliases`, `countries`, `programs`), optional `note` and `force`. The list is replaced in one transaction. A list less than half of the old one is refused unless `force` is true (a broken file must not empty a list).

## What is not built (and why)

- **Reading the official files.** The official download pages of OFAC and the United Nations could not be reached from the build environment (the hosts did not resolve), so their file formats could not be read in this session. Writing a parser from memory is forbidden by the project rules. Until a session that can reach the hosts reads the official documentation and adds the two readers, a person or script converts the official file to the normalized entries above and calls the import route. The readers belong in `lib/compliance/` and must end in the same `sanctionsImport` input.
- **Automatic refresh.** Both lists change often. A scheduled job that downloads, reads and imports them belongs with the readers.
- **Politically exposed persons (PEP).** No free official source exists; a paid provider would be registered through `registerScreeningProvider` (`lib/kyc/screening.ts`).
- **Typos in every word.** Candidates are found by shared words, so a name in which every word is misspelled is not found. A word with one wrong letter (five or more letters) next to an exact word is found.
- **Re-screening.** Screening runs when a review starts. Names are not re-checked when a list changes later.

## Checks

`SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-compliance.ts` and `sql/assertions/s16_016_compliance.sql`.
