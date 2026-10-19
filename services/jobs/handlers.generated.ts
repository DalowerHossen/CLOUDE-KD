// path: services/jobs/handlers.generated.ts
// GENERATED - do not edit. Source: workers/<step>/*.job.ts and *.event.ts (run: npm run gen)

import type { EventHandlerDefinition, JobHandlerDefinition } from './handler-types';
import { jobHandler as transferImportJob } from '@/workers/transfer/import.job';
import { eventHandler as inventoryInvoiceStockEvent } from '@/workers/inventory/invoice-stock.event';
import { eventHandler as notificationsDomainEventsEvent } from '@/workers/notifications/domain-events.event';
import { eventHandler as onboardingMilestonesEvent } from '@/workers/onboarding/milestones.event';
import { eventHandler as s13ClientNoticesEvent } from '@/workers/s13/client-notices.event';
import { eventHandler as s13DisputeIntakeEvent } from '@/workers/s13/dispute-intake.event';
import { eventHandler as s14PlatformInvoicePaidEvent } from '@/workers/s14/platform-invoice-paid.event';
import { eventHandler as s14SettlePaymentEvent } from '@/workers/s14/settle-payment.event';

export const jobHandlers: JobHandlerDefinition[] = [transferImportJob];
export const eventHandlers: EventHandlerDefinition[] = [inventoryInvoiceStockEvent, notificationsDomainEventsEvent, onboardingMilestonesEvent, s13ClientNoticesEvent, s13DisputeIntakeEvent, s14PlatformInvoicePaidEvent, s14SettlePaymentEvent];
