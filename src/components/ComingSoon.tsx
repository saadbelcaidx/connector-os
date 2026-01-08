import { useNavigate } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  title?: string;
  description?: string;
}

export default function ComingSoon({
  title = 'Coming Soon',
  description = 'This feature is currently in development.',
}: ComingSoonProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <Clock
            size={28}
            style={{ color: 'rgba(255, 255, 255, 0.4)' }}
            strokeWidth={1.5}
          />
        </div>

        {/* Title */}
        <h1
          className="text-2xl font-medium tracking-tight mb-3"
          style={{ color: 'rgba(255, 255, 255, 0.85)' }}
        >
          {title}
        </h1>

        {/* Description */}
        <p
          className="text-[15px] leading-relaxed mb-8"
          style={{ color: 'rgba(255, 255, 255, 0.45)' }}
        >
          {description}
        </p>

        {/* Back button */}
        <button
          onClick={() => navigate('/launcher')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.7)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          }}
        >
          <ArrowLeft size={16} />
          Back to Launcher
        </button>
      </div>
    </div>
  );
}
