// path: config/s16-compliance.ts
// Settings of the compliance pages and routes.
/** A change of a country switch or a list import needs an identity check this fresh. */
export const COMPLIANCE_STEP_UP_SECONDS = 900;
/** The import route accepts a larger body than the default because a list holds many entries. */
export const COMPLIANCE_IMPORT_MAX_BYTES = 10_000_000;
