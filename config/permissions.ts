// path: config/permissions.ts
// GENERATED - do not edit. Source: config/permissions/* (run: npm run gen)

import type { PermissionDefinition } from '@/types/contracts';
import { permissions as s02Core } from './permissions/s02-core';
import { permissions as s03Auth } from './permissions/s03-auth';
import { permissions as s04Security } from './permissions/s04-security';

export const permissions: PermissionDefinition[] = [...s02Core, ...s03Auth, ...s04Security];
