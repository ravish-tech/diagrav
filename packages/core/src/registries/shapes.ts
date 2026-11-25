import type { DiagramNode, NodeLabelPlacement, Point } from '../schema/types.js';

export interface ShapeDefinition {
  type: string;
  label: string;
  category: string;
  /** Optional search aliases (e.g. "db", "sql", "vpc", "k8s") for Palette search. */
  keywords?: string[];
  defaultSize: { width: number; height: number };
  defaultBorderRadius?: number;
  defaultBorderDash?: number[];
  defaultFillColor?: string;
  defaultBorderColor?: string;
  defaultLabelPlacement?: NodeLabelPlacement;
  /** Containers render behind normal nodes and edges so shapes can be placed inside them. */
  isContainer?: boolean;
  /** Returns primary filled SVG path `d` in local node coordinates [0..width, 0..height]. */
  renderPath(width: number, height: number, borderRadius?: number): string;
  /** Optional stroke-only internal decoration path (e.g. cylinder rim, UML dividers, container header). */
  renderDecorations?(width: number, height: number, borderRadius?: number): string;
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

const diamondPoints = (w: number, h: number): Point[] => [
  { x: w / 2, y: 0 },
  { x: w, y: h / 2 },
  { x: w / 2, y: h },
  { x: 0, y: h / 2 },
];

const hexagonPoints = (w: number, h: number): Point[] => {
  const inset = Math.min(w * 0.2, h * 0.5);
  return [
    { x: inset, y: 0 },
    { x: w - inset, y: 0 },
    { x: w, y: h / 2 },
    { x: w - inset, y: h },
    { x: inset, y: h },
    { x: 0, y: h / 2 },
  ];
};

const parallelogramPoints = (w: number, h: number): Point[] => {
  const skew = Math.min(20, w * 0.2);
  return [
    { x: skew, y: 0 },
    { x: w, y: 0 },
    { x: w - skew, y: h },
    { x: 0, y: h },
  ];
};

export const BUILTIN_SHAPES: ShapeDefinition[] = [
  // ── 1. Basic Shapes ─────────────────────────────────────────────────────
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
    label: 'Rounded',
    category: 'Basic Shapes',
    defaultSize: { width: 140, height: 64 },
    defaultBorderRadius: 8,
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 8),
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'pill',
    label: 'Stadium',
    category: 'Basic Shapes',
    defaultSize: { width: 140, height: 52 },
    renderPath: (w, h) => roundedRectPath(w, h, h / 2),
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
    renderPath: (w, h) => polygonPath(diamondPoints(w, h)),
    getAnchorPoint: (node, towards) =>
      polygonAnchor(node, towards, diamondPoints(node.geometry.width, node.geometry.height)),
  },
  {
    type: 'triangle',
    label: 'Triangle',
    category: 'Basic Shapes',
    defaultSize: { width: 110, height: 90 },
    renderPath: (w, h) =>
      polygonPath([
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]),
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      return polygonAnchor(node, towards, [
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]);
    },
  },
  {
    type: 'hexagon',
    label: 'Hexagon',
    category: 'Basic Shapes',
    defaultSize: { width: 140, height: 72 },
    renderPath: (w, h) => polygonPath(hexagonPoints(w, h)),
    getAnchorPoint: (node, towards) =>
      polygonAnchor(node, towards, hexagonPoints(node.geometry.width, node.geometry.height)),
  },
  {
    type: 'octagon',
    label: 'Octagon',
    category: 'Basic Shapes',
    defaultSize: { width: 112, height: 80 },
    renderPath: (w, h) => {
      const c = Math.min(w, h) * 0.28;
      return polygonPath([
        { x: c, y: 0 },
        { x: w - c, y: 0 },
        { x: w, y: c },
        { x: w, y: h - c },
        { x: w - c, y: h },
        { x: c, y: h },
        { x: 0, y: h - c },
        { x: 0, y: c },
      ]);
    },
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      const c = Math.min(w, h) * 0.28;
      return polygonAnchor(node, towards, [
        { x: c, y: 0 },
        { x: w - c, y: 0 },
        { x: w, y: c },
        { x: w, y: h - c },
        { x: w - c, y: h },
        { x: c, y: h },
        { x: 0, y: h - c },
        { x: 0, y: c },
      ]);
    },
  },
  {
    type: 'parallelogram',
    label: 'Parallelogram',
    category: 'Basic Shapes',
    defaultSize: { width: 144, height: 64 },
    renderPath: (w, h) => polygonPath(parallelogramPoints(w, h)),
    getAnchorPoint: (node, towards) =>
      polygonAnchor(node, towards, parallelogramPoints(node.geometry.width, node.geometry.height)),
  },
  {
    type: 'trapezoid',
    label: 'Trapezoid',
    category: 'Basic Shapes',
    defaultSize: { width: 144, height: 64 },
    renderPath: (w, h) => {
      const inset = Math.min(22, w * 0.18);
      return polygonPath([
        { x: inset, y: 0 },
        { x: w - inset, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]);
    },
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      const inset = Math.min(22, w * 0.18);
      return polygonAnchor(node, towards, [
        { x: inset, y: 0 },
        { x: w - inset, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]);
    },
  },

  // ── 2. Flowchart ────────────────────────────────────────────────────────
  {
    type: 'fc-terminator',
    label: 'Start / End',
    category: 'Flowchart',
    defaultSize: { width: 136, height: 48 },
    defaultFillColor: '#ecfdf5',
    defaultBorderColor: '#16a34a',
    renderPath: (w, h) => roundedRectPath(w, h, h / 2),
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'fc-process',
    label: 'Process',
    category: 'Flowchart',
    defaultSize: { width: 144, height: 60 },
    defaultBorderRadius: 4,
    defaultFillColor: '#eff6ff',
    defaultBorderColor: '#2563eb',
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 4),
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'fc-decision',
    label: 'Decision',
    category: 'Flowchart',
    defaultSize: { width: 128, height: 84 },
    defaultFillColor: '#fffbeb',
    defaultBorderColor: '#d97706',
    renderPath: (w, h) => polygonPath(diamondPoints(w, h)),
    getAnchorPoint: (node, towards) =>
      polygonAnchor(node, towards, diamondPoints(node.geometry.width, node.geometry.height)),
  },
  {
    type: 'fc-data',
    label: 'Data I/O',
    category: 'Flowchart',
    defaultSize: { width: 144, height: 60 },
    defaultFillColor: '#f5f3ff',
    defaultBorderColor: '#7c3aed',
    renderPath: (w, h) => polygonPath(parallelogramPoints(w, h)),
    getAnchorPoint: (node, towards) =>
      polygonAnchor(node, towards, parallelogramPoints(node.geometry.width, node.geometry.height)),
  },
  {
    type: 'fc-document',
    label: 'Document',
    category: 'Flowchart',
    defaultSize: { width: 136, height: 72 },
    renderPath: (w, h) => {
      const wave = Math.min(14, h * 0.22);
      return `M 0 0 H ${w} V ${h - wave} Q ${w * 0.75} ${h - wave * 2.2} ${w * 0.5} ${h - wave} T 0 ${h - wave} Z`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'fc-predefined',
    label: 'Subprocess',
    category: 'Flowchart',
    defaultSize: { width: 148, height: 64 },
    renderPath: (w, h) => `M 0 0 H ${w} V ${h} H 0 Z`,
    renderDecorations: (w, h) => {
      const inset = Math.min(14, w * 0.12);
      return `M ${inset} 0 V ${h} M ${w - inset} 0 V ${h}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'fc-manual-input',
    label: 'Manual Input',
    category: 'Flowchart',
    defaultSize: { width: 144, height: 64 },
    renderPath: (w, h) => {
      const drop = Math.min(16, h * 0.26);
      return polygonPath([
        { x: 0, y: drop },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]);
    },
    getAnchorPoint: (node, towards) => {
      const { width: w, height: h } = node.geometry;
      const drop = Math.min(16, h * 0.26);
      return polygonAnchor(node, towards, [
        { x: 0, y: drop },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ]);
    },
  },
  {
    type: 'fc-delay',
    label: 'Delay',
    category: 'Flowchart',
    defaultSize: { width: 136, height: 60 },
    renderPath: (w, h) => {
      const r = h / 2;
      const straight = Math.max(0, w - r);
      return `M 0 0 H ${straight} A ${r} ${r} 0 0 1 ${straight} ${h} H 0 Z`;
    },
    getAnchorPoint: rectAnchor,
  },

  // ── 3. Containers & Groups ──────────────────────────────────────────────
  {
    type: 'container-group',
    label: 'Group Box',
    category: 'Containers',
    keywords: ['group', 'box', 'frame', 'cluster', 'subnet', 'vpc', 'boundary'],
    isContainer: true,
    defaultSize: { width: 320, height: 220 },
    defaultBorderRadius: 8,
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#64748b',
    defaultLabelPlacement: { model: 'internal', position: 'top' },
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 8),
    renderDecorations: (w, h) => {
      const hdr = Math.min(28, h * 0.28);
      return `M 0 ${hdr} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'container-dashed',
    label: 'Dashed Zone',
    category: 'Containers',
    keywords: ['dashed', 'zone', 'vpc', 'region', 'boundary', 'cluster', 'security'],
    isContainer: true,
    defaultSize: { width: 320, height: 220 },
    defaultBorderRadius: 10,
    defaultBorderDash: [6, 4],
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#64748b',
    defaultLabelPlacement: { model: 'internal', position: 'top-left' },
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 10),
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'container-swimlane-v',
    label: 'Swimlane V',
    category: 'Containers',
    keywords: ['swimlane', 'lane', 'column', 'vertical', 'pool'],
    isContainer: true,
    defaultSize: { width: 220, height: 320 },
    defaultBorderRadius: 4,
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#475569',
    defaultLabelPlacement: { model: 'internal', position: 'top' },
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 4),
    renderDecorations: (w, h) => {
      const hdr = Math.min(30, h * 0.22);
      return `M 0 ${hdr} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'container-swimlane-h',
    label: 'Swimlane H',
    category: 'Containers',
    keywords: ['swimlane', 'lane', 'row', 'horizontal', 'pool'],
    isContainer: true,
    defaultSize: { width: 420, height: 150 },
    defaultBorderRadius: 4,
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#475569',
    defaultLabelPlacement: { model: 'internal', position: 'left' },
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 4),
    renderDecorations: (w, h) => {
      const hdr = Math.min(92, w * 0.26);
      return `M ${hdr} 0 V ${h}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'container-package',
    label: 'Package',
    category: 'Containers',
    keywords: ['package', 'folder', 'module', 'namespace', 'uml'],
    isContainer: true,
    defaultSize: { width: 300, height: 200 },
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#475569',
    defaultLabelPlacement: { model: 'internal', position: 'top-left' },
    renderPath: (w, h) => {
      const tabW = Math.min(100, w * 0.42);
      const tabH = Math.min(24, h * 0.24);
      return `M 0 0 H ${tabW} L ${tabW + 8} ${tabH} H ${w} V ${h} H 0 Z`;
    },
    renderDecorations: (w, h) => {
      const tabH = Math.min(24, h * 0.24);
      return `M 0 ${tabH} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },

  // ── 4. Architecture & Cloud ─────────────────────────────────────────────
  {
    type: 'arch-database',
    label: 'Database',
    category: 'Architecture',
    keywords: ['db', 'sql', 'postgres', 'mysql', 'storage', 'cylinder', 'store', 'cache', 'redis'],
    defaultSize: { width: 120, height: 84 },
    defaultFillColor: '#fff7ed',
    defaultBorderColor: '#ea580c',
    renderPath: (w, h) => {
      const ry = Math.min(13, h * 0.18);
      const rx = w / 2;
      return `M 0 ${ry} A ${rx} ${ry} 0 0 1 ${w} ${ry} V ${h - ry} A ${rx} ${ry} 0 0 1 0 ${h - ry} Z`;
    },
    renderDecorations: (w, h) => {
      const ry = Math.min(13, h * 0.18);
      const rx = w / 2;
      return `M 0 ${ry} A ${rx} ${ry} 0 0 0 ${w} ${ry}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'arch-cloud',
    label: 'Cloud',
    category: 'Architecture',
    keywords: ['cloud', 'aws', 'gcp', 'azure', 'internet', 'network', 'saas'],
    defaultSize: { width: 156, height: 84 },
    defaultFillColor: '#f0f9ff',
    defaultBorderColor: '#0284c7',
    renderPath: (w, h) => {
      const s = (x: number, y: number) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`;
      return [
        `M ${s(0.22, 0.98)}`,
        `C ${s(0.03, 0.98)} ${s(-0.02, 0.64)} ${s(0.11, 0.48)}`,
        `C ${s(0.07, 0.2)} ${s(0.3, 0.02)} ${s(0.5, 0.12)}`,
        `C ${s(0.66, -0.02)} ${s(0.93, 0.12)} ${s(0.89, 0.42)}`,
        `C ${s(1.03, 0.52)} ${s(1.0, 0.98)} ${s(0.78, 0.98)}`,
        'Z',
      ].join(' ');
    },
    getAnchorPoint: ellipseAnchor,
  },
  {
    type: 'arch-queue',
    label: 'Queue',
    category: 'Architecture',
    keywords: ['queue', 'kafka', 'pubsub', 'broker', 'mq', 'topic', 'stream', 'bus'],
    defaultSize: { width: 148, height: 56 },
    defaultFillColor: '#faf5ff',
    defaultBorderColor: '#9333ea',
    renderPath: (w, h) => {
      const rx = Math.min(12, w * 0.14);
      const ry = h / 2;
      return `M ${rx} 0 H ${w - rx} A ${rx} ${ry} 0 0 1 ${w - rx} ${h} H ${rx} A ${rx} ${ry} 0 0 1 ${rx} 0 Z`;
    },
    renderDecorations: (w, h) => {
      const rx = Math.min(12, w * 0.14);
      const ry = h / 2;
      return `M ${w - rx} 0 A ${rx} ${ry} 0 0 0 ${w - rx} ${h}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'arch-server',
    label: 'Service',
    category: 'Architecture',
    keywords: ['server', 'service', 'api', 'microservice', 'backend', 'worker', 'pod', 'k8s'],
    defaultSize: { width: 148, height: 72 },
    defaultBorderRadius: 6,
    defaultFillColor: '#f0fdf4',
    defaultBorderColor: '#15803d',
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 6),
    renderDecorations: (w, h) => {
      const bar = Math.min(14, h * 0.24);
      return `M 0 ${bar} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'arch-actor',
    label: 'User / Actor',
    category: 'Architecture',
    keywords: ['user', 'actor', 'person', 'client', 'customer', 'human'],
    defaultSize: { width: 96, height: 96 },
    defaultLabelPlacement: { model: 'external', position: 'bottom' },
    renderPath: (w, h) => {
      const cx = w / 2;
      const headR = Math.min(w, h) * 0.17;
      const headCy = headR + 4;
      const bodyTop = headCy + headR + 4;
      return [
        `M ${cx - headR} ${headCy}`,
        `A ${headR} ${headR} 0 1 0 ${cx + headR} ${headCy}`,
        `A ${headR} ${headR} 0 1 0 ${cx - headR} ${headCy} Z`,
        `M ${cx - w * 0.34} ${h - 4}`,
        `C ${cx - w * 0.34} ${bodyTop} ${cx + w * 0.34} ${bodyTop} ${cx + w * 0.34} ${h - 4} Z`,
      ].join(' ');
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'arch-note',
    label: 'Note',
    category: 'Architecture',
    keywords: ['note', 'sticky', 'comment', 'annotation', 'memo'],
    defaultSize: { width: 148, height: 84 },
    defaultFillColor: '#fefce8',
    defaultBorderColor: '#ca8a04',
    renderPath: (w, h) => {
      const fold = Math.min(16, w * 0.18, h * 0.28);
      return `M 0 0 H ${w - fold} L ${w} ${fold} V ${h} H 0 Z`;
    },
    renderDecorations: (w, h) => {
      const fold = Math.min(16, w * 0.18, h * 0.28);
      return `M ${w - fold} 0 V ${fold} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },

  // ── 5. UML & Software ───────────────────────────────────────────────────
  {
    type: 'uml-class',
    label: 'Class',
    category: 'UML',
    keywords: ['class', 'entity', 'model', 'table', 'schema', 'struct'],
    defaultSize: { width: 164, height: 108 },
    defaultFillColor: '#ffffff',
    defaultBorderColor: '#334155',
    defaultLabelPlacement: { model: 'internal', position: 'top' },
    renderPath: (w, h) => `M 0 0 H ${w} V ${h} H 0 Z`,
    renderDecorations: (w, h) => {
      const y1 = Math.min(28, h * 0.28);
      const y2 = y1 + (h - y1) * 0.45;
      return `M 0 ${y1} H ${w} M 0 ${y2} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'uml-component',
    label: 'Component',
    category: 'UML',
    keywords: ['component', 'module', 'library', 'plugin'],
    defaultSize: { width: 156, height: 76 },
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#334155',
    renderPath: (w, h) => {
      const tab = Math.min(12, w * 0.14);
      return `M ${tab} 0 H ${w} V ${h} H ${tab} Z`;
    },
    renderDecorations: (w, h) => {
      const tab = Math.min(12, w * 0.14);
      const tabH = Math.min(12, h * 0.2);
      const y1 = h * 0.24;
      const y2 = h * 0.58;
      return [
        `M 0 ${y1} H ${tab * 1.6} V ${y1 + tabH} H 0 Z`,
        `M 0 ${y2} H ${tab * 1.6} V ${y2 + tabH} H 0 Z`,
      ].join(' ');
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'uml-state',
    label: 'State',
    category: 'UML',
    keywords: ['state', 'fsm', 'machine', 'lifecycle'],
    defaultSize: { width: 148, height: 72 },
    defaultBorderRadius: 14,
    defaultFillColor: '#f8fafc',
    defaultBorderColor: '#334155',
    defaultLabelPlacement: { model: 'internal', position: 'top' },
    renderPath: (w, h, r) => roundedRectPath(w, h, r ?? 14),
    renderDecorations: (w, h) => {
      const hdr = Math.min(24, h * 0.34);
      return `M 0 ${hdr} H ${w}`;
    },
    getAnchorPoint: rectAnchor,
  },
  {
    type: 'uml-interface',
    label: 'Interface',
    category: 'UML',
    defaultSize: { width: 56, height: 56 },
    defaultLabelPlacement: { model: 'external', position: 'bottom' },
    renderPath: (w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
    },
    getAnchorPoint: ellipseAnchor,
  },
  {
    type: 'uml-usecase',
    label: 'Use Case',
    category: 'UML',
    defaultSize: { width: 148, height: 68 },
    defaultFillColor: '#eff6ff',
    defaultBorderColor: '#2563eb',
    renderPath: (w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
    },
    getAnchorPoint: ellipseAnchor,
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
