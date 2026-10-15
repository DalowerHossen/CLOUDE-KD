// path: components/layout/user-menu.tsx
'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NavItem } from '@/config/nav-types';
import { t, type StringKey } from '@/lib/i18n';
import { NavIconView } from './icon-map';

export interface ShellUser {
  name: string;
  email: string;
  roleLabel: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letters.join('') || '?';
}

export function UserMenu({
  user,
  accountItems,
}: {
  user: ShellUser;
  accountItems: readonly NavItem[];
}): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('s01Core.nav.userMenu')}
          className="rounded-full"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-base">{user.name}</p>
          <p className="truncate text-caption font-normal text-muted-foreground">{user.email}</p>
          <p className="text-caption font-normal text-muted-foreground">{user.roleLabel}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accountItems.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={item.href}>
              <NavIconView name={item.icon} className="h-4 w-4" />
              {t(item.labelKey as StringKey)}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="flex w-full items-center gap-2 text-left">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t('s01Core.nav.signOut')}
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
