import type { DiagramEdge, DiagramNode, EdgeRouting, Point } from '../schema/types.js';
import type { ShapeRegistry } from './shapes.js';

export interface RoutedEdge {
  /** Ordered control points including clipped source and target endpoints. */
  points: Point[];
  /** SVG path `d` attribute string. */
  pathD: string;
}

export interface EdgeRouterDefinition {
  type: EdgeRouting;
  label: string;
  route(source: DiagramNode, target: DiagramNode, edge: DiagramEdge, shapes: ShapeRegistry): RoutedEdge;
}

function centerOf(node: DiagramNode): Point {
  return {
    x: node.geometry.x + node.geometry.width / 2,
    y: node.geometry.y + node.geometry.height / 2,
  };
}

function polylineToPath(points: Point[]): string {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function computeClippedEndpoints(
  source: DiagramNode,
  target: DiagramNode,
  innerPoints: Point[],
  shapes: ShapeRegistry,
): Point[] {
  const srcCenter = centerOf(source);
  const tgtCenter = centerOf(target);
  const firstRef = innerPoints.length > 0 ? innerPoints[0] : tgtCenter;
  const lastRef = innerPoints.length > 0 ? innerPoints[innerPoints.length - 1] : srcCenter;

  const start = shapes.get(source.type).getAnchorPoint(source, firstRef);
  const end = shapes.get(target.type).getAnchorPoint(target, lastRef);
  return [start, ...innerPoints, end];
}

function computeOrthogonalInnerPoints(source: DiagramNode, target: DiagramNode, bends: Point[]): Point[] {
  if (bends.length > 0) {
    // Preserve user bends while orthogonalizing transitions
    const src = centerOf(source);
    const tgt = centerOf(target);
    const all = [src, ...bends, tgt];
    const result: Point[] = [];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i];
      const b = all[i + 1];
      if (i > 0) result.push(a);
      if (Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1) {
        result.push({ x: b.x, y: a.y });
      }
    }
    return result;
  }

  const src = centerOf(source);
  const tgt = centerOf(target);
  const dx = Math.abs(tgt.x - src.x);
  const dy = Math.abs(tgt.y - src.y);

  if (dx < 2 || dy < 2) return [];
  if (dx >= dy) {
    const midX = (src.x + tgt.x) / 2;
    return [
      { x: midX, y: src.y },
      { x: midX, y: tgt.y },
    ];
  }
  const midY = (src.y + tgt.y) / 2;
  return [
    { x: src.x, y: midY },
    { x: tgt.x, y: midY },
  ];
}

function pointsToSmoothBezier(points: Point[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return polylineToPath(points);
  }
  if (points.length === 3) {
    const [p0, p1, p2] = points;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  // Smooth quadratic spline through midpoints (yEd-like smooth curve)
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    if (i === points.length - 2) {
      d += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    } else {
      d += ` Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
    }
  }
  return d;
}

export const BUILTIN_EDGE_ROUTERS: EdgeRouterDefinition[] = [
  {
    type: 'straight',
    label: 'Straight',
    route(source, target, _edge, shapes) {
      const points = computeClippedEndpoints(source, target, [], shapes);
      return { points, pathD: polylineToPath(points) };
    },
  },
  {
    type: 'polyline',
    label: 'Polyline (Bends)',
    route(source, target, edge, shapes) {
      const points = computeClippedEndpoints(source, target, edge.bends, shapes);
      return { points, pathD: polylineToPath(points) };
    },
  },
  {
    type: 'orthogonal',
    label: 'Orthogonal',
    route(source, target, edge, shapes) {
      const inner = computeOrthogonalInnerPoints(source, target, edge.bends);
      const points = computeClippedEndpoints(source, target, inner, shapes);
      return { points, pathD: polylineToPath(points) };
    },
  },
  {
    type: 'bezier',
    label: 'Bezier',
    route(source, target, edge, shapes) {
      const points = computeClippedEndpoints(source, target, edge.bends, shapes);
      return { points, pathD: pointsToSmoothBezier(points) };
    },
  },
];

export class EdgeRouterRegistry {
  private routers = new Map<EdgeRouting, EdgeRouterDefinition>();

  constructor(initial: EdgeRouterDefinition[] = BUILTIN_EDGE_ROUTERS) {
    for (const router of initial) {
      this.register(router);
    }
  }

  register(router: EdgeRouterDefinition): void {
    this.routers.set(router.type, router);
  }

  get(type: EdgeRouting): EdgeRouterDefinition {
    return this.routers.get(type) ?? this.routers.get('polyline')!;
  }

  list(): EdgeRouterDefinition[] {
    return Array.from(this.routers.values());
  }
}

/** Returns point & unit normal at fraction t (0..1) along a polyline. */
export function pointAlongPolyline(points: Point[], t: number): { point: Point; normal: Point } {
  if (points.length === 0) return { point: { x: 0, y: 0 }, normal: { x: 0, y: -1 } };
  if (points.length === 1) return { point: points[0], normal: { x: 0, y: -1 } };

  const clamped = Math.max(0, Math.min(1, t));
  const segLengths: number[] = [];
  let total = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLengths.push(len);
    total += len;
  }

  if (total < 1e-6) {
    return { point: points[0], normal: { x: 0, y: -1 } };
  }

  const targetDist = clamped * total;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (acc + len >= targetDist || i === segLengths.length - 1) {
      const localT = len > 1e-6 ? (targetDist - acc) / len : 0;
      const a = points[i];
      const b = points[i + 1];
      const dx = (b.x - a.x) / (len || 1);
      const dy = (b.y - a.y) / (len || 1);
      return {
        point: { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT },
        normal: { x: -dy, y: dx },
      };
    }
    acc += len;
  }

  return { point: points[points.length - 1], normal: { x: 0, y: -1 } };
}
