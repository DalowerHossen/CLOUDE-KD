// path: lib/social/registry.ts
// The networks that have an adapter. Adding a network is one adapter file and one line here.
import 'server-only';
import type { SocialProvider } from '@/config/s16-social';
import type { SocialAdapter } from './adapter';
import { facebookAdapter } from './adapters/facebook';
import { instagramAdapter } from './adapters/instagram';
import { linkedinAdapter } from './adapters/linkedin';
import { pinterestAdapter } from './adapters/pinterest';
import { sandboxAdapter } from './adapters/sandbox';
import { telegramAdapter } from './adapters/telegram';
import { threadsAdapter } from './adapters/threads';
import { xAdapter } from './adapters/x';

const ADAPTERS: Readonly<Record<SocialProvider, SocialAdapter>> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  threads: threadsAdapter,
  linkedin: linkedinAdapter,
  x: xAdapter,
  telegram: telegramAdapter,
  pinterest: pinterestAdapter,
  sandbox: sandboxAdapter,
};

export const adapterFor = (provider: SocialProvider): SocialAdapter => ADAPTERS[provider];
