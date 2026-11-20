import type {
  DiagramLabel,
  DiagramNode,
  EdgeLabelPlacement,
  NodeLabelPlacement,
  Point,
} from '../schema/types.js';
import { pointAlongPolyline } from './edges.js';

export interface ComputedLabelPosition {
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  dominantBaseline: 'central' | 'hanging' | 'auto';
}

export function computeNodeLabelPosition(
  node: DiagramNode,
  label: DiagramLabel<NodeLabelPlacement>,
): ComputedLabelPosition {
  const { x, y, width: w, height: h } = node.geometry;
  const { model, position, offset } = label.placement;
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;
  const pad = label.style.padding ?? 8;

  if (model === 'free') {
    return {
      x: x + w / 2 + ox,
      y: y + h / 2 + oy,
      textAnchor: 'middle',
      dominantBaseline: 'central',
    };
  }

  const isExt = model === 'external';
  let lx = x + w / 2;
  let ly = y + h / 2;
  let textAnchor: 'start' | 'middle' | 'end' = 'middle';
  let dominantBaseline: 'central' | 'hanging' | 'auto' = 'central';

  switch (position) {
    case 'center':
      lx = x + w / 2;
      ly = y + h / 2;
      break;
    case 'top':
      lx = x + w / 2;
      ly = isExt ? y - pad : y + pad;
      dominantBaseline = isExt ? 'auto' : 'hanging';
      break;
    case 'bottom':
      lx = x + w / 2;
      ly = isExt ? y + h + pad : y + h - pad;
      dominantBaseline = isExt ? 'hanging' : 'auto';
      break;
    case 'left':
      lx = isExt ? x - pad : x + pad;
      ly = y + h / 2;
      textAnchor = isExt ? 'end' : 'start';
      break;
    case 'right':
      lx = isExt ? x + w + pad : x + w - pad;
      ly = y + h / 2;
      textAnchor = isExt ? 'start' : 'end';
      break;
    case 'top-left':
      lx = isExt ? x - pad : x + pad;
      ly = isExt ? y - pad : y + pad;
      textAnchor = isExt ? 'end' : 'start';
      dominantBaseline = isExt ? 'auto' : 'hanging';
      break;
    case 'top-right':
      lx = isExt ? x + w + pad : x + w - pad;
      ly = isExt ? y - pad : y + pad;
      textAnchor = isExt ? 'start' : 'end';
      dominantBaseline = isExt ? 'auto' : 'hanging';
      break;
    case 'bottom-left':
      lx = isExt ? x - pad : x + pad;
      ly = isExt ? y + h + pad : y + h - pad;
      textAnchor = isExt ? 'end' : 'start';
      dominantBaseline = isExt ? 'hanging' : 'auto';
      break;
    case 'bottom-right':
      lx = isExt ? x + w + pad : x + w - pad;
      ly = isExt ? y + h + pad : y + h - pad;
      textAnchor = isExt ? 'start' : 'end';
      dominantBaseline = isExt ? 'hanging' : 'auto';
      break;
  }

  return {
    x: lx + ox,
    y: ly + oy,
    textAnchor,
    dominantBaseline,
  };
}

export function computeEdgeLabelPosition(
  points: Point[],
  label: DiagramLabel<EdgeLabelPlacement>,
): ComputedLabelPosition {
  const { model, ratio, distance = -10, offset } = label.placement;
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;

  let t = 0.5;
  if (model === 'source') t = 0.15;
  else if (model === 'target') t = 0.85;
  else if (model === 'ratio') t = ratio ?? 0.5;

  const { point, normal } = pointAlongPolyline(points, t);

  if (model === 'free') {
    return {
      x: point.x + ox,
      y: point.y + oy,
      textAnchor: 'middle',
      dominantBaseline: 'central',
    };
  }

  return {
    x: point.x + normal.x * distance + ox,
    y: point.y + normal.y * distance + oy,
    textAnchor: 'middle',
    dominantBaseline: 'central',
  };
}

/**
 * Resolves a dragged node label world position into either a snapped canonical
 * internal/external slot or a free offset relative to the node center.
 */
export function resolveNodeLabelDrop(
  node: DiagramNode,
  label: DiagramLabel<NodeLabelPlacement>,
  worldPt: Point,
  snapThreshold = 10,
): NodeLabelPlacement {
  const candidates: Array<{ model: 'internal' | 'external'; position: NodeLabelPlacement['position'] }> = [
    { model: 'internal', position: 'center' },
    { model: 'internal', position: 'top' },
    { model: 'internal', position: 'bottom' },
    { model: 'internal', position: 'left' },
    { model: 'internal', position: 'right' },
    { model: 'external', position: 'top' },
    { model: 'external', position: 'bottom' },
    { model: 'external', position: 'left' },
    { model: 'external', position: 'right' },
  ];

  let best: NodeLabelPlacement | null = null;
  let bestDist = snapThreshold + 0.001;

  for (const cand of candidates) {
    const pos = computeNodeLabelPosition(node, { ...label, placement: cand });
    const d = Math.hypot(worldPt.x - pos.x, worldPt.y - pos.y);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }

  if (best) return best;

  const cx = node.geometry.x + node.geometry.width / 2;
  const cy = node.geometry.y + node.geometry.height / 2;
  return {
    model: 'free',
    position: 'center',
    offset: {
      x: Math.round(worldPt.x - cx),
      y: Math.round(worldPt.y - cy),
    },
  };
}

/**
 * Projects a dragged edge label world position onto the routed edge polyline,
 * returning an EdgeLabelPlacement (`center` or `ratio` + signed perpendicular `distance`).
 */
export function resolveEdgeLabelDrop(points: Point[], worldPt: Point): EdgeLabelPlacement {
  if (points.length < 2) {
    return { model: 'center', distance: -10 };
  }

  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLengths.push(len);
    total += len;
  }
  if (total < 1e-6) {
    return { model: 'center', distance: -10 };
  }

  let bestDistSq = Infinity;
  let bestT = 0.5;
  let bestSignedDist = -10;
  let acc = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    const a = points[i];
    const b = points[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;
    const localT = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((worldPt.x - a.x) * vx + (worldPt.y - a.y) * vy) / lenSq)) : 0;
    const projX = a.x + vx * localT;
    const projY = a.y + vy * localT;
    const dx = worldPt.x - projX;
    const dy = worldPt.y - projY;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestT = (acc + len * localT) / total;
      const nx = len > 1e-6 ? -vy / len : 0;
      const ny = len > 1e-6 ? vx / len : -1;
      bestSignedDist = dx * nx + dy * ny;
    }
    acc += len;
  }

  const clampedRatio = Math.max(0.05, Math.min(0.95, bestT));
  const roundedDist = Math.round(Math.max(-120, Math.min(120, bestSignedDist)));

  if (Math.abs(clampedRatio - 0.5) < 0.04) {
    return { model: 'center', distance: roundedDist };
  }
  return {
    model: 'ratio',
    ratio: Number(clampedRatio.toFixed(3)),
    distance: roundedDist,
  };
}
