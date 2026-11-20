import {
  CommandEngine,
  EdgeRouterRegistry,
  ShapeRegistry,
  createAlignNodesCommand,
  createDefaultEdge,
  createDefaultEdgeLabel,
  createDefaultNode,
  createDefaultNodeLabel,
  createDistributeNodesCommand,
  createEmptyDocument,
  createMatchSizeCommand,
  exportDocumentToSvg,
  validateDocument,
  type ArrowType,
  type DiagramCommand,
  type DiagramDocument,
  type EdgePatch,
  type EdgeRouting,
  type FillStyle,
  type NodeAlignment,
  type NodeDistribution,
  type NodeMatchSize,
  type NodePatch,
  type Point,
} from '@diagrav/core';
import fs from 'node:fs';
import path from 'node:path';
import type { DiagravBridgeServer } from './bridge.js';

export class DiagravMcpSession {
  readonly engine: CommandEngine;
  readonly shapes: ShapeRegistry;
  readonly routers: EdgeRouterRegistry;
  private bridge: DiagravBridgeServer | null = null;

  constructor(initialDoc?: DiagramDocument) {
    this.engine = new CommandEngine(initialDoc ?? createEmptyDocument('AI Diagram'));
    this.shapes = new ShapeRegistry();
    this.routers = new EdgeRouterRegistry();
  }

  attachBridge(bridge: DiagravBridgeServer): void {
    this.bridge = bridge;
  }

  /** Called when a connected browser Studio tab sends its current diagram state. */
  syncFromStudio(doc: DiagramDocument): void {
    this.engine.execute({ type: 'document.load', document: doc });
  }

  private runCommand(command: DiagramCommand): { ok: boolean; error?: string } {
    const res = this.engine.execute(command);
    if (res.ok) {
      this.bridge?.broadcast({ type: 'command', command });
    }
    return res;
  }

  getDiagram(summaryOnly = false): Record<string, unknown> {
    const doc = this.engine.getDocument();
    const summary = {
      title: doc.meta.title,
      schemaVersion: doc.schemaVersion,
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      liveStudioClients: this.bridge?.getClientCount() ?? 0,
      nodes: doc.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.labels[0]?.text ?? '',
        geometry: n.geometry,
      })),
      edges: doc.edges.map((e) => ({
        id: e.id,
        source: e.source.nodeId,
        target: e.target.nodeId,
        routing: e.routing,
        label: e.labels[0]?.text ?? '',
        bendsCount: e.bends.length,
      })),
    };
    return summaryOnly ? summary : { summary, document: doc };
  }

  listShapes() {
    return this.shapes.list().map((s) => ({
      type: s.type,
      label: s.label,
      category: s.category,
      defaultSize: s.defaultSize,
      defaultBorderRadius: s.defaultBorderRadius ?? 0,
    }));
  }

  createDiagram(title = 'Untitled Diagram') {
    const doc = createEmptyDocument(title);
    const res = this.runCommand({ type: 'document.load', document: doc });
    return { ...res, title };
  }

  loadDiagram(filePath: string) {
    const resolved = path.resolve(filePath);
    const raw = fs.readFileSync(resolved, 'utf8');
    const doc = validateDocument(JSON.parse(raw));
    const res = this.runCommand({ type: 'document.load', document: doc });
    return { ...res, filePath: resolved, nodeCount: doc.nodes.length, edgeCount: doc.edges.length };
  }

  saveDiagram(filePath: string) {
    const resolved = path.resolve(filePath);
    const doc = this.engine.getDocument();
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(doc, null, 2), 'utf8');
    return { ok: true, filePath: resolved, nodeCount: doc.nodes.length, edgeCount: doc.edges.length };
  }

  addNode(params: {
    id?: string;
    type?: string;
    label?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fillColor?: string;
    fill?: FillStyle;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    shadow?: boolean;
  }) {
    const shapeDef = this.shapes.get(params.type ?? 'rounded-rect');
    const node = createDefaultNode({
      id: params.id,
      type: shapeDef.type,
      labelText: params.label ?? shapeDef.label,
      geometry: {
        x: params.x ?? 100,
        y: params.y ?? 100,
        width: params.width ?? shapeDef.defaultSize.width,
        height: params.height ?? shapeDef.defaultSize.height,
      },
      style: {
        fill:
          params.fill ??
          (params.fillColor ? { type: 'solid', color: params.fillColor, opacity: 1 } : undefined),
        border: {
          color: params.borderColor ?? '#475569',
          width: params.borderWidth ?? 1.5,
          radius: params.borderRadius ?? shapeDef.defaultBorderRadius ?? 0,
          opacity: 1,
        },
        shadow: params.shadow ?? false,
      },
    });
    const res = this.runCommand({ type: 'node.create', node });
    return { ...res, node };
  }

  updateNode(id: string, patch: NodePatch) {
    return this.runCommand({ type: 'node.update', id, patch });
  }

  deleteNode(id: string) {
    return this.runCommand({ type: 'node.delete', id });
  }

  connectNodes(params: {
    id?: string;
    sourceNodeId: string;
    targetNodeId: string;
    routing?: EdgeRouting;
    label?: string;
    bends?: Point[];
    stroke?: string;
    width?: number;
    dash?: number[];
    sourceArrow?: ArrowType;
    targetArrow?: ArrowType;
  }) {
    const edge = createDefaultEdge(params.sourceNodeId, params.targetNodeId, {
      id: params.id,
      routing: params.routing ?? 'polyline',
      bends: params.bends ?? [],
      style: {
        stroke: params.stroke ?? '#475569',
        width: params.width ?? 1.75,
        dash: params.dash ?? [],
        sourceArrow: params.sourceArrow ?? 'none',
        targetArrow: params.targetArrow ?? 'standard',
      },
      labels: params.label ? [createDefaultEdgeLabel(params.label)] : [],
    });
    const res = this.runCommand({ type: 'edge.create', edge });
    return { ...res, edge };
  }

  updateEdge(id: string, patch: EdgePatch) {
    return this.runCommand({ type: 'edge.update', id, patch });
  }

  deleteEdge(id: string) {
    return this.runCommand({ type: 'edge.delete', id });
  }

  setLabel(targetKind: 'node' | 'edge', targetId: string, text: string) {
    if (targetKind === 'node') {
      const node = this.engine.getNode(targetId);
      if (!node) return { ok: false, error: `Node not found: ${targetId}` };
      const existing = node.labels[0] ?? createDefaultNodeLabel(text);
      return this.runCommand({
        type: 'label.upsert',
        targetKind: 'node',
        targetId,
        label: { ...existing, text },
      });
    }
    const edge = this.engine.getEdge(targetId);
    if (!edge) return { ok: false, error: `Edge not found: ${targetId}` };
    const existing = edge.labels[0] ?? createDefaultEdgeLabel(text);
    return this.runCommand({
      type: 'label.upsert',
      targetKind: 'edge',
      targetId,
      label: { ...existing, text },
    });
  }

  alignNodes(nodeIds: string[], alignment: NodeAlignment) {
    const cmd = createAlignNodesCommand(this.engine.getDocument(), nodeIds, alignment);
    if (!cmd) return { ok: false, error: 'Need at least 2 valid nodes to align (or already aligned)' };
    return this.runCommand(cmd);
  }

  distributeNodes(nodeIds: string[], mode: NodeDistribution) {
    const cmd = createDistributeNodesCommand(this.engine.getDocument(), nodeIds, mode);
    if (!cmd) return { ok: false, error: 'Need at least 3 valid nodes to distribute (or already distributed)' };
    return this.runCommand(cmd);
  }

  matchSize(nodeIds: string[], mode: NodeMatchSize) {
    const cmd = createMatchSizeCommand(this.engine.getDocument(), nodeIds, mode);
    if (!cmd) return { ok: false, error: 'Need at least 2 valid nodes to match size (or already matched)' };
    return this.runCommand(cmd);
  }

  applyBatch(commands: DiagramCommand[], label?: string) {
    return this.runCommand({ type: 'batch', commands, label });
  }

  undo() {
    const ok = this.engine.undo();
    if (ok) this.bridge?.broadcast({ type: 'undo' });
    return { ok, canUndo: this.engine.canUndo(), canRedo: this.engine.canRedo() };
  }

  redo() {
    const ok = this.engine.redo();
    if (ok) this.bridge?.broadcast({ type: 'redo' });
    return { ok, canUndo: this.engine.canUndo(), canRedo: this.engine.canRedo() };
  }

  exportSvg(filePath?: string) {
    const svg = exportDocumentToSvg(this.engine.getDocument(), this.shapes, this.routers);
    if (filePath) {
      const resolved = path.resolve(filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, svg, 'utf8');
      return { ok: true, filePath: resolved, bytes: Buffer.byteLength(svg, 'utf8') };
    }
    return { ok: true, svg };
  }
}
