import {
  cloneDocument,
  createEmptyDocument,
  validateDocument,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramLabel,
  type DiagramNode,
  type EdgeLabelPlacement,
  type NodeLabelPlacement,
} from '../schema/types.js';
import type { CommandResult, DiagramCommand, EdgePatch, NodePatch } from './types.js';

export type EngineListener = (doc: DiagramDocument) => void;
export type HistoryListener = (state: { canUndo: boolean; canRedo: boolean }) => void;

export interface ExecuteOptions {
  /** Coalesce rapid consecutive edits with the same key into a single Undo entry. */
  mergeKey?: string;
  /** Coalescing window in milliseconds (default: 500). */
  mergeWindowMs?: number;
}

const MAX_HISTORY = 200;

function applyNodePatch(node: DiagramNode, patch: NodePatch): DiagramNode {
  return {
    ...node,
    type: patch.type ?? node.type,
    geometry: patch.geometry ? { ...node.geometry, ...patch.geometry } : node.geometry,
    style: patch.style
      ? {
          fill: patch.style.fill ?? node.style.fill,
          border: patch.style.border
            ? { ...node.style.border, ...patch.style.border }
            : node.style.border,
          shadow: patch.style.shadow !== undefined ? patch.style.shadow : node.style.shadow,
        }
      : node.style,
    labels: patch.labels ?? node.labels,
    data: patch.data ? { ...node.data, ...patch.data } : node.data,
  };
}

function applyEdgePatch(edge: DiagramEdge, patch: EdgePatch): DiagramEdge {
  return {
    ...edge,
    source: patch.source ?? edge.source,
    target: patch.target ?? edge.target,
    routing: patch.routing ?? edge.routing,
    bends: patch.bends ?? edge.bends,
    style: patch.style ? { ...edge.style, ...patch.style } : edge.style,
    labels: patch.labels ?? edge.labels,
    data: patch.data ? { ...edge.data, ...patch.data } : edge.data,
  };
}

/**
 * Pure, framework-agnostic state & command engine.
 * Runs identically in browser and Node.js (for headless AI / MCP).
 */
export class CommandEngine {
  private doc: DiagramDocument;
  private undoStack: DiagramDocument[] = [];
  private redoStack: DiagramDocument[] = [];
  private lastMergeKey: string | null = null;
  private lastMergeTime = 0;
  private changeListeners = new Set<EngineListener>();
  private historyListeners = new Set<HistoryListener>();

  constructor(initialDoc?: DiagramDocument) {
    this.doc = initialDoc ? validateDocument(initialDoc) : createEmptyDocument();
  }

  getDocument(): DiagramDocument {
    return this.doc;
  }

  getNode(id: string): DiagramNode | undefined {
    return this.doc.nodes.find((n) => n.id === id);
  }

  getEdge(id: string): DiagramEdge | undefined {
    return this.doc.edges.find((e) => e.id === id);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  onChange(listener: EngineListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onHistoryChange(listener: HistoryListener): () => void {
    this.historyListeners.add(listener);
    return () => this.historyListeners.delete(listener);
  }

  execute(command: DiagramCommand, options?: ExecuteOptions): CommandResult {
    // Fast-path non-recorded viewport updates to avoid cloning nodes/edges on every pan/zoom frame
    if (command.type === 'viewport.set' && !command.recordHistory) {
      this.doc = {
        ...this.doc,
        viewport: { ...command.viewport },
      };
      this.emitChange();
      return { ok: true };
    }

    const recordHistory =
      command.type === 'viewport.set' ? Boolean(command.recordHistory) : true;

    const now = Date.now();
    const mergeKey = options?.mergeKey;
    const mergeWindow = options?.mergeWindowMs ?? 500;
    const shouldMerge =
      recordHistory &&
      Boolean(mergeKey) &&
      mergeKey === this.lastMergeKey &&
      now - this.lastMergeTime <= mergeWindow &&
      this.undoStack.length > 0;

    const before = recordHistory && !shouldMerge ? cloneDocument(this.doc) : null;
    const next = cloneDocument(this.doc);

    const err = this.applyToDraft(next, command);
    if (err) {
      return { ok: false, error: err };
    }

    next.meta.updatedAt = new Date().toISOString();
    this.doc = next;

    if (command.type === 'document.load') {
      this.undoStack = [];
      this.redoStack = [];
      this.lastMergeKey = null;
    } else if (shouldMerge) {
      this.lastMergeTime = now;
      this.redoStack = [];
    } else if (recordHistory && before) {
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.lastMergeKey = mergeKey ?? null;
      this.lastMergeTime = now;
    }

    this.emitChange();
    this.emitHistory();
    return { ok: true };
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.lastMergeKey = null;
    this.redoStack.push(cloneDocument(this.doc));
    this.doc = prev;
    this.emitChange();
    this.emitHistory();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.lastMergeKey = null;
    this.undoStack.push(cloneDocument(this.doc));
    this.doc = next;
    this.emitChange();
    this.emitHistory();
    return true;
  }

  private applyToDraft(draft: DiagramDocument, command: DiagramCommand): string | null {
    switch (command.type) {
      case 'node.create': {
        if (draft.nodes.some((n) => n.id === command.node.id)) {
          return `Node already exists: ${command.node.id}`;
        }
        draft.nodes.push(structuredClone(command.node));
        return null;
      }

      case 'node.update': {
        const idx = draft.nodes.findIndex((n) => n.id === command.id);
        if (idx === -1) return `Node not found: ${command.id}`;
        draft.nodes[idx] = applyNodePatch(draft.nodes[idx], command.patch);
        return null;
      }

      case 'node.delete': {
        const idx = draft.nodes.findIndex((n) => n.id === command.id);
        if (idx === -1) return `Node not found: ${command.id}`;
        draft.nodes.splice(idx, 1);
        draft.edges = draft.edges.filter(
          (e) => e.source.nodeId !== command.id && e.target.nodeId !== command.id,
        );
        return null;
      }

      case 'node.reorder': {
        const idx = draft.nodes.findIndex((n) => n.id === command.id);
        if (idx === -1) return `Node not found: ${command.id}`;
        const [node] = draft.nodes.splice(idx, 1);
        if (command.position === 'front') draft.nodes.push(node);
        else draft.nodes.unshift(node);
        return null;
      }

      case 'edge.create': {
        if (draft.edges.some((e) => e.id === command.edge.id)) {
          return `Edge already exists: ${command.edge.id}`;
        }
        const hasSource = draft.nodes.some((n) => n.id === command.edge.source.nodeId);
        const hasTarget = draft.nodes.some((n) => n.id === command.edge.target.nodeId);
        if (!hasSource || !hasTarget) {
          return `Edge references missing node(s): ${command.edge.source.nodeId} -> ${command.edge.target.nodeId}`;
        }
        draft.edges.push(structuredClone(command.edge));
        return null;
      }

      case 'edge.update': {
        const idx = draft.edges.findIndex((e) => e.id === command.id);
        if (idx === -1) return `Edge not found: ${command.id}`;
        draft.edges[idx] = applyEdgePatch(draft.edges[idx], command.patch);
        return null;
      }

      case 'edge.delete': {
        const idx = draft.edges.findIndex((e) => e.id === command.id);
        if (idx === -1) return `Edge not found: ${command.id}`;
        draft.edges.splice(idx, 1);
        return null;
      }

      case 'label.upsert': {
        if (command.targetKind === 'node') {
          const node = draft.nodes.find((n) => n.id === command.targetId);
          if (!node) return `Node not found: ${command.targetId}`;
          const lbl = structuredClone(command.label) as DiagramLabel<NodeLabelPlacement>;
          const idx = node.labels.findIndex((l) => l.id === lbl.id);
          if (idx >= 0) node.labels[idx] = lbl;
          else node.labels.push(lbl);
          return null;
        } else {
          const edge = draft.edges.find((e) => e.id === command.targetId);
          if (!edge) return `Edge not found: ${command.targetId}`;
          const lbl = structuredClone(command.label) as DiagramLabel<EdgeLabelPlacement>;
          const idx = edge.labels.findIndex((l) => l.id === lbl.id);
          if (idx >= 0) edge.labels[idx] = lbl;
          else edge.labels.push(lbl);
          return null;
        }
      }

      case 'label.delete': {
        if (command.targetKind === 'node') {
          const node = draft.nodes.find((n) => n.id === command.targetId);
          if (!node) return `Node not found: ${command.targetId}`;
          node.labels = node.labels.filter((l) => l.id !== command.labelId);
          return null;
        } else {
          const edge = draft.edges.find((e) => e.id === command.targetId);
          if (!edge) return `Edge not found: ${command.targetId}`;
          edge.labels = edge.labels.filter((l) => l.id !== command.labelId);
          return null;
        }
      }

      case 'viewport.set': {
        draft.viewport = { ...command.viewport };
        return null;
      }

      case 'document.load': {
        const validated = validateDocument(command.document);
        draft.schemaVersion = validated.schemaVersion;
        draft.meta = validated.meta;
        draft.viewport = validated.viewport;
        draft.nodes = validated.nodes;
        draft.edges = validated.edges;
        draft.extensions = validated.extensions;
        return null;
      }

      case 'batch': {
        for (const sub of command.commands) {
          const err = this.applyToDraft(draft, sub);
          if (err) return err;
        }
        return null;
      }
    }
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) {
      listener(this.doc);
    }
  }

  private emitHistory(): void {
    const state = { canUndo: this.canUndo(), canRedo: this.canRedo() };
    for (const listener of this.historyListeners) {
      listener(state);
    }
  }
}
