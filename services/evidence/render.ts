// path: services/evidence/render.ts
// Draws the evidence pack PDF for collected data.
import 'server-only';
import { createElement } from 'react';
import { getServerEnv } from '@/lib/env';
import { EvidencePackPdf } from '@/lib/pdf/evidence-pack-pdf';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import type { EvidencePackData } from './types';

export async function renderEvidencePackPdf(data: EvidencePackData): Promise<Uint8Array> {
  setupFonts(getServerEnv().PDF_FONT_DIR);
  return (await renderPdf(createElement(EvidencePackPdf, { data }))).bytes;
}
