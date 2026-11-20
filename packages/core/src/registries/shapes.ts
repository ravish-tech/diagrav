import type { DiagramNode, Point } from '../schema/types.js';

export interface ShapeDefinition {
  type: string;
  label: string;
  category: string;
  defaultSize: { width: number; height: number };
  defaultBorderRadius?: number;
  /** Returns SVG path `d` in local node coordinates [0..width, 0..height]. */
  renderPath(width: number, height: number, borderRadius?: number): string;
  /** Computes boundary anchor point on the node perimeter facing `towards`. */
  getAnchorPoint(node: DiagramNode, towards: Point): Point;
}

function getNodeCenter(node: DiagramNode): Point {
  return {
    x: node.geometry.x + node.geometry.width / 2,
    y: node.geometry.y + node.geometry.height / 2,
  };
}

/** Ray intersection from center of rectangle towards target point. */
export function rectAnchor(node: DiagramNode, towards: Point): Point {
  const cx = node.geometry.x + node.geometry.width / 2;
  const cy = node.geometry.y + node.geometry.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = node.geometry.width / 2;
  const hh = node.geometry.height / 2;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Ray intersection from center of ellipse towards target point. */
export function ellipseAnchor(node: DiagramNode, towards: Point): Point {
  const cx = node.geometry.x + node.geometry.width / 2;
  const cy = node.geometry.y + node.geometry.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const rx = node.geometry.width / 2;
  const ry = node.geometry.height / 2;
  const angle = Math.atan2(dy / ry, dx / rx);
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
  };
}

/** Ray intersection with convex polygon defined in local [0..w, 0..h] coords. */
export function polygonAnchor(node: DiagramNode, towards: Point, localPoints: Point[]): Point {
  const c = getNodeCenter(node);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (dx === 0 && dy === 0) return c;

  const ox = node.geometry.x;
  const oy = node.geometry.y;
  let bestT = Infinity;

  for (let i = 0; i < localPoints.length; i++) {
    const p1 = { x: ox + localPoints[i].x, y: oy + localPoints[i].y };
    const p2 = {
      x: ox + localPoints[(i + 1) % localPoints.length].x,
      y: oy + localPoints[(i + 1) % localPoints.length].y,
    };
    const sx = p2.x - p1.x;
    const sy = p2.y - p1.y;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-9) continue;

    const qpx = p1.x - c.x;
    const qpy = p1.y - c.y;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * dy - qpy * dx) / denom;
    if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 && t < bestT) {
      bestT = t;
    }
  }

  if (!Number.isFinite(bestT)) return rectAnchor(node, towards);
  return { x: c.x + dx * bestT, y: c.y + dy * bestT };
}

function roundedRectPath(w: number, h: number, r = 0): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius === 0) {
    return `M 0 0 H ${w} V ${h} H 0 Z`;
  }
  return [
    `M ${radius} 0`,
    `H ${w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${w} ${radius}`,
    `V ${h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${w - radius} ${h}`,
    `H ${radius}`,
    `A ${radius} ${radius} 0 0 1 0 ${h - radius}`,
    `V ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0`,
    'Z',
  ].join(' ');
}

function polygonPath(pts: Point[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

export const BUILTIN_SHAPES: ShapeDefinition[] = [
  {
    type: 'rect',
    label: 'Rectangle',
    category: 'Basic Shapes',
    defaultSize: { width: 140, height: 64 },
    defaultBorderRadius: 0,
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 0),
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'rounded-rect',
    label: 'Rounded Rect',
    category: 'Basic Shapes',
    defaultSize: { width: 140, height: 64 },
    defaultBorderRadius: 8,
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 8),
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'ellipse',
    label: 'Ellipse',
    category: 'Basic Shapes',
    defaultSize: { width: 120, height: 72 },
    renderPath: (w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
    },
    getAnchorPoint: ellipseAnchor,
  },
  {
    type: 'diamond',
    label: 'Diamond',
    category: 'Basic Shapes',
    defaultSize: { width: 120, height: 84 },
    renderPath: (w, h) =>
      polygonPath([
        { x: w / 2, y: 0 },
        { x: w, y: h / 2 },
        { x: w / 2, y: h },
        { x: 0, y: h / 2 },
      ]),
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      return polygonAnchor(node, towards, [
        { x: w / 2, y: 0 },
        { x: w, y: h / 2 },
        { x: w / 2, y: h },
        { x: 0, y: h / 2 },
      ]);
    },
  },
  {
    type: 'hexagon',
    label: 'Hexagon',
    category: 'Basic Shapes',
    defaultSize: { width: 140, height: 72 },
    renderPath: (w, h) => {
      const inset = Math.min(w * 0.2, h * 0.5);
      return polygonPath([
        { x: inset, y: 0 },
        { x: w - inset, y: 0 },
        { x: w, y: h / 2 },
        { x: w - inset, y: h },
        { x: inset, y: h },
        { x: 0, y: h / 2 },
      ]);
    },
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      const inset = Math.min(w * 0.2, h * 0.5);
      return polygonAnchor(node, towards, [
        { x: inset, y: 0 },
        { x: w - inset, y: 0 },
        { x: w, y: h / 2 },
        { x: w - inset, y: h },
        { x: inset, y: h },
        { x: 0, y: h / 2 },
      ]);
    },
  },
  {
    type: 'parallelogram',
    label: 'Parallelogram',
    category: 'Basic Shapes',
    defaultSize: { width: 144, height: 64 },
    renderPath: (w, h) => {
      const skew = Math.min(20, w * 0.2);
      return polygonPath([
        { x: skew, y: 0 },
        { x: w, y: 0 },
        { x: w - skew, y: h },
        { x: 0, y: h },
      ]);
    },
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      const skew = Math.min(20, w * 0.2);
      return polygonAnchor(node, towards, [
        { x: skew, y: 0 },
        { x: w, y: 0 },
        { x: w - skew, y: h },
        { x: 0, y: h },
      ]);
    },
  },
];

export class ShapeRegistry {
  private shapes = new Map<string, ShapeDefinition>();

  constructor(initialShapes: ShapeDefinition[] = BUILTIN_SHAPES) {
    for (const shape of initialShapes) {
      this.register(shape);
    }
  }

  register(shape: ShapeDefinition): void {
    this.shapes.set(shape.type, shape);
  }

  get(type: string): ShapeDefinition {
    return this.shapes.get(type) ?? this.shapes.get('rect')!;
  }

  has(type: string): boolean {
    return this.shapes.has(type);
  }

  list(): ShapeDefinition[] {
    return Array.from(this.shapes.values());
  }
}
