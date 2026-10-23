// path: lib/ocr/vision.ts
// Google Cloud Vision, read from the official API description (docs/integrations/google-vision.md): the `images:annotate` request for
// one image with `DOCUMENT_TEXT_DETECTION`, and the reading of the answer into text lines with a confidence for each line. The API
// key travels as the `key` query parameter, so it is kept out of every error text and log; the address is never reported.
import {
  OCR_IMAGE_TYPES,
  OCR_MAX_IMAGE_BYTES,
  VISION_TIMEOUT_MS,
  VISION_URL,
} from '@/config/s16-ocr';
import { toInt } from '@/lib/reports/numbers';

export class OcrApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'OcrApiError';
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

export interface OcrLine {
  text: string;
  /** 0 to 1, the mean confidence of the words of the line. */
  confidence: number;
}

export interface OcrRead {
  text: string;
  lines: OcrLine[];
  /** 0 to 1, the mean confidence of the pages, or null when Vision gave none. */
  pageConfidence: number | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v !== null && typeof v === 'object' ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A confidence rounded to two decimals (this is a score from 0 to 1, never an amount of money). */
const hundredths = (x: number): number => toInt(String(x * 100 + 0.5)) / 100;

export function buildRequest(bytes: Uint8Array, languageHints: readonly string[]): Json {
  return {
    requests: [
      {
        image: { content: Buffer.from(bytes).toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        ...(languageHints.length > 0
          ? { imageContext: { languageHints: [...languageHints] } }
          : {}),
      },
    ],
  };
}

/** Rebuilds the lines of the page from the symbols and their detected breaks. */
export function parseResponse(json: unknown): OcrRead {
  const first = obj(arr(obj(json).responses)[0]);
  const status = obj(first.error);
  if (Object.keys(status).length > 0) {
    const code = num(status.code);
    // google.rpc.Code: 4 deadline exceeded, 8 resource exhausted, 14 unavailable can pass on a later try.
    const retryable = code === 4 || code === 8 || code === 14;
    throw new OcrApiError('Google could not read this image.', 200, retryable);
  }
  const full = obj(first.fullTextAnnotation);
  const lines: OcrLine[] = [];
  const pageScores: number[] = [];
  for (const page of arr(full.pages)) {
    const p = obj(page);
    const pc = num(p.confidence);
    if (pc !== null) pageScores.push(pc);
    for (const block of arr(p.blocks)) {
      const b = obj(block);
      if (typeof b.blockType === 'string' && b.blockType !== 'TEXT' && b.blockType !== 'TABLE')
        continue;
      for (const para of arr(b.paragraphs)) {
        let text = '';
        let scores: number[] = [];
        const endLine = (): void => {
          const t = text.replace(/\s+/g, ' ').trim();
          if (t !== '')
            lines.push({
              text: t,
              confidence: scores.length === 0 ? 0 : mean(scores),
            });
          text = '';
          scores = [];
        };
        for (const word of arr(obj(para).words)) {
          const w = obj(word);
          const wc = num(w.confidence);
          if (wc !== null) scores.push(wc);
          for (const sym of arr(w.symbols)) {
            const s = obj(sym);
            text += typeof s.text === 'string' ? s.text : '';
            const br = obj(obj(obj(s.property).detectedBreak));
            const kind = typeof br.type === 'string' ? br.type : '';
            if (kind === 'SPACE' || kind === 'SURE_SPACE') text += ' ';
            else if (kind === 'EOL_SURE_SPACE' || kind === 'LINE_BREAK') endLine();
          }
        }
        endLine();
      }
    }
  }
  return {
    text: typeof full.text === 'string' ? full.text : lines.map((l) => l.text).join('\n'),
    lines,
    pageConfidence: pageScores.length === 0 ? null : mean(pageScores),
  };
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return hundredths(sum / values.length);
}

/** Sends one image to Vision and returns what was read. */
export async function readImage(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
  languageHints: readonly string[],
  fetcher: Fetcher = defaultFetcher,
): Promise<OcrRead> {
  if (!OCR_IMAGE_TYPES.includes(mimeType))
    throw new OcrApiError(
      'Only JPEG and PNG images can be read. PDF files are not read.',
      0,
      false,
    );
  if (bytes.length === 0 || bytes.length > OCR_MAX_IMAGE_BYTES)
    throw new OcrApiError('The image is empty or larger than 4 MB.', 0, false);
  let response: Response;
  try {
    response = await fetcher(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildRequest(bytes, languageHints)),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new OcrApiError('Google could not be reached. It will be tried again.', 0, true);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const refused = response.status === 400 || response.status === 401 || response.status === 403;
    throw new OcrApiError(
      refused
        ? 'Google refused the request. Check the API key and that the Cloud Vision API is turned on for it.'
        : retryable
          ? 'Google is busy. It will be tried again.'
          : 'Google could not read this image.',
      response.status,
      retryable,
    );
  }
  return parseResponse(json);
}
