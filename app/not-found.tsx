// path: app/not-found.tsx
import { RouteNotFound } from '@/components/shared/route-views';

export default function NotFound(): JSX.Element {
  return (
    <main id="main-content" className="px-sp-16">
      <RouteNotFound homeHref="/" />
    </main>
  );
}
