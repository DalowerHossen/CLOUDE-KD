// path: app/(public)/error.tsx
'use client';

import { RouteError } from '@/components/shared/route-views';

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return <RouteError {...props} />;
}
