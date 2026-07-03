'use client';

// Bespoke entity-manager panels embedded under the unified settings nav.
// They manage their own data (CRUD) and can't be generated from the registry, so
// they're rendered as-is (restyled to the shell language in a later stage).
// Loaded via next/dynamic (ssr:false) to avoid SSR issues and to code-split.
//
// Stage 1 embeds ONLY the panels that were actively used (and working) in the old
// tabs. The separate-route integration pages (Google Drive, Embeddings Manager,
// Services) have pre-existing broken imports / need their own testing — deferred.

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

const Loading = () => <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

const PatternManagement = dynamic(() => import('@/components/settings/PatternManagement'), { ssr: false, loading: Loading });
const DataSchemaSettings = dynamic(() => import('@/components/settings/DataSchemaSettings'), { ssr: false, loading: Loading });
const SchedulerSection = dynamic(() => import('@/components/settings/SchedulerSection'), { ssr: false, loading: Loading });
const ApiTokensSection = dynamic(() => import('@/components/settings/ApiTokensSection'), { ssr: false, loading: Loading });

// Maps a layout group's `component` key to the component to render.
export const EMBEDS: Record<string, ComponentType<any>> = {
  patterns: PatternManagement,
  dataSchema: DataSchemaSettings,
  scheduler: SchedulerSection,
  apiTokens: ApiTokensSection,
};
