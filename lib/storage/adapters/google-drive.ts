// path: lib/storage/adapters/google-drive.ts
// Google Drive through the REST API with the company's own OAuth link and the minimal scope (drive.file: only files
// this app created). Folder layout: tenants/{company_id}/{category}/. Holds encrypted bytes only.
import { ProviderUnavailableError, objectPath, withBackoff, type StorageAdapter } from './base';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** The part of the company link the adapter needs. Implemented by the Drive link service (05.5). */
export interface DriveAccess {
  accessToken(companyId: string): Promise<string>;
  /** Folder id cache so a folder path is looked up once. */
  folderCache(companyId: string): Promise<Record<string, string>>;
  saveFolder(companyId: string, key: string, folderId: string): Promise<void>;
  /** Called when Google answers 401/403 with a revoked or invalid grant. */
  markRevoked(companyId: string, message: string): Promise<void>;
}

class DriveHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const retryable = (error: unknown): boolean =>
  error instanceof DriveHttpError &&
  (error.status === 429 || error.status >= 500 || error.status === 403 + 1000);

export function createDriveAdapter(
  access: DriveAccess,
  fetchImpl: typeof fetch = fetch,
): StorageAdapter {
  async function call(
    companyId: string,
    url: string,
    init: RequestInit = {},
    tolerate: readonly number[] = [],
  ): Promise<Response> {
    return withBackoff(async () => {
      const token = await access.accessToken(companyId);
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 401) {
        await access.markRevoked(companyId, 'Google no longer accepts the saved sign-in.');
        throw new ProviderUnavailableError('google_drive', 'The Google Drive link was revoked.');
      }
      if (response.status === 403) {
        const text = await response.text();
        // Rate limit answers are 403 with a reason; quota or permission answers are final.
        if (/rateLimitExceeded|userRateLimitExceeded|backendError/i.test(text))
          throw new DriveHttpError(429, text.slice(0, 120));
        throw new ProviderUnavailableError('google_drive', 'Google Drive refused the request.');
      }
      if (!response.ok && !tolerate.includes(response.status))
        throw new DriveHttpError(response.status, `Drive answered ${response.status}`);
      return response;
    }, retryable).catch((error: unknown) => {
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError('google_drive', 'Google Drive is not available.');
    });
  }

  async function findFolder(
    companyId: string,
    name: string,
    parent: string | null,
  ): Promise<string | null> {
    const escaped = name.replace(/'/g, "\\'");
    const q = `name='${escaped}' and mimeType='${FOLDER_MIME}' and trashed=false and '${parent ?? 'root'}' in parents`;
    const response = await call(
      companyId,
      `${API}/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1', spaces: 'drive' })}`,
    );
    const body = (await response.json()) as { files?: { id: string }[] };
    return body.files?.[0]?.id ?? null;
  }

  async function createFolder(
    companyId: string,
    name: string,
    parent: string | null,
  ): Promise<string> {
    const response = await call(companyId, `${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parent ? { parents: [parent] } : {}),
      }),
    });
    return ((await response.json()) as { id: string }).id;
  }

  /** Walks tenants / {company} / {category}, creating what is missing and caching the ids. */
  async function ensurePath(companyId: string, segments: string[]): Promise<string> {
    const cache = await access.folderCache(companyId);
    let parent: string | null = null;
    let key = '';
    for (const segment of segments) {
      key = key ? `${key}/${segment}` : segment;
      let id: string | undefined = cache[key];
      if (!id) {
        id =
          (await findFolder(companyId, segment, parent)) ??
          (await createFolder(companyId, segment, parent));
        await access.saveFolder(companyId, key, id);
      }
      parent = id;
    }
    if (!parent) throw new ProviderUnavailableError('google_drive', 'No folder.');
    return parent;
  }

  return {
    provider: 'google_drive',
    async put(input) {
      if (!input.companyId)
        throw new ProviderUnavailableError(
          'google_drive',
          'Platform files are not stored in Google Drive.',
        );
      const path = objectPath(input.companyId, input.category, input.fileId).split('/');
      const name = path.pop() ?? `${input.fileId}.kdenc`;
      const parent = await ensurePath(input.companyId, path);
      const boundary = `kd${Math.random().toString(36).slice(2)}${Date.now()}`;
      const meta = JSON.stringify({
        name,
        parents: [parent],
        mimeType: 'application/octet-stream',
      });
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`,
        ),
        Buffer.from(input.bytes),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const response = await call(
        input.companyId,
        `${UPLOAD}/files?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: { 'content-type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      return { ref: ((await response.json()) as { id: string }).id };
    },
    async get(ref, companyId) {
      if (!companyId) throw new ProviderUnavailableError('google_drive', 'No company.');
      const response = await call(companyId, `${API}/files/${encodeURIComponent(ref)}?alt=media`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async remove(ref, companyId) {
      if (!companyId) return;
      // A file that is already gone from Drive counts as removed.
      await call(companyId, `${API}/files/${encodeURIComponent(ref)}`, { method: 'DELETE' }, [404]);
    },
    async health(companyId) {
      if (!companyId) return { ok: false, message: 'No company.' };
      try {
        await call(companyId, `${API}/about?fields=storageQuota`);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'unavailable' };
      }
    },
  };
}
