// path: lib/env/s09.ts
// Environment fragment of STEP 09: an optional folder with a Unicode font for PDF documents.
import { z } from 'zod';

export const serverShape = {
  /**
   * Folder that holds regular.ttf and bold.ttf of a font with the characters your clients need (for example a Noto
   * Sans file). Without it PDFs use the built-in Helvetica, which covers Western European text only; other
   * characters are replaced by a question mark.
   */
  PDF_FONT_DIR: z.string().min(1).max(300).optional(),
};
