// path: services/storage/admin-ops.ts
// Platform view of storage: provider health, Drive links, file counts, migrations of all companies, quarantine.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { getAdapter } from './providers';
import {
  controlMigration,
  listMigrations,
  migrationControlSchema,
  startMigration,
  startMigrationSchema,
  type MigrationView,
} from './migrate';

export const adminActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start_migration'),
      companyId: z.string().uuid(),
      target: z.enum(['google_drive', 'supabase']),
      deleteSource: z.boolean().default(false),
    })
    .strict(),
  migrationControlSchema.extend({ action: z.literal('control_migration') }).strict(),
  z
    .object({
      action: z.literal('review_quarantine'),
      id: z.string().uuid(),
      decision: z.enum(['dismissed', 'confirmed']),
    })
    .strict(),
  z
    .object({
      action: z.literal('add_malware_hash'),
      hash: z.string().regex(/^[0-9a-fA-F]{64}$/),
      label: z.string().trim().min(2).max(120),
    })
    .strict(),
]);
export type AdminAction = z.infer<typeof adminActionSchema>;

export interface StorageOverview {
  platform: { ok: boolean; message?: string };
  driveLinks: { connected: number; error: number; revoked: number };
  files: { supabase: number; googleDrive: number };
  migrations: MigrationView[];
  quarantine: {
    id: string;
    name: string;
    category: string;
    sizeBytes: number;
    reasonCode: string;
    reason: string;
    createdAt: string;
  }[];
}

async function countFiles(provider: 'supabase' | 'google_drive'): Promise<number> {
  const { count, error } = await getAdminSupabase()
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('storage_provider', provider)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return count ?? 0;
}

export async function storageOverview(): Promise<StorageOverview> {
  const admin = getAdminSupabase();
  const [platform, links, supabaseFiles, driveFiles, migrations, quarantine] = await Promise.all([
    getAdapter('supabase').health(null),
    admin.from('drive_connections').select('status').is('deleted_at', null).limit(5000),
    countFiles('supabase'),
    countFiles('google_drive'),
    listMigrations(null),
    admin
      .from('file_quarantine')
      .select('id, name, category, size_bytes, reason_code, reason, created_at')
      .eq('status', 'held')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (links.error) throw new InternalError(links.error);
  if (quarantine.error) throw new InternalError(quarantine.error);
  const states = (links.data ?? []).map((l) => String(l.status));
  return {
    platform,
    driveLinks: {
      connected: states.filter((s) => s === 'connected').length,
      error: states.filter((s) => s === 'error').length,
      revoked: states.filter((s) => s === 'revoked').length,
    },
    files: { supabase: supabaseFiles, googleDrive: driveFiles },
    migrations,
    quarantine: (quarantine.data ?? []).map((q) => ({
      id: String(q.id),
      name: String(q.name),
      category: String(q.category),
      sizeBytes: Number(q.size_bytes),
      reasonCode: String(q.reason_code),
      reason: String(q.reason),
      createdAt: String(q.created_at),
    })),
  };
}

export async function runAdminAction(actor: Actor, input: AdminAction): Promise<void> {
  const admin = getAdminSupabase();
  switch (input.action) {
    case 'start_migration':
      await startMigration(
        actor,
        startMigrationSchema.parse({
          target: input.target,
          deleteSource: input.deleteSource,
          companyId: input.companyId,
        }),
      );
      return;
    case 'control_migration':
      await controlMigration(actor, { id: input.id, op: input.op });
      return;
    case 'review_quarantine': {
      const { data, error } = await admin
        .from('file_quarantine')
        .update({
          status: input.decision,
          reviewed_by: actor.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('status', 'held')
        .is('deleted_at', null)
        .select('id');
      if (error) throw new InternalError(error);
      if (!data || data.length === 0) throw new NotFoundError();
      await getService('audit').record({
        action: 'storage.quarantine_reviewed',
        resourceType: 'file_quarantine',
        resourceId: input.id,
        companyId: null,
        metadata: { decision: input.decision },
      });
      return;
    }
    case 'add_malware_hash': {
      const { data, error } = await admin
        .from('malware_hashes')
        .insert({ content_hash: input.hash.toLowerCase(), label: input.label })
        .select('id')
        .single();
      if (error) throw new InternalError(error);
      await getService('audit').record({
        action: 'storage.malware_hash_added',
        resourceType: 'malware_hash',
        resourceId: String(data.id),
        companyId: null,
        metadata: {},
      });
      return;
    }
  }
}
