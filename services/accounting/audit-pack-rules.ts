// path: services/accounting/audit-pack-rules.ts
// The audit pack as pure functions: the checksum of each section, the manifest that lists them with the result of the audit chain
// check, and the checksum of the manifest. An auditor can recompute the section checksums from the file and compare them with the
// manifest, and the manifest checksum with the record the system kept when the pack was made.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { dayText } from './journal-rules';

export const packInput = z
  .object({ from: dayText, to: dayText })
  .strict()
  .refine((v) => v.to >= v.from, {
    message: 'The period cannot end before it starts.',
    path: ['to'],
  })
  .refine(
    (v) => Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`) <= 400 * 86_400_000,
    {
      message: 'An audit pack covers at most about one year.',
      path: ['to'],
    },
  );

export const MAX_PACK_ROWS = 150_000;

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

export interface PackSection {
  name: string;
  rows: number;
  sha256: string;
}

export interface ChainFacts {
  ok: boolean;
  checkedFrom: string;
  checkedTo: string;
  firstBrokenSequence: string | null;
  gaps: string[];
  headSequence: string | null;
  headHash: string | null;
}

export interface Manifest {
  version: 1;
  companyId: string;
  companyName: string;
  period: { from: string; to: string };
  generatedAt: string;
  generatedBy: string;
  sections: PackSection[];
  chain: ChainFacts;
  notes: string[];
}

/** One section: its rows as JSON text and the checksum of that text. */
export function sectionOf(
  name: string,
  rows: readonly unknown[],
): { section: PackSection; json: string } {
  const json = JSON.stringify(rows);
  return { section: { name, rows: rows.length, sha256: sha256Hex(json) }, json };
}

/** The manifest text (fixed key order) and its checksum. */
export function manifestOf(m: Manifest): { json: string; sha256: string } {
  const ordered = {
    version: m.version,
    companyId: m.companyId,
    companyName: m.companyName,
    period: m.period,
    generatedAt: m.generatedAt,
    generatedBy: m.generatedBy,
    sections: m.sections.map((s) => ({ name: s.name, rows: s.rows, sha256: s.sha256 })),
    chain: m.chain,
    notes: m.notes,
  };
  const json = JSON.stringify(ordered);
  return { json, sha256: sha256Hex(json) };
}

/** What an auditor does with the file: recompute each section's checksum from its rows and compare with the manifest. */
export function checkPack(file: {
  manifest: Manifest;
  manifestSha256: string;
  sections: Record<string, unknown[]>;
}): {
  ok: boolean;
  problems: string[];
} {
  const problems: string[] = [];
  if (manifestOf(file.manifest).sha256 !== file.manifestSha256)
    problems.push('The manifest does not match its checksum.');
  for (const s of file.manifest.sections) {
    const rows = file.sections[s.name];
    if (!rows) problems.push(`Section ${s.name} is missing.`);
    else if (rows.length !== s.rows)
      problems.push(`Section ${s.name} has ${rows.length} rows, the manifest says ${s.rows}.`);
    else if (sectionOf(s.name, rows).section.sha256 !== s.sha256)
      problems.push(`Section ${s.name} does not match its checksum.`);
  }
  if (!file.manifest.chain.ok)
    problems.push('The audit chain check did not pass when the pack was made.');
  return { ok: problems.length === 0, problems };
}
