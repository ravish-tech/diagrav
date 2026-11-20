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
