// path: lib/compliance/rules.ts
// Inputs of the compliance routes: country restrictions and the import of a sanctions list.
import { z } from 'zod';
import { nameTokens } from './match';

export const COUNTRY_MODES = ['block', 'review'] as const;
export const COUNTRY_SOURCES = ['un_security_council', 'manual'] as const;
export const SANCTION_SOURCES = ['ofac', 'un'] as const;
export const MAX_IMPORT_ENTRIES = 60_000;

const code = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Use a two-letter country code in capitals.')
  .refine((c) => c !== 'ZZ', 'Use a real country code.');

export const countryInput = z
  .object({
    countryCode: code,
    mode: z.enum(COUNTRY_MODES).default('block'),
    source: z.enum(COUNTRY_SOURCES).default('manual'),
    reference: z.string().trim().max(300).default(''),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export const countryPatch = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(COUNTRY_MODES).optional(),
    reason: z.string().trim().min(10).max(500).optional(),
    reference: z.string().trim().max(300).optional(),
    version: z.number().int().min(1),
  })
  .strict()
  .refine(
    (v) =>
      v.enabled !== undefined ||
      v.mode !== undefined ||
      v.reason !== undefined ||
      v.reference !== undefined,
    'Nothing to change.',
  );

const entry = z
  .object({
    sourceUid: z.string().trim().min(1).max(100),
    kind: z.enum(['person', 'business']),
    name: z.string().trim().min(1).max(500),
    aliases: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
    countries: z.array(code).max(30).default([]),
    programs: z.string().trim().max(300).default(''),
  })
  .strict();

export const sanctionsImport = z
  .object({
    source: z.enum(SANCTION_SOURCES),
    entries: z.array(entry).min(1).max(MAX_IMPORT_ENTRIES),
    note: z.string().trim().max(300).default(''),
    force: z.boolean().default(false),
  })
  .strict();

export type SanctionsImport = z.infer<typeof sanctionsImport>;

/** The row sent to the database: the tokens of the name and of every alias, for the candidate search. */
export function toRow(e: z.infer<typeof entry>): {
  source_uid: string;
  kind: string;
  name: string;
  aliases: string[];
  search_tokens: string[];
  countries: string[];
  programs: string;
} {
  const tokens = new Set<string>();
  for (const n of [e.name, ...e.aliases]) for (const t of nameTokens(n)) tokens.add(t);
  return {
    source_uid: e.sourceUid,
    kind: e.kind,
    name: e.name,
    aliases: e.aliases,
    search_tokens: [...tokens].slice(0, 400),
    countries: e.countries,
    programs: e.programs,
  };
}
