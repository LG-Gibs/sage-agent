import { describe, it, expect } from 'vitest';
import {
  SseParser,
  SseProtocolError,
  serializeSseEvent,
  type SageStreamEvent,
} from '../src/index';

describe('SseParser — all five Backend v3 event types', () => {
  it('parses chunk events', () => {
    const p = new SseParser();
    const evts = p.push(
      'event: chunk\ndata: {"delta":"Hello","index":0,"finish_reason":null}\n\n',
    );
    expect(evts).toEqual([
      { type: 'chunk', delta: 'Hello', index: 0, finish_reason: null },
    ]);
  });

  it('parses tool_call events with domain', () => {
    const p = new SseParser();
    const [evt] = p.push(
      'event: tool_call\ndata: {"id":"tc_1","name":"web_search","arguments":{"q":"sage"},"domain":"cloud"}\n\n',
    );
    expect(evt).toEqual({
      type: 'tool_call',
      id: 'tc_1',
      name: 'web_search',
      arguments: { q: 'sage' },
      domain: 'cloud',
    });
  });

  it('parses done events with usage', () => {
    const p = new SseParser();
    const [evt] = p.push(
      'event: done\ndata: {"stop_reason":"stop","model":"gemma-4-2b","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
    );
    expect(evt).toMatchObject({ type: 'done', model: 'gemma-4-2b' });
  });

  it('parses error events', () => {
    const p = new SseParser();
    const [evt] = p.push(
      'event: error\ndata: {"code":"OFFLINE","message":"no net","retryable":true}\n\n',
    );
    expect(evt).toEqual({
      type: 'error',
      code: 'OFFLINE',
      message: 'no net',
      retryable: true,
    });
  });

  it('parses heartbeat events', () => {
    const p = new SseParser();
    const [evt] = p.push('event: heartbeat\ndata: {"ts":1719000000000}\n\n');
    expect(evt).toEqual({ type: 'heartbeat', ts: 1719000000000 });
  });
});

describe('SseParser — streaming robustness', () => {
  it('reassembles an event split across multiple pushes', () => {
    const p = new SseParser();
    expect(p.push('event: chu')).toEqual([]);
    expect(p.push('nk\ndata: {"delta":"Hi","ind')).toEqual([]);
    const evts = p.push('ex":0,"finish_reason":"stop"}\n\n');
    expect(evts).toEqual([
      { type: 'chunk', delta: 'Hi', index: 0, finish_reason: 'stop' },
    ]);
  });

  it('emits multiple events from a single push', () => {
    const p = new SseParser();
    const wire =
      'event: chunk\ndata: {"delta":"a","index":0,"finish_reason":null}\n\n' +
      'event: heartbeat\ndata: {"ts":1}\n\n' +
      'event: chunk\ndata: {"delta":"b","index":1,"finish_reason":null}\n\n';
    const evts = p.push(wire);
    expect(evts.map((e) => e.type)).toEqual(['chunk', 'heartbeat', 'chunk']);
  });

  it('normalizes CRLF line endings', () => {
    const p = new SseParser();
    const evts = p.push(
      'event: heartbeat\r\ndata: {"ts":7}\r\n\r\n',
    );
    expect(evts).toEqual([{ type: 'heartbeat', ts: 7 }]);
  });

  it('ignores unknown event types (forward-compatible)', () => {
    const p = new SseParser();
    const evts = p.push('event: future_thing\ndata: {"x":1}\n\n');
    expect(evts).toEqual([]);
  });

  it('ignores SSE comment lines', () => {
    const p = new SseParser();
    const evts = p.push(': this is a comment\nevent: heartbeat\ndata: {"ts":3}\n\n');
    expect(evts).toEqual([{ type: 'heartbeat', ts: 3 }]);
  });

  it('throws SseProtocolError on malformed JSON for a known event', () => {
    const p = new SseParser();
    expect(() => p.push('event: chunk\ndata: {not json}\n\n')).toThrow(
      SseProtocolError,
    );
  });

  it('throws SseProtocolError when a required field is missing', () => {
    const p = new SseParser();
    expect(() =>
      p.push('event: chunk\ndata: {"index":0,"finish_reason":null}\n\n'),
    ).toThrow(/chunk.delta/);
  });
});

describe('serializeSseEvent — round-trips through the parser', () => {
  const samples: SageStreamEvent[] = [
    { type: 'chunk', delta: 'x', index: 2, finish_reason: null },
    {
      type: 'tool_call',
      id: 'tc_9',
      name: 'execute_js',
      arguments: { code: '1+1' },
      domain: 'mobile',
    },
    {
      type: 'done',
      stop_reason: 'stop',
      model: 'gemma-4-9b',
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    },
    { type: 'error', code: 'TIMEOUT', message: 't', retryable: true },
    { type: 'heartbeat', ts: 42 },
  ];

  it('serializer output parses back to the original event', () => {
    const p = new SseParser();
    for (const evt of samples) {
      const [parsed] = p.push(serializeSseEvent(evt));
      expect(parsed).toEqual(evt);
    }
  });
});
