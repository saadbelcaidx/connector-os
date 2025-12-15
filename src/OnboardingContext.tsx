import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type OnboardingStep = 'welcome' | 'launcher' | 'settings' | 'matching-engine' | 'intro' | 'complete';

interface OnboardingContextType {
  isOnboarding: boolean;
  currentStep: OnboardingStep;
  startOnboarding: () => void;
  nextStep: () => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const ONBOARDING_KEY = 'operator_os_onboarded';

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDING_KEY);
    if (!onboarded) {
      setIsOnboarding(true);
    }
  }, []);

  const startOnboarding = () => {
    setIsOnboarding(true);
    setCurrentStep('launcher');
  };

  const nextStep = () => {
    const steps: OnboardingStep[] = ['launcher', 'settings', 'matching-engine', 'intro', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOnboarding(false);
    setCurrentStep('welcome');
  };

  const skipOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOnboarding(false);
    setCurrentStep('welcome');
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboarding,
        currentStep,
        startOnboarding,
        nextStep,
        completeOnboarding,
        skipOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
