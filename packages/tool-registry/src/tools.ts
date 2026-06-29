import type { ToolDomain, ToolName } from '@sage/shared-types';

/** Minimal JSON-Schema subset used to describe tool parameters to the model. */
export interface JsonSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      description?: string;
      enum?: readonly string[];
      items?: { type: string };
    }
  >;
  required?: readonly string[];
}

export interface ToolDefinition {
  name: ToolName;
  domain: ToolDomain;
  description: string;
  parameters: JsonSchema;
  /**
   * Offline behavior is part of the contract, not an afterthought.
   *  - 'native'       : executes fully on-device, no network required.
   *  - 'offline_error': returns the OFFLINE ToolResult when the radio is down.
   */
  offline: 'native' | 'offline_error';
}

/**
 * The 10 registered tools. Six mobile, four cloud.
 * Adding a tool here without a domain is a type error; the integrity check
 * (registry.assertIntegrity) additionally enforces the 6/4 split at runtime.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  // ── Mobile domain (execute on-device; server never receives args/results) ──
  {
    name: 'execute_js',
    domain: 'mobile',
    offline: 'native',
    description:
      'Execute JavaScript/TypeScript in an isolated QuickJS context for data manipulation and computation. No network access.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JS source to evaluate.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'render_prototype',
    domain: 'mobile',
    offline: 'native',
    description:
      'Render a standalone HTML/JS/CSS prototype in a sandboxed on-device WebView and return a handle.',
    parameters: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Full HTML document to render.' },
        title: { type: 'string', description: 'Optional display title.' },
      },
      required: ['html'],
    },
  },
  {
    name: 'read_native_contacts',
    domain: 'mobile',
    offline: 'native',
    description: 'Read and search the device address book (with permission).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or number to match.' },
        limit: { type: 'number', description: 'Max results (default 20).' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    domain: 'mobile',
    offline: 'native',
    description: 'Create a calendar event via EventKit (iOS) / CalendarContract (Android).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startISO: { type: 'string', description: 'ISO-8601 start datetime.' },
        endISO: { type: 'string', description: 'ISO-8601 end datetime.' },
        location: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['title', 'startISO', 'endISO'],
    },
  },
  {
    name: 'set_reminder',
    domain: 'mobile',
    offline: 'native',
    description: 'Create a reminder via EventKit (iOS) / AlarmManager (Android).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueISO: { type: 'string', description: 'ISO-8601 due datetime.' },
        notes: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'search_local_memory',
    domain: 'mobile',
    offline: 'native',
    description:
      'Semantic top-k search over the local sqlite-vec memory store. Returns opaque memory fragments.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', description: 'Number of fragments (default 5).' },
      },
      required: ['query'],
    },
  },

  // ── Cloud domain (routed to POST /api/sage/tools/*; requires connectivity) ──
  {
    name: 'web_search',
    domain: 'cloud',
    offline: 'offline_error',
    description: 'Structured web search via Tavily. Returns ranked results with snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number', description: 'Default 5.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_webpage',
    domain: 'cloud',
    offline: 'offline_error',
    description: 'Fetch and clean a webpage to readable markdown via Jina Reader.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'execute_python',
    domain: 'cloud',
    offline: 'offline_error',
    description:
      'Execute Python in an E2B Firecracker microVM for heavy compute. Sandboxed and ephemeral.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        timeoutMs: { type: 'number', description: 'Default 30000.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'deep_research',
    domain: 'cloud',
    offline: 'offline_error',
    description:
      'Autonomous multi-step research (Tavily + Jina) orchestrated server-side per request, returning a synthesized brief.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        depth: { type: 'string', enum: ['shallow', 'standard', 'deep'] },
      },
      required: ['topic'],
    },
  },
];
