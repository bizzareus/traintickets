/**
 * Minimal raw Chrome DevTools Protocol (CDP) client over a plain WebSocket.
 * No Playwright/Puppeteer — just `fetch` (for the /json/version handshake) and
 * Node's built-in `WebSocket` global (stable since Node 21/22, no extra dep).
 *
 * Supports just what the IRCTC session keeper needs: create a target, attach
 * to it (flattened session), navigate, wait for an event, and read cookies.
 */

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

type CdpEvent = { method: string; params: unknown; sessionId?: string };

export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private eventListeners: Array<{
    method: string;
    sessionId?: string;
    resolve: (e: CdpEvent) => void;
  }> = [];

  private constructor(private readonly wsUrl: string) {}

  /** Resolve a browser-use (or any standard remote-debugging) cdpUrl to a live client. */
  static async connect(cdpHttpUrl: string): Promise<CdpClient> {
    const versionResp = await fetch(`${cdpHttpUrl.replace(/\/$/, '')}/json/version`);
    if (!versionResp.ok) {
      throw new Error(`/json/version ${versionResp.status}`);
    }
    const info = (await versionResp.json()) as { webSocketDebuggerUrl?: string };
    if (!info.webSocketDebuggerUrl) {
      throw new Error('no webSocketDebuggerUrl in /json/version response');
    }
    const client = new CdpClient(info.webSocketDebuggerUrl);
    await client.open();
    return client;
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const onOpen = () => {
        ws.removeEventListener('error', onError);
        resolve();
      };
      const onError = (ev: Event) => {
        ws.removeEventListener('open', onOpen);
        reject(new Error(`CDP websocket error: ${String((ev as ErrorEvent).message ?? ev)}`));
      };
      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('error', onError, { once: true });
      ws.addEventListener('message', (ev) => this.onMessage(ev));
    });
  }

  private onMessage(ev: MessageEvent): void {
    let msg: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown; sessionId?: string };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const call = this.pending.get(msg.id);
      if (!call) return;
      this.pending.delete(msg.id);
      if (msg.error) call.reject(new Error(msg.error.message));
      else call.resolve(msg.result);
      return;
    }
    if (msg.method) {
      const event: CdpEvent = { method: msg.method, params: msg.params, sessionId: msg.sessionId };
      this.eventListeners = this.eventListeners.filter((l) => {
        if (l.method !== event.method) return true;
        if (l.sessionId !== undefined && l.sessionId !== event.sessionId) return true;
        l.resolve(event);
        return false;
      });
    }
  }

  /** Send a CDP command. Include `sessionId` to target an attached page session. */
  send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    if (!this.ws) throw new Error('CDP client not connected');
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws!.send(JSON.stringify(payload));
    });
  }

  /** Resolve when a matching event arrives, or reject after `timeoutMs`. */
  waitForEvent(method: string, sessionId: string | undefined, timeoutMs: number): Promise<CdpEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.eventListeners = this.eventListeners.filter((l) => l.resolve !== wrapped);
        reject(new Error(`timeout waiting for ${method}`));
      }, timeoutMs);
      const wrapped = (e: CdpEvent) => {
        clearTimeout(timer);
        resolve(e);
      };
      this.eventListeners.push({ method, sessionId, resolve: wrapped });
    });
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    for (const call of this.pending.values()) {
      call.reject(new Error('CDP client closed'));
    }
    this.pending.clear();
  }
}

export type CdpCookie = {
  name: string;
  value: string;
  domain: string;
  expires: number;
};

/** `cookies.map(c => `${name}=${value}`).join('; ')` for use as a Cookie header. */
export function cookiesToHeaderString(cookies: CdpCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
