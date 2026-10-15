// path: instrumentation.ts
// Runs once when the server starts (Node.js runtime only): environment check, boot hooks, service registration.
const BOOT_FLAG = Symbol.for('kd.solution.it.booted');

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const holder = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (holder[BOOT_FLAG]) return;
  holder[BOOT_FLAG] = true;

  const { validateEnvAtBoot } = await import('@/lib/env');
  validateEnvAtBoot();
  const { runBootHooks } = await import('@/lib/boot.generated');
  await runBootHooks();
  const { bootstrapServices } = await import('@/lib/bootstrap.generated');
  await bootstrapServices();
}
