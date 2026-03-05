/**
 * MCP DIAGNOSIS — Phase 24
 *
 * Pure, deterministic mapping from MCP error codes to actionable next steps.
 * No network. No state. No side effects.
 */

export interface McpDiagnosis {
  code: string | null;
  message: string | null;
  actionTab: 'ai' | 'outreach' | null;
  focusId: string | null;
}

const NULL_DIAGNOSIS: McpDiagnosis = { code: null, message: null, actionTab: null, focusId: null };

export function diagnoseMcpError(error: string | undefined): McpDiagnosis {
  if (!error) return NULL_DIAGNOSIS;

  const code = error.split(':')[0]?.trim() || '';

  switch (code) {
    case 'AI_SETUP_INCOMPLETE':
      return { code, message: 'ai not configured', actionTab: 'ai', focusId: 'ai_provider' };
    case 'AZURE_DEPLOYMENT_NOT_FOUND':
      return { code, message: 'azure deployment not found', actionTab: 'ai', focusId: 'azure_chat_deployment' };
    case 'AZURE_MODEL_NOT_SUPPORTED':
      return { code, message: 'azure model not supported', actionTab: 'ai', focusId: 'azure_chat_deployment' };
    case 'AZURE_UNAUTHORIZED':
      return { code, message: 'azure key invalid', actionTab: 'ai', focusId: 'azure_api_key' };
    case 'OPENAI_MODEL_NOT_FOUND':
      return { code, message: 'openai model not found', actionTab: 'ai', focusId: 'openai_api_key' };
    case 'OPENAI_UNAUTHORIZED':
      return { code, message: 'openai key invalid', actionTab: 'ai', focusId: 'openai_api_key' };
    case 'ANTHROPIC_UNAUTHORIZED':
      return { code, message: 'anthropic key invalid', actionTab: 'ai', focusId: 'anthropic_api_key' };
    case 'RATE_LIMITED':
      return { code, message: 'rate limited — try again later', actionTab: null, focusId: null };
    case 'UPSTREAM_ERROR':
      return { code, message: 'ai provider error', actionTab: 'ai', focusId: null };
    default:
      return NULL_DIAGNOSIS;
  }
}

/** Derive the most frequent diagnosis from a list of error strings */
export function topDiagnosis(errors: string[]): McpDiagnosis {
  if (errors.length === 0) return NULL_DIAGNOSIS;

  const counts = new Map<string, number>();
  for (const err of errors) {
    const code = err.split(':')[0]?.trim() || 'UNKNOWN';
    counts.set(code, (counts.get(code) || 0) + 1);
  }

  let topCode = '';
  let topCount = 0;
  for (const [code, count] of counts) {
    if (count > topCount) {
      topCode = code;
      topCount = count;
    }
  }

  const topError = errors.find(e => e.startsWith(topCode));
  return diagnoseMcpError(topError);
}
