// path: lib/kyc/image-prep.ts
// Browser helpers that make a document photo small before it is sent. A phone photo is often 4 to 5 MB; sent as JSON it
// is about a third larger and can pass the request limit of the host (6 MB). The photo is scaled so its longest side is at
// most MAX_SIDE pixels and saved as JPEG, which keeps text readable and is usually under 1 MB.
export const MAX_SIDE = 2000;
/** Target size of the prepared photo. */
export const TARGET_BYTES = 3_000_000;
/** A PDF is sent as it is, so it must stay small enough for the request limit once it is base64 coded. */
export const MAX_PDF_BYTES = 4_000_000;

export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // fall through to the image element
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('unreadable'));
    img.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

export interface PreparedImage {
  blob: Blob;
  /** Size of the original picture, for the "too small" check. */
  originalWidth: number;
  originalHeight: number;
}

/** Scales the photo down and returns a JPEG. Throws when the file is not a readable picture. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const decoded = await decode(file);
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    let blob: Blob | null = null;
    for (const quality of [0.88, 0.78, 0.66, 0.5]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error('encode failed');
    return { blob, originalWidth: decoded.width, originalHeight: decoded.height };
  } finally {
    decoded.close();
  }
}
