import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';

export function WelcomeModal() {
  const { isOnboarding, currentStep, startOnboarding, skipOnboarding } = useOnboarding();

  if (!isOnboarding || currentStep !== 'welcome') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm bg-black/60">
      <div
        className="relative max-w-md w-full rounded-[20px] p-8 border border-[#26F7C7]/30"
        style={{
          background: 'linear-gradient(135deg, rgba(12, 12, 12, 0.95) 0%, rgba(10, 10, 10, 0.95) 100%)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 0 40px rgba(38, 247, 199, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <button
          onClick={skipOnboarding}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={20} />
        </button>

        <div
          className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(38, 247, 199, 0.2) 0%, rgba(38, 247, 199, 0.05) 100%)',
            border: '1px solid rgba(38, 247, 199, 0.3)',
            boxShadow: '0 0 30px rgba(38, 247, 199, 0.2)',
          }}
        >
          <Sparkles size={32} className="text-[#26F7C7]" />
        </div>

        <h2
          className="text-2xl font-semibold text-center mb-3"
          style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, rgba(255, 255, 255, 0.7) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Welcome to Operator OS
        </h2>

        <p className="text-white/60 text-center mb-8 leading-relaxed">
          Let me show you around. This will take 30 seconds.
        </p>

        <button
          onClick={startOnboarding}
          className="w-full py-3 px-6 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, rgba(38, 247, 199, 0.15) 0%, rgba(38, 247, 199, 0.05) 100%)',
            border: '1px solid rgba(38, 247, 199, 0.3)',
            color: '#26F7C7',
            boxShadow: '0 0 20px rgba(38, 247, 199, 0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(38, 247, 199, 0.25) 0%, rgba(38, 247, 199, 0.1) 100%)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(38, 247, 199, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(38, 247, 199, 0.15) 0%, rgba(38, 247, 199, 0.05) 100%)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(38, 247, 199, 0.15)';
          }}
        >
          Start Tour
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

interface TourTooltipProps {
  step: string;
  title: string;
  description: string;
  onNext: () => void;
  onSkip: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right';
  isLastStep?: boolean;
}

export function TourTooltip({
  step,
  title,
  description,
  onNext,
  onSkip,
  position = 'bottom',
  isLastStep = false,
}: TourTooltipProps) {
  const positionClasses = {
    top: 'bottom-full mb-4',
    bottom: 'top-full mt-4',
    left: 'right-full mr-4',
    right: 'left-full ml-4',
  };

  return (
    <div className={`absolute z-50 ${positionClasses[position]}`}>
      <div
        className="w-80 rounded-[16px] p-6 border border-[#26F7C7]/30"
        style={{
          background: 'linear-gradient(135deg, rgba(12, 12, 12, 0.98) 0%, rgba(10, 10, 10, 0.98) 100%)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 0 40px rgba(38, 247, 199, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[#26F7C7] text-sm font-medium">{step}</span>
          <button
            onClick={onSkip}
            className="text-white/40 hover:text-white/80 transition-colors text-sm"
          >
            Skip tour
          </button>
        </div>

        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-white/70 text-sm mb-4 leading-relaxed">{description}</p>

        <button
          onClick={onNext}
          className="w-full py-2.5 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, rgba(38, 247, 199, 0.15) 0%, rgba(38, 247, 199, 0.05) 100%)',
            border: '1px solid rgba(38, 247, 199, 0.3)',
            color: '#26F7C7',
            boxShadow: '0 0 15px rgba(38, 247, 199, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(38, 247, 199, 0.25) 0%, rgba(38, 247, 199, 0.1) 100%)';
            e.currentTarget.style.boxShadow = '0 0 25px rgba(38, 247, 199, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(38, 247, 199, 0.15) 0%, rgba(38, 247, 199, 0.05) 100%)';
            e.currentTarget.style.boxShadow = '0 0 15px rgba(38, 247, 199, 0.1)';
          }}
        >
          {isLastStep ? 'Enter Operator OS' : 'Next'}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function OnboardingOverlay() {
  const { isOnboarding, currentStep, nextStep, completeOnboarding, skipOnboarding } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isOnboarding || currentStep === 'welcome') return;

    if (currentStep === 'settings' && location.pathname !== '/settings') {
      navigate('/settings');
    } else if (currentStep === 'matching-engine' && location.pathname !== '/matching-engine') {
      navigate('/matching-engine');
    } else if (currentStep === 'intro' && location.pathname !== '/matching-engine') {
      navigate('/matching-engine');
    }
  }, [currentStep, isOnboarding, navigate, location.pathname]);

  useEffect(() => {
    if (currentStep === 'complete') {
      completeOnboarding();
      navigate('/launcher');
    }
  }, [currentStep, completeOnboarding, navigate]);

  if (!isOnboarding || currentStep === 'welcome' || currentStep === 'complete') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.12)' }}
      />
    </div>
  );
}
