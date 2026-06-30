/**
 * SAGE-AGENT interactive preview — wired to the REAL @sage packages.
 * Bundled by build.mjs and inlined into a single static page. Every panel calls
 * the actual shipped logic; only the voice I/O engines are demo stubs (no mic in
 * a sandboxed page) and QuickJS uses an embedded-wasm module.
 */
import type { ArbiterSignals, CapabilityManifest } from '@sage/shared-types';
import type { Responder, SttEngine, TtsEngine, VoiceState } from '@sage/voice-core';
import {
  createArbiterRouter,
  runRoutingBenchmark,
  deriveFeatureFlags,
  classifyComplexity,
  extractFeatures,
} from '@sage/arbiter-core';
import { VoicePipeline } from '@sage/voice-core';
import {
  MemoryManager,
  InMemoryVectorStore,
  createHashingEmbedder,
  toMemoryFragments,
} from '@sage/memory-core';
import { createQuickJsWasmSandbox } from '@sage/sandbox-core';
import variant from '@jitl/quickjs-singlefile-browser-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';

const app = document.getElementById('app') as HTMLElement;
const tabsEl = document.getElementById('tabs') as HTMLElement;
const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
const router = createArbiterRouter();

function capableManifest(over: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    platform: 'ios',
    osVersion: '18.2',
    totalRamBytes: 8 * 1024 ** 3,
    supports9B: true,
    gpu: 'metal',
    mlAccelerator: 'coreml',
    npuPresent: true,
    installedModels: [
      { id: 'gemma-4-2b', path: '/2b.gguf', sizeBytes: 1, verified: true },
      { id: 'gemma-4-9b', path: '/9b.gguf', sizeBytes: 1, verified: true },
    ],
    signalsReady: true,
    ready: true,
    ...over,
  };
}

// ─────────────────────────── Capability / Home ───────────────────────────
function panelCapability(): string {
  return `
  <div class="eyebrow">Home · capability gating</div>
  <div class="h">What can run?</div>
  <p class="sub">Toggle device facts — the gates update live via the real <b>deriveFeatureFlags()</b>.</p>
  <div class="card">
    <div class="row"><span class="k">RAM</span>
      <select id="ram" class="v" style="width:auto"><option value="6">6 GB</option><option value="8" selected>8 GB</option><option value="12">12 GB</option></select></div>
    <div class="row"><span class="k">Microphone permission</span><label class="badge on" id="micL"><input id="mic" type="checkbox" checked hidden> granted</label></div>
    <div class="row"><span class="k">Gemma 4 9B installed</span><label class="badge on" id="m9bL"><input id="m9b" type="checkbox" checked hidden> yes</label></div>
    <div class="row"><span class="k">Capability manifest ready</span><label class="badge on" id="rdyL"><input id="rdy" type="checkbox" checked hidden> ready</label></div>
  </div>
  <div id="tiles"></div>`;
}
function wireCapability(root: HTMLElement) {
  const tiles = root.querySelector('#tiles') as HTMLElement;
  const toggles: Array<[string, string, string, string]> = [
    ['mic', 'micL', 'granted', 'denied'],
    ['m9b', 'm9bL', 'yes', 'no'],
    ['rdy', 'rdyL', 'ready', 'not ready'],
  ];
  function recompute() {
    const ram = Number((root.querySelector('#ram') as HTMLSelectElement).value);
    const mic = (root.querySelector('#mic') as HTMLInputElement).checked;
    const has9b = (root.querySelector('#m9b') as HTMLInputElement).checked;
    const ready = (root.querySelector('#rdy') as HTMLInputElement).checked;
    const models = [{ id: 'gemma-4-2b', path: '/2b', sizeBytes: 1, verified: true }];
    if (has9b) models.push({ id: 'gemma-4-9b', path: '/9b', sizeBytes: 1, verified: true });
    const manifest = capableManifest({
      totalRamBytes: ram * 1024 ** 3,
      supports9B: ram >= 8,
      installedModels: models,
      ready,
      signalsReady: ready,
    });
    const flags = deriveFeatureFlags(manifest, { microphone: mic });
    const feat: Array<[string, boolean, string]> = [
      ['Voice loop', flags.voice, flags.reasons.voice ?? 'wake word + STT + TTS, on-device'],
      ['Wake word ("Hey Sage")', flags.wakeWord, flags.reasons.wakeWord ?? 'Porcupine armed'],
      ['Gemma 4 9B', flags.model9B, flags.reasons.model9B ?? 'high-capability local model'],
      ['Local inference', flags.localInference, flags.reasons.localInference ?? 'llama.cpp ready'],
    ];
    tiles.innerHTML = feat
      .map(
        ([nm, on, rs]) => `<div class="tile"><span class="dot" style="background:${on ? 'var(--green)' : 'var(--faint)'}"></span>
        <div class="tn"><div class="nm">${esc(nm)}</div><div class="rs">${esc(rs)}</div></div>
        <span class="badge ${on ? 'on' : 'off'}">${on ? 'enabled' : 'disabled'}</span></div>`,
      )
      .join('');
  }
  toggles.forEach(([id, lid, onT, offT]) => {
    const cb = root.querySelector('#' + id) as HTMLInputElement;
    const lab = root.querySelector('#' + lid) as HTMLElement;
    lab.addEventListener('click', (e) => {
      e.preventDefault();
      cb.checked = !cb.checked;
      lab.className = 'badge ' + (cb.checked ? 'on' : 'off');
      lab.lastChild!.textContent = ' ' + (cb.checked ? onT : offT);
      recompute();
    });
  });
  (root.querySelector('#ram') as HTMLSelectElement).addEventListener('change', recompute);
  recompute();
}

// ─────────────────────────── Arbiter Router ───────────────────────────
const SIGNAL_OPTS: Record<keyof ArbiterSignals, string[]> = {
  network: ['offline', 'poor', 'fair', 'good'],
  power: ['critical', 'low', 'normal', 'charging'],
  complexity: ['simple', 'moderate', 'complex'],
  privacy: ['standard', 'private', 'sensitive'],
  preference: ['auto', 'prefer_local', 'prefer_cloud'],
};
function panelRouter(): string {
  const sel = (k: keyof ArbiterSignals, def: string) =>
    `<div class="field"><label>${k}</label><select id="sig-${k}">${SIGNAL_OPTS[k]
      .map((o) => `<option ${o === def ? 'selected' : ''}>${o}</option>`)
      .join('')}</select></div>`;
  return `
  <div class="eyebrow">Arbiter Core · 5-signal router</div>
  <div class="h">Where does it run?</div>
  <p class="sub">The real <b>ArbiterRouter.route()</b> decides local vs cloud — on-device, no network.</p>
  <div class="grid2">${sel('network', 'good')}${sel('power', 'normal')}${sel('complexity', 'moderate')}${sel('privacy', 'standard')}</div>
  ${sel('preference', 'auto')}
  <div class="card" id="decision"></div>
  <button class="btn sec" id="bench" style="width:100%">▶ Run the 50-case routing benchmark</button>
  <div id="benchOut" class="small" style="margin-top:8px"></div>`;
}
function wireRouter(root: HTMLElement) {
  const cap = capableManifest();
  const read = (): ArbiterSignals => ({
    network: (root.querySelector('#sig-network') as HTMLSelectElement).value as ArbiterSignals['network'],
    power: (root.querySelector('#sig-power') as HTMLSelectElement).value as ArbiterSignals['power'],
    complexity: (root.querySelector('#sig-complexity') as HTMLSelectElement).value as ArbiterSignals['complexity'],
    privacy: (root.querySelector('#sig-privacy') as HTMLSelectElement).value as ArbiterSignals['privacy'],
    preference: (root.querySelector('#sig-preference') as HTMLSelectElement).value as ArbiterSignals['preference'],
  });
  const out = root.querySelector('#decision') as HTMLElement;
  function decide() {
    const d = router.route({ signals: read(), capability: cap });
    out.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
      <span class="badge ${d.target}">${d.target}</span>
      <span class="v" style="font-size:14px">${esc(d.model)}</span></div>
      <div class="rationale">${esc(d.rationale)}</div>`;
  }
  Object.keys(SIGNAL_OPTS).forEach((k) =>
    (root.querySelector('#sig-' + k) as HTMLSelectElement).addEventListener('change', decide),
  );
  const benchBtn = root.querySelector('#bench') as HTMLButtonElement;
  benchBtn.addEventListener('click', async () => {
    benchBtn.disabled = true;
    benchBtn.textContent = 'Running…';
    const r = await runRoutingBenchmark(router);
    root.querySelector('#benchOut')!.innerHTML =
      `<span class="ok">${r.agreements}/${r.total} agreement (${(r.rate * 100).toFixed(0)}%)</span> · disagreements: ${r.disagreements.length} <span class="small">(gate ≥85%)</span>`;
    benchBtn.disabled = false;
    benchBtn.textContent = '▶ Re-run the 50-case routing benchmark';
  });
  decide();
}

// ─────────────────────────── Classifier ───────────────────────────
function panelClassifier(): string {
  return `
  <div class="eyebrow">Arbiter Core · Signal 3</div>
  <div class="h">Task complexity</div>
  <p class="sub">Type a request — the real on-device <b>classifyComplexity()</b> buckets it live.</p>
  <div class="field"><label>user request</label><textarea id="ctext">Research the top 5 competitors, compare their pricing, and then synthesize a one-page brief citing sources.</textarea></div>
  <div class="card" id="cout"></div>`;
}
function wireClassifier(root: HTMLElement) {
  const ta = root.querySelector('#ctext') as HTMLTextAreaElement;
  const out = root.querySelector('#cout') as HTMLElement;
  function run() {
    const label = classifyComplexity(ta.value);
    const f = extractFeatures(ta.value);
    const color = label === 'complex' ? 'var(--red)' : label === 'moderate' ? 'var(--amber)' : 'var(--green)';
    out.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span class="badge" style="background:${color};color:#04140C">${label}</span></div>
      <div class="row"><span class="k">words</span><span class="v">${f.wordCount}</span></div>
      <div class="row"><span class="k">has code</span><span class="v">${f.hasCode}</span></div>
      <div class="row"><span class="k">multi-step</span><span class="v">${f.multiStep}</span></div>
      <div class="row"><span class="k">research verbs</span><span class="v">${f.researchVerbCount}</span></div>
      <div class="row"><span class="k">deep question</span><span class="v">${f.deepQuestion}</span></div>`;
  }
  ta.addEventListener('input', run);
  run();
}

// ─────────────────────────── Voice loop ───────────────────────────
const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
function panelVoice(): string {
  return `
  <div class="eyebrow">Phase 2 · voice loop</div>
  <div class="h">Hey Sage</div>
  <p class="sub">The real <b>VoicePipeline</b> state machine, driven by demo engines (no mic here).</p>
  <div style="text-align:center;margin:18px 0"><span class="state-pill" id="vstate"><span class="dot" style="background:var(--green)"></span><span id="vstateT">idle</span></span></div>
  <div class="card"><div class="small">You said</div><div id="vtrans" class="rationale">—</div></div>
  <div class="card"><div class="small">Sage</div><div id="vresp" class="rationale">—</div></div>
  <div id="vlat" class="mono" style="display:none"></div>
  <button class="btn" id="vbtn" style="width:100%;margin-top:12px">🎙 Push to talk</button>`;
}
function wireVoice(root: HTMLElement) {
  const stateT = root.querySelector('#vstateT') as HTMLElement;
  const trans = root.querySelector('#vtrans') as HTMLElement;
  const resp = root.querySelector('#vresp') as HTMLElement;
  const lat = root.querySelector('#vlat') as HTMLElement;
  const btn = root.querySelector('#vbtn') as HTMLButtonElement;

  const stt: SttEngine = {
    available: true,
    async transcribe({ onPartial, signal }) {
      await delay(550);
      if (signal.aborted) throw aborted();
      onPartial?.('what is on my…');
      const captureEndedAt = Date.now();
      await delay(90); // Whisper compute
      if (signal.aborted) throw aborted();
      return { text: 'what is on my calendar today', captureEndedAt };
    },
    async stop() {},
  };
  const tts: TtsEngine = {
    available: true,
    async speak(_t, { onStart, signal }) {
      await delay(70);
      if (signal.aborted) throw aborted();
      onStart?.();
      await delay(900);
    },
    async stop() {},
  };
  const responder: Responder = async (_t, onToken, signal) => {
    await delay(130);
    if (signal.aborted) throw aborted();
    const reply = 'You have a 9am standup and a 2pm review with Maya.';
    for (const tok of reply.match(/\S+\s*/g) ?? []) {
      if (signal.aborted) throw aborted();
      onToken(tok);
      await delay(40);
    }
    return reply;
  };

  const pipeline = new VoicePipeline({
    stt,
    tts,
    responder,
    hooks: {
      onState: (s: VoiceState) => (stateT.textContent = s.replace('_', ' ')),
      onFinalTranscript: (t) => (trans.textContent = t || '—'),
      onResponseToken: (tok) => (resp.textContent = (resp.textContent === '—' ? '' : resp.textContent) + tok),
      onLatency: (l) => {
        lat.style.display = 'block';
        lat.textContent = `latency  stt=${Math.round(l.sttMs ?? 0)}ms  think=${Math.round(l.thinkMs ?? 0)}ms  ttsStart=${Math.round(l.ttsStartMs ?? 0)}ms\nvoice I/O within 500ms target: ${l.withinTarget}`;
      },
    },
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    resp.textContent = '—';
    trans.textContent = '—';
    lat.style.display = 'none';
    await pipeline.pushToTalk();
    btn.disabled = false;
  });
}

// ─────────────────────────── Code sandbox ───────────────────────────
let sandboxP: Promise<ReturnType<typeof createQuickJsWasmSandbox>> | null = null;
function sandbox() {
  return (sandboxP ??= (async () => {
    const mod = await newQuickJSWASMModuleFromVariant(variant as never);
    return createQuickJsWasmSandbox({ module: mod as never });
  })());
}
function panelSandbox(): string {
  return `
  <div class="eyebrow">Phase 4 · QuickJS</div>
  <div class="h">Run code, sandboxed</div>
  <p class="sub">Real QuickJS (WASM) in an isolated context — no host access, enforced limits.</p>
  <div class="field"><label>JavaScript</label><textarea id="code">[1,2,3,4].filter(x=>x%2===0).map(x=>x*10).reduce((a,b)=>a+b,0)</textarea></div>
  <div class="chips">
    <span class="chip" data-c="JSON.stringify([typeof process, typeof require, typeof fetch])">isolation check</span>
    <span class="chip" data-c="let n=0; while(true) n++;">infinite loop</span>
    <span class="chip" data-c="throw new Error('boom')">throw</span>
  </div>
  <button class="btn" id="run" style="width:100%">▶ Execute</button>
  <div id="sout" class="mono" style="display:none;margin-top:10px"></div>`;
}
function wireSandbox(root: HTMLElement) {
  const ta = root.querySelector('#code') as HTMLTextAreaElement;
  const out = root.querySelector('#sout') as HTMLElement;
  const btn = root.querySelector('#run') as HTMLButtonElement;
  root.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      ta.value = (c as HTMLElement).dataset.c || '';
    }),
  );
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    out.style.display = 'block';
    out.textContent = 'booting QuickJS…';
    try {
      const sb = await sandbox();
      const r = await sb.execute(ta.value, { timeoutMs: 1000 });
      out.innerHTML = r.ok
        ? `<span class="ok">✓ value</span>  ${esc(JSON.stringify(r.value))}\n${r.logs.length ? 'logs: ' + esc(r.logs.join(' | ')) + '\n' : ''}<span class="small">${r.durationMs}ms · isolated context</span>`
        : `<span class="err">✗ ${esc(r.error?.name)}</span>  ${esc(r.error?.message)}\n<span class="small">contained — host never crashed</span>`;
    } catch (e) {
      out.innerHTML = `<span class="err">init failed:</span> ${esc((e as Error).message)}`;
    }
    btn.disabled = false;
  });
}

// ─────────────────────────── Memory / RAG ───────────────────────────
const mem = new MemoryManager(new InMemoryVectorStore(), createHashingEmbedder(), { now: () => Date.now() });
const SEED = [
  'The daily standup meeting is at 9am every weekday.',
  'My manager is Maya Chen and she prefers concise email updates.',
  'The Q3 product launch deadline is the fifteenth of September.',
  'My usual coffee order is a flat white with oat milk.',
  'I go to the gym on Monday, Wednesday and Friday mornings.',
  'Our primary database is Postgres on the production cluster.',
  'The team retro is on the last Friday of every sprint.',
  'My travel documents are in the secure folder on device.',
];
const memReady = (async () => {
  for (const t of SEED) await mem.remember({ text: t });
})();
function panelMemory(): string {
  return `
  <div class="eyebrow">Phase 5 · sqlite-vec RAG</div>
  <div class="h">On-device memory</div>
  <p class="sub">Real <b>MemoryManager.recall()</b> over ${SEED.length} seeded memories (offline embedder). Hits become the opaque <b>memories[]</b> sent to the backend.</p>
  <div class="field"><label>query</label><input id="q" type="text" value="when is my standup and who is my manager" /></div>
  <button class="btn" id="qbtn" style="width:100%">🔎 Recall</button>
  <div id="hits" style="margin-top:10px"></div>
  <div class="small" style="margin-top:10px">memories[] payload → /api/sage/infer</div>
  <div id="payload" class="mono" style="margin-top:4px">—</div>`;
}
function wireMemory(root: HTMLElement) {
  const q = root.querySelector('#q') as HTMLInputElement;
  const hits = root.querySelector('#hits') as HTMLElement;
  const payload = root.querySelector('#payload') as HTMLElement;
  async function run() {
    await memReady;
    const res = await mem.recall(q.value, 4);
    hits.innerHTML =
      res
        .map(
          (hriit) => `<div class="tile"><div class="tn"><div class="nm" style="font-size:13px;font-weight:500">${esc(hriit.record.text)}</div>
        <div class="bar"><i style="width:${Math.max(4, Math.round(hriit.score * 100))}%"></i></div></div>
        <span class="hitscore">${hriit.score.toFixed(2)}</span></div>`,
        )
        .join('') || '<div class="small">no matches</div>';
    payload.textContent = JSON.stringify(toMemoryFragments(res, { minScore: 0.15, maxFragments: 4 }), null, 2);
  }
  (root.querySelector('#qbtn') as HTMLButtonElement).addEventListener('click', run);
  run();
}

// ─────────────────────────── Tabs ───────────────────────────
interface Tab { id: string; label: string; icon: string; render: () => string; wire: (r: HTMLElement) => void }
const TABS: Tab[] = [
  { id: 'home', label: 'Home', icon: '🏠', render: panelCapability, wire: wireCapability },
  { id: 'router', label: 'Router', icon: '🧭', render: panelRouter, wire: wireRouter },
  { id: 'think', label: 'Classify', icon: '🧠', render: panelClassifier, wire: wireClassifier },
  { id: 'voice', label: 'Voice', icon: '🎙', render: panelVoice, wire: wireVoice },
  { id: 'code', label: 'Sandbox', icon: '⚡', render: panelSandbox, wire: wireSandbox },
  { id: 'mem', label: 'Memory', icon: '🗂', render: panelMemory, wire: wireMemory },
];
function show(tab: Tab) {
  app.innerHTML = tab.render();
  tab.wire(app);
  app.scrollTop = 0;
  [...tabsEl.children].forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.id === tab.id));
}
tabsEl.innerHTML = TABS.map(
  (t) => `<button class="tab" data-id="${t.id}"><span class="ic">${t.icon}</span>${t.label}</button>`,
).join('');
[...tabsEl.children].forEach((c, i) => c.addEventListener('click', () => show(TABS[i]!)));
show(TABS[0]!);
