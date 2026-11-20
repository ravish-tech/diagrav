import type { DiagramCommand, DiagramDocument } from '@diagrav/core';
import { validateDocument } from '@diagrav/core';
import { WebSocket, WebSocketServer } from 'ws';

export type BridgeOutgoingMessage =
  | { type: 'command'; command: DiagramCommand }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'sync'; document: DiagramDocument };

export type BridgeIncomingMessage =
  | { type: 'sync'; document: unknown }
  | { type: 'ping' };

export interface BridgeCallbacks {
  onStudioSync: (doc: DiagramDocument) => void;
  getCurrentDocument: () => DiagramDocument;
}

/**
 * Live WebSocket bridge between `@diagrav/mcp` and open `@diagrav/ui` browser tabs.
 * Lets Claude / Google agents edit an open diagram in real time while the user watches
 * and can Undo/Redo every AI step.
 */
export class DiagravBridgeServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private port: number;

  constructor(port: number, private callbacks: BridgeCallbacks) {
    this.port = port;
  }

  async start(): Promise<boolean> {
    if (this.port <= 0) return false;
    return new Promise((resolve) => {
      const wss = new WebSocketServer({ host: '127.0.0.1', port: this.port });

      wss.once('listening', () => {
        this.wss = wss;
        resolve(true);
      });

      wss.once('error', (err) => {
        // Non-fatal: e.g. EADDRINUSE if another MCP instance already bound the bridge port.
        process.stderr.write(`[diagrav-mcp] Live bridge unavailable on port ${this.port}: ${err.message}\n`);
        resolve(false);
      });

      wss.on('connection', (ws) => {
        this.clients.add(ws);

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(String(raw)) as BridgeIncomingMessage;
            if (msg.type === 'sync') {
              const doc = validateDocument(msg.document);
              this.callbacks.onStudioSync(doc);
            } else if (msg.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } catch {
            // Ignore malformed client messages
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
        });
      });
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getPort(): number {
    return this.port;
  }

  broadcast(message: BridgeOutgoingMessage): void {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  async close(): Promise<void> {
    if (!this.wss) return;
    const server = this.wss;
    this.wss = null;
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
