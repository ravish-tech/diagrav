import {
  CommandEngine,
  type EngineListener,
  type ExecuteOptions,
  type HistoryListener,
} from './commands/engine.js';
import type { CommandResult, DiagramCommand } from './commands/types.js';
import {
  createAlignNodesCommand,
  createDistributeNodesCommand,
  createMatchSizeCommand,
  type NodeAlignment,
  type NodeDistribution,
  type NodeMatchSize,
} from './layout/alignment.js';
import { EdgeRouterRegistry } from './registries/edges.js';
import { ShapeRegistry } from './registries/shapes.js';
import {
  InteractionController,
  type SelectionListener,
  type SelectionState,
} from './renderer/interaction.js';
import { SvgRenderer } from './renderer/svg-renderer.js';
import type {
  DiagramDocument,
  DiagramMode,
  EditorTool,
  Point,
} from './schema/types.js';

export interface DiagravOptions {
  container: HTMLElement;
  document?: DiagramDocument;
  mode?: DiagramMode;
  /** Whether clicking elements selects them in readonly mode (default: true). */
  readonlySelectable?: boolean;
  shapes?: ShapeRegistry;
  routers?: EdgeRouterRegistry;
}

/**
 * Main mountable Diagrav engine instance.
 * Supports both `readonly` (embeddable viewer) and `editor` (full yEd-style editor) modes.
 */
export class Diagrav {
  readonly engine: CommandEngine;
  readonly shapes: ShapeRegistry;
  readonly routers: EdgeRouterRegistry;
  readonly renderer: SvgRenderer;
  readonly interaction: InteractionController;
  private unsubChange: () => void;
  private lastDocRef: DiagramDocument;

  constructor(options: DiagravOptions) {
    this.shapes = options.shapes ?? new ShapeRegistry();
    this.routers = options.routers ?? new EdgeRouterRegistry();
    this.engine = new CommandEngine(options.document);
    this.renderer = new SvgRenderer(options.container, this.shapes, this.routers);
    this.interaction = new InteractionController(
      this.engine,
      this.renderer,
      this.shapes,
      this.routers,
      options.mode ?? 'editor',
      options.readonlySelectable ?? true,
    );

    this.lastDocRef = this.engine.getDocument();
    this.unsubChange = this.engine.onChange((doc) => {
      const state = this.interaction.getRenderState();
      const prev = this.lastDocRef;
      this.lastDocRef = doc;
      // Fast-path viewport-only pan updates (and zoom in readonly mode, which has no handles)
      const viewportOnly = doc.nodes === prev.nodes && doc.edges === prev.edges;
      if (viewportOnly && (doc.viewport.zoom === prev.viewport.zoom || state.mode === 'readonly')) {
        this.renderer.updateViewport(doc, state);
      } else {
        this.renderer.render(doc, state);
      }
    });

    this.renderer.render(this.lastDocRef, this.interaction.getRenderState());
  }

  execute(command: DiagramCommand, options?: ExecuteOptions): CommandResult {
    return this.engine.execute(command, options);
  }

  getDocument(): DiagramDocument {
    return this.engine.getDocument();
  }

  loadDocument(doc: DiagramDocument): CommandResult {
    this.interaction.clearSelection();
    return this.engine.execute({ type: 'document.load', document: doc });
  }

  undo(): boolean {
    return this.engine.undo();
  }

  redo(): boolean {
    return this.engine.redo();
  }

  setMode(mode: DiagramMode): void {
    this.interaction.setMode(mode);
  }

  getMode(): DiagramMode {
    return this.interaction.getMode();
  }

  setTool(tool: EditorTool): void {
    this.interaction.setTool(tool);
  }

  getTool(): EditorTool {
    return this.interaction.getTool();
  }

  setShowGrid(show: boolean): void {
    this.interaction.setShowGrid(show);
  }

  setSnapToGrid(snap: boolean): void {
    this.interaction.setSnapToGrid(snap);
  }

  getSelection(): SelectionState {
    return this.interaction.getSelection();
  }

  alignSelected(alignment: NodeAlignment): boolean {
    const cmd = createAlignNodesCommand(
      this.engine.getDocument(),
      this.interaction.getSelection().nodeIds,
      alignment,
    );
    if (!cmd) return false;
    return this.engine.execute(cmd).ok;
  }

  distributeSelected(mode: NodeDistribution): boolean {
    const cmd = createDistributeNodesCommand(
      this.engine.getDocument(),
      this.interaction.getSelection().nodeIds,
      mode,
    );
    if (!cmd) return false;
    return this.engine.execute(cmd).ok;
  }

  matchSizeSelected(mode: NodeMatchSize): boolean {
    const cmd = createMatchSizeCommand(
      this.engine.getDocument(),
      this.interaction.getSelection().nodeIds,
      mode,
    );
    if (!cmd) return false;
    return this.engine.execute(cmd).ok;
  }

  screenToWorld(clientX: number, clientY: number): Point {
    return this.renderer.screenToWorld(clientX, clientY, this.engine.getDocument());
  }

  getViewportCenterWorld(): Point {
    const rect = this.renderer.svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return this.renderer.screenToWorld(cx, cy, this.engine.getDocument());
  }

  fitToView(padding = 48): void {
    const rect = this.renderer.svg.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const doc = this.engine.getDocument();
    if (doc.nodes.length === 0) {
      this.engine.execute({
        type: 'viewport.set',
        viewport: { x: 0, y: 0, zoom: 1 },
        recordHistory: false,
      });
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of doc.nodes) {
      minX = Math.min(minX, n.geometry.x);
      minY = Math.min(minY, n.geometry.y);
      maxX = Math.max(maxX, n.geometry.x + n.geometry.width);
      maxY = Math.max(maxY, n.geometry.y + n.geometry.height);
    }
    for (const e of doc.edges) {
      for (const b of e.bends) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x);
        maxY = Math.max(maxY, b.y);
      }
    }

    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const availW = Math.max(1, rect.width - padding * 2);
    const availH = Math.max(1, rect.height - padding * 2);
    const zoom = Math.max(0.2, Math.min(1.25, Math.min(availW / contentW, availH / contentH)));
    const x = (rect.width - contentW * zoom) / 2 - minX * zoom;
    const y = (rect.height - contentH * zoom) / 2 - minY * zoom;

    this.engine.execute({
      type: 'viewport.set',
      viewport: { x, y, zoom },
      recordHistory: false,
    });
  }

  exportSvg(): string {
    return this.renderer.exportSvg(this.engine.getDocument());
  }

  onChange(listener: EngineListener): () => void {
    return this.engine.onChange(listener);
  }

  onHistoryChange(listener: HistoryListener): () => void {
    return this.engine.onHistoryChange(listener);
  }

  onSelectionChange(listener: SelectionListener): () => void {
    return this.interaction.onSelectionChange(listener);
  }

  destroy(): void {
    this.unsubChange();
    this.interaction.destroy();
    this.renderer.destroy();
  }
}
