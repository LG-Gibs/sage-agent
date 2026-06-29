export interface ResearchSource {
  title?: string;
  url: string;
  content: string;
}

export interface ResearchBrief {
  topic: string;
  summary: string;
  keyPoints: string[];
  sources: Array<{ title: string; url: string }>;
}

function firstSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const m = trimmed.match(/^.{20,240}?[.!?](\s|$)/);
  return (m ? m[0] : trimmed.slice(0, 200)).trim();
}

/**
 * Synthesize a deep-research brief from fetched sources. Pure + deterministic so
 * it's unit-testable without network; the route below feeds it Tavily results
 * enriched with Jina Reader content.
 */
export function synthesizeResearch(topic: string, sources: ResearchSource[]): ResearchBrief {
  const keyPoints = sources
    .map((s) => firstSentence(s.content))
    .filter((s) => s.length > 0)
    .slice(0, 6);
  return {
    topic,
    summary: `Synthesis for "${topic}" drawn from ${sources.length} source(s).`,
    keyPoints,
    sources: sources.map((s) => ({ title: s.title ?? s.url, url: s.url })),
  };
}

interface TavilyResult {
  title?: string;
  url: string;
  content?: string;
}

/**
 * Online deep-research orchestration: Tavily search → Jina Reader fetch of the
 * top results → synthesis. Requires TAVILY_API_KEY (Jina key optional). Returns
 * null when unkeyed so the caller can fall back to a stub.
 */
export async function runDeepResearch(
  topic: string,
  depth: 'shallow' | 'standard' | 'deep',
  keys: { tavilyApiKey: string; jinaApiKey: string },
): Promise<ResearchBrief | null> {
  if (!keys.tavilyApiKey) return null;
  const maxResults = depth === 'deep' ? 6 : depth === 'standard' ? 4 : 2;

  const searchRes = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: keys.tavilyApiKey, query: topic, max_results: maxResults }),
  });
  const searchJson = (await searchRes.json().catch(() => ({}))) as { results?: TavilyResult[] };
  const results = searchJson.results ?? [];

  const sources: ResearchSource[] = await Promise.all(
    results.map(async (r) => {
      try {
        const headers: Record<string, string> = {};
        if (keys.jinaApiKey) headers.Authorization = `Bearer ${keys.jinaApiKey}`;
        const page = await fetch(`https://r.jina.ai/${r.url}`, { headers });
        const content = (await page.text()).slice(0, 8000);
        return { title: r.title, url: r.url, content };
      } catch {
        return { title: r.title, url: r.url, content: r.content ?? '' };
      }
    }),
  );

  return synthesizeResearch(topic, sources);
}
