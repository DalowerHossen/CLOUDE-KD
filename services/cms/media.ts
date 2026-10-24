// path: services/cms/media.ts
// Media library of the public site: images stored through the storage contract (category cms, platform file).
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const MEDIA_CATEGORY = 'cms';

export const uploadSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    mimeType: z.string().trim().min(3).max(100),
    /** Base64 text of the file, at most about 3.5 MB of image data. */
    dataBase64: z
      .string()
      .min(8)
      .max(4_800_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export async function uploadMedia(
  input: z.infer<typeof uploadSchema>,
): Promise<{ id: string; name: string; mimeType: string }> {
  if (!input.mimeType.startsWith('image/'))
    throw new ValidationError('Only images can be added to pages.');
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'));
  const record = await getService('storage').put({
    companyId: null,
    category: MEDIA_CATEGORY,
    name: input.name,
    bytes,
    mimeType: input.mimeType,
  });
  if (!record.mimeType.startsWith('image/'))
    throw new ValidationError('Only images can be added to pages.');
  return { id: record.id, name: record.name, mimeType: record.mimeType };
}

export async function listMedia(): Promise<
  { id: string; name: string; mimeType: string; sizeBytes: number; createdAt: string }[]
> {
  const { data, error } = await getAdminSupabase()
    .from('files')
    .select('id, name, mime_type, size_bytes, created_at')
    .eq('category', MEDIA_CATEGORY)
    .is('company_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((f) => ({
    id: String(f.id),
    name: String(f.name),
    mimeType: String(f.mime_type),
    sizeBytes: Number(f.size_bytes),
    createdAt: String(f.created_at),
  }));
}

/** A public image: only platform files of the CMS category with an image type are ever served without a session. */
export async function readPublicMedia(
  id: string,
): Promise<{ bytes: Uint8Array; mimeType: string; name: string }> {
  const { data, error } = await getAdminSupabase()
    .from('files')
    .select('id, mime_type, name')
    .eq('id', id)
    .eq('category', MEDIA_CATEGORY)
    .is('company_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || !String(data.mime_type).startsWith('image/')) throw new NotFoundError();
  const file = await getService('storage').get(id);
  return { bytes: file.bytes, mimeType: String(data.mime_type), name: String(data.name) };
}
