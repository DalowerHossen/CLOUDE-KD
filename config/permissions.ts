// path: config/permissions.ts
// GENERATED - do not edit. Source: config/permissions/* (run: npm run gen)

import type { PermissionDefinition } from '@/types/contracts';
import { permissions as s02Core } from './permissions/s02-core';
import { permissions as s03Auth } from './permissions/s03-auth';
import { permissions as s04Security } from './permissions/s04-security';
import { permissions as s05StorageEmail } from './permissions/s05-storage-email';
import { permissions as s06Site } from './permissions/s06-site';
import { permissions as s07Admin } from './permissions/s07-admin';
import { permissions as s07Company } from './permissions/s07-company';
import { permissions as s07Data } from './permissions/s07-data';
import { permissions as s07Domain } from './permissions/s07-domain';
import { permissions as s07Kyc } from './permissions/s07-kyc';
import { permissions as s07Support } from './permissions/s07-support';
import { permissions as s07Team } from './permissions/s07-team';
import { permissions as s08Catalog } from './permissions/s08-catalog';
import { permissions as s08Clients } from './permissions/s08-clients';
import { permissions as s08Inventory } from './permissions/s08-inventory';
import { permissions as s08Purchasing } from './permissions/s08-purchasing';
import { permissions as s08Transfer } from './permissions/s08-transfer';
import { permissions as s09Credits } from './permissions/s09-credits';
import { permissions as s09Dunning } from './permissions/s09-dunning';
import { permissions as s09Estimates } from './permissions/s09-estimates';
import { permissions as s09Invoices } from './permissions/s09-invoices';
import { permissions as s09Projects } from './permissions/s09-projects';
import { permissions as s09Recurring } from './permissions/s09-recurring';
import { permissions as s09Reports } from './permissions/s09-reports';
import { permissions as s09Tax } from './permissions/s09-tax';
import { permissions as s10Payments } from './permissions/s10-payments';
import { permissions as s10Processors } from './permissions/s10-processors';
import { permissions as s13Portal } from './permissions/s13-portal';
import { permissions as s14Payouts } from './permissions/s14-payouts';
import { permissions as s15Accounting } from './permissions/s15-accounting';
import { permissions as s15Hr } from './permissions/s15-hr';
import { permissions as s15Payroll } from './permissions/s15-payroll';
import { permissions as s16Api } from './permissions/s16-api';
import { permissions as s16Whatsapp } from './permissions/s16-whatsapp';

export const permissions: PermissionDefinition[] = [...s02Core, ...s03Auth, ...s04Security, ...s05StorageEmail, ...s06Site, ...s07Admin, ...s07Company, ...s07Data, ...s07Domain, ...s07Kyc, ...s07Support, ...s07Team, ...s08Catalog, ...s08Clients, ...s08Inventory, ...s08Purchasing, ...s08Transfer, ...s09Credits, ...s09Dunning, ...s09Estimates, ...s09Invoices, ...s09Projects, ...s09Recurring, ...s09Reports, ...s09Tax, ...s10Payments, ...s10Processors, ...s13Portal, ...s14Payouts, ...s15Accounting, ...s15Hr, ...s15Payroll, ...s16Api, ...s16Whatsapp];
