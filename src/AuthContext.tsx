import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const SAAS_MODE = false;

export type AccessTier = 'FREE' | 'CORE' | 'ADVANCED' | 'OPERATOR';

export interface User {
  id: string;
  username: string;
  email: string | null;
  tier: AccessTier;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
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

const DEV_MODE = import.meta.env.DEV;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SAAS_MODE) {
      const publicConsoleUser: User = {
        id: 'public-console-user',
        username: 'Operator',
        email: null,
        tier: 'OPERATOR',
        isAdmin: false,
      };
      setUser(publicConsoleUser);
      setLoading(false);
      return;
    }

    const storedUser = localStorage.getItem('operator_os_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('operator_os_user');
      }
    }

    if (DEV_MODE && !storedUser) {
      const devUser: User = {
        id: 'dev-user-id',
        username: 'dev',
        email: 'dev@operatoros.local',
        tier: 'OPERATOR',
        isAdmin: true,
      };
      setUser(devUser);
      localStorage.setItem('operator_os_user', JSON.stringify(devUser));
    }

    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const passwordHash = await hashPassword(password);

      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, tier, is_admin')
        .eq('username', username)
        .eq('password_hash', passwordHash)
        .maybeSingle();

      if (error || !data) {
        console.error('Login failed:', error);
        return false;
      }

      const loggedInUser: User = {
        id: data.id,
        username: data.username,
        email: data.email,
        tier: data.tier as AccessTier,
        isAdmin: data.is_admin,
      };

      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id);

      setUser(loggedInUser);
      localStorage.setItem('operator_os_user', JSON.stringify(loggedInUser));

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('operator_os_user');
  };

  const hasTierAccess = (requiredTier: AccessTier): boolean => {
    if (!user) return false;
    if (user.isAdmin) return true;

    const userTierLevel = TIER_HIERARCHY[user.tier];
    const requiredTierLevel = TIER_HIERARCHY[requiredTier];

    return userTierLevel >= requiredTierLevel;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
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

export { supabase };
