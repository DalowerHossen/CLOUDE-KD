// path: app/(admin)/admin/not-found.tsx
import { RouteNotFound } from '@/components/shared/route-views';

export default function NotFound(): JSX.Element {
  return <RouteNotFound homeHref="/admin" />;
}
