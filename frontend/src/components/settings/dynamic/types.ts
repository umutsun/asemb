// Types for the redesigned, registry-driven settings shell. Mirrors the backend
// schema produced by backend/src/config/settings-ui-layout.ts (buildSettingsSchema).

export type ControlType =
  | 'switch'
  | 'slider'
  | 'segmented'
  | 'select'
  | 'text'
  | 'secret'
  | 'textarea'
  | 'json'
  | 'range'
  | 'sourceBars';

export interface SchemaFieldOption {
  value: string;
  label: string;
}

export interface SchemaField {
  key: string;
  label: string;
  help?: string;
  control: ControlType;
  type: 'string' | 'number' | 'boolean' | 'json' | 'secret';
  secret: boolean;
  options?: SchemaFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default?: unknown;
  advanced: boolean;
  rangeMaxKey?: string;
}

export interface SchemaGroup {
  id: string;
  title: string;
  /** Key of a bespoke component to embed (see dynamic/embeds.tsx) instead of fields. */
  component?: string;
  preset?: 'answerSafety';
  fields: SchemaField[];
}

export interface SchemaSection {
  id: string;
  navGroup: string;
  title: string;
  blurb: string;
  count: number;
  groups: SchemaGroup[];
}

export interface Preset {
  label: string;
  blurb: string;
  values: Record<string, any>;
}

export interface SettingsSchema {
  sections: SchemaSection[];
  presets: Record<string, Preset>;
}

export type ValueMap = Record<string, any>;

/** (key, value) setter used by every control to write into the shell's dirty map. */
export type SetValue = (key: string, value: any) => void;
