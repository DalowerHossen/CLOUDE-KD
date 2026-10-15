// path: types/contracts/storage.ts
import type { Uuid } from './common';

export type StorageProvider = 'google_drive' | 'supabase';

export type FileCategory =
  | 'invoice'
  | 'receipt'
  | 'contract'
  | 'kyc'
  | 'logo'
  | 'attachment'
  | 'payslip'
  | 'evidence'
  | 'export'
  | 'cms'
  | 'other';

export interface FileRecord {
  id: Uuid;
  companyId: Uuid | null;
  category: FileCategory;
  name: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  storageProvider: StorageProvider;
  keyVersion: number;
  createdAt: string;
}

export interface StorageService {
  put(input: {
    companyId: Uuid | null;
    category: FileCategory;
    name: string;
    bytes: Uint8Array;
    mimeType: string;
  }): Promise<FileRecord>;
  get(fileId: Uuid): Promise<{ record: FileRecord; bytes: Uint8Array }>;
  signedUrl(fileId: Uuid, ttlSeconds: number): Promise<string>;
  remove(fileId: Uuid): Promise<void>;
  /** Linked Google Drive wins; otherwise Supabase Storage. */
  resolveProvider(companyId: Uuid | null): Promise<StorageProvider>;
  migrate(fileId: Uuid, target: StorageProvider): Promise<FileRecord>;
}
