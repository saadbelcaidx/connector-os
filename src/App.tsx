import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, SAAS_MODE } from './AuthContext';
import { OnboardingProvider } from './OnboardingContext';
import { OnboardingOverlay } from './Onboarding';
import Portal from './Portal';
import Launcher from './Launcher';
import Calculator from './Calculator';
import Library from './Library';
import InitiationDoc from './InitiationDoc';
import NeedPowerDoc from './NeedPowerDoc';
import MatchingEngineV3 from './MatchingEngineV3';
import Settings from './Settings';
import Login from './Login';
import Admin from './Admin';
import AccessControl from './AccessControl';
import Notifications from './Notifications';
import SignalsGuide from './SignalsGuide';
import SignalPresets from './SignalPresets';
import { Dashboard } from './Dashboard';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (!SAAS_MODE) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] flex items-center justify-center">
        <div className="text-white text-opacity-60">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {SAAS_MODE && <Route path="/login" element={<div className="page-fade"><Login /></div>} />}
      <Route path="/" element={<PrivateRoute><div className="page-fade"><Portal /></div></PrivateRoute>} />
      <Route path="/launcher" element={<PrivateRoute><div className="page-fade"><Launcher /></div></PrivateRoute>} />

      <Route
        path="/calculator"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <Calculator />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/library"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <Library />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/matching-engine"
        element={
          <PrivateRoute>
            <AccessControl requiredTier="ADVANCED" featureName="Matching Engine V3">
              <div className="page-fade">
                <MatchingEngineV3 />
              </div>
            </AccessControl>
          </PrivateRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <Settings />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <Dashboard />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/signals/presets"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <SignalPresets />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <Notifications />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <Admin />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/docs/initiation"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <InitiationDoc />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/docs/need-power"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <NeedPowerDoc />
            </div>
          </PrivateRoute>
        }
      />

      <Route
        path="/docs/signals-guide"
        element={
          <PrivateRoute>
            <div className="page-fade">
              <SignalsGuide />
            </div>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <Router>
          <OnboardingOverlay />
          <AppRoutes />
        </Router>
      </OnboardingProvider>
    </AuthProvider>
  );
}

export default App;
