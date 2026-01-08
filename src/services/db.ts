/**
 * CENTRALIZED DATABASE ACCESS LAYER
 *
 * Rule: Components NEVER import supabase directly.
 * All DB operations go through this service.
 */

import { supabase } from '../lib/supabase';

// =============================================================================
// OPERATOR SETTINGS
// =============================================================================

export const db = {
  // Get operator settings by user ID
  getOperatorSettings: (userId: string) =>
    supabase.from('operator_settings').select('*').eq('user_id', userId).single(),

  // Update operator settings
  updateOperatorSettings: (userId: string, data: Record<string, unknown>) =>
    supabase.from('operator_settings').update(data).eq('user_id', userId),

  // Upsert operator settings
  upsertOperatorSettings: (userId: string, data: Record<string, unknown>) =>
    supabase.from('operator_settings').upsert({ user_id: userId, ...data }),

  // =============================================================================
  // EDGE FUNCTIONS
  // =============================================================================

  // Invoke edge function
  invokeFunction: <T = unknown>(name: string, body: Record<string, unknown>) =>
    supabase.functions.invoke<T>(name, { body }),

  // =============================================================================
  // AUTH (read-only access for components)
  // =============================================================================

  getSession: () => supabase.auth.getSession(),
};

// Re-export for components that genuinely need raw client (auth callbacks, etc.)
// Use sparingly - prefer db methods above
export { supabase } from '../lib/supabase';
