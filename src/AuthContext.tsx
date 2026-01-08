import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './lib/supabase';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

// SSM-gated features use Supabase Auth
// Other features remain open (public console mode)
export const SAAS_MODE = false;

export type AccessTier = 'FREE' | 'CORE' | 'ADVANCED' | 'OPERATOR';

/**
 * RuntimeMode: Explicit runtime mode for the entire app.
 * - 'guest': No DB writes, no AI calls, localStorage only, zero side effects
 * - 'auth': Full persistence, AI enabled (if configured), realtime subscriptions
 *
 * This replaces all implicit `user?.id` / `isGuest` checks with a single source of truth.
 */
export type RuntimeMode = 'guest' | 'auth';

export interface User {
  id: string;
  email: string;
  tier: AccessTier;
  isAdmin: boolean;
  needsPasswordSetup: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  runtimeMode: RuntimeMode;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null; needsSignUp?: boolean }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  setPassword: (password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  hasTierAccess: (requiredTier: AccessTier) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TIER_HIERARCHY: Record<AccessTier, number> = {
  FREE: 0,
  CORE: 1,
  ADVANCED: 2,
  OPERATOR: 3,
};

// Production URL for magic link redirect
const PRODUCTION_URL = 'https://app.connector-os.com';

const getRedirectUrl = () => {
  // Always use production URL for magic links
  // This ensures the link works regardless of where user signed up from
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.origin}/auth/callback`;
  }
  return `${PRODUCTION_URL}/auth/callback`;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Convert Supabase user to our User type
  const mapSupabaseUser = (supabaseUser: SupabaseUser | null): User | null => {
    if (!supabaseUser || !supabaseUser.email) return null;

    // Check if user has completed password setup
    const passwordSetupComplete = supabaseUser.user_metadata?.password_setup_complete === true;

    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      tier: 'OPERATOR', // Default tier for authenticated users
      isAdmin: false,
      needsPasswordSetup: !passwordSetupComplete,
    };
  };

  useEffect(() => {
    // CANONICAL: Get session on mount, set user, flip loading
    supabase.auth.getSession().then(({ data }) => {
      console.log('[Auth] getSession result:', data.session ? 'HAS SESSION' : 'NO SESSION');
      setSession(data.session);
      setUser(data.session?.user ? mapSupabaseUser(data.session.user) : null);
      setLoading(false);
    });

    // CANONICAL: Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        console.log('[Auth] onAuthStateChange:', _event, currentSession ? 'HAS SESSION' : 'NO SESSION');
        setSession(currentSession);
        setUser(currentSession?.user ? mapSupabaseUser(currentSession.user) : null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Sign in with magic link (via custom endpoint for branded emails)
  const signInWithEmail = async (email: string): Promise<{ error: string | null }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-magic-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase().trim(),
            type: 'magiclink',
            redirectTo: getRedirectUrl(),
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        console.error('[Auth] Sign in error:', result);
        return { error: result.error || 'Failed to send magic link' };
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] Sign in exception:', err);
      return { error: 'Failed to send magic link' };
    }
  };

  // Sign in with password
  const signInWithPassword = async (email: string, password: string): Promise<{ error: string | null; needsSignUp?: boolean }> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[Auth] Password sign in error:', error);
        // Check if user doesn't exist
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Invalid email or password', needsSignUp: true };
        }
        return { error: error.message };
      }

      // Clear trial flags on successful login
      localStorage.removeItem('ssm_force_guest');
      localStorage.removeItem('msg_sim_trials');

      return { error: null };
    } catch (err) {
      console.error('[Auth] Password sign in exception:', err);
      return { error: 'Failed to sign in' };
    }
  };

  // Sign up with password
  const signUpWithPassword = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl(),
        },
      });

      if (error) {
        console.error('[Auth] Sign up error:', error);
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] Sign up exception:', err);
      return { error: 'Failed to create account' };
    }
  };

  // Set password for magic link users
  const setPassword = async (password: string): Promise<{ error: string | null }> => {
    // Guard: no session = no auth mutation
    if (!session?.user) {
      return { error: 'No active session' };
    }

    try {
      // Set password AND mark setup as complete
      const { error, data } = await supabase.auth.updateUser({
        password,
        data: {
          password_setup_complete: true,
        },
      });

      if (error) {
        console.error('[Auth] Set password error:', error);
        return { error: error.message };
      }

      // Update local user state to reflect password setup complete
      if (data.user) {
        setUser(mapSupabaseUser(data.user));
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] Set password exception:', err);
      return { error: 'Failed to set password' };
    }
  };

  // Reset password (via custom endpoint for branded emails)
  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-magic-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase().trim(),
            type: 'recovery',
            redirectTo: getRedirectUrl(),
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        console.error('[Auth] Reset password error:', result);
        return { error: result.error || 'Failed to send reset link' };
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] Reset password exception:', err);
      return { error: 'Failed to send reset link' };
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
    }
  };

  const hasTierAccess = (requiredTier: AccessTier): boolean => {
    if (!user) return false;
    if (user.isAdmin) return true;

    const userTierLevel = TIER_HIERARCHY[user.tier];
    const requiredTierLevel = TIER_HIERARCHY[requiredTier];

    return userTierLevel >= requiredTierLevel;
  };

  // Derive runtime mode from auth state - single source of truth
  const runtimeMode: RuntimeMode = user?.id ? 'auth' : 'guest';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        runtimeMode,
        signInWithEmail,
        signInWithPassword,
        signUpWithPassword,
        setPassword,
        resetPassword,
        signOut,
        isAuthenticated: !!user,
        hasTierAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Convenience hook for runtime mode.
 * Returns 'guest' or 'auth' - use this instead of checking user?.id everywhere.
 */
export function useRuntimeMode(): RuntimeMode {
  const { runtimeMode } = useAuth();
  return runtimeMode;
}

/**
 * Helper to check if we're in guest mode.
 * Prefer using runtimeMode === 'guest' directly for clarity.
 */
export function isGuestMode(runtimeMode: RuntimeMode): boolean {
  return runtimeMode === 'guest';
}

export { supabase };
