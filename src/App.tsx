import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, SAAS_MODE } from './AuthContext';
import { OnboardingProvider } from './OnboardingContext';
import { OnboardingOverlay } from './Onboarding';
import Landing from './Landing';
import Portal from './Portal';
import Launcher from './Launcher';
import Calculator from './Calculator';
import Library from './Library';
import InitiationDoc from './InitiationDoc';
import NeedPowerDoc from './NeedPowerDoc';
import Flow from './Flow';
import ReplyBrainV1 from './reply/ReplyBrainV1';
import DebugReplyBrain from './reply/DebugReplyBrain';
import ReplyTracker from './reply/ReplyTracker';
import Settings from './Settings';
import Login from './Login';
import AuthCallback from './AuthCallback';
import Admin from './Admin';
import SSMGate from './SSMGate';
import Notifications from './Notifications';
import SignalsGuide from './SignalsGuide';
import SignalPresets from './SignalPresets';
import { Dashboard } from './Dashboard';
import SSMAccessDashboard from './operator/SSMAccessDashboard';
import CorpusAdmin from './operator/CorpusAdmin';
import OperatorRoute from './OperatorRoute';
import PasswordSetupGate from './PasswordSetupGate';
import OnboardingWizard from './OnboardingWizard';
import ConnectorHub from './ConnectorHub';
import ConnectorAgent from './connector-agent/ConnectorAgent';
import Operator from './Operator';
import Privacy from './Privacy';
import Terms from './Terms';
import ComingSoon from './components/ComingSoon';
import VslWatch from './VslWatch';
import Version from './Version';
import { FEATURES } from './config/features';
import ConnectorAssistant from './components/ConnectorAssistant';
import PlatformApp from './platform/PlatformApp';
import PlatformDashboard from './platform/PlatformDashboard';
import PlatformSettings from './platform/PlatformSettings';

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

// Shows landing page for non-authenticated users, redirects to launcher if authenticated
function LandingRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-white text-opacity-60">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/flow" replace />;
  }

  return <Landing />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Landing page for non-authenticated users */}
      <Route path="/" element={<LandingRoute />} />

      {/* Landing page always accessible (for authenticated users to view site) */}
      <Route path="/site" element={<Landing />} />

      {/* Auth routes - always available for SSM gating */}
      <Route path="/login" element={<div className="page-fade"><Login /></div>} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route path="/portal" element={<PrivateRoute><div className="page-fade"><Portal /></div></PrivateRoute>} />
      <Route path="/launcher" element={<div className="page-fade"><Launcher /></div>} />
      <Route path="/setup" element={<PrivateRoute><div className="page-fade"><OnboardingWizard /></div></PrivateRoute>} />

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

      {/* Library/Playbook is public */}
      <Route path="/library" element={<div className="page-fade"><Library /></div>} />

      {/* Compliance pages - public */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/version" element={<Version />} />
      <Route path="/vsl/watch" element={<VslWatch />} />

      {/* Debug page for reply brain testing */}
      <Route path="/debug/reply-brain" element={<div className="page-fade"><DebugReplyBrain /></div>} />

      {/* Flow - Main product */}
      <Route path="/flow" element={<div className="page-fade"><Flow /></div>} />

      {/* Operator Console - Hidden pipeline dashboard */}
      <Route path="/operator" element={<div className="page-fade"><Operator /></div>} />

      {/* Connector Hub - Lead database (SSM gated) */}
      <Route
        path="/hub"
        element={
          <PrivateRoute>
            <SSMGate featureName="Connector Hub">
              <div className="page-fade">
                <ConnectorHub />
              </div>
            </SSMGate>
          </PrivateRoute>
        }
      />

      {/* Strategic Alignment Platform - Dashboard (SSM gated) */}
      <Route
        path="/platform-dashboard"
        element={
          <PrivateRoute>
            <SSMGate featureName="Strategic Platform">
              <div className="page-fade">
                <PlatformDashboard />
              </div>
            </SSMGate>
          </PrivateRoute>
        }
      />

      {/* Strategic Alignment Platform - Branding edit (SSM gated) */}
      <Route
        path="/platform-settings"
        element={
          <PrivateRoute>
            <SSMGate featureName="Strategic Platform">
              <div className="page-fade">
                <PlatformSettings />
              </div>
            </SSMGate>
          </PrivateRoute>
        }
      />

      {/* Strategic Alignment Platform - White-labeled live demo tool (SSM gated) */}
      <Route
        path="/p/:slug"
        element={
          <PrivateRoute>
            <SSMGate featureName="Strategic Platform">
              <div className="page-fade">
                <PlatformApp />
              </div>
            </SSMGate>
          </PrivateRoute>
        }
      />

      <Route
        path="/msg-sim"
        element={
          <PrivateRoute>
            <SSMGate featureName="Msg Simulator">
              <div className="page-fade">
                <ReplyBrainV1 />
              </div>
            </SSMGate>
          </PrivateRoute>
        }
      />

      <Route
        path="/reply-tracker"
        element={
          <PrivateRoute>
            <SSMGate featureName="Inbound">
              <div className="page-fade">
                <ReplyTracker />
              </div>
            </SSMGate>
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
        path="/operator/ssm-access"
        element={
          <PrivateRoute>
            <OperatorRoute>
              <div className="page-fade">
                <SSMAccessDashboard />
              </div>
            </OperatorRoute>
          </PrivateRoute>
        }
      />

      <Route
        path="/operator/corpus"
        element={
          <PrivateRoute>
            <OperatorRoute>
              <div className="page-fade">
                <CorpusAdmin />
              </div>
            </OperatorRoute>
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

      {/* Connector Agent — Feature-flagged, SSM-gated when enabled */}
      <Route
        path="/connector-agent"
        element={
          FEATURES.CONNECTOR_AGENT_ENABLED ? (
            <div className="page-fade">
              <ConnectorAgent />
            </div>
          ) : (
            <ComingSoon
              title="Connector Agent"
              description="Locate & confirm contacts. Coming soon."
            />
          )
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
          <PasswordSetupGate>
            <OnboardingOverlay />
            <AppRoutes />
            <ConnectorAssistant />
          </PasswordSetupGate>
        </Router>
      </OnboardingProvider>
    </AuthProvider>
  );
}

export default App;
