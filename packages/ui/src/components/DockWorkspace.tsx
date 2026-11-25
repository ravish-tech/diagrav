import { useEffect, useRef, useState, type ReactNode } from 'react';

export type DockSide = 'left' | 'right';
export type PanelMode = 'docked' | 'floating';

export interface PanelState {
  id: string;
  open: boolean;
  mode: PanelMode;
  side: DockSide;
  order: number;
  collapsed: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface DockPanelConfig {
  id: string;
  title: string;
  render: () => ReactNode;
}

interface DropTarget {
  side: DockSide;
  position: 'full' | 'top' | 'bottom';
}

interface DragInfo {
  panelId: string;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  detached: boolean;
}

interface ResizeInfo {
  panelId: string;
  startClientX: number;
  startClientY: number;
  origWidth: number;
  origHeight: number;
}

export interface DockWorkspaceProps {
  panels: DockPanelConfig[];
  states: Record<string, PanelState>;
  onChangeStates: (updater: (prev: Record<string, PanelState>) => Record<string, PanelState>) => void;
  children: ReactNode;
}

const SNAP_EDGE_PX = 180;
const DOCK_WIDTH_PX = 264;
const DOCK_WIDTHS_KEY = 'diagrav.dockWidths.v1';

function loadDockWidths(): { left: number; right: number } {
  try {
    const raw = localStorage.getItem(DOCK_WIDTHS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { left?: number; right?: number };
      return {
        left: Math.max(210, Math.min(420, parsed.left ?? DOCK_WIDTH_PX)),
        right: Math.max(210, Math.min(420, parsed.right ?? DOCK_WIDTH_PX)),
      };
    }
  } catch {
    // ignore
  }
  return { left: DOCK_WIDTH_PX, right: DOCK_WIDTH_PX };
}

export function DockWorkspace({
  panels,
  states,
  onChangeStates,
  children,
}: DockWorkspaceProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const resizeRef = useRef<ResizeInfo | null>(null);
  const colResizeRef = useRef<{ side: DockSide; startX: number; origWidth: number } | null>(null);
  const statesRef = useRef(states);
  statesRef.current = states;
  const draggingIdRef = useRef<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dockWidths, setDockWidths] = useState(loadDockWidths);

  useEffect(() => {
    try {
      localStorage.setItem(DOCK_WIDTHS_KEY, JSON.stringify(dockWidths));
    } catch {
      // ignore
    }
  }, [dockWidths]);

  const panelMap = new Map(panels.map((p) => [p.id, p]));

  const leftDocked = Object.values(states)
    .filter((s) => s.open && s.mode === 'docked' && s.side === 'left')
    .sort((a, b) => a.order - b.order);

  const rightDocked = Object.values(states)
    .filter((s) => s.open && s.mode === 'docked' && s.side === 'right')
    .sort((a, b) => a.order - b.order);

  const floatingPanels = Object.values(states)
    .filter((s) => s.open && s.mode === 'floating')
    .sort((a, b) => a.zIndex - b.zIndex);

  const bringToFront = (id: string) => {
    onChangeStates((prev) => {
      const maxZ = Math.max(10, ...Object.values(prev).map((p) => p.zIndex));
      const cur = prev[id];
      if (!cur || cur.zIndex === maxZ) return prev;
      return { ...prev, [id]: { ...cur, zIndex: maxZ + 1 } };
    });
  };

  const toggleFloat = (id: string) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    onChangeStates((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const maxZ = Math.max(10, ...Object.values(prev).map((p) => p.zIndex));
      if (cur.mode === 'docked') {
        const defaultX =
          cur.side === 'left'
            ? 24
            : Math.max(24, (stageRect?.width ?? 900) - cur.width - 24);
        return {
          ...prev,
          [id]: {
            ...cur,
            mode: 'floating',
            collapsed: false,
            x: defaultX,
            y: 24,
            zIndex: maxZ + 1,
          },
        };
      }
      // Re-dock to its last side at the bottom
      const sameSide = Object.values(prev).filter(
        (p) => p.id !== id && p.open && p.mode === 'docked' && p.side === cur.side,
      );
      const nextOrder = sameSide.length > 0 ? Math.max(...sameSide.map((p) => p.order)) + 1 : 0;
      return {
        ...prev,
        [id]: {
          ...cur,
          mode: 'docked',
          order: nextOrder,
        },
      };
    });
  };

  const toggleCollapse = (id: string) => {
    onChangeStates((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, collapsed: !cur.collapsed } };
    });
  };

  const closePanel = (id: string) => {
    onChangeStates((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, open: false } };
    });
  };

  const computeDropTarget = (clientX: number, clientY: number, panelId: string): DropTarget | null => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    let side: DockSide | null = null;
    if (relX <= SNAP_EDGE_PX) side = 'left';
    else if (relX >= rect.width - SNAP_EDGE_PX) side = 'right';
    if (!side) return null;

    const othersOnSide = Object.values(statesRef.current).filter(
      (s) => s.id !== panelId && s.open && s.mode === 'docked' && s.side === side,
    );
    if (othersOnSide.length === 0) {
      return { side, position: 'full' };
    }
    return { side, position: relY < rect.height / 2 ? 'top' : 'bottom' };
  };

  const startHeaderDrag = (panelId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();

    const stageRect = stageRef.current?.getBoundingClientRect();
    const panelEl = (e.currentTarget as HTMLElement).closest('.diagrav-dock-pane') as HTMLElement | null;
    const panelRect = panelEl?.getBoundingClientRect();
    const cur = states[panelId];
    if (!cur || !stageRect) return;

    const width = cur.mode === 'floating' ? cur.width : DOCK_WIDTH_PX;
    const height = cur.mode === 'floating' ? cur.height : Math.min(460, Math.max(280, (panelRect?.height ?? 380) * 0.8));
    const offsetX = panelRect ? Math.min(width - 24, Math.max(16, e.clientX - panelRect.left)) : width / 2;
    const offsetY = panelRect ? Math.min(32, Math.max(8, e.clientY - panelRect.top)) : 16;

    bringToFront(panelId);
    dragRef.current = {
      panelId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      offsetX,
      offsetY,
      width,
      height,
      detached: cur.mode === 'floating',
    };
  };

  const startResize = (panelId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const cur = states[panelId];
    if (!cur) return;
    bringToFront(panelId);
    resizeRef.current = {
      panelId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origWidth: cur.width,
      origHeight: cur.height,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) return;

      if (colResizeRef.current) {
        const cr = colResizeRef.current;
        const delta = cr.side === 'left' ? e.clientX - cr.startX : cr.startX - e.clientX;
        const nextW = Math.max(210, Math.min(420, Math.round(cr.origWidth + delta)));
        setDockWidths((prev) => ({ ...prev, [cr.side]: nextW }));
        return;
      }

      if (resizeRef.current) {
        const r = resizeRef.current;
        const nextW = Math.max(220, Math.min(520, Math.round(r.origWidth + (e.clientX - r.startClientX))));
        const nextH = Math.max(160, Math.min(stageRect.height - 24, Math.round(r.origHeight + (e.clientY - r.startClientY))));
        onChangeStates((prev) => {
          const cur = prev[r.panelId];
          if (!cur) return prev;
          return { ...prev, [r.panelId]: { ...cur, width: nextW, height: nextH } };
        });
        return;
      }

      const d = dragRef.current;
      if (!d) return;

      const dist = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
      if (!d.detached && dist < 6) return;

      if (!d.detached) {
        d.detached = true;
        draggingIdRef.current = d.panelId;
        setDraggingId(d.panelId);
      } else if (!draggingIdRef.current) {
        draggingIdRef.current = d.panelId;
        setDraggingId(d.panelId);
      }

      const rawX = e.clientX - stageRect.left - d.offsetX;
      const rawY = e.clientY - stageRect.top - d.offsetY;
      const clampedX = Math.max(4, Math.min(stageRect.width - 80, Math.round(rawX)));
      const clampedY = Math.max(4, Math.min(stageRect.height - 40, Math.round(rawY)));

      onChangeStates((prev) => {
        const cur = prev[d.panelId];
        if (!cur) return prev;
        const maxZ = Math.max(10, ...Object.values(prev).map((p) => p.zIndex));
        return {
          ...prev,
          [d.panelId]: {
            ...cur,
            mode: 'floating',
            collapsed: false,
            x: clampedX,
            y: clampedY,
            width: d.width,
            height: d.height,
            zIndex: cur.zIndex === maxZ ? cur.zIndex : maxZ + 1,
          },
        };
      });

      setDropTarget(computeDropTarget(e.clientX, e.clientY, d.panelId));
    };

    const onUp = (e: PointerEvent) => {
      if (colResizeRef.current) {
        colResizeRef.current = null;
        return;
      }
      if (resizeRef.current) {
        resizeRef.current = null;
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;

      if (d.detached) {
        const target = computeDropTarget(e.clientX, e.clientY, d.panelId);
        if (target) {
          onChangeStates((prev) => {
            const next = { ...prev };
            const others = Object.values(next)
              .filter((p) => p.id !== d.panelId && p.open && p.mode === 'docked' && p.side === target.side)
              .sort((a, b) => a.order - b.order);

            const ordered =
              target.position === 'top'
                ? [d.panelId, ...others.map((o) => o.id)]
                : [...others.map((o) => o.id), d.panelId];

            ordered.forEach((id, idx) => {
              const p = next[id];
              if (p) {
                next[id] = {
                  ...p,
                  mode: 'docked',
                  side: target.side,
                  order: idx,
                };
              }
            });
            return next;
          });
        }
      }

      draggingIdRef.current = null;
      setDraggingId(null);
      setDropTarget(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onChangeStates]);

  const renderPane = (state: PanelState, isFloating: boolean) => {
    const cfg = panelMap.get(state.id);
    if (!cfg) return null;

    return (
      <section
        key={state.id}
        aria-label={cfg.title}
        className={`diagrav-dock-pane ${isFloating ? 'is-floating' : 'is-docked'} ${state.collapsed ? 'is-collapsed' : ''} ${draggingId === state.id ? 'is-dragging' : ''}`}
        style={
          isFloating
            ? {
                left: state.x,
                top: state.y,
                width: state.width,
                height: state.collapsed ? 'auto' : state.height,
                zIndex: state.zIndex,
              }
            : undefined
        }
        onPointerDown={() => {
          if (isFloating) bringToFront(state.id);
        }}
      >
        <div
          className="diagrav-pane-header"
          onPointerDown={(e) => startHeaderDrag(state.id, e)}
          onDoubleClick={() => toggleFloat(state.id)}
          title="Drag to float or snap to Left/Right dock (double-click to toggle float)"
        >
          <span className="diagrav-pane-grip" aria-hidden="true">
            ⋮⋮
          </span>
          <span className="diagrav-pane-title">{cfg.title}</span>
          <div className="diagrav-pane-actions">
            <button
              type="button"
              className="diagrav-pane-btn"
              onClick={() => toggleFloat(state.id)}
              title={isFloating ? `Dock to ${state.side}` : 'Float panel'}
              aria-label={isFloating ? `Dock ${cfg.title}` : `Float ${cfg.title}`}
            >
              {isFloating ? '◧' : '⧉'}
            </button>
            <button
              type="button"
              className="diagrav-pane-btn"
              onClick={() => toggleCollapse(state.id)}
              title={state.collapsed ? 'Expand' : 'Collapse'}
              aria-label={state.collapsed ? `Expand ${cfg.title}` : `Collapse ${cfg.title}`}
            >
              {state.collapsed ? '+' : '−'}
            </button>
            <button
              type="button"
              className="diagrav-pane-btn"
              onClick={() => closePanel(state.id)}
              title="Close panel"
              aria-label={`Close ${cfg.title}`}
            >
              ×
            </button>
          </div>
        </div>
        {!state.collapsed && <div className="diagrav-pane-body">{cfg.render()}</div>}
        {isFloating && !state.collapsed && (
          <div
            className="diagrav-pane-resize-handle"
            onPointerDown={(e) => startResize(state.id, e)}
            title="Resize floating panel"
          />
        )}
      </section>
    );
  };

  return (
    <div ref={stageRef} className="diagrav-workspace-stage">
      {leftDocked.length > 0 && (
        <aside
          className="diagrav-dock-column is-left"
          aria-label="Left Dock"
          style={{ width: dockWidths.left, minWidth: dockWidths.left, maxWidth: dockWidths.left }}
        >
          {leftDocked.map((s) => renderPane(s, false))}
          <div
            className="diagrav-dock-splitter is-left"
            title="Drag to resize left dock"
            onPointerDown={(e) => {
              e.preventDefault();
              colResizeRef.current = { side: 'left', startX: e.clientX, origWidth: dockWidths.left };
            }}
          />
        </aside>
      )}

      <main className="diagrav-workspace-center">{children}</main>

      {rightDocked.length > 0 && (
        <aside
          className="diagrav-dock-column is-right"
          aria-label="Right Dock"
          style={{ width: dockWidths.right, minWidth: dockWidths.right, maxWidth: dockWidths.right }}
        >
          <div
            className="diagrav-dock-splitter is-right"
            title="Drag to resize right dock"
            onPointerDown={(e) => {
              e.preventDefault();
              colResizeRef.current = { side: 'right', startX: e.clientX, origWidth: dockWidths.right };
            }}
          />
          {rightDocked.map((s) => renderPane(s, false))}
        </aside>
      )}

      {/* Floating panels */}
      {floatingPanels.map((s) => renderPane(s, true))}

      {/* Snap-to-dock drop zone preview overlay while dragging */}
      {draggingId && dropTarget && (
        <div
          className={`diagrav-drop-zone is-${dropTarget.side} is-${dropTarget.position}`}
          aria-hidden="true"
        >
          <span>
            Dock {dropTarget.side}
            {dropTarget.position !== 'full' ? ` (${dropTarget.position})` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
