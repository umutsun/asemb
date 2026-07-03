/**
 * Chat Template Registry
 *
 * Manages available chat templates and provides dynamic imports.
 * Add new templates here when creating custom themes for clients.
 */

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  ChatInterface: () => Promise<any>;
  Widget?: () => Promise<any>;
  config: () => Promise<any>;
}

export const chatTemplates: Record<string, TemplateConfig> = {
  // Default template (always available)
  'base': {
    id: 'base',
    name: 'Default Template',
    description: 'Default chat interface',
    version: '1.0.0',
    ChatInterface: () => import('./base/ChatInterface'),
    config: () => import('./base/config.json')
  },

  'zen01': {
    id: 'zen01',
    name: 'Zen 01',
    description: 'Minimal typography-first chat: single accent color, hairline borders, dark/light mode',
    version: '2.0.0',
    ChatInterface: () => import('./zen01/ChatInterface'),
    config: () => import('./zen01/config.json')
  },

  'counsel': {
    id: 'counsel',
    name: 'Counsel',
    description: 'Editorial law-review chat: serif display, viridian accent, footnote-style sources',
    version: '1.0.0',
    ChatInterface: () => import('./counsel/ChatInterface'),
    config: () => import('./counsel/config.json')
  },

  'atlas': {
    id: 'atlas',
    name: 'Atlas',
    description: 'Product-grade chat: layered surfaces, ultramarine accent, source cards',
    version: '1.0.0',
    ChatInterface: () => import('./atlas/ChatInterface'),
    config: () => import('./atlas/config.json')
  },

  'majlis': {
    id: 'majlis',
    name: 'Majlis',
    description: 'Ink-and-brass legal chat: dark-first, small-caps labels, docket source ledger',
    version: '1.0.0',
    ChatInterface: () => import('./majlis/ChatInterface'),
    config: () => import('./majlis/config.json')
  },

  // Example: Add custom templates here
  // 'custom1': {
  //   id: 'custom1',
  //   name: 'Acme Corp Template',
  //   description: 'Custom theme for Acme Corp',
  //   version: '1.0.0',
  //   ChatInterface: () => import('./custom-acme/ChatInterface'),
  //   Widget: () => import('./custom-acme/Widget'),
  //   config: () => import('./custom-acme/config.json')
  // },
};

/**
 * Get available templates
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(chatTemplates);
}

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): TemplateConfig | null {
  return chatTemplates[templateId] || null;
}

/**
 * Check if template exists
 */
export function templateExists(templateId: string): boolean {
  return templateId in chatTemplates;
}

/**
 * Get default template
 */
export function getDefaultTemplate(): TemplateConfig {
  return chatTemplates['base'];
}
