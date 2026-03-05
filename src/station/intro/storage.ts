/**
 * Intro Builder — localStorage CRUD for custom templates
 *
 * Key: `intro_templates` in localStorage.
 * Custom templates only — presets removed.
 */

import type { IntroTemplate } from './types';

const STORAGE_KEY = 'intro_templates';

export function loadCustomTemplates(): IntroTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as IntroTemplate[];
  } catch {
    return [];
  }
}

export function saveTemplate(template: IntroTemplate): void {
  const templates = loadCustomTemplates();
  const idx = templates.findIndex(t => t.id === template.id);
  const now = new Date().toISOString();

  if (idx >= 0) {
    templates[idx] = { ...template, updatedAt: now };
  } else {
    templates.push({ ...template, createdAt: now, updatedAt: now });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function deleteTemplate(id: string): void {
  const templates = loadCustomTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function duplicateTemplate(template: IntroTemplate): IntroTemplate {
  const now = new Date().toISOString();
  const copy: IntroTemplate = {
    ...template,
    id: `custom-${Date.now()}`,
    name: `${template.name} (Copy)`,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  };
  saveTemplate(copy);
  return copy;
}

export function getAllTemplates(): IntroTemplate[] {
  return loadCustomTemplates();
}
