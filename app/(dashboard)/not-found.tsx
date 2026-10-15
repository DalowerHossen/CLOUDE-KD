// path: app/(dashboard)/not-found.tsx
import { RouteNotFound } from '@/components/shared/route-views';

export default function NotFound(): JSX.Element {
  return <RouteNotFound homeHref="/dashboard" />;
}
