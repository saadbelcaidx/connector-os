import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, AlertCircle } from 'lucide-react';
import { useAuth } from './AuthContext';

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(username, password);

    if (success) {
      navigate('/launcher');
    } else {
      setError('Invalid username or password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-block w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(58, 156, 255, 0.2) 0%, rgba(38, 247, 199, 0.2) 100%)',
              border: '1px solid rgba(58, 156, 255, 0.3)',
              boxShadow: '0 0 20px rgba(58, 156, 255, 0.15)',
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <Lock size={32} style={{ color: '#3A9CFF' }} />
            </div>
          </div>
          <h1 className="text-[32px] font-medium text-white mb-2">Operator OS</h1>
          <p className="text-[15px] text-white text-opacity-60">Sign in to access your workspace</p>
        </div>

        <div
          className="bg-[#0C0C0C] rounded-[12px] p-8 border border-[#1C1C1C]"
          style={{
            boxShadow: '0 0 20px rgba(14, 165, 233, 0.08)',
          }}
        >
          {error && (
            <div className="mb-6 p-3 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg flex items-start gap-2">
              <AlertCircle size={18} style={{ color: '#ef4444', marginTop: '1px' }} />
              <div className="text-[13px] text-red-400">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label className="flex items-center text-[13px] font-normal text-white text-opacity-65 mb-2">
                Username
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white opacity-40"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  className="w-full h-[44px] bg-[#0F0F0F] text-white text-[15px] pl-10 pr-3 rounded-lg border border-[#1C1C1C] hover:border-[#262626] focus:border-[#3A9CFF] focus:outline-none transition-all duration-150"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="flex items-center text-[13px] font-normal text-white text-opacity-65 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white opacity-40"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full h-[44px] bg-[#0F0F0F] text-white text-[15px] pl-10 pr-3 rounded-lg border border-[#1C1C1C] hover:border-[#262626] focus:border-[#3A9CFF] focus:outline-none transition-all duration-150"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[44px] bg-[#3A9CFF] text-white text-[15px] font-medium rounded-lg hover:bg-opacity-90 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                boxShadow: '0 0 20px rgba(58, 156, 255, 0.25)',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#1C1C1C]">
            <div className="text-[12px] text-white text-opacity-40 text-center">
              Development mode: Auto-login enabled
            </div>
            <div className="text-[11px] text-white text-opacity-30 text-center mt-1">
              Default admin: username=admin, password=admin123
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-[12px] text-white text-opacity-40">
            Operator OS V4 • Access Control System
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
