// path: components/shared/theme-init-script.tsx
import { THEME_INIT_SCRIPT } from '@/lib/providers/theme-script';

/**
 * Applies the saved theme before first paint. The content is a fixed constant (never user input);
 * dangerouslySetInnerHTML is needed because React would escape the characters of inline script text.
 */
export function ThemeInitScript({ nonce }: { nonce: string | undefined }): JSX.Element {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
