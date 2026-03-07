import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, TrendingUp, BookOpen, Home, Settings, User, LogOut, Key, Eye, EyeOff, ArrowRight, Loader2, Radio, List } from 'lucide-react';
import { useAuth } from './AuthContext';

interface DockApp {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  route: string;
}

const dockApps: DockApp[] = [
  {
    id: 'home',
    name: 'Home',
    icon: Home,
    route: '/launcher',
  },
  {
    id: 'station',
    name: 'Station',
    icon: Radio,
    route: '/station',
  },
  {
    id: 'runs',
    name: 'Runs',
    icon: List,
    route: '/station/runs',
  },
  {
    id: 'msg-sim',
    name: 'Msg Sim',
    icon: Mail,
    route: '/msg-sim',
  },
  {
    id: 'calculator',
    name: 'Revenue',
    icon: TrendingUp,
    route: '/calculator',
  },
  {
    id: 'library',
    name: 'Library',
    icon: BookOpen,
    route: '/library',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: Settings,
    route: '/settings',
  },
];

// Station input style (matches AuthModal)
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  padding: '0 12px',
  fontFamily: 'monospace',
  fontSize: '11px',
  color: 'rgba(255,255,255,0.8)',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '2px',
  outline: 'none',
  transition: 'border-color 0.2s',
};

// Station primary button style
const btnPrimaryStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontFamily: 'monospace',
  fontSize: '11px',
  fontWeight: 500,
  color: '#000',
  background: '#fff',
  border: 'none',
  borderRadius: '2px',
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};

// Account Menu Component
function AccountMenu({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user, signOut, setPassword } = useAuth();
  const navigate = useNavigate();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate('/launcher');
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsSettingPassword(true);
    const result = await setPassword(password);

    if (result.error) {
      setPasswordError(result.error);
      setIsSettingPassword(false);
    } else {
      setPasswordSuccess(true);
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordValue('');
        setConfirmPassword('');
        setPasswordSuccess(false);
      }, 1500);
      setIsSettingPassword(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Menu */}
      <div
        className="absolute bottom-full mb-3 right-0 w-[260px] overflow-hidden z-50"
        style={{
          background: '#09090b',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '2px',
          animation: 'menu-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {!showPasswordForm ? (
          <>
            {/* User info */}
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-1">Signed in as</p>
              <p className="font-mono text-[11px] text-white/60 truncate">{user?.email}</p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => setShowPasswordForm(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <Key size={14} style={{ color: 'rgba(255,255,255,0.3)', strokeWidth: 1.5 }} />
                <span className="font-mono text-[11px] text-white/50">Change Password</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <LogOut size={14} style={{ color: 'rgba(255,255,255,0.3)', strokeWidth: 1.5 }} />
                <span className="font-mono text-[11px] text-white/50">Sign Out</span>
              </button>
            </div>
          </>
        ) : (
          <div className="p-4">
            {/* Back button */}
            <button
              onClick={() => {
                setShowPasswordForm(false);
                setPasswordValue('');
                setConfirmPassword('');
                setPasswordError(null);
              }}
              className="font-mono text-[10px] text-white/25 hover:text-white/40 mb-4 transition-colors"
            >
              ← Back
            </button>

            {passwordSuccess ? (
              <div className="text-center py-4">
                <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                  <Key size={16} style={{ color: 'rgba(16,185,129,0.7)', strokeWidth: 1.5 }} />
                </div>
                <p className="font-mono text-[11px] text-white/60">Password updated</p>
              </div>
            ) : (
              <>
                <p className="font-mono text-[11px] text-white/60 font-medium mb-1">Change Password</p>
                <p className="font-mono text-[10px] text-white/30 mb-4">Enter a new password</p>

                <form onSubmit={handleSetPassword}>
                  <div className="relative" style={{ marginBottom: '8px' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPasswordValue(e.target.value)}
                      placeholder="New password"
                      autoFocus
                      style={{ ...inputStyle, paddingRight: '36px' }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    style={{ ...inputStyle, marginBottom: '8px' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                  />

                  {passwordError && (
                    <p className="font-mono text-[10px] text-white/30 mb-2">{passwordError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!password || !confirmPassword || isSettingPassword}
                    style={{
                      ...btnPrimaryStyle,
                      opacity: (!password || !confirmPassword || isSettingPassword) ? 0.3 : 1,
                    }}
                  >
                    {isSettingPassword ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: '#000' }} />
                    ) : (
                      <>
                        Update Password
                        <ArrowRight size={12} />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes menu-slide-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

interface DockProps {
  disabled?: boolean;
}

function Dock({ disabled = false }: DockProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  const handleAppClick = (app: DockApp) => {
    if (disabled) return;
    navigate(app.route);
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div
        className="flex items-center gap-1 px-2 py-1.5"
        style={{
          background: 'rgba(9, 9, 11, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '2px',
          animation: 'dock-fade-in 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards',
          opacity: 0,
        }}
      >
        {dockApps.map((app) => {
          const Icon = app.icon;
          const isActive = app.route === '/station'
            ? location.pathname === '/station'
            : app.route === '/station/runs'
              ? location.pathname.startsWith('/station/run')
              : location.pathname === app.route;

          return (
            <button
              key={app.id}
              onClick={() => handleAppClick(app)}
              onMouseEnter={() => !disabled && setHoveredApp(app.id)}
              onMouseLeave={() => setHoveredApp(null)}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1.5"
              style={{
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isActive && !disabled
                  ? 'rgba(255, 255, 255, 0.04)'
                  : hoveredApp === app.id && !disabled
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'transparent',
                borderRadius: '2px',
                transition: 'background 200ms ease, opacity 200ms ease',
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <Icon
                size={16}
                style={{
                  color: isActive && !disabled ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                  strokeWidth: 1.5,
                  transition: 'color 200ms ease',
                }}
              />
              <span
                className="font-mono"
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.04em',
                  color: isActive && !disabled ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                  transition: 'color 200ms ease',
                }}
              >
                {app.name}
              </span>
            </button>
          );
        })}

        {/* Divider + Account button - only show when logged in */}
        {isAuthenticated && user && (
          <>
            <div
              className="w-px h-6 mx-1"
              style={{ background: 'rgba(255, 255, 255, 0.06)' }}
            />
            <div className="relative">
              <button
                onClick={() => !disabled && setShowAccountMenu(!showAccountMenu)}
                onMouseEnter={() => !disabled && setHoveredApp('account')}
                onMouseLeave={() => setHoveredApp(null)}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5"
                style={{
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: showAccountMenu && !disabled
                    ? 'rgba(255, 255, 255, 0.04)'
                    : hoveredApp === 'account' && !disabled
                      ? 'rgba(255, 255, 255, 0.02)'
                      : 'transparent',
                  borderRadius: '2px',
                  transition: 'background 200ms ease, opacity 200ms ease',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <User
                  size={16}
                  style={{
                    color: showAccountMenu && !disabled ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                    strokeWidth: 1.5,
                    transition: 'color 200ms ease',
                  }}
                />
                <span
                  className="font-mono"
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.04em',
                    color: showAccountMenu && !disabled ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                    transition: 'color 200ms ease',
                  }}
                >
                  Account
                </span>
              </button>

              <AccountMenu
                isOpen={showAccountMenu && !disabled}
                onClose={() => setShowAccountMenu(false)}
              />
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes dock-fade-in {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default Dock;
