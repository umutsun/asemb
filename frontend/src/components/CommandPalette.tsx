'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { Command } from 'cmdk';
import { 
  Search,
  Home,
  MessageSquare,
  Settings,
  FileText,
  Database,
  Brain,
  RefreshCw,
  Moon,
  Sun,
  Monitor,
  Globe,
  Code,
  Activity,
  Upload,
  Download,
  Trash2,
  X,
  ChevronRight,
  Command as CommandIcon
} from 'lucide-react';

const CommandPalette = () => {
  const { commandPaletteOpen, setCommandPaletteOpen, setTheme, theme, clearMessages, addNotification } = useStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [setCommandPaletteOpen]);

  const commands = [
    {
      category: 'Navigation',
      items: [
        { icon: Home, label: 'Go to Dashboard', shortcut: 'G D', action: () => window.location.href = '/' },
        { icon: MessageSquare, label: 'New Chat', shortcut: 'N C', action: () => { clearMessages(); setCommandPaletteOpen(false); } },
        { icon: Activity, label: 'View Analytics', shortcut: 'V A', action: () => { addNotification('info', 'Opening analytics...'); setCommandPaletteOpen(false); } },
      ]
    },
    {
      category: 'Theme',
      items: [
        { icon: Sun, label: 'Light Mode', shortcut: 'T L', action: () => { setTheme('light'); setCommandPaletteOpen(false); } },
        { icon: Moon, label: 'Dark Mode', shortcut: 'T D', action: () => { setTheme('dark'); setCommandPaletteOpen(false); } },
        { icon: Monitor, label: 'System Theme', shortcut: 'T S', action: () => { setTheme('system'); setCommandPaletteOpen(false); } },
      ]
    },
    {
      category: 'Actions',
      items: [
        { icon: RefreshCw, label: 'Refresh Dashboard', shortcut: 'R', action: () => { window.location.reload(); } },
        { icon: Database, label: 'View Database Status', shortcut: 'D B', action: () => { addNotification('info', 'Opening database status...'); setCommandPaletteOpen(false); } },
        { icon: Brain, label: 'AI Settings', shortcut: 'A I', action: () => { addNotification('info', 'Opening AI settings...'); setCommandPaletteOpen(false); } },
        { icon: Globe, label: 'Web Scraper', shortcut: 'W S', action: () => { addNotification('info', 'Opening web scraper...'); setCommandPaletteOpen(false); } },
        { icon: Code, label: 'API Documentation', shortcut: 'A P I', action: () => { window.open('/api-docs', '_blank'); setCommandPaletteOpen(false); } },
      ]
    },
    {
      category: 'Data',
      items: [
        { icon: Upload, label: 'Import Data', shortcut: 'I', action: () => { addNotification('info', 'Opening import dialog...'); setCommandPaletteOpen(false); } },
        { icon: Download, label: 'Export Data', shortcut: 'E', action: () => { addNotification('info', 'Preparing export...'); setCommandPaletteOpen(false); } },
        { icon: Trash2, label: 'Clear All Data', shortcut: 'C A', action: () => { 
          if (confirm('Are you sure you want to clear all data?')) {
            addNotification('warning', 'Clearing all data...');
            setCommandPaletteOpen(false);
          }
        }},
      ]
    },
  ];

  if (!commandPaletteOpen) return null;

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={() => setCommandPaletteOpen(false)}
          />
          
          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-[9999]"
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
              <Command className="max-h-[500px]">
                <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                  <Search className="w-5 h-5 text-gray-400 mr-3" />
                  <Command.Input
                    placeholder="Type a command or search..."
                    value={search}
                    onValueChange={setSearch}
                    className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500"
                  />
                  <button
                    onClick={() => setCommandPaletteOpen(false)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                
                <Command.List className="max-h-[400px] overflow-y-auto p-2">
                  <Command.Empty className="py-6 text-center text-gray-500">
                    No results found.
                  </Command.Empty>
                  
                  {commands.map((group) => (
                    <Command.Group key={group.category} heading={group.category} className="mb-2">
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5">
                        {group.category}
                      </div>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Command.Item
                            key={item.label}
                            onSelect={item.action}
                            className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700">
                                <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {item.label}
                              </span>
                            </div>
                            <kbd className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400 font-mono">
                              {item.shortcut}
                            </kbd>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ))}
                </Command.List>
                
                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↑↓</kbd>
                        Navigate
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↵</kbd>
                        Select
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">Esc</kbd>
                        Close
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CommandIcon className="w-3 h-3" />
                      <span>Command Palette</span>
                    </div>
                  </div>
                </div>
              </Command>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;