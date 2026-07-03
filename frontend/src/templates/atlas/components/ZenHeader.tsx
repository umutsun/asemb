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
 * Atlas Header Component
 * Translucent blurred bar: accent brand mark + name + tag pill on the left,
 * bordered theme toggle + user menu on the right. Build id is rendered as
 * barely-visible micro-text (informational only).
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
    <header className="atlas-header sticky top-0 z-50">
      {/* Full-frame-width bar with 24px horizontal padding (mock .f-head),
          not constrained to the reading column */}
      <div className="flex h-full w-full items-center justify-between px-6">
        {/* Brand: accent square mark + name + tag pill */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="atlas-brand-mark" aria-hidden>
            {chatbotSettings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={chatbotSettings.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              '§'
            )}
          </span>
          <h1 className="atlas-brand-name truncate" title={`Build: ${buildId}`}>
            {chatbotSettings.title || 'Atlas'}
          </h1>
          {chatbotSettings.subtitle && (
            <span className="atlas-brand-tag hidden truncate sm:inline">
              {chatbotSettings.subtitle}
            </span>
          )}
        </div>

        {/* Theme toggle + user menu + build micro-text */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="atlas-mode-btn"
            aria-label={isDark ? 'Light mode' : 'Dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 px-1.5 hover:bg-[var(--atlas-surface-2)]"
              >
                <Avatar className="h-6 w-6 border border-[var(--atlas-border)] bg-[var(--atlas-surface)]">
                  <AvatarFallback className="bg-transparent text-xs text-[var(--atlas-muted)]">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            {/* Portal content renders outside the container — pass the explicit mode class */}
            <DropdownMenuContent
              align="end"
              className={`w-48 atlas-dropdown ${isDark ? 'atlas-dark' : 'atlas-light'}`}
            >
              <Link href="/profile">
                <DropdownMenuItem className="atlas-dropdown-item cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className={isDark ? 'bg-white/10' : 'bg-black/10'} />
              <DropdownMenuItem
                onClick={onLogout}
                className="atlas-dropdown-item cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Build id: barely-visible micro-text */}
          <span className="hidden select-none text-[9px] leading-none text-[var(--atlas-muted)] opacity-40 md:inline">
            {buildId}
          </span>
        </div>
      </div>
    </header>
  );
};

export default ZenHeader;
