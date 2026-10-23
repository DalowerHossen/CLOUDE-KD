// path: services/company/logo.ts
// The company logo. It goes through the storage contract (category "logo", encrypted, checked by the file validator),
// and only the file id is kept in the branding section. A new logo applies to documents made after the change; old
// files stay as they are. Only the logo of the signed-in company can be read here.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Actor } from '@/types/contracts';
import { getSection, saveSection } from './settings';

export const logoUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    /** Base64 of the image, at most about 1.4 MB of image data. */
    dataBase64: z
      .string()
      .min(8)
      .max(1_900_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export async function uploadLogo(
  actor: Actor,
  input: z.infer<typeof logoUploadSchema>,
): Promise<{ fileId: string }> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
  const record = await getService('storage').put({
    companyId: actor.companyId,
    category: 'logo',
    name: input.name,
    bytes,
    mimeType: input.mimeType,
  });
  // The validator may change the type (for example after re-encoding); anything but a raster image is refused.
  if (!/^image\/(png|jpeg|webp)$/.test(record.mimeType)) {
    await getService('storage')
      .remove(record.id)
      .catch(() => undefined);
    throw new ValidationError('Use a PNG, JPEG or WebP image.');
  }
  const branding = await getSection(actor.companyId, 'branding');
  await saveSection(
    actor,
    'branding',
    { ...branding.value, logoFileId: record.id },
    branding.version,
  );
  return { fileId: record.id };
}

export async function readLogo(
  companyId: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const branding = await getSection(companyId, 'branding');
  const id = branding.value.logoFileId;
  if (!id) throw new NotFoundError();
  const file = await getService('storage').get(id);
  if (file.record.companyId !== companyId || file.record.category !== 'logo')
    throw new NotFoundError();
  return { bytes: file.bytes, mimeType: file.record.mimeType };
}
