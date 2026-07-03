'use client';

import React from 'react';
import SettingsShell from '@/components/settings/dynamic/SettingsShell';

// Unified, registry-driven settings page (replaces the old tab monolith).
export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Providers, retrieval, chatbot, and system configuration.
        </p>
      </div>
      <SettingsShell />
    </div>
  );
}
