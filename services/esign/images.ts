// path: services/esign/images.ts
// Signature pictures. A drawn signature or an uploaded picture is decoded and drawn again as a small PNG, so the stored
// file is always a real image without metadata or hidden content, whatever the browser sent.
import sharp from 'sharp';
import { ValidationError } from '@/lib/errors';
import { sha256Hex } from '@/lib/utils/hash';

export const MAX_SIGNATURE_UPLOAD_BYTES = 500_000;
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

export interface SignatureImage {
  bytes: Uint8Array;
  hash: string;
}

/** `data` is base64 (a data URL prefix is allowed). Only PNG and JPEG pass, and only if they really decode. */
export async function normalizeSignatureImage(data: string): Promise<SignatureImage> {
  const base64 = data.replace(/^data:image\/(png|jpeg);base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw new ValidationError('The signature picture is not valid.');
  const raw = new Uint8Array(Buffer.from(base64, 'base64'));
  if (raw.length < 100 || raw.length > MAX_SIGNATURE_UPLOAD_BYTES)
    throw new ValidationError('The signature picture is too small or too large.');
  if (!startsWith(raw, PNG) && !startsWith(raw, JPEG))
    throw new ValidationError('Use a PNG or JPEG picture.');
  try {
    const out = await sharp(raw, { limitInputPixels: 20_000_000 })
      .flatten({ background: '#ffffff' })
      .resize({ width: 600, height: 200, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const bytes = new Uint8Array(out);
    return { bytes, hash: await sha256Hex(bytes) };
  } catch {
    throw new ValidationError('The signature picture could not be read.');
  }
}
