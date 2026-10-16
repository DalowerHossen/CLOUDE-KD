// path: services/jobs/handlers.generated.ts
// GENERATED - do not edit. Source: workers/<step>/*.job.ts and *.event.ts (run: npm run gen)

import type { EventHandlerDefinition, JobHandlerDefinition } from './handler-types';
import { eventHandler as notificationsDomainEventsEvent } from '@/workers/notifications/domain-events.event';
import { eventHandler as onboardingMilestonesEvent } from '@/workers/onboarding/milestones.event';

export const jobHandlers: JobHandlerDefinition[] = [];
export const eventHandlers: EventHandlerDefinition[] = [notificationsDomainEventsEvent, onboardingMilestonesEvent];
