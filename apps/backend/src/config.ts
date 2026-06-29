export type UpstreamProvider = 'mock' | 'openrouter' | 'azure-foundry';

export interface BackendConfig {
  port: number;
  provider: UpstreamProvider;
  /** Models the server is willing to proxy. Constraint 2: allowlist check only. */
  allowedModels: string[];
  upstreamBaseUrl: string;
  /** Upstream key — NEVER transmitted to the device. */
  upstreamApiKey: string;
  /** OpenRouter uses Bearer; Azure Foundry uses the 'api-key' header. */
  upstreamAuthStyle: 'authorization-bearer' | 'api-key';
  azureApiVersion: string;
  tavilyApiKey: string;
  jinaApiKey: string;
  e2bApiKey: string;
  heartbeatMs: number;
}

const DEFAULT_ALLOWED = [
  'mock-cloud',
  'google/gemini-2.5-flash', // ArbiterRouter cloud-efficient tier
  'anthropic/claude-sonnet-4', // ArbiterRouter cloud-capable tier
  'google/gemini-2.5-pro',
  'openai/o3',
  'perplexity/sonar',
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const provider = (env.SAGE_UPSTREAM_PROVIDER ?? 'mock') as UpstreamProvider;
  const allowed = (env.SAGE_ALLOWED_MODELS ?? DEFAULT_ALLOWED.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port: Number(env.PORT ?? 8787),
    provider,
    allowedModels: allowed,
    upstreamBaseUrl: env.SAGE_UPSTREAM_BASE_URL ?? '',
    upstreamApiKey: env.SAGE_UPSTREAM_API_KEY ?? '',
    upstreamAuthStyle:
      provider === 'azure-foundry' ? 'api-key' : 'authorization-bearer',
    azureApiVersion: env.SAGE_AZURE_API_VERSION ?? '2024-10-21',
    tavilyApiKey: env.TAVILY_API_KEY ?? '',
    jinaApiKey: env.JINA_API_KEY ?? '',
    e2bApiKey: env.E2B_API_KEY ?? '',
    heartbeatMs: Number(env.SAGE_HEARTBEAT_MS ?? 15000),
  };
}
