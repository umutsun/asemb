'use client';

import React from 'react';
import { LogOut, UserCircle, Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ZenHeaderProps } from '../types';

/**
 * Counsel Header Component
 * Slim editorial header: serif brand title + uppercase letter-spaced subtitle
 * on the left, ghost theme toggle + user menu on the right. Build id is
 * rendered as barely-visible micro-text (informational only).
 */
export const ZenHeader: React.FC<ZenHeaderProps> = ({
  chatbotSettings,
  user,
  onLogout,
  isDark,
  onToggleTheme,
}) => {
  const buildId = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || 'dev';

  return (
    <header className="counsel-header sticky top-0 z-50">
      {/* Full-frame-width bar with 28px horizontal padding (mock .f-head),
          not constrained to the reading column */}
      <div className="flex h-full w-full items-center justify-between px-7">
        {/* Serif brand title + uppercase subtitle */}
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="counsel-brand-name truncate" title={`Build: ${buildId}`}>
            {chatbotSettings.title || 'Counsel'}
          </h1>
          {chatbotSettings.subtitle && (
            <span className="counsel-brand-sub hidden truncate sm:inline">
              {chatbotSettings.subtitle}
            </span>
          )}
        </div>

        {/* Theme toggle + user menu + build micro-text */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--counsel-muted)] transition-colors hover:bg-[var(--counsel-hover)] hover:text-[var(--counsel-ink)]"
            aria-label={isDark ? 'Light mode' : 'Dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 px-1.5 hover:bg-[var(--counsel-hover)]"
              >
                <Avatar className="h-6 w-6 border border-[var(--counsel-hairline)] bg-[var(--counsel-surface)]">
                  <AvatarFallback className="bg-transparent text-xs text-[var(--counsel-muted)]">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            {/* Portal content renders outside the container — pass the explicit mode class */}
            <DropdownMenuContent
              align="end"
              className={`w-48 counsel-dropdown ${isDark ? 'counsel-dark' : 'counsel-light'}`}
            >
              <Link href="/profile">
                <DropdownMenuItem className="counsel-dropdown-item cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className={isDark ? 'bg-white/10' : 'bg-black/10'} />
              <DropdownMenuItem
                onClick={onLogout}
                className="counsel-dropdown-item cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Build id: barely-visible micro-text */}
          <span className="hidden select-none text-[9px] leading-none text-[var(--counsel-muted)] opacity-40 md:inline">
            {buildId}
          </span>
        </div>
      </div>
    </header>
  );
};

export default ZenHeader;
