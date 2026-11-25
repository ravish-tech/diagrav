import type { DiagramCommand } from '../commands/types.js';
import type { DiagramDocument, DiagramNode } from '../schema/types.js';

export type AutoLayoutAlgorithm = 'hierarchical-lr' | 'hierarchical-tb' | 'grid';

export interface AutoLayoutOptions {
  /** Horizontal gap between layers or grid columns (default: 72). */
  gapX?: number;
  /** Vertical gap between sibling nodes or grid rows (default: 48). */
  gapY?: number;
  /** Origin offset X (default: 60). */
  originX?: number;
  /** Origin offset Y (default: 60). */
  originY?: number;
}

/**
 * Computes topological layer ranks for directed graphs (cycle-safe via Kahn + fallback).
 */
function assignLayers(doc: DiagramDocument, nodes: DiagramNode[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outgoing.set(n.id, []);
  }

  for (const e of doc.edges) {
    if (!nodeIds.has(e.source.nodeId) || !nodeIds.has(e.target.nodeId)) continue;
    if (e.source.nodeId === e.target.nodeId) continue;
    outgoing.get(e.source.nodeId)!.push(e.target.nodeId);
    inDegree.set(e.target.nodeId, (inDegree.get(e.target.nodeId) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      rank.set(n.id, 0);
      queue.push(n.id);
    }
  }

  // If the graph is purely cyclic (no zero-in-degree nodes), seed with the first node
  if (queue.length === 0 && nodes.length > 0) {
    rank.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited.add(id);
    const curRank = rank.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      const nextRank = Math.max(rank.get(next) ?? 0, curRank + 1);
      rank.set(next, nextRank);
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg <= 0 && !visited.has(next)) {
        queue.push(next);
      }
    }
  }

  // Assign any remaining unvisited cycle nodes
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, 0);
  }

  return rank;
}

/**
 * Generates an undoable batch command that lays out diagram nodes cleanly.
 * Works identically in browser Studio and headless `@diagrav/mcp`.
 */
export function createAutoLayoutCommand(
  doc: DiagramDocument,
  algorithm: AutoLayoutAlgorithm,
  options: AutoLayoutOptions = {},
): DiagramCommand | null {
  const nodes = doc.nodes;
  if (nodes.length === 0) return null;

  const gapX = options.gapX ?? 72;
  const gapY = options.gapY ?? 48;
  const originX = options.originX ?? 60;
  const originY = options.originY ?? 60;

  const targetPositions = new Map<string, { x: number; y: number }>();

  if (algorithm === 'grid') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const maxW = Math.max(...nodes.map((n) => n.geometry.width));
    const maxH = Math.max(...nodes.map((n) => n.geometry.height));
    nodes.forEach((n, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cellX = originX + col * (maxW + gapX);
      const cellY = originY + row * (maxH + gapY);
      targetPositions.set(n.id, {
        x: Math.round(cellX + (maxW - n.geometry.width) / 2),
        y: Math.round(cellY + (maxH - n.geometry.height) / 2),
      });
    });
  } else {
    const ranks = assignLayers(doc, nodes);
    const layers = new Map<number, DiagramNode[]>();
    for (const n of nodes) {
      const r = ranks.get(n.id) ?? 0;
      const list = layers.get(r) ?? [];
      list.push(n);
      layers.set(r, list);
    }

    const sortedRanks = Array.from(layers.keys()).sort((a, b) => a - b);

    if (algorithm === 'hierarchical-lr') {
      // Compute total height per layer so layers center vertically against the tallest layer
      const layerMeta = sortedRanks.map((r) => {
        const list = layers.get(r)!;
        const maxW = Math.max(...list.map((n) => n.geometry.width));
        const totalH =
          list.reduce((acc, n) => acc + n.geometry.height, 0) + Math.max(0, list.length - 1) * gapY;
        return { list, maxW, totalH };
      });
      const maxTotalH = Math.max(...layerMeta.map((m) => m.totalH));

      let cursorX = originX;
      for (const m of layerMeta) {
        let cursorY = originY + (maxTotalH - m.totalH) / 2;
        for (const n of m.list) {
          targetPositions.set(n.id, {
            x: Math.round(cursorX + (m.maxW - n.geometry.width) / 2),
            y: Math.round(cursorY),
          });
          cursorY += n.geometry.height + gapY;
        }
        cursorX += m.maxW + gapX;
      }
    } else {
      // hierarchical-tb
      const layerMeta = sortedRanks.map((r) => {
        const list = layers.get(r)!;
        const maxH = Math.max(...list.map((n) => n.geometry.height));
        const totalW =
          list.reduce((acc, n) => acc + n.geometry.width, 0) + Math.max(0, list.length - 1) * gapX;
        return { list, maxH, totalW };
      });
      const maxTotalW = Math.max(...layerMeta.map((m) => m.totalW));

      let cursorY = originY;
      for (const m of layerMeta) {
        let cursorX = originX + (maxTotalW - m.totalW) / 2;
        for (const n of m.list) {
          targetPositions.set(n.id, {
            x: Math.round(cursorX),
            y: Math.round(cursorY + (m.maxH - n.geometry.height) / 2),
          });
          cursorX += n.geometry.width + gapX;
        }
        cursorY += m.maxH + gapY;
      }
    }
  }

  const commands: DiagramCommand[] = [];
  for (const n of nodes) {
    const pos = targetPositions.get(n.id);
    if (pos && (pos.x !== n.geometry.x || pos.y !== n.geometry.y)) {
      commands.push({ type: 'node.update', id: n.id, patch: { geometry: pos } });
    }
  }
  // Reset manual edge bends on auto-layout so connections route cleanly
  for (const e of doc.edges) {
    if (e.bends.length > 0) {
      commands.push({ type: 'edge.update', id: e.id, patch: { bends: [] } });
    }
  }

  if (commands.length === 0) return null;
  return { type: 'batch', commands, label: `Auto-layout (${algorithm})` };
}
