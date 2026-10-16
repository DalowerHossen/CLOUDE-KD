// path: lib/storage/validate/image.ts
// Raster images are decoded and encoded again. This removes metadata (EXIF, GPS, camera data), trailing data and
// anything hidden in unused chunks, and fails for files that only look like images.
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from './limits';
import { Reject, type FileKind } from './types';

export async function reencodeImage(
  bytes: Uint8Array,
  kind: Extract<FileKind, 'png' | 'jpeg' | 'gif' | 'webp'>,
): Promise<{ bytes: Buffer; removedMetadata: boolean }> {
  try {
    const input = sharp(Buffer.from(bytes), {
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: kind === 'gif' || kind === 'webp',
    });
    const meta = await input.metadata();
    const hadMetadata = Boolean(
      meta.exif || meta.icc || meta.xmp || meta.iptc || meta.comments?.length,
    );
    // Orientation is applied to the pixels first, because the EXIF tag that carried it is dropped.
    const pipeline = input.rotate();
    let out: Buffer;
    switch (kind) {
      case 'png':
        out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        break;
      case 'jpeg':
        out = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        break;
      case 'gif':
        out = await pipeline.gif().toBuffer();
        break;
      case 'webp':
        out = await pipeline.webp({ quality: 90 }).toBuffer();
        break;
    }
    return { bytes: out, removedMetadata: hadMetadata };
  } catch (error) {
    if (error instanceof Reject) throw error;
    throw new Reject('image_invalid', 'The image could not be read.');
  }
}
