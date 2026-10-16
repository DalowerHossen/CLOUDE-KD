// path: config/permissions.ts
// GENERATED - do not edit. Source: config/permissions/* (run: npm run gen)

import type { PermissionDefinition } from '@/types/contracts';
import { permissions as s02Core } from './permissions/s02-core';
import { permissions as s03Auth } from './permissions/s03-auth';
import { permissions as s04Security } from './permissions/s04-security';
import { permissions as s05StorageEmail } from './permissions/s05-storage-email';
import { permissions as s06Site } from './permissions/s06-site';
import { permissions as s07Company } from './permissions/s07-company';
import { permissions as s07Team } from './permissions/s07-team';

export const permissions: PermissionDefinition[] = [...s02Core, ...s03Auth, ...s04Security, ...s05StorageEmail, ...s06Site, ...s07Company, ...s07Team];
