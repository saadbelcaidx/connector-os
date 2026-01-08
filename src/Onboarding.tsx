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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative max-w-sm w-full rounded-2xl p-6 border border-white/[0.08]"
        style={{
          background: 'rgba(12, 12, 12, 0.95)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
        }}
      >
        <button
          onClick={skipOnboarding}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255, 255, 255, 0.06)' }}
          >
            <Sparkles size={20} className="text-white/70" />
          </div>
          <div>
            <h2 className="text-[15px] font-medium text-white/90">Welcome to Connector OS</h2>
            <p className="text-[12px] text-white/40">Quick tour — 30 seconds</p>
          </div>
        </div>

        <button
          onClick={startOnboarding}
          className="w-full py-2.5 rounded-lg text-[13px] font-medium bg-white/90 text-black hover:bg-white transition-colors flex items-center justify-center gap-2"
        >
          Start Tour
          <ArrowRight size={14} />
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
    top: 'bottom-full mb-3',
    bottom: 'top-full mt-3',
    left: 'right-full mr-3',
    right: 'left-full ml-3',
  };

  return (
    <div className={`absolute z-50 ${positionClasses[position]}`}>
      <div
        className="w-72 rounded-xl p-4 border border-white/[0.08]"
        style={{
          background: 'rgba(12, 12, 12, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-white/50 font-medium uppercase tracking-wide">{step}</span>
          <button
            onClick={onSkip}
            className="text-white/30 hover:text-white/60 transition-colors text-[11px]"
          >
            Skip
          </button>
        </div>

        <h3 className="text-[14px] font-medium text-white/90 mb-1">{title}</h3>
        <p className="text-[12px] text-white/50 mb-4 leading-relaxed">{description}</p>

        <button
          onClick={onNext}
          className="w-full py-2 rounded-lg text-[12px] font-medium bg-white/90 text-black hover:bg-white transition-colors flex items-center justify-center gap-1.5"
        >
          {isLastStep ? 'Get Started' : 'Next'}
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
