import type { CommandEngine } from '../commands/engine.js';
import type { DiagramCommand } from '../commands/types.js';
import type { EdgeRouterRegistry } from '../registries/edges.js';
import type { ShapeRegistry } from '../registries/shapes.js';
import {
  createDefaultEdge,
  createDefaultEdgeLabel,
  createDefaultNodeLabel,
  type DiagramMode,
  type DiagramNode,
  type EditorTool,
  type Point,
} from '../schema/types.js';
import type { RenderState, SvgRenderer } from './svg-renderer.js';

export interface SelectionState {
  nodeIds: string[];
  edgeIds: string[];
}

export type SelectionListener = (selection: SelectionState) => void;

type DragSession =
  | { kind: 'pan'; startX: number; startY: number; origVpX: number; origVpY: number }
  | {
      kind: 'move-nodes';
      startWorld: Point;
      origins: Map<string, { x: number; y: number }>;
      moved: boolean;
    }
  | {
      kind: 'resize-node';
      nodeId: string;
      dir: string;
      startWorld: Point;
      orig: { x: number; y: number; width: number; height: number };
    }
  | {
      kind: 'create-edge';
      fromNodeId: string;
    }
  | {
      kind: 'move-bend';
      edgeId: string;
      bendIndex: number;
      origBends: Point[];
    };

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export class InteractionController {
  private mode: DiagramMode;
  private tool: EditorTool = 'select';
  private snapToGrid = true;
  private gridSize = 10;
  private showGrid = true;
  private selectedNodeIds = new Set<string>();
  private selectedEdgeIds = new Set<string>();
  private hoveredNodeId: string | null = null;
  private draftEdge: RenderState['draftEdge'] = null;
  private snapLines: RenderState['snapLines'] = [];
  private drag: DragSession | null = null;
  private selectionListeners = new Set<SelectionListener>();
  private activeInlineInput: HTMLInputElement | null = null;

  constructor(
    private engine: CommandEngine,
    private renderer: SvgRenderer,
    private shapes: ShapeRegistry,
    private routers: EdgeRouterRegistry,
    initialMode: DiagramMode = 'editor',
  ) {
    this.mode = initialMode;
    this.bindEvents();
  }

  getRenderState(): RenderState {
    return {
      mode: this.mode,
      selectedNodeIds: this.selectedNodeIds,
      selectedEdgeIds: this.selectedEdgeIds,
      hoveredNodeId: this.hoveredNodeId,
      showGrid: this.showGrid,
      gridSize: this.gridSize,
      draftEdge: this.draftEdge,
      snapLines: this.snapLines,
    };
  }

  getMode(): DiagramMode {
    return this.mode;
  }

  setMode(mode: DiagramMode): void {
    this.mode = mode;
    if (mode === 'readonly') {
      this.draftEdge = null;
      this.snapLines = [];
      this.closeInlineEditor(false);
    }
    this.redraw();
  }

  getTool(): EditorTool {
    return this.tool;
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.renderer.svg.style.cursor = tool === 'edge' ? 'crosshair' : 'default';
  }

  setSnapToGrid(enabled: boolean): void {
    this.snapToGrid = enabled;
  }

  setShowGrid(enabled: boolean): void {
    this.showGrid = enabled;
    this.redraw();
  }

  getSelection(): SelectionState {
    return {
      nodeIds: Array.from(this.selectedNodeIds),
      edgeIds: Array.from(this.selectedEdgeIds),
    };
  }

  selectNodes(ids: string[]): void {
    this.selectedNodeIds = new Set(ids);
    this.selectedEdgeIds.clear();
    this.emitSelection();
    this.redraw();
  }

  selectEdges(ids: string[]): void {
    this.selectedNodeIds.clear();
    this.selectedEdgeIds = new Set(ids);
    this.emitSelection();
    this.redraw();
  }

  clearSelection(): void {
    if (this.selectedNodeIds.size === 0 && this.selectedEdgeIds.size === 0) return;
    this.selectedNodeIds.clear();
    this.selectedEdgeIds.clear();
    this.emitSelection();
    this.redraw();
  }

  onSelectionChange(listener: SelectionListener): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  destroy(): void {
    this.closeInlineEditor(false);
    const svg = this.renderer.svg;
    svg.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    svg.removeEventListener('wheel', this.onWheel);
    svg.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private bindEvents(): void {
    const svg = this.renderer.svg;
    svg.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    svg.addEventListener('wheel', this.onWheel, { passive: false });
    svg.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private redraw(): void {
    this.renderer.render(this.engine.getDocument(), this.getRenderState());
  }

  private emitSelection(): void {
    const sel = this.getSelection();
    for (const l of this.selectionListeners) l(sel);
  }

  private findNodeAt(world: Point): DiagramNode | null {
    const nodes = this.engine.getDocument().nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (
        world.x >= n.geometry.x &&
        world.x <= n.geometry.x + n.geometry.width &&
        world.y >= n.geometry.y &&
        world.y <= n.geometry.y + n.geometry.height
      ) {
        return n;
      }
    }
    return null;
  }

  private snap(val: number, bypass: boolean): number {
    if (!this.snapToGrid || bypass) return val;
    return Math.round(val / this.gridSize) * this.gridSize;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    this.closeInlineEditor(true);

    const target = e.target as SVGElement | null;
    const doc = this.engine.getDocument();
    const world = this.renderer.screenToWorld(e.clientX, e.clientY, doc);

    // Middle mouse or readonly background => pan
    if (e.button === 1) {
      this.drag = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origVpX: doc.viewport.x,
        origVpY: doc.viewport.y,
      };
      return;
    }

    // 1. Resize handle
    const resizeNodeId = target?.getAttribute('data-resize-node-id');
    const resizeDir = target?.getAttribute('data-resize-dir');
    if (this.mode === 'editor' && resizeNodeId && resizeDir) {
      const node = this.engine.getNode(resizeNodeId);
      if (node) {
        this.drag = {
          kind: 'resize-node',
          nodeId: node.id,
          dir: resizeDir,
          startWorld: world,
          orig: {
            x: node.geometry.x,
            y: node.geometry.y,
            width: node.geometry.width,
            height: node.geometry.height,
          },
        };
      }
      return;
    }

    // 2. Port handle => start edge creation
    const portNodeId = target?.getAttribute('data-port-node-id');
    if (this.mode === 'editor' && portNodeId) {
      this.drag = { kind: 'create-edge', fromNodeId: portNodeId };
      this.draftEdge = { fromNodeId: portNodeId, toPoint: world, targetNodeId: null };
      this.redraw();
      return;
    }

    // 3. Bend handle => move existing bend
    const bendEdgeId = target?.getAttribute('data-bend-edge-id');
    const bendIdxAttr = target?.getAttribute('data-bend-index');
    if (this.mode === 'editor' && bendEdgeId && bendIdxAttr !== null) {
      const edge = this.engine.getEdge(bendEdgeId);
      if (edge) {
        this.drag = {
          kind: 'move-bend',
          edgeId: edge.id,
          bendIndex: Number(bendIdxAttr),
          origBends: structuredClone(edge.bends),
        };
      }
      return;
    }

    // 4. Node hit
    const nodeGroup = target?.closest('[data-node-id]') as SVGElement | null;
    const nodeId = nodeGroup?.getAttribute('data-node-id');
    if (nodeId) {
      if (this.mode === 'editor' && this.tool === 'edge') {
        this.drag = { kind: 'create-edge', fromNodeId: nodeId };
        this.draftEdge = { fromNodeId: nodeId, toPoint: world, targetNodeId: null };
        this.redraw();
        return;
      }

      if (e.shiftKey) {
        if (this.selectedNodeIds.has(nodeId)) this.selectedNodeIds.delete(nodeId);
        else this.selectedNodeIds.add(nodeId);
      } else if (!this.selectedNodeIds.has(nodeId)) {
        this.selectedNodeIds = new Set([nodeId]);
        this.selectedEdgeIds.clear();
      }
      this.emitSelection();

      if (this.mode === 'editor') {
        const origins = new Map<string, { x: number; y: number }>();
        for (const id of this.selectedNodeIds) {
          const n = this.engine.getNode(id);
          if (n) origins.set(id, { x: n.geometry.x, y: n.geometry.y });
        }
        this.drag = { kind: 'move-nodes', startWorld: world, origins, moved: false };
      }
      this.redraw();
      return;
    }

    // 5. Edge hit (select OR yEd-style click-drag to insert bend!)
    const edgeHitId = target?.getAttribute('data-edge-hit-id');
    if (edgeHitId) {
      const wasSelected = this.selectedEdgeIds.has(edgeHitId);
      this.selectedNodeIds.clear();
      this.selectedEdgeIds = new Set([edgeHitId]);
      this.emitSelection();

      if (this.mode === 'editor' && wasSelected) {
        const edge = this.engine.getEdge(edgeHitId);
        if (edge) {
          const src = this.engine.getNode(edge.source.nodeId);
          const tgt = this.engine.getNode(edge.target.nodeId);
          if (src && tgt) {
            const routed = this.routers.get(edge.routing).route(src, tgt, edge, this.shapes);
            // Find closest segment index to insert bend
            let bestSeg = 0;
            let bestDist = Infinity;
            for (let i = 0; i < routed.points.length - 1; i++) {
              const d = distToSegment(world, routed.points[i], routed.points[i + 1]);
              if (d < bestDist) {
                bestDist = d;
                bestSeg = i;
              }
            }
            const nextBends = [...edge.bends];
            const insertIdx = Math.min(bestSeg, nextBends.length);
            nextBends.splice(insertIdx, 0, {
              x: this.snap(world.x, e.ctrlKey || e.metaKey),
              y: this.snap(world.y, e.ctrlKey || e.metaKey),
            });
            this.engine.execute({
              type: 'edge.update',
              id: edge.id,
              patch: {
                routing: edge.routing === 'straight' ? 'polyline' : edge.routing,
                bends: nextBends,
              },
            });
            this.drag = {
              kind: 'move-bend',
              edgeId: edge.id,
              bendIndex: insertIdx,
              origBends: structuredClone(nextBends),
            };
          }
        }
      }
      this.redraw();
      return;
    }

    // 6. Empty canvas => clear selection + start pan
    this.clearSelection();
    this.drag = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origVpX: doc.viewport.x,
      origVpY: doc.viewport.y,
    };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const doc = this.engine.getDocument();
    const world = this.renderer.screenToWorld(e.clientX, e.clientY, doc);

    if (!this.drag) {
      if (this.mode === 'editor') {
        const hovered = this.findNodeAt(world)?.id ?? null;
        if (hovered !== this.hoveredNodeId) {
          this.hoveredNodeId = hovered;
          this.redraw();
        }
      }
      return;
    }

    const bypassSnap = e.ctrlKey || e.metaKey;

    switch (this.drag.kind) {
      case 'pan': {
        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;
        this.engine.execute({
          type: 'viewport.set',
          viewport: {
            x: this.drag.origVpX + dx,
            y: this.drag.origVpY + dy,
            zoom: doc.viewport.zoom,
          },
          recordHistory: false,
        });
        break;
      }

      case 'move-nodes': {
        const dx = world.x - this.drag.startWorld.x;
        const dy = world.y - this.drag.startWorld.y;
        this.drag.moved = true;
        this.snapLines = [];

        // Snap lines for single-node drag (yEd style)
        let snapOffsetX = 0;
        let snapOffsetY = 0;
        if (this.drag.origins.size === 1 && !bypassSnap) {
          const [movingId, orig] = Array.from(this.drag.origins.entries())[0];
          const movingNode = this.engine.getNode(movingId);
          if (movingNode) {
            const rawX = orig.x + dx;
            const rawY = orig.y + dy;
            const cx = rawX + movingNode.geometry.width / 2;
            const cy = rawY + movingNode.geometry.height / 2;
            const threshold = 6;

            for (const other of doc.nodes) {
              if (other.id === movingId) continue;
              const ocx = other.geometry.x + other.geometry.width / 2;
              const ocy = other.geometry.y + other.geometry.height / 2;
              if (Math.abs(cx - ocx) < threshold) {
                snapOffsetX = ocx - cx;
                this.snapLines.push({ orientation: 'vertical', value: ocx });
              }
              if (Math.abs(cy - ocy) < threshold) {
                snapOffsetY = ocy - cy;
                this.snapLines.push({ orientation: 'horizontal', value: ocy });
              }
            }
          }
        }

        // Update positions live directly on current doc without spamming undo stack;
        // commit on pointerup.
        for (const [id, orig] of this.drag.origins.entries()) {
          const node = this.engine.getNode(id);
          if (!node) continue;
          const nextX = snapOffsetX !== 0 ? orig.x + dx + snapOffsetX : this.snap(orig.x + dx, bypassSnap);
          const nextY = snapOffsetY !== 0 ? orig.y + dy + snapOffsetY : this.snap(orig.y + dy, bypassSnap);
          node.geometry.x = nextX;
          node.geometry.y = nextY;
        }
        this.redraw();
        break;
      }

      case 'resize-node': {
        const node = this.engine.getNode(this.drag.nodeId);
        if (!node) return;
        const dx = world.x - this.drag.startWorld.x;
        const dy = world.y - this.drag.startWorld.y;
        const o = this.drag.orig;
        let { x, y, width, height } = o;
        const minW = 36;
        const minH = 28;

        if (this.drag.dir.includes('e')) width = Math.max(minW, this.snap(o.width + dx, bypassSnap));
        if (this.drag.dir.includes('s')) height = Math.max(minH, this.snap(o.height + dy, bypassSnap));
        if (this.drag.dir.includes('w')) {
          const newX = this.snap(o.x + dx, bypassSnap);
          const newW = o.x + o.width - newX;
          if (newW >= minW) {
            x = newX;
            width = newW;
          }
        }
        if (this.drag.dir.includes('n')) {
          const newY = this.snap(o.y + dy, bypassSnap);
          const newH = o.y + o.height - newY;
          if (newH >= minH) {
            y = newY;
            height = newH;
          }
        }

        node.geometry.x = x;
        node.geometry.y = y;
        node.geometry.width = width;
        node.geometry.height = height;
        this.redraw();
        break;
      }

      case 'create-edge': {
        const hit = this.findNodeAt(world);
        const targetNodeId = hit && hit.id !== this.drag.fromNodeId ? hit.id : null;
        this.draftEdge = { fromNodeId: this.drag.fromNodeId, toPoint: world, targetNodeId };
        this.redraw();
        break;
      }

      case 'move-bend': {
        const edge = this.engine.getEdge(this.drag.edgeId);
        if (!edge || !edge.bends[this.drag.bendIndex]) return;
        edge.bends[this.drag.bendIndex] = {
          x: this.snap(world.x, bypassSnap),
          y: this.snap(world.y, bypassSnap),
        };
        this.redraw();
        break;
      }
    }
  };

  private onPointerUp = (): void => {
    if (!this.drag) return;
    const session = this.drag;
    this.drag = null;
    this.snapLines = [];

    switch (session.kind) {
      case 'move-nodes': {
        if (session.moved) {
          // Capture final positions, restore origins, then dispatch 1 undoable batch command
          const finals = new Map<string, Point>();
          for (const [id, orig] of session.origins.entries()) {
            const n = this.engine.getNode(id);
            if (n) {
              finals.set(id, { x: n.geometry.x, y: n.geometry.y });
              n.geometry.x = orig.x;
              n.geometry.y = orig.y;
            }
          }
          const commands: DiagramCommand[] = [];
          for (const [id, pt] of finals.entries()) {
            commands.push({ type: 'node.update', id, patch: { geometry: { x: pt.x, y: pt.y } } });
          }
          this.engine.execute({ type: 'batch', commands, label: 'Move nodes' });
        }
        break;
      }

      case 'resize-node': {
        const n = this.engine.getNode(session.nodeId);
        if (n) {
          const finalGeo = { ...n.geometry };
          n.geometry = { ...n.geometry, ...session.orig };
          this.engine.execute({
            type: 'node.update',
            id: session.nodeId,
            patch: { geometry: finalGeo },
          });
        }
        break;
      }

      case 'create-edge': {
        const targetId = this.draftEdge?.targetNodeId;
        this.draftEdge = null;
        if (targetId && targetId !== session.fromNodeId) {
          const edge = createDefaultEdge(session.fromNodeId, targetId);
          this.engine.execute({ type: 'edge.create', edge });
          this.selectEdges([edge.id]);
        } else {
          this.redraw();
        }
        break;
      }

      case 'move-bend': {
        const edge = this.engine.getEdge(session.edgeId);
        if (edge) {
          const finalBends = structuredClone(edge.bends);
          edge.bends = session.origBends;
          this.engine.execute({
            type: 'edge.update',
            id: session.edgeId,
            patch: { bends: finalBends },
          });
        }
        break;
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const doc = this.engine.getDocument();
    const rect = this.renderer.svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.max(0.15, Math.min(4, doc.viewport.zoom * zoomFactor));
    const scaleRatio = nextZoom / doc.viewport.zoom;

    const nextX = mouseX - (mouseX - doc.viewport.x) * scaleRatio;
    const nextY = mouseY - (mouseY - doc.viewport.y) * scaleRatio;

    this.engine.execute({
      type: 'viewport.set',
      viewport: { x: nextX, y: nextY, zoom: nextZoom },
      recordHistory: false,
    });
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (this.mode !== 'editor') return;
    const target = e.target as SVGElement | null;

    // Double-click bend handle => remove bend (yEd behavior!)
    const bendEdgeId = target?.getAttribute('data-bend-edge-id');
    const bendIdxAttr = target?.getAttribute('data-bend-index');
    if (bendEdgeId && bendIdxAttr !== null) {
      const edge = this.engine.getEdge(bendEdgeId);
      if (edge) {
        const nextBends = edge.bends.filter((_, i) => i !== Number(bendIdxAttr));
        this.engine.execute({ type: 'edge.update', id: edge.id, patch: { bends: nextBends } });
      }
      return;
    }

    // Double-click node => edit label
    const nodeGroup = target?.closest('[data-node-id]') as SVGElement | null;
    const nodeId = nodeGroup?.getAttribute('data-node-id');
    if (nodeId) {
      this.openInlineLabelEditor('node', nodeId);
      return;
    }

    // Double-click edge => edit edge label
    const edgeHitId = target?.getAttribute('data-edge-hit-id');
    if (edgeHitId) {
      this.openInlineLabelEditor('edge', edgeHitId);
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'editor') return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      return;
    }

    // Undo / Redo
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.engine.redo();
      else this.engine.undo();
      return;
    }

    // F2 => edit primary label of selected node/edge (yEd shortcut!)
    if (e.key === 'F2') {
      e.preventDefault();
      if (this.selectedNodeIds.size === 1) {
        this.openInlineLabelEditor('node', Array.from(this.selectedNodeIds)[0]);
      } else if (this.selectedEdgeIds.size === 1) {
        this.openInlineLabelEditor('edge', Array.from(this.selectedEdgeIds)[0]);
      }
      return;
    }

    // Escape => clear selection
    if (e.key === 'Escape') {
      this.draftEdge = null;
      this.clearSelection();
      return;
    }

    // Delete / Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedNodeIds.size === 0 && this.selectedEdgeIds.size === 0) return;
      e.preventDefault();
      const commands: DiagramCommand[] = [];
      for (const id of this.selectedEdgeIds) commands.push({ type: 'edge.delete', id });
      for (const id of this.selectedNodeIds) commands.push({ type: 'node.delete', id });
      this.engine.execute({ type: 'batch', commands, label: 'Delete selection' });
      this.clearSelection();
    }
  };

  openInlineLabelEditor(kind: 'node' | 'edge', id: string): void {
    this.closeInlineEditor(true);
    const doc = this.engine.getDocument();
    let worldPos: Point;
    let initialText = '';

    if (kind === 'node') {
      const node = this.engine.getNode(id);
      if (!node) return;
      worldPos = {
        x: node.geometry.x + node.geometry.width / 2,
        y: node.geometry.y + node.geometry.height / 2,
      };
      initialText = node.labels[0]?.text ?? '';
    } else {
      const edge = this.engine.getEdge(id);
      if (!edge) return;
      const src = this.engine.getNode(edge.source.nodeId);
      const tgt = this.engine.getNode(edge.target.nodeId);
      if (!src || !tgt) return;
      const routed = this.routers.get(edge.routing).route(src, tgt, edge, this.shapes);
      const mid = routed.points[Math.floor(routed.points.length / 2)] ?? routed.points[0];
      worldPos = mid;
      initialText = edge.labels[0]?.text ?? '';
    }

    const screen = this.renderer.worldToScreen(worldPos, doc);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialText;
    input.style.position = 'fixed';
    input.style.left = `${screen.x - 70}px`;
    input.style.top = `${screen.y - 14}px`;
    input.style.width = '140px';
    input.style.height = '28px';
    input.style.padding = '2px 8px';
    input.style.fontSize = '13px';
    input.style.textAlign = 'center';
    input.style.border = '2px solid #2563eb';
    input.style.borderRadius = '6px';
    input.style.background = '#ffffff';
    input.style.color = '#0f172a';
    input.style.outline = 'none';
    input.style.zIndex = '9999';
    input.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.15)';

    const commit = () => {
      const text = input.value;
      if (kind === 'node') {
        const node = this.engine.getNode(id);
        if (node) {
          const existing = node.labels[0] ?? createDefaultNodeLabel(text);
          this.engine.execute({
            type: 'label.upsert',
            targetKind: 'node',
            targetId: id,
            label: { ...existing, text },
          });
        }
      } else {
        const edge = this.engine.getEdge(id);
        if (edge) {
          const existing = edge.labels[0] ?? createDefaultEdgeLabel(text);
          this.engine.execute({
            type: 'label.upsert',
            targetKind: 'edge',
            targetId: id,
            label: { ...existing, text },
          });
        }
      }
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.closeInlineEditor(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeInlineEditor(false);
      }
    });
    input.addEventListener('blur', () => this.closeInlineEditor(true));

    (input as HTMLInputElement & { __commit?: () => void }).__commit = commit;
    document.body.appendChild(input);
    input.focus();
    input.select();
    this.activeInlineInput = input;
  }

  private closeInlineEditor(commit: boolean): void {
    const input = this.activeInlineInput;
    if (!input) return;
    this.activeInlineInput = null;
    if (commit) {
      const fn = (input as HTMLInputElement & { __commit?: () => void }).__commit;
      fn?.();
    }
    input.remove();
  }
}
