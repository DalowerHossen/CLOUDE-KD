// path: config/s16-ocr.ts
// Receipt OCR constants (STEP 16.8). Facts are from docs/integrations/google-vision.md (read 2026-10-23).
export const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
export const VISION_TIMEOUT_MS = 25_000;
/** Our own cautious limit on the image sent to Google; the real limit was not read. */
export const OCR_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const OCR_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png'];
export const OCR_BATCH = 5;
export const OCR_LOCK_SECONDS = 300;
export const OCR_MAX_ATTEMPTS = 3;
/** Minutes to wait before the next try after a temporary failure: after the first, after the second. */
export const OCR_RETRY_MINUTES: readonly number[] = [2, 10];
export const OCR_ENQUEUE_BATCH = 20;
export const OCR_STEP_UP_SECONDS = 300;
export const OCR_DEFAULT_DAILY_LIMIT = 200;
/** A field below this confidence is shown as "check this" on the page. */
export const OCR_LOW_CONFIDENCE = 0.7;
