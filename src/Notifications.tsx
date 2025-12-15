import { useState, useEffect } from 'react';
import { ArrowLeft, Bell, TrendingUp, AlertTriangle, DollarSign, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';
import AppHeader from './AppHeader';
import {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  Notification,
} from './services/NotificationsService';

function NotificationCard({ notification, onDelete }: { notification: Notification; onDelete: (id: string) => void }) {
  const getIcon = () => {
    switch (notification.type) {
      case 'pressure_rising':
        return TrendingUp;
      case 'funding_spike':
        return DollarSign;
      case 'layoffs_increase':
        return AlertTriangle;
      case 'hiring_surge':
        return Users;
      case 'tech_shift':
        return Users;
      default:
        return Bell;
    }
  };

  const getBadgeColor = () => {
    switch (notification.type) {
      case 'pressure_rising':
        return '#26F7C7';
      case 'funding_spike':
        return '#3A9CFF';
      case 'layoffs_increase':
        return '#999999';
      case 'hiring_surge':
        return '#26F7C7';
      case 'tech_shift':
        return '#3A9CFF';
      default:
        return '#666666';
    }
  };

  const getTypeLabel = () => {
    switch (notification.type) {
      case 'pressure_rising':
        return 'Pressure Rising';
      case 'funding_spike':
        return 'Funding Event';
      case 'layoffs_increase':
        return 'Layoffs Alert';
      case 'hiring_surge':
        return 'Hiring Surge';
      case 'tech_shift':
        return 'Tech Shift';
      default:
        return 'Alert';
    }
  };

  const getTimeSince = () => {
    const now = new Date();
    const created = new Date(notification.created_at);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const Icon = getIcon();
  const badgeColor = getBadgeColor();
  const isUnread = !notification.read;

  return (
    <div
      className={`relative p-5 rounded-[10px] border transition-all duration-300 hover:scale-[1.005] ${
        isUnread
          ? 'bg-[#0C0C0C] border-[#26F7C7] border-opacity-30'
          : 'bg-[#0C0C0C] bg-opacity-50 border-[#1C1C1C]'
      }`}
      style={{
        boxShadow: isUnread ? '0 0 16px rgba(38, 247, 199, 0.15)' : '0 0 8px rgba(14, 165, 233, 0.08)',
      }}
    >
      {isUnread && (
        <div
          className="absolute inset-0 rounded-[10px] pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(38, 247, 199, 0.06) 0%, transparent 70%)',
          }}
        />
      )}

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded"
              style={{
                background: `${badgeColor}20`,
              }}
            >
              <Icon size={16} style={{ color: badgeColor, strokeWidth: 2 }} />
            </div>
            <div>
              <div
                className="text-[11px] font-medium uppercase tracking-wider mb-1"
                style={{ color: badgeColor }}
              >
                {getTypeLabel()}
              </div>
              <div className="text-[10px] text-white text-opacity-40">{getTimeSince()}</div>
            </div>
          </div>
          {isUnread && (
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: '#26F7C7',
                boxShadow: '0 0 8px rgba(38, 247, 199, 0.6)',
              }}
            />
          )}
        </div>

        <p className="text-[14px] text-white text-opacity-85 leading-relaxed mb-4">
          {notification.message}
        </p>

        <div className="flex items-center justify-between pt-3 border-t border-[#1C1C1C]">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[9px] text-white text-opacity-40 uppercase tracking-wider">Signal</div>
              <div
                className="text-[13px] font-medium"
                style={{ color: notification.signal_strength >= 70 ? '#26F7C7' : '#3A9CFF' }}
              >
                {notification.signal_strength}/100
              </div>
            </div>
            <div>
              <div className="text-[9px] text-white text-opacity-40 uppercase tracking-wider">Momentum</div>
              <div className="text-[13px] font-medium text-white text-opacity-85">
                {notification.momentum}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-white text-opacity-40 uppercase tracking-wider">Forecast</div>
              <div className="text-[13px] font-medium text-white text-opacity-85 capitalize">
                {notification.forecast}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    const data = await getNotifications();
    setNotifications(data);
    setLoading(false);

    await markAllAsRead();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      <div className="max-w-[1000px] mx-auto">
        <button
          onClick={() => navigate('/launcher')}
          className="flex items-center gap-2 mb-6 text-sm text-gray-400 hover:text-gray-200 transition-colors duration-200"
        >
          <ArrowLeft size={16} />
          Back to Connector OS
        </button>

        <div className="mb-8">
          <div className="inline-block px-2.5 py-1 bg-[#0F1B17] text-[#26F7C7] text-[10px] font-medium rounded-full mb-2 border-b border-[#26F7C7] border-opacity-30">
            Connector OS
          </div>
          <h1 className="text-[32px] font-medium text-white mb-1.5">Pressure Alerts</h1>
          <p className="text-[17px] font-light text-white text-opacity-75">
            Real-time notifications when market signals shift.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white text-opacity-40">Loading alerts...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <div
              className="inline-block p-4 rounded-full mb-4"
              style={{
                background: 'rgba(14, 165, 233, 0.12)',
              }}
            >
              <Bell size={32} style={{ color: '#3A9CFF' }} />
            </div>
            <div className="text-[16px] text-white text-opacity-60 mb-2">No alerts yet</div>
            <div className="text-[13px] text-white text-opacity-40">
              Notifications will appear here when pressure signals shift.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notification, index) => (
              <div
                key={notification.id}
                style={{
                  animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`,
                }}
              >
                <NotificationCard notification={notification} onDelete={handleDelete} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-6 right-6 text-[11px] text-white opacity-60 font-light">
        Notifications • Connector OS
      </div>

      <AppHeader />
      <Dock />

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
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

export default Notifications;
