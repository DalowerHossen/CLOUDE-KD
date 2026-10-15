// path: components/layout/theme-toggle.tsx
'use client';

import { Contrast, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';
import { useTheme, type ContrastChoice, type ThemeChoice } from '@/lib/providers/theme-provider';

export function ThemeToggle(): JSX.Element {
  const { theme, contrast, resolvedTheme, setTheme, setContrast } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('s01Core.nav.toggleTheme')}>
          {contrast === 'high' ? (
            <Contrast className="h-5 w-5" aria-hidden="true" />
          ) : resolvedTheme === 'dark' ? (
            <Moon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Sun className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('s01Core.nav.switchTheme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeChoice)}
        >
          <DropdownMenuRadioItem value="light">{t('s01Core.nav.themeLight')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('s01Core.nav.themeDark')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            {t('s01Core.nav.themeSystem')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('s01Core.nav.switchContrast')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={contrast}
          onValueChange={(value) => setContrast(value as ContrastChoice)}
        >
          <DropdownMenuRadioItem value="normal">
            {t('s01Core.nav.contrastNormal')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="high">
            {t('s01Core.nav.contrastHigh')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
