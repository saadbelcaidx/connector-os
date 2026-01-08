// Feature flags - single source of truth for environment-gated features
// Toggle features via environment variables without code changes

export const FEATURES = {
  CONNECTOR_AGENT_ENABLED:
    import.meta.env.VITE_ENABLE_CONNECTOR_AGENT === 'true',
};
