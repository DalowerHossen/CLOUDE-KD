// path: components/layout/skip-link.tsx
import { t } from '@/lib/i18n';

/** First focusable element of every page; jumps to the element with id="main-content". */
export function SkipLink(): JSX.Element {
  return (
    <a href="#main-content" className="skip-link">
      {t('s01Core.nav.skipToContent')}
    </a>
  );
}
