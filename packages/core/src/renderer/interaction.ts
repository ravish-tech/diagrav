import type { CommandEngine } from '../commands/engine.js';
import type { DiagramCommand } from '../commands/types.js';
import { pointAlongPolyline, type EdgeRouterRegistry } from '../registries/edges.js';
import { computeEdgeLabelPosition, computeNodeLabelPosition } from '../registries/labels.js';
import type { ShapeRegistry } from '../registries/shapes.js';
import {
  createDefaultEdge,
  createDefaultEdgeLabel,
  createDefaultNodeLabel,
  generateId,
  type DiagramEdge,
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
      moved: boolean;
    }
  | {
      kind: 'create-edge';
      fromNodeId: string;
    }
  | {
      kind: 'pending-bend';
      edgeId: string;
      startClientX: number;
      startClientY: number;
      insertIndex: number;
      origBends: Point[];
      origRouting: DiagramEdge['routing'];
    }
  | {
      kind: 'move-bend';
      edgeId: string;
      bendIndex: number;
      origBends: Point[];
      origRouting: DiagramEdge['routing'];
      isNewBend: boolean;
      moved: boolean;
    };

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pointsEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
}

export class InteractionController {
  private mode: DiagramMode;
  private readonlySelectable: boolean;
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
    readonlySelectable = true,
  ) {
    this.mode = initialMode;
    this.readonlySelectable = readonlySelectable;
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
      this.abortDrag();
      this.draftEdge = null;
      this.snapLines = [];
      this.hoveredNodeId = null;
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
    this.abortDrag();
    this.closeInlineEditor(false);
    const svg = this.renderer.svg;
    svg.removeEventListener('pointerdown', this.onPointerDown);
    svg.removeEventListener('selectstart', this.onSelectStart);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onWindowBlur);
    svg.removeEventListener('wheel', this.onWheel);
    svg.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private bindEvents(): void {
    const svg = this.renderer.svg;
    svg.addEventListener('pointerdown', this.onPointerDown);
    svg.addEventListener('selectstart', this.onSelectStart);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onWindowBlur);
    svg.addEventListener('wheel', this.onWheel, { passive: false });
    svg.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onSelectStart = (e: Event): void => {
    e.preventDefault();
  };

  private redraw(): void {
    this.renderer.render(this.engine.getDocument(), this.getRenderState());
  }

  private emitSelection(): void {
    const sel = this.getSelection();
    for (const l of this.selectionListeners) l(sel);
  }

  private isSvgVisible(): boolean {
    const svg = this.renderer.svg;
    if (!svg.isConnected) return false;
    const rect = svg.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private findNodeAt(world: Point, margin = 0): DiagramNode | null {
    const nodes = this.engine.getDocument().nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (
        world.x >= n.geometry.x - margin &&
        world.x <= n.geometry.x + n.geometry.width + margin &&
        world.y >= n.geometry.y - margin &&
        world.y <= n.geometry.y + n.geometry.height + margin
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

  private computeBendInsertIndex(edge: DiagramEdge, src: DiagramNode, tgt: DiagramNode, world: Point): number {
    // Compare against the logical chain [srcCenter, ...edge.bends, tgtCenter]
    // so orthogonal synthetic corners don't skew the insertion index.
    const chain: Point[] = [
      { x: src.geometry.x + src.geometry.width / 2, y: src.geometry.y + src.geometry.height / 2 },
      ...edge.bends,
      { x: tgt.geometry.x + tgt.geometry.width / 2, y: tgt.geometry.y + tgt.geometry.height / 2 },
    ];
    let bestSeg = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chain.length - 1; i++) {
      const d = distToSegment(world, chain[i], chain[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = i;
      }
    }
    return Math.min(bestSeg, edge.bends.length);
  }

  private abortDrag(): void {
    const session = this.drag;
    if (!session) return;
    this.drag = null;
    this.snapLines = [];
    this.draftEdge = null;

    if (session.kind === 'move-nodes') {
      for (const [id, orig] of session.origins.entries()) {
        const n = this.engine.getNode(id);
        if (n) {
          n.geometry.x = orig.x;
          n.geometry.y = orig.y;
        }
      }
      this.redraw();
    } else if (session.kind === 'resize-node') {
      const n = this.engine.getNode(session.nodeId);
      if (n) {
        n.geometry = { ...n.geometry, ...session.orig };
      }
      this.redraw();
    } else if (session.kind === 'move-bend') {
      const edge = this.engine.getEdge(session.edgeId);
      if (edge) {
        edge.bends = session.origBends;
        edge.routing = session.origRouting;
      }
      this.redraw();
    } else if (session.kind === 'create-edge') {
      this.redraw();
    }
  }

  private onPointerCancel = (): void => {
    this.abortDrag();
  };

  private onWindowBlur = (): void => {
    this.abortDrag();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    // Prevent native browser text selection when clicking, dragging, or double-clicking shapes
    e.preventDefault();
    this.closeInlineEditor(true);
    this.renderer.svg.focus({ preventScroll: true });

    const target = e.target as Element | null;
    const doc = this.engine.getDocument();
    const world = this.renderer.screenToWorld(e.clientX, e.clientY, doc);

    // Middle mouse => pan
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
    const resizeEl = target?.closest('[data-resize-node-id]') as Element | null;
    const resizeNodeId = resizeEl?.getAttribute('data-resize-node-id');
    const resizeDir = resizeEl?.getAttribute('data-resize-dir');
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
          moved: false,
        };
      }
      return;
    }

    // 2. Port handle => start edge creation (checked BEFORE node hit!)
    const portEl = target?.closest('[data-port-node-id]') as Element | null;
    const portNodeId = portEl?.getAttribute('data-port-node-id');
    if (this.mode === 'editor' && portNodeId) {
      this.drag = { kind: 'create-edge', fromNodeId: portNodeId };
      this.draftEdge = { fromNodeId: portNodeId, toPoint: world, targetNodeId: null };
      this.redraw();
      return;
    }

    // 3. Bend handle => move existing bend
    const bendEl = target?.closest('[data-bend-edge-id]') as Element | null;
    const bendEdgeId = bendEl?.getAttribute('data-bend-edge-id');
    const bendIdxAttr = bendEl?.getAttribute('data-bend-index');
    if (this.mode === 'editor' && bendEdgeId && bendIdxAttr !== null && bendIdxAttr !== undefined) {
      const edge = this.engine.getEdge(bendEdgeId);
      if (edge) {
        this.drag = {
          kind: 'move-bend',
          edgeId: edge.id,
          bendIndex: Number(bendIdxAttr),
          origBends: structuredClone(edge.bends),
          origRouting: edge.routing,
          isNewBend: false,
          moved: false,
        };
      }
      return;
    }

    // 4. Node hit
    const nodeGroup = target?.closest('[data-node-id]') as Element | null;
    const nodeId = nodeGroup?.getAttribute('data-node-id');
    if (nodeId) {
      if (this.mode === 'editor' && this.tool === 'edge') {
        this.drag = { kind: 'create-edge', fromNodeId: nodeId };
        this.draftEdge = { fromNodeId: nodeId, toPoint: world, targetNodeId: null };
        this.redraw();
        return;
      }

      if (this.mode === 'readonly' && !this.readonlySelectable) {
        this.drag = {
          kind: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          origVpX: doc.viewport.x,
          origVpY: doc.viewport.y,
        };
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

    // 5. Edge hit (select OR yEd-style drag >4px to insert bend)
    const edgeHitEl = target?.closest('[data-edge-hit-id]') as Element | null;
    const edgeHitId = edgeHitEl?.getAttribute('data-edge-hit-id');
    if (edgeHitId) {
      if (this.mode === 'readonly' && !this.readonlySelectable) {
        this.drag = {
          kind: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          origVpX: doc.viewport.x,
          origVpY: doc.viewport.y,
        };
        return;
      }

      const wasSelected = this.selectedEdgeIds.has(edgeHitId);
      if (!wasSelected) {
        this.selectedNodeIds.clear();
        this.selectedEdgeIds = new Set([edgeHitId]);
        this.emitSelection();
        this.redraw();
      }

      if (this.mode === 'editor' && wasSelected) {
        const edge = this.engine.getEdge(edgeHitId);
        if (edge) {
          const src = this.engine.getNode(edge.source.nodeId);
          const tgt = this.engine.getNode(edge.target.nodeId);
          if (src && tgt) {
            const insertIndex = this.computeBendInsertIndex(edge, src, tgt, world);
            this.drag = {
              kind: 'pending-bend',
              edgeId: edge.id,
              startClientX: e.clientX,
              startClientY: e.clientY,
              insertIndex,
              origBends: structuredClone(edge.bends),
              origRouting: edge.routing,
            };
          }
        }
      }
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
      if (this.mode === 'editor' && this.isSvgVisible()) {
        const target = e.target as Element | null;
        const portNodeId = target?.closest?.('[data-port-node-id]')?.getAttribute('data-port-node-id');
        // Include port-radius margin so hovering onto a port circle never clears hoveredNodeId
        const hoverMargin = 9 / Math.max(0.15, doc.viewport.zoom);
        const hovered = portNodeId ?? this.findNodeAt(world, hoverMargin)?.id ?? null;
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
        if (!this.drag.moved && Math.hypot(dx, dy) < 1) break;
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

        // Update positions live directly for 60fps preview; commit atomically on pointerup.
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

        if (x !== o.x || y !== o.y || width !== o.width || height !== o.height) {
          this.drag.moved = true;
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

      case 'pending-bend': {
        // Require > 4px drag threshold before inserting a new bend point
        const dist = Math.hypot(e.clientX - this.drag.startClientX, e.clientY - this.drag.startClientY);
        if (dist < 4) break;
        const edge = this.engine.getEdge(this.drag.edgeId);
        if (!edge) break;

        const pt: Point = {
          x: this.snap(world.x, bypassSnap),
          y: this.snap(world.y, bypassSnap),
        };
        const nextBends = [...this.drag.origBends];
        nextBends.splice(this.drag.insertIndex, 0, pt);
        edge.bends = nextBends;
        if (edge.routing === 'straight') {
          edge.routing = 'polyline';
        }
        this.drag = {
          kind: 'move-bend',
          edgeId: edge.id,
          bendIndex: this.drag.insertIndex,
          origBends: this.drag.origBends,
          origRouting: this.drag.origRouting,
          isNewBend: true,
          moved: true,
        };
        this.redraw();
        break;
      }

      case 'move-bend': {
        const edge = this.engine.getEdge(this.drag.edgeId);
        if (!edge || !edge.bends[this.drag.bendIndex]) return;
        const nextPt = {
          x: this.snap(world.x, bypassSnap),
          y: this.snap(world.y, bypassSnap),
        };
        const cur = edge.bends[this.drag.bendIndex];
        if (cur.x !== nextPt.x || cur.y !== nextPt.y) {
          this.drag.moved = true;
          edge.bends[this.drag.bendIndex] = nextPt;
          this.redraw();
        }
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
        if (!session.moved) break;
        const finals = new Map<string, Point>();
        let anyChanged = false;
        for (const [id, orig] of session.origins.entries()) {
          const n = this.engine.getNode(id);
          if (n) {
            if (n.geometry.x !== orig.x || n.geometry.y !== orig.y) anyChanged = true;
            finals.set(id, { x: n.geometry.x, y: n.geometry.y });
            n.geometry.x = orig.x;
            n.geometry.y = orig.y;
          }
        }
        if (anyChanged) {
          const commands: DiagramCommand[] = [];
          for (const [id, pt] of finals.entries()) {
            commands.push({ type: 'node.update', id, patch: { geometry: { x: pt.x, y: pt.y } } });
          }
          this.engine.execute({ type: 'batch', commands, label: 'Move nodes' });
        }
        break;
      }

      case 'resize-node': {
        if (!session.moved) break;
        const n = this.engine.getNode(session.nodeId);
        if (n) {
          const finalGeo = { ...n.geometry };
          n.geometry = { ...n.geometry, ...session.orig };
          if (
            finalGeo.x !== session.orig.x ||
            finalGeo.y !== session.orig.y ||
            finalGeo.width !== session.orig.width ||
            finalGeo.height !== session.orig.height
          ) {
            this.engine.execute({
              type: 'node.update',
              id: session.nodeId,
              patch: { geometry: finalGeo },
            });
          }
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

      case 'pending-bend': {
        // Click without dragging (>4px): do nothing so double-click label editing works cleanly
        break;
      }

      case 'move-bend': {
        if (!session.moved && !session.isNewBend) break;
        const edge = this.engine.getEdge(session.edgeId);
        if (edge) {
          const finalBends = structuredClone(edge.bends);
          const finalRouting = edge.routing;
          edge.bends = session.origBends;
          edge.routing = session.origRouting;
          if (!pointsEqual(finalBends, session.origBends) || finalRouting !== session.origRouting) {
            this.engine.execute({
              type: 'edge.update',
              id: session.edgeId,
              patch: {
                routing: finalRouting,
                bends: finalBends,
              },
            });
          }
        }
        break;
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.closeInlineEditor(true);
    const doc = this.engine.getDocument();
    const rect = this.renderer.svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Smooth exponential zoom for both mouse wheels and macOS trackpads
    const clampedDelta = Math.max(-120, Math.min(120, e.deltaY));
    const zoomFactor = Math.exp(-clampedDelta * 0.0022);
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
    const target = e.target as Element | null;

    // 1. Double-click bend handle => remove bend (yEd behavior!)
    const bendEl = target?.closest('[data-bend-edge-id]') as Element | null;
    const bendEdgeId = bendEl?.getAttribute('data-bend-edge-id');
    const bendIdxAttr = bendEl?.getAttribute('data-bend-index');
    if (bendEdgeId && bendIdxAttr !== null && bendIdxAttr !== undefined) {
      const edge = this.engine.getEdge(bendEdgeId);
      if (edge) {
        const idx = Number(bendIdxAttr);
        const nextBends = edge.bends.filter((_, i) => i !== idx);
        this.engine.execute({ type: 'edge.update', id: edge.id, patch: { bends: nextBends } });
      }
      return;
    }

    // Proximity fallback for bend handle double-click on selected edges
    const doc = this.engine.getDocument();
    const world = this.renderer.screenToWorld(e.clientX, e.clientY, doc);
    const bendHitRadius = 10 / Math.max(0.15, doc.viewport.zoom);
    for (const selEdgeId of this.selectedEdgeIds) {
      const edge = this.engine.getEdge(selEdgeId);
      if (!edge) continue;
      const idx = edge.bends.findIndex((b) => Math.hypot(b.x - world.x, b.y - world.y) <= bendHitRadius);
      if (idx >= 0) {
        const nextBends = edge.bends.filter((_, i) => i !== idx);
        this.engine.execute({ type: 'edge.update', id: edge.id, patch: { bends: nextBends } });
        return;
      }
    }

    // 2. Double-click node => edit label
    const nodeGroup = target?.closest('[data-node-id]') as Element | null;
    const nodeId = nodeGroup?.getAttribute('data-node-id');
    if (nodeId) {
      this.openInlineLabelEditor('node', nodeId);
      return;
    }

    // 3. Double-click edge => edit edge label
    const edgeHitEl = target?.closest('[data-edge-hit-id]') as Element | null;
    const edgeHitId = edgeHitEl?.getAttribute('data-edge-hit-id');
    if (edgeHitId) {
      this.openInlineLabelEditor('edge', edgeHitId);
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'editor' || !this.isSvgVisible()) return;
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        (active as HTMLElement).isContentEditable)
    ) {
      return;
    }
    // If another Diagrav canvas is explicitly focused, don't hijack its shortcuts
    if (active && active.classList.contains('diagrav-svg') && active !== this.renderer.svg) {
      return;
    }

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    // Undo / Redo (Cmd+Z / Cmd+Shift+Z / Ctrl+Y)
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.engine.redo();
      else this.engine.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.engine.redo();
      return;
    }

    // Select All (Cmd+A)
    if (mod && key === 'a') {
      e.preventDefault();
      const doc = this.engine.getDocument();
      this.selectNodes(doc.nodes.map((n) => n.id));
      return;
    }

    // Duplicate selected nodes (Cmd+D)
    if (mod && key === 'd' && this.selectedNodeIds.size > 0) {
      e.preventDefault();
      const commands: DiagramCommand[] = [];
      const newIds: string[] = [];
      for (const id of this.selectedNodeIds) {
        const orig = this.engine.getNode(id);
        if (!orig) continue;
        const copy = structuredClone(orig);
        copy.id = generateId('node');
        copy.geometry.x += 24;
        copy.geometry.y += 24;
        copy.labels = copy.labels.map((l) => ({ ...l, id: generateId('lbl') }));
        commands.push({ type: 'node.create', node: copy });
        newIds.push(copy.id);
      }
      if (commands.length > 0) {
        this.engine.execute({ type: 'batch', commands, label: 'Duplicate nodes' });
        this.selectNodes(newIds);
      }
      return;
    }

    // Arrow key nudge for selected nodes
    if (
      this.selectedNodeIds.size > 0 &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      const step = e.shiftKey ? 1 : this.gridSize;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const commands: DiagramCommand[] = [];
      for (const id of this.selectedNodeIds) {
        const n = this.engine.getNode(id);
        if (n) {
          commands.push({
            type: 'node.update',
            id,
            patch: { geometry: { x: n.geometry.x + dx, y: n.geometry.y + dy } },
          });
        }
      }
      if (commands.length > 0) {
        this.engine.execute({ type: 'batch', commands, label: 'Nudge nodes' });
      }
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

    // Escape => cancel draft / clear selection
    if (e.key === 'Escape') {
      this.abortDrag();
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
    if (this.mode !== 'editor') return;
    this.closeInlineEditor(true);
    const doc = this.engine.getDocument();
    let worldPos: Point;
    let initialText = '';

    if (kind === 'node') {
      const node = this.engine.getNode(id);
      if (!node) return;
      const existing = node.labels[0];
      if (existing) {
        const pos = computeNodeLabelPosition(node, existing);
        worldPos = { x: pos.x, y: pos.y };
        initialText = existing.text;
      } else {
        worldPos = {
          x: node.geometry.x + node.geometry.width / 2,
          y: node.geometry.y + node.geometry.height / 2,
        };
      }
    } else {
      const edge = this.engine.getEdge(id);
      if (!edge) return;
      const src = this.engine.getNode(edge.source.nodeId);
      const tgt = this.engine.getNode(edge.target.nodeId);
      if (!src || !tgt) return;
      const routed = this.routers.get(edge.routing).route(src, tgt, edge, this.shapes);
      const existing = edge.labels[0];
      if (existing) {
        const pos = computeEdgeLabelPosition(routed.points, existing);
        worldPos = { x: pos.x, y: pos.y };
        initialText = existing.text;
      } else {
        worldPos = pointAlongPolyline(routed.points, 0.5).point;
      }
    }

    const screen = this.renderer.worldToScreen(worldPos, doc);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialText;
    input.style.position = 'fixed';
    input.style.left = `${screen.x - 80}px`;
    input.style.top = `${screen.y - 15}px`;
    input.style.width = '160px';
    input.style.height = '30px';
    input.style.padding = '2px 8px';
    input.style.fontSize = '13px';
    input.style.textAlign = 'center';
    input.style.border = '2px solid var(--j-accent, #2563eb)';
    input.style.borderRadius = '6px';
    input.style.background = 'var(--j-surface-1, #ffffff)';
    input.style.color = 'var(--j-fg, #0f172a)';
    input.style.outline = 'none';
    input.style.zIndex = '9999';
    input.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.18)';

    const commit = () => {
      const text = input.value;
      if (text === initialText) return;
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
