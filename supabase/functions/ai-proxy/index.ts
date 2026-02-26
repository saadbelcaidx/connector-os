import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  provider: 'openai' | 'azure' | 'anthropic';
  // OpenAI
  openaiApiKey?: string;
  // Azure
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeployment?: string;
  // Anthropic
  anthropicApiKey?: string;
  // Common
  model?: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { provider, messages, max_tokens = 200, temperature = 0.7 } = body;

    // Debug: log incoming request
    console.log('[ai-proxy] Received request:', JSON.stringify({
      provider,
      hasMessages: !!messages,
      messageCount: messages?.length,
      hasOpenaiKey: !!body.openaiApiKey,
      hasAzureKey: !!body.azureApiKey,
      hasAnthropicKey: !!body.anthropicApiKey,
      model: body.model,
    }));

    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'provider is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let content = '';

    // =========================================================================
    // OPENAI
    // =========================================================================
    if (provider === 'openai') {
      const { openaiApiKey, model = 'gpt-4o-mini' } = body;

      if (!openaiApiKey) {
        return new Response(
          JSON.stringify({ error: 'openaiApiKey is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[ai-proxy] Calling OpenAI with model:', model);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens,
          temperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ai-proxy] OpenAI error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `OpenAI error: ${response.status}`, details: errorText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      content = data.choices?.[0]?.message?.content || '';
    }

    // =========================================================================
    // AZURE OPENAI
    // =========================================================================
    else if (provider === 'azure') {
      const { azureEndpoint, azureApiKey, azureDeployment } = body;

      if (!azureEndpoint || !azureApiKey || !azureDeployment) {
        return new Response(
          JSON.stringify({ error: 'azureEndpoint, azureApiKey, and azureDeployment are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build Azure endpoint URL
      const url = `${azureEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=2024-02-15-preview`;

      console.log('[ai-proxy] Calling Azure OpenAI:', azureDeployment);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': azureApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          max_tokens,
          temperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ai-proxy] Azure error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `Azure error: ${response.status}`, details: errorText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      content = data.choices?.[0]?.message?.content || '';
    }

    // =========================================================================
    // ANTHROPIC
    // =========================================================================
    else if (provider === 'anthropic') {
      const { anthropicApiKey, model = 'claude-haiku-4-5-20251001' } = body;

      if (!anthropicApiKey) {
        return new Response(
          JSON.stringify({ error: 'anthropicApiKey is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[ai-proxy] Calling Anthropic with model:', model);

      // Anthropic requires system messages via separate 'system' parameter
      // Only user/assistant messages go in the messages array
      const systemMessage = messages.find(m => m.role === 'system');
      const anthropicMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));

      const requestBody: Record<string, unknown> = {
        model,
        messages: anthropicMessages,
        max_tokens,
      };

      // Add system prompt if present
      if (systemMessage) {
        requestBody.system = systemMessage.content;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ai-proxy] Anthropic error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `Anthropic error: ${response.status}`, details: errorText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      content = data.content?.[0]?.text || '';
    }

    // =========================================================================
    // UNKNOWN PROVIDER
    // =========================================================================
    else {
      return new Response(
        JSON.stringify({ error: `Unknown provider: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ai-proxy] Success, content length:', content.length);

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ai-proxy] Exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
