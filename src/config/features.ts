// Feature flags - single source of truth for environment-gated features
// Toggle features via environment variables without code changes

export const FEATURES = {
  // Force-enable in dev, respect env var in prod
  CONNECTOR_AGENT_ENABLED:
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_CONNECTOR_AGENT === 'true',

  // PHILEMON — Ground Truth UI System
  // Default: ON in dev (for testing), OFF in prod (until Phase 3 complete)
  // Enables: state machine, truth counters, copy contract, dataset awareness
  PHILEMON_MODE:
    import.meta.env.VITE_PHILEMON_MODE === 'true' ||
    (import.meta.env.DEV && import.meta.env.VITE_PHILEMON_MODE !== 'false'),
};
