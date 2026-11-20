import { CommandEngine, type EngineListener, type HistoryListener } from './commands/engine.js';
import type { CommandResult, DiagramCommand } from './commands/types.js';
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
    );

    this.unsubChange = this.engine.onChange((doc) => {
      this.renderer.render(doc, this.interaction.getRenderState());
    });

    this.renderer.render(this.engine.getDocument(), this.interaction.getRenderState());
  }

  execute(command: DiagramCommand): CommandResult {
    return this.engine.execute(command);
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

  screenToWorld(clientX: number, clientY: number): Point {
    return this.renderer.screenToWorld(clientX, clientY, this.engine.getDocument());
  }

  fitToView(padding = 48): void {
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

    const rect = this.renderer.svg.getBoundingClientRect();
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const availW = Math.max(1, rect.width - padding * 2);
    const availH = Math.max(1, rect.height - padding * 2);
    const zoom = Math.max(0.2, Math.min(1.5, Math.min(availW / contentW, availH / contentH)));
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
