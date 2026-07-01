'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, LogOut, UserCircle, MessageSquare, Sun, Moon } from 'lucide-react';
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
import { motion, AnimatePresence } from 'framer-motion';
import type { ZenHeaderProps } from '../types';

// Zen/Tao wisdom quotes - expanded collection
const zenQuotes = [
  // Lao Tzu (Tao Te Ching)
  { text: "Those who know do not speak; those who speak do not know.", source: "Lao Tzu" },
  { text: "A journey of a thousand miles begins with a single step.", source: "Lao Tzu" },
  { text: "Water is soft, yet it wears away stone.", source: "Lao Tzu" },
  { text: "Emptiness is more valuable than fullness.", source: "Lao Tzu" },
  { text: "Be simple, hold to your center, desire little.", source: "Lao Tzu" },
  { text: "Nature does not hurry, yet everything is accomplished.", source: "Lao Tzu" },
  { text: "The softest thing overcomes the hardest.", source: "Lao Tzu" },
  { text: "One who knows himself is enlightened.", source: "Lao Tzu" },
  { text: "Be understanding toward others, and firm with yourself.", source: "Lao Tzu" },
  { text: "The great Tao flows, both to the left and to the right.", source: "Lao Tzu" },
  { text: "Those who know little speak much; those who know much speak little.", source: "Lao Tzu" },
  { text: "The strong do not prevail; those who prevail are strong.", source: "Lao Tzu" },
  { text: "Do nothing, and let it be.", source: "Lao Tzu" },
  { text: "The best leader is one whose people are unaware of his presence.", source: "Lao Tzu" },
  { text: "Dim your own light, and become one with the chaos.", source: "Lao Tzu" },

  // Chuang Tzu (Zhuangzi)
  { text: "Great wisdom is like a child.", source: "Chuang Tzu" },
  { text: "Happiness is a light thing; who can hold it?", source: "Chuang Tzu" },
  { text: "While asleep, you do not know you are dreaming.", source: "Chuang Tzu" },
  { text: "The fish knows not the water, nor man the air.", source: "Chuang Tzu" },
  { text: "The useless tree lives long.", source: "Chuang Tzu" },
  { text: "Is the butterfly the man's dream, or the man the butterfly's?", source: "Chuang Tzu" },

  // Zen Masters
  { text: "Silence is the most powerful cry.", source: "Zen Proverb" },
  { text: "There is no time other than now.", source: "Zen Proverb" },
  { text: "The mind should be like still water.", source: "Zen Proverb" },
  { text: "The river never tires of flowing.", source: "Zen Proverb" },
  { text: "The greatest wisdom is simplicity.", source: "Zen Proverb" },
  { text: "The leaf falls, the tree remains.", source: "Zen Proverb" },
  { text: "The wind blows, the willow bends but does not break.", source: "Zen Proverb" },
  { text: "Every moment is a new beginning.", source: "Zen Proverb" },
  { text: "Enlightenment comes when you stop searching.", source: "Zen Proverb" },
  { text: "Look at the moon, not the finger pointing at it.", source: "Zen Proverb" },
  { text: "However high the mountain, there is always a path.", source: "Zen Proverb" },
  { text: "An empty cup can be filled.", source: "Zen Proverb" },
  { text: "Carry wood, draw water - therein lies the miracle.", source: "Zen Proverb" },
  { text: "Be like falling snow: silent yet transformative.", source: "Zen Proverb" },
  { text: "If speech is silver, silence is golden.", source: "Zen Proverb" },
  { text: "Do not count your chickens before they hatch.", source: "Zen Proverb" },
  { text: "The true path is a gateless gate.", source: "Mumon" },
  { text: "Sit where you sit, walk where you walk.", source: "Unmon" },
  { text: "What is the sound of one hand clapping?", source: "Hakuin" },

  // Buddha
  { text: "The mind is everything. What you think, you become.", source: "Buddha" },
  { text: "Pain is inevitable, suffering is optional.", source: "Buddha" },
  { text: "When you learn to let go, peace finds you.", source: "Buddha" },
  { text: "Every morning we are born again.", source: "Buddha" },
  { text: "The world changes not through fear, but through love.", source: "Buddha" },
  { text: "Work out your own salvation.", source: "Buddha" },

  // Confucius
  { text: "Learning without thought is labor lost; thought without learning is perilous.", source: "Confucius" },
  { text: "Wherever I go, I have three teachers.", source: "Confucius" },
  { text: "To know that you do not know is true wisdom.", source: "Confucius" },

  // Japanese Proverbs
  { text: "Fall down seven times, stand up eight.", source: "Japanese Proverb" },
  { text: "Haste makes waste.", source: "Japanese Proverb" },
  { text: "Even in the shade of a tree, there is change.", source: "Japanese Proverb" },
  { text: "No one has learned to walk without falling.", source: "Japanese Proverb" },
  { text: "If no step is taken, the road never ends.", source: "Japanese Proverb" },
];

/**
 * Zen01 Header Component
 * Contains logo, title, live indicator, theme toggle, and user menu
 */
export const ZenHeader: React.FC<ZenHeaderProps> = ({
  chatbotSettings,
  user,
  onClearChat,
  onLogout,
  isDark,
  onToggleTheme,
}) => {
  const [showZenToast, setShowZenToast] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(zenQuotes[0]);
  const [isFirstRender, setIsFirstRender] = useState(true);

  // Get random quote
  const getRandomQuote = () => {
    const randomIndex = Math.floor(Math.random() * zenQuotes.length);
    setCurrentQuote(zenQuotes[randomIndex]);
  };

  // Handle theme toggle with Zen toast
  const handleThemeToggle = () => {
    getRandomQuote();
    onToggleTheme();
    setShowZenToast(true);

    // Auto-hide after 4 seconds
    setTimeout(() => {
      setShowZenToast(false);
    }, 4000);
  };

  // Skip showing toast on initial render
  useEffect(() => {
    setIsFirstRender(false);
  }, []);

  return (
    <header className="zen01-header">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {chatbotSettings.title || 'Zen Assistant'}
              </h1>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 dark:border-cyan-500/30">
                Build: {process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || 'dev'}
              </span>
            </div>
            {chatbotSettings.subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{chatbotSettings.subtitle}</p>
            )}
          </div>
        </div>

        {/* Live Indicator, Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle with Zen - Single Combined Button */}
          <button
            onClick={handleThemeToggle}
            className="w-9 h-9 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700
              hover:from-cyan-50 hover:to-purple-50 dark:hover:from-cyan-900/30 dark:hover:to-purple-900/30
              border border-slate-300 dark:border-slate-600
              hover:border-cyan-400/50 dark:hover:border-cyan-500/50
              transition-all duration-300 hover:scale-105 hover:shadow-lg
              group relative overflow-hidden"
            aria-label={isDark ? 'Light mode' : 'Dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {/* Animated background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-purple-500/0
              translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

            {isDark ? (
              <Sun className="h-4 w-4 text-amber-500 group-hover:text-amber-400 transition-colors relative z-10" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600 group-hover:text-purple-600 transition-colors relative z-10" />
            )}
          </button>

          {/* Zen Toast - Fixed Position */}
          <AnimatePresence>
            {showZenToast && !isFirstRender && (
              <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                  duration: 0.4
                }}
                className="fixed top-20 left-1/2 -translate-x-1/2
                  w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] sm:max-w-[420px]
                  p-4 sm:p-5 rounded-2xl
                  bg-gradient-to-br from-slate-900/95 to-slate-800/95 dark:from-slate-100/95 dark:to-white/95
                  backdrop-blur-xl
                  border border-cyan-500/30 dark:border-cyan-600/30
                  shadow-2xl shadow-cyan-500/20 dark:shadow-cyan-600/10
                  z-[100]"
              >
                {/* Animated border glow */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20
                  animate-pulse opacity-50" style={{ padding: '1px', margin: '-1px' }} />

                {/* Content */}
                <div className="flex items-center gap-4 relative">
                  {/* Yin-Yang with rotation animation */}
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                    className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl
                      bg-gradient-to-br from-cyan-500/20 to-purple-500/20 dark:from-cyan-600/20 dark:to-purple-600/20
                      flex items-center justify-center"
                  >
                    <span className="text-xl sm:text-2xl">☯</span>
                  </motion.div>

                  {/* Quote text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base text-slate-100 dark:text-slate-800 leading-relaxed font-light italic">
                      "{currentQuote.text}"
                    </p>
                    <p className="text-[10px] sm:text-xs text-cyan-400/80 dark:text-cyan-600/80 mt-2 text-right font-medium">
                      — {currentQuote.source}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 4, ease: "linear" }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-purple-500 origin-left rounded-b-2xl"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Avatar className="h-7 w-7 bg-gradient-to-br from-cyan-500 to-purple-600">
                  <AvatarFallback className="text-xs text-white bg-transparent">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={`w-48 zen01-dropdown ${isDark ? 'zen01-dark' : 'zen01-light'}`}
            >
              <Link href="/profile">
                <DropdownMenuItem
                  className="zen01-dropdown-item cursor-pointer"
                >
                  <UserCircle className="h-4 w-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className={isDark ? "bg-[#1e3a5f]/50" : "bg-slate-200"} />
              <DropdownMenuItem
                onClick={onLogout}
                className={`cursor-pointer ${isDark ? 'text-rose-400 hover:text-rose-300' : 'text-rose-600 hover:text-rose-700'}`}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default ZenHeader;
