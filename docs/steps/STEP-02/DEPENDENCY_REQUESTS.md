# STEP 02 dependency requests

None. STEP 02 uses only packages that are already in `package.json`: `@supabase/ssr`, `@supabase/supabase-js`, `@noble/ed25519`, `zod`, `server-only`.

Note for the Integrator: a PostgreSQL driver (`pg`) is not required. Locks use lease rows and SQL functions (see DECISIONS D2).
