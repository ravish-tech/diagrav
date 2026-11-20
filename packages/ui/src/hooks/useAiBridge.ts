import type { DiagramCommand, DiagramDocument, Diagrav } from '@diagrav/core';
import { toast } from 'jenni-react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected';

const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:4175';

/**
 * Connects the browser Studio (`@diagrav/ui`) to the live `@diagrav/mcp` WebSocket bridge.
 * Incoming AI commands run through the studio's CommandEngine so every AI edit is live & Undoable.
 */
export function useAiBridge(diagravRef: RefObject<Diagrav | null>, doc: DiagramDocument) {
  const [status, setStatus] = useState<BridgeStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const applyingRemoteRef = useRef(false);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    }
    setStatus('disconnected');
  }, []);

  const connect = useCallback(
    (url = DEFAULT_BRIDGE_URL) => {
      disconnect();
      setStatus('connecting');
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('connected');
          toast.success('Connected to @diagrav/mcp live bridge');
          const current = diagravRef.current?.getDocument();
          if (current) {
            ws.send(JSON.stringify({ type: 'sync', document: current }));
          }
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as
              | { type: 'command'; command: DiagramCommand }
              | { type: 'undo' }
              | { type: 'redo' };
            const instance = diagravRef.current;
            if (!instance) return;
            applyingRemoteRef.current = true;
            try {
              if (msg.type === 'command') {
                instance.execute(msg.command);
              } else if (msg.type === 'undo') {
                instance.undo();
              } else if (msg.type === 'redo') {
                instance.redo();
              }
            } finally {
              applyingRemoteRef.current = false;
            }
          } catch {
            // ignore malformed bridge message
          }
        };

        ws.onerror = () => {
          toast.error('AI Bridge unavailable (start @diagrav/mcp first)');
          disconnect();
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
            setStatus('disconnected');
          }
        };
      } catch {
        toast.error('Failed to open AI Bridge WebSocket');
        setStatus('disconnected');
      }
    },
    [diagravRef, disconnect],
  );

  // Sync local human edits to MCP server when connected
  useEffect(() => {
    if (status !== 'connected' || applyingRemoteRef.current) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'sync', document: doc }));
    }
  }, [doc, status]);

  useEffect(() => () => disconnect(), [disconnect]);

  const toggle = useCallback(() => {
    if (status === 'disconnected') connect();
    else disconnect();
  }, [status, connect, disconnect]);

  return { status, toggle };
}
