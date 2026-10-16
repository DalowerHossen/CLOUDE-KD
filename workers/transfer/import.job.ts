// path: workers/transfer/import.job.ts
// Background run of a spreadsheet import, a hundred rows at a time.
import { z } from 'zod';
import { runImportChunk } from '@/services/import/imports';
import type { JobHandlerDefinition } from '@/services/jobs/handler-types';

const payload = z.object({ jobId: z.string().uuid() }).strict();

export const jobHandler: JobHandlerDefinition = {
  name: 'transfer.import',
  async handle(raw, context) {
    const parsed = payload.safeParse(raw);
    if (!parsed.success || !context.companyId) return;
    await runImportChunk(parsed.data.jobId, context.companyId);
  },
};
