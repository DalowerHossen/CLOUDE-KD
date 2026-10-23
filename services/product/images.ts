// path: services/product/images.ts
// Product pictures. They go through the storage contract (encrypted, checked by the file validator); the product keeps
// only the file ids (five at most, the first is the main picture). A picture can be read only through its product.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { MAX_IMAGES } from '@/lib/catalog/products';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export const imageUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    /** Base64 of the image, at most about 1.9 MB of image data. */
    dataBase64: z
      .string()
      .min(8)
      .max(2_600_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

async function ids(
  companyId: string,
  productId: string,
): Promise<{ list: string[]; version: number }> {
  const { data, error } = await getAdminSupabase()
    .from('products')
    .select('image_file_ids, version')
    .eq('id', productId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    list: (data.image_file_ids as string[] | null) ?? [],
    version: Math.trunc(Number(data.version)),
  };
}

async function write(
  companyId: string,
  productId: string,
  version: number,
  list: string[],
): Promise<void> {
  const r = await getAdminSupabase()
    .from('products')
    .update({ image_file_ids: list })
    .eq('id', productId)
    .eq('company_id', companyId)
    .eq('version', version)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
}

export async function addImage(
  actor: Actor,
  productId: string,
  input: z.infer<typeof imageUploadSchema>,
): Promise<{ fileId: string }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const current = await ids(companyId, productId);
  if (current.list.length >= MAX_IMAGES)
    throw new ValidationError(`An item can have ${MAX_IMAGES} pictures at most.`);
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
  const storage = getService('storage');
  const record = await storage.put({
    companyId,
    category: 'attachment',
    name: input.name,
    bytes,
    mimeType: input.mimeType,
  });
  if (!/^image\/(png|jpeg|webp)$/.test(record.mimeType)) {
    await storage.remove(record.id).catch(() => undefined);
    throw new ValidationError('Use a PNG, JPEG or WebP picture.');
  }
  try {
    await write(companyId, productId, current.version, [...current.list, record.id]);
  } catch (error) {
    await storage.remove(record.id).catch(() => undefined);
    throw error;
  }
  await getService('audit').record({
    action: 'product.image_added',
    resourceType: 'product',
    resourceId: productId,
    companyId,
    metadata: { by: actor.userId },
  });
  return { fileId: record.id };
}

export async function removeImage(actor: Actor, productId: string, fileId: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const current = await ids(companyId, productId);
  if (!current.list.includes(fileId)) throw new NotFoundError();
  await write(
    companyId,
    productId,
    current.version,
    current.list.filter((x) => x !== fileId),
  );
  await getService('storage')
    .remove(fileId)
    .catch(() => undefined);
  await getService('audit').record({
    action: 'product.image_removed',
    resourceType: 'product',
    resourceId: productId,
    companyId,
    metadata: { by: actor.userId },
  });
}

/** The bytes of one picture, only when it belongs to a product of the company. */
export async function readImage(
  companyId: string,
  productId: string,
  fileId: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const current = await ids(companyId, productId);
  if (!current.list.includes(fileId)) throw new NotFoundError();
  const file = await getService('storage').get(fileId);
  if (file.record.companyId !== companyId) throw new NotFoundError();
  return { bytes: file.bytes, mimeType: file.record.mimeType };
}
