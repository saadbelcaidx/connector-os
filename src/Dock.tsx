import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Network, Mail, TrendingUp, BookOpen, Home, Settings, User, LogOut, Key, Eye, EyeOff, X, ArrowRight, Loader2, Radar } from 'lucide-react';
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
    id: 'flow',
    name: 'Flow',
    icon: Network,
    route: '/flow',
  },
  {
    id: 'hub',
    name: 'Markets',
    icon: Radar,
    route: '/hub',
  },
  {
    id: 'msg-sim',
    name: 'Msg Sim',
    icon: Mail,
    route: '/msg-sim',
  },
  {
    id: 'intros',
    name: 'Intros',
    icon: Network,
    route: '/introductions',
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
        className="absolute bottom-full mb-3 right-0 w-[280px] rounded-xl overflow-hidden z-50"
        style={{
          background: 'rgba(18, 18, 18, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
          animation: 'menu-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {!showPasswordForm ? (
          <>
            {/* User info */}
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Signed in as</p>
              <p className="text-[13px] text-white/80 truncate">{user?.email}</p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => setShowPasswordForm(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
              >
                <Key size={15} className="text-white/40" />
                <span className="text-[13px] text-white/70">Change Password</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
              >
                <LogOut size={15} className="text-white/40" />
                <span className="text-[13px] text-white/70">Sign Out</span>
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
              className="flex items-center gap-1 text-[12px] text-white/40 hover:text-white/60 mb-4 transition-colors"
            >
              ← Back
            </button>

            {passwordSuccess ? (
              <div className="text-center py-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                  <Key size={18} className="text-emerald-400" />
                </div>
                <p className="text-[14px] text-white/80">Password updated!</p>
              </div>
            ) : (
              <>
                <h3 className="text-[15px] font-medium text-white/90 mb-1">Change Password</h3>
                <p className="text-[12px] text-white/40 mb-4">Enter a new password</p>

                <form onSubmit={handleSetPassword}>
                  <div className="relative mb-3">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPasswordValue(e.target.value)}
                      placeholder="New password"
                      autoFocus
                      className="w-full h-[42px] px-3 pr-10 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.15] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/50 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full h-[42px] px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.15] transition-colors mb-3"
                  />

                  {passwordError && (
                    <p className="text-[12px] text-red-400 mb-3">{passwordError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!password || !confirmPassword || isSettingPassword}
                    className="w-full h-[40px] btn-primary text-[13px] disabled:opacity-50"
                  >
                    {isSettingPassword ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        Update Password
                        <ArrowRight size={14} />
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
    if (disabled) return; // Block navigation when disabled
    navigate(app.route);
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-2xl"
        style={{
          background: 'rgba(12, 12, 12, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.05) inset',
          animation: 'dock-fade-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards',
          opacity: 0,
        }}
      >
        {dockApps.map((app) => {
          const Icon = app.icon;
          const isActive = location.pathname === app.route;

          return (
            <button
              key={app.id}
              onClick={() => handleAppClick(app)}
              onMouseEnter={() => !disabled && setHoveredApp(app.id)}
              onMouseLeave={() => setHoveredApp(null)}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl"
              style={{
                cursor: disabled ? 'not-allowed' : 'pointer',
                transform: hoveredApp === app.id && !disabled ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease',
                background: isActive && !disabled ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <Icon
                size={18}
                style={{
                  color: isActive && !disabled ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                  strokeWidth: 1.5,
                  transition: 'color 200ms ease',
                }}
              />
              <span
                className="text-[9px] font-medium tracking-wide"
                style={{
                  color: isActive && !disabled ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.4)',
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
              className="w-px h-8 mx-1"
              style={{ background: 'rgba(255, 255, 255, 0.08)', opacity: disabled ? 0.4 : 1 }}
            />
            <div className="relative">
              <button
                onClick={() => !disabled && setShowAccountMenu(!showAccountMenu)}
                onMouseEnter={() => !disabled && setHoveredApp('account')}
                onMouseLeave={() => setHoveredApp(null)}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl"
                style={{
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transform: hoveredApp === 'account' && !disabled ? 'translateY(-2px)' : 'translateY(0)',
                  transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease',
                  background: showAccountMenu && !disabled ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <User
                  size={18}
                  style={{
                    color: showAccountMenu && !disabled ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                    strokeWidth: 1.5,
                    transition: 'color 200ms ease',
                  }}
                />
                <span
                  className="text-[9px] font-medium tracking-wide"
                  style={{
                    color: showAccountMenu && !disabled ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.4)',
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
            transform: translateY(100px);
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
