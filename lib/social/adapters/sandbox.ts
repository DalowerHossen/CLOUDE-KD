// path: lib/social/adapters/sandbox.ts
// The test network: publishes at once and sends nothing anywhere. Used to try the composer, the schedule and the rules.
import 'server-only';
import type { SocialAdapter } from '../adapter';

export const sandboxAdapter: SocialAdapter = {
  id: 'sandbox',
  label: 'Sandbox',
  async publish() {
    return { state: 'published', externalId: `sandbox.${crypto.randomUUID()}`, url: null };
  },
};
