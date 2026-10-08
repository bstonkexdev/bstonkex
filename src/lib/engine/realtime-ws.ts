// BSTONKEX WebSocket Manager — production-ready WS with auto-reconnect,
// heartbeat, subscription management, and connection state tracking.
// Falls back to polling when WS endpoint is unavailable.

export type WsState = 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'disconnected';
export type WsChannel = string; // e.g. "market:bsc:0x...", "trades:solana:..."

interface WsConfig {
  url: string;
  maxReconnectAttempts?: number;
  heartbeatMs?: number;
  reconnectBaseMs?: number;
}

interface WsSubscription {
  channel: WsChannel;
  callback: (data: any) => void;
  active: boolean;
}

interface WsStateListener {
  (state: WsState, latency: number): void;
}

// ── Manager ──────────────────────────────────────────────────

class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WsConfig;
  private state: WsState = 'disconnected';
  private stateListeners: WsStateListener[] = [];
  private subscriptions = new Map<string, WsSubscription>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private latency = 0;
  private sequenceMap = new Map<string, number>();

  constructor(config: WsConfig) {
    this.config = {
      maxReconnectAttempts: 10,
      heartbeatMs: 15000,
      reconnectBaseMs: 1000,
      ...config,
    };
  }

  // ── Public API ──────────────────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.setState('connecting');
    try {
      this.ws = new WebSocket(this.config.url);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch {
      this.setState('disconnected');
    }
  }

  disconnect(): void {
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }

  subscribe(channel: WsChannel, callback: (data: any) => void): () => void {
    const id = `${channel}:${Date.now()}`;
    const sub: WsSubscription = { channel, callback, active: true };
    this.subscriptions.set(id, sub);

    // Send subscribe message if connected
    if (this.state === 'connected') {
      this.send({ type: 'subscribe', channel });
    }

    return () => {
      const s = this.subscriptions.get(id);
      if (s) {
        s.active = false;
        this.subscriptions.delete(id);
        if (this.state === 'connected') {
          // Only send unsubscribe if no other subs on this channel
          const hasOther = [...this.subscriptions.values()].some(s2 => s2.channel === channel && s2.active);
          if (!hasOther) this.send({ type: 'unsubscribe', channel });
        }
      }
    };
  }

  getState(): WsState { return this.state; }
  getLatency(): number { return this.latency; }

  onStateChange(cb: WsStateListener): () => void {
    this.stateListeners.push(cb);
    return () => { this.stateListeners = this.stateListeners.filter(l => l !== cb); };
  }

  // ── Internal ────────────────────────────────────────────

  private handleOpen(): void {
    this.reconnectAttempt = 0;
    this.setState('connected');
    this.startHeartbeat();
    // Re-subscribe all active channels
    const channels = new Set<string>();
    this.subscriptions.forEach(sub => {
      if (sub.active) channels.add(sub.channel);
    });
    channels.forEach(ch => this.send({ type: 'subscribe', channel: ch }));
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data);

      // Pong / heartbeat response
      if (msg.type === 'pong') {
        this.lastPong = Date.now();
        this.latency = Date.now() - (msg.timestamp || Date.now());
        return;
      }

      // Event with sequence — detect gaps
      if (msg.sequence != null && msg.channel) {
        const lastSeq = this.sequenceMap.get(msg.channel) || 0;
        if (msg.sequence > lastSeq + 1 && lastSeq > 0) {
          // Sequence gap detected — client should resync
          console.warn(`[WS] Sequence gap on ${msg.channel}: ${lastSeq} → ${msg.sequence}`);
        }
        this.sequenceMap.set(msg.channel, msg.sequence);
      }

      // Dispatch to subscribers
      const channel = msg.channel || msg.type;
      this.subscriptions.forEach(sub => {
        if (sub.active && (sub.channel === channel || sub.channel === '*')) {
          sub.callback(msg);
        }
      });
    } catch {
      // Ignore malformed messages
    }
  }

  private handleClose(): void {
    this.clearTimers();
    if (this.reconnectAttempt < (this.config.maxReconnectAttempts || 10)) {
      this.setState('reconnecting');
      const delay = Math.min(
        (this.config.reconnectBaseMs || 1000) * Math.pow(2, this.reconnectAttempt),
        30000
      );
      this.reconnectAttempt++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    } else {
      this.setState('degraded');
    }
  }

  private handleError(): void {
    // Will trigger close
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
        // Check if pong is stale
        if (this.lastPong > 0 && Date.now() - this.lastPong > (this.config.heartbeatMs || 15000) * 3) {
          this.ws.close(); // Force reconnect
        }
      }
    }, this.config.heartbeatMs || 15000);
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private setState(state: WsState): void {
    this.state = state;
    this.stateListeners.forEach(l => l(state, this.latency));
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }
}

// ── Singleton — try to connect, gracefully handle failure ──

const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'wss://bstonkex-production-ec26.up.railway.app/ws';

export const wsManager = new WebSocketManager({ url: WS_URL });

// Attempt connection — will silently fail if no server (polling fallback)
try { wsManager.connect(); } catch { /* polling fallback */ }

export { WebSocketManager };