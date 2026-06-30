# SAGE-AGENT — System Architecture (Phase 1)

> The device is the agent. The backend extends its reach.

This document is the Phase 1 architecture deliverable. It shows every component,
the trust boundary between device and server, and the control flow for both
local and cloud inference cycles. The constitutional constraints are annotated
inline as **[C1]–[C6]**.

## Constitutional constraints (binding)

| # | Constraint |
|---|------------|
| C1 | The device owns the ReAct loop. The server runs exactly one inference cycle per request. |
| C2 | The SageRouter is fully on-device. The server applies an allowlist check only — never a routing override. |
| C3 | `POST /api/sage/infer` is a stateless proxy: validate, forward, stream, return. No loop, no cross-call state. |
| C4 | The two-domain tool registry is authoritative. Mobile tools never run on the server; cloud tools fail when offline. |
| C5 | Memory is on-device and never synced. The backend treats `memories[]` as opaque prompt text. |
| C6 | No new features on deprecated paths (`/api/sage/agent`, `calculateRoute()`, the VM sandbox, native mocks). |

## 1. System component diagram

```mermaid
flowchart TB
  subgraph DEVICE["📱 DEVICE — the agent (owns all orchestration)"]
    direction TB
    UI["UI / Voice surface<br/>(capability-aware gating)"]
    subgraph VOICE["Voice pipeline (offline)"]
      WAKE["Porcupine wake word"]
      STT["Whisper.cpp STT"]
      TTS["Piper TTS"]
    end
    subgraph ARB["SageCore (C1, C2)"]
      RL["ReActLoop<br/>(owns reasoning + tool loop)"]
      AR["SageRouter<br/>(5 signals → model + target)"]
      TDR["ToolDomainRouter<br/>(two-domain dispatch)"]
    end
    CAP["Capability Manifest<br/>(RAM · OS · GPU · NPU · models)"]
    SIG["Signal readers ×5<br/>(network·power·complexity·privacy·preference)"]
    subgraph MOBTOOLS["Mobile Tool Registry (C4)"]
      QJS["QuickJS (execute_js)"]
      WV["WebView (render_prototype)"]
      OS["OS: contacts·calendar·reminder"]
      MEM["search_local_memory"]
    end
    subgraph LOCAL["On-device inference"]
      LLAMA["llama.cpp GGUF<br/>Gemma 4 2B / 9B"]
    end
    subgraph STORE["Local stores (encrypted)"]
      VEC["sqlite-vec<br/>(vectors)"]
      WDB["WatermelonDB<br/>(relational)"]
      MMKV["MMKV (KV, encrypted)"]
    end
    SKILL["Skill Acquisition<br/>(JSON + QuickJS)"]
  end

  BOUND{{"🔒 Trust boundary<br/>upstream API keys never cross to device"}}

  subgraph SERVER["☁️ SAGE Backend v3 — stateless proxy (C3)"]
    INFER["POST /api/sage/infer<br/>validate · allowlist (C2) · inject memories verbatim (C5) · stream SSE"]
    TOOLS["POST /api/sage/tools/*<br/>web_search·fetch·execute·research"]
    UP["Upstream adapter<br/>OpenRouter / Azure Foundry"]
  end

  subgraph CLOUD["Frontier providers"]
    OR["OpenRouter / Azure AI Foundry"]
    TAV["Tavily"]
    JINA["Jina Reader"]
    E2B["E2B Firecracker"]
  end

  UI --> WAKE --> STT --> RL
  RL --> TTS --> UI
  RL -->|every cycle| AR
  AR -->|reads| SIG
  AR -->|reads| CAP
  SIG -.-> CAP
  AR -->|target=local| LLAMA
  AR -->|target=cloud| INFER
  RL -->|tool_call| TDR
  TDR -->|mobile| MOBTOOLS
  TDR -->|cloud| TOOLS
  MEM --> VEC
  RL --> MEM
  RL -. memories[] .-> INFER
  SKILL --> QJS
  TDR --> SKILL

  INFER --- BOUND
  TOOLS --- BOUND
  BOUND --- UP
  UP --> OR
  TOOLS --> TAV
  TOOLS --> JINA
  TOOLS --> E2B

  classDef device fill:#0A2A1C,stroke:#2FBF77,color:#EAECEF;
  classDef server fill:#10203A,stroke:#5B8DEF,color:#EAECEF;
  classDef cloud fill:#2A1E10,stroke:#FFB612,color:#EAECEF;
  class DEVICE,VOICE,ARB,MOBTOOLS,LOCAL,STORE device;
  class SERVER server;
  class CLOUD cloud;
```

## 2. Cold-start capability boot (Phase 0)

The app may only enter `ready` state once the Capability Manifest is assembled
**and** all five signals are readable.

```mermaid
sequenceDiagram
  participant App
  participant Signals as Signal readers ×5
  participant Probe as Native probe (Swift/Kotlin)
  participant Manifest as CapabilityManifest

  App->>Signals: readSignalsSafe({ taskText })
  Note over Signals: network·power·complexity·privacy·preference<br/>(no network access — C2)
  Signals-->>App: { signals, degraded, failed[] }
  App->>Probe: getPlatform / RAM / GPU / NPU / models
  Probe-->>App: raw capability values
  App->>Manifest: buildCapabilityManifest(probe, { signalsReady })
  Note over Manifest: supports9B = RAM ≥ 8GB<br/>ready = signalsReady && hasVerifiedModel
  Manifest-->>App: CapabilityManifest { ready }
  alt ready
    App->>App: enter ready state (full feature gating)
  else limited
    App->>App: degraded mode (download/verify model, retry signals)
  end
```

## 3. ReActLoop — cloud-target cycle (SSE contract)

```mermaid
sequenceDiagram
  participant RL as ReActLoop (device)
  participant AR as SageRouter
  participant API as POST /api/sage/infer
  participant UP as Upstream (OpenRouter/Foundry)

  RL->>AR: route({ signals, capability })
  AR-->>RL: { model, target:"cloud", rationale }
  RL->>API: messages + memories[] (opaque, C5) + model
  API->>API: validate · allowlist check only (C2)
  API-->>RL: event: heartbeat (flush)
  API->>UP: one inference cycle (C3)
  loop streaming
    UP-->>API: delta / tool_call delta
    API-->>RL: event: chunk
    API-->>RL: event: tool_call { domain }
  end
  API-->>RL: event: done { usage }
  Note over RL: server never loops or stores state (C1, C3)
  alt tool_call received
    RL->>RL: ToolDomainRouter dispatch → append tool_result → next cycle
  else text
    RL->>RL: yield to UI / TTS
  end
```

## 4. ReActLoop — local-target cycle (offline)

```mermaid
sequenceDiagram
  participant RL as ReActLoop (device)
  participant AR as SageRouter
  participant LL as llama.cpp (GGUF)
  participant TDR as ToolDomainRouter

  RL->>AR: route({ signals, capability })
  Note over AR: offline / critical battery / sensitive / prefer_local<br/>→ hard local override
  AR-->>RL: { model:"gemma-4-2b", target:"local" }
  RL->>LL: generate(messages)
  loop tokens
    LL-->>RL: token stream
  end
  alt tool_call
    RL->>TDR: dispatch(tool_call)
    alt mobile tool
      TDR-->>RL: tool_result (on-device)
    else cloud tool while offline
      TDR-->>RL: { error:"OFFLINE", code:"OFFLINE" }
      Note over RL: model adapts; never blocks
    end
  end
```

## 5. ToolDomainRouter dispatch

```mermaid
flowchart TD
  TC["tool_call { name, domain }"] --> Q{domain?}
  Q -->|mobile| M["Execute on-device<br/>QuickJS / WebView / OS / sqlite-vec"]
  Q -->|cloud| N{online?}
  N -->|yes| C["POST /api/sage/tools/*"]
  N -->|no| O["return OFFLINE ToolResult<br/>(code: OFFLINE)"]
  M --> R["append ToolResult → ReActLoop"]
  C --> R
  O --> R
```

## 6. Graceful degradation hierarchy

```mermaid
flowchart LR
  A["Cloud (capable)"] -->|fails| B["Cloud (efficient)"]
  B -->|fails| C["Local (default GGUF)"]
  C -->|not installed| D["Local (efficient GGUF)"]
  D -->|none available| E["Surface error:<br/>cannot process request"]
```

## 7. Two-domain tool registry (C4)

| Tool | Domain | Offline behavior | Runtime |
|------|--------|------------------|---------|
| `execute_js` | mobile | native | QuickJS isolated context |
| `render_prototype` | mobile | native | sandboxed WebView |
| `read_native_contacts` | mobile | native | Contacts (EventKit / ContactsContract) |
| `create_calendar_event` | mobile | native | EventKit / CalendarContract |
| `set_reminder` | mobile | native | EventKit / AlarmManager |
| `query_calendar` | mobile | native | EventKit / CalendarContract (P6) |
| `list_reminders` | mobile | native | EventKit / local store (P6) |
| `file_system` | mobile | native | Files.app / SAF, sandboxed (P6) |
| `search_local_memory` | mobile | native | sqlite-vec top-k |
| `web_search` | cloud | OFFLINE error | Tavily |
| `fetch_webpage` | cloud | OFFLINE error | Jina Reader |
| `execute_python` | cloud | OFFLINE error | E2B Firecracker |
| `deep_research` | cloud | OFFLINE error | Tavily + Jina (server-orchestrated) |

13 tools after Phase 6 (9 mobile / 4 cloud); integrity enforces domain + offline
consistency, not a frozen count.

## 8. Repository ↔ architecture map

| Component | Where it lives | Phase |
|-----------|----------------|-------|
| Domain vocabulary | `packages/shared-types` | 0–1 ✅ |
| SSE contract (parser + serializer) | `packages/sse-contract` | 0–1 ✅ |
| Two-domain registry | `packages/tool-registry` | 0–1 ✅ (dispatcher: P3) |
| Signal readers + Capability Manifest | `packages/core` | 0 ✅ |
| SageRouter / ReActLoop / ToolDomainRouter | `packages/core` (`router.ts`, `agent/*`) | 3 ✅ |
| Cloud/local inference targets + 50-case routing benchmark | `packages/core/src/agent`, `src/benchmark` | 3 ✅ |
| SAGE Backend v3 proxy | `apps/backend` | 0–1 ✅ |
| Native capability + thermal probe | `apps/mobile/modules/sage-capability` | 0 ✅ |
| Native signal providers + boot screen | `apps/mobile/src`, `App.tsx` | 0 ✅ |
| Voice pipeline (Porcupine/Whisper/Piper) | `apps/mobile` | P2 |
| QuickJS / E2B sandbox | `packages/sandbox-core`, `apps/mobile`, `apps/backend` | 4 ✅ |
| sqlite-vec RAG + memory lifecycle + injection | `packages/memory-core`, `apps/mobile/src/memory` | 5 ✅ |
| Online research (Tavily + Jina synthesis) | `apps/backend/src/research.ts` | 5 ✅ |
| Deep OS integrations (Contacts/Calendar/Reminders/Files) | `apps/mobile/modules/sage-os`, `apps/mobile/src/os` | 6 ✅ |
