// path: components/ui/toaster.tsx
'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/lib/providers/theme-provider';

/** Toast host. Use `toast` from "sonner" to show messages. */
function Toaster(): JSX.Element {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      position="top-center"
      toastOptions={{
        classNames: {
          toast: 'group border bg-background text-foreground shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}

export { Toaster };
