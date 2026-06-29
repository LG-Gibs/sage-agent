import type { Response } from 'express';
import { serializeSseEvent, type SageStreamEvent } from '@sage/sse-contract';

/**
 * Server-side SSE writer. Uses the SAME serializer the device parses with
 * (@sage/sse-contract), so wire compatibility is guaranteed by construction.
 */
export class SseEmitter {
  private hb: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  constructor(
    private readonly res: Response,
    private readonly heartbeatMs: number,
  ) {}

  open(): void {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering so events flush immediately.
      'X-Accel-Buffering': 'no',
    });
    // Immediate heartbeat: flushes headers and starts the client's timeout clock.
    this.send({ type: 'heartbeat', ts: Date.now() });
    if (this.heartbeatMs > 0) {
      this.hb = setInterval(
        () => this.send({ type: 'heartbeat', ts: Date.now() }),
        this.heartbeatMs,
      );
      // Never keep the process alive solely to emit heartbeats.
      this.hb.unref?.();
    }
  }

  send(evt: SageStreamEvent): void {
    if (this.closed) return;
    this.res.write(serializeSseEvent(evt));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    this.res.end();
  }
}
