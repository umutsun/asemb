'use client';

import React from 'react';
import { LogOut, UserCircle, Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
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
 * Majlis Header Component
 * 60px hairline-ruled bar: short brass rule + small-caps serif wordmark on the
 * left; small-caps language label, ghost theme toggle (hover brass) and user
 * menu on the right. Build id is rendered as barely-visible micro-text
 * (informational only).
 */
export const ZenHeader: React.FC<ZenHeaderProps> = ({
  chatbotSettings,
  user,
  onLogout,
  isDark,
  onToggleTheme,
}) => {
  const { i18n } = useTranslation();
  const buildId = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || 'dev';
  // Current UI language code for the header's language slot (mock .lang)
  const langLabel = (i18n.language || '').split('-')[0].toUpperCase();

  return (
    <header className="majlis-header sticky top-0 z-50">
      {/* Full-frame-width bar with 28px horizontal padding (mock .f-head),
          not constrained to the reading column */}
      <div className="flex h-full w-full items-center justify-between px-7">
        {/* Brand: 22px brass rule + small-caps serif wordmark + subtitle */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="majlis-brand-rule" aria-hidden />
          <h1 className="majlis-brand-name truncate" title={`Build: ${buildId}`}>
            {chatbotSettings.title || 'Majlis'}
          </h1>
          {chatbotSettings.subtitle && (
            <span className="majlis-brand-sub hidden truncate sm:inline">
              {chatbotSettings.subtitle}
            </span>
          )}
        </div>

        {/* Language label + theme toggle + user menu + build micro-text */}
        <div className="flex shrink-0 items-center gap-2">
          {langLabel && (
            <span className="majlis-header-lang hidden sm:inline">{langLabel}</span>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            className="majlis-mode-btn flex h-8 w-8 items-center justify-center"
            aria-label={isDark ? 'Light mode' : 'Dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 px-1.5 hover:bg-[var(--majlis-hover)]"
              >
                <Avatar className="h-6 w-6 border border-[var(--majlis-hairline)] bg-[var(--majlis-surface)]">
                  <AvatarFallback className="bg-transparent text-xs text-[var(--majlis-muted)]">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            {/* Portal content renders outside the container — pass the explicit mode class */}
            <DropdownMenuContent
              align="end"
              className={`w-48 majlis-dropdown ${isDark ? 'majlis-dark' : 'majlis-light'}`}
            >
              <Link href="/profile">
                <DropdownMenuItem className="majlis-dropdown-item cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className={isDark ? 'bg-white/10' : 'bg-black/10'} />
              <DropdownMenuItem
                onClick={onLogout}
                className="majlis-dropdown-item cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Build id: barely-visible micro-text */}
          <span className="hidden select-none text-[9px] leading-none text-[var(--majlis-muted)] opacity-40 md:inline">
            {buildId}
          </span>
        </div>
      </div>
    </header>
  );
};

export default ZenHeader;
