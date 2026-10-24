// path: lib/storage/validate/svg.ts
// SVG files are code. They are sanitized and then rasterized to PNG, so no vector markup is ever stored or served.
import DOMPurify from 'isomorphic-dompurify';
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from './limits';
import { Reject } from './types';

const MAX_SVG_BYTES = 2 * 1024 * 1024;

/** Removes scripts, event handlers, foreignObject, external references and entity declarations. */
export function sanitizeSvg(source: string): string {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<\?php/i.test(source)) {
    throw new Reject('svg_invalid', 'The image uses features that are not allowed.');
  }
  const clean = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: [
      'script',
      'foreignObject',
      'use',
      'image',
      'a',
      'style',
      'animate',
      'set',
      'animateMotion',
      'animateTransform',
    ],
    FORBID_ATTR: ['style', 'href', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
  });
  if (!/<svg[\s>]/i.test(clean)) throw new Reject('svg_invalid', 'The image is not a valid SVG.');
  return clean;
}

export async function rasterizeSvg(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.length > MAX_SVG_BYTES) throw new Reject('too_large', 'The SVG is larger than 2 MB.');
  const clean = sanitizeSvg(Buffer.from(bytes).toString('utf8'));
  try {
    return await sharp(Buffer.from(clean), { limitInputPixels: MAX_IMAGE_PIXELS, density: 144 })
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new Reject('svg_invalid', 'The image is not a valid SVG.');
  }
}
