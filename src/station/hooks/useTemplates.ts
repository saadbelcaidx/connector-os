/**
 * useTemplates — Template CRUD hook for the Intro Builder
 *
 * Manages template state, selected template, save/delete/duplicate.
 * Reads from localStorage on mount.
 */

import { useState, useCallback, useEffect } from 'react';
import type { IntroTemplate } from '../intro/types';
import {
  loadCustomTemplates,
  saveTemplate as persistTemplate,
  deleteTemplate as removeTemplate,
  duplicateTemplate as copyTemplate,
  getAllTemplates,
} from '../intro/storage';

export function useTemplates() {
  const [customTemplates, setCustomTemplates] = useState<IntroTemplate[]>([]);
  const [allTemplates, setAllTemplates] = useState<IntroTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<IntroTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<IntroTemplate | null>(null);

  // Load on mount
  useEffect(() => {
    const custom = loadCustomTemplates();
    setCustomTemplates(custom);
    setAllTemplates(getAllTemplates());
  }, []);

  const selectTemplate = useCallback((template: IntroTemplate) => {
    setSelectedTemplate(template);
    setEditingTemplate(null);
  }, []);

  const startNew = useCallback(() => {
    const now = new Date().toISOString();
    const blank: IntroTemplate = {
      id: `custom-${Date.now()}`,
      name: '',
      description: '',
      supplyBody: 'Hey {{supply.firstName}} — ',
      demandBody: 'Hey {{demand.firstName}} — ',
      variables: [],
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    };
    setEditingTemplate(blank);
    setSelectedTemplate(null);
  }, []);

  const startEdit = useCallback((template: IntroTemplate) => {
    setEditingTemplate({ ...template });
    setSelectedTemplate(null);
  }, []);

  const updateEditing = useCallback((template: IntroTemplate) => {
    setEditingTemplate(template);
  }, []);

  const saveTemplate = useCallback((template: IntroTemplate) => {
    persistTemplate(template);
    const custom = loadCustomTemplates();
    setCustomTemplates(custom);
    setAllTemplates(getAllTemplates());
    setEditingTemplate(null);
    setSelectedTemplate(template);
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    removeTemplate(id);
    const custom = loadCustomTemplates();
    setCustomTemplates(custom);
    setAllTemplates(getAllTemplates());
    if (selectedTemplate?.id === id) setSelectedTemplate(null);
    if (editingTemplate?.id === id) setEditingTemplate(null);
  }, [selectedTemplate, editingTemplate]);

  const duplicateTemplate = useCallback((template: IntroTemplate) => {
    const copy = copyTemplate(template);
    const custom = loadCustomTemplates();
    setCustomTemplates(custom);
    setAllTemplates(getAllTemplates());
    setEditingTemplate(copy);
    setSelectedTemplate(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingTemplate(null);
  }, []);

  return {
    customTemplates,
    allTemplates,
    selectedTemplate,
    editingTemplate,
    selectTemplate,
    startNew,
    startEdit,
    updateEditing,
    saveTemplate,
    deleteTemplate,
    duplicateTemplate,
    cancelEdit,
  };
}
