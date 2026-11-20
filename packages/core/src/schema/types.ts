export interface Point {
  x: number;
  y: number;
}

export interface GradientStop {
  color: string;
  /** 0 to 1 */
  offset: number;
  opacity?: number;
}

export type FillStyle =
  | { type: 'none' }
  | { type: 'solid'; color: string; opacity?: number }
  | { type: 'linear-gradient'; angle: number; stops: GradientStop[] }
  | { type: 'radial-gradient'; cx?: number; cy?: number; r?: number; stops: GradientStop[] };

export interface BorderStyle {
  color: string;
  width: number;
  dash?: number[];
  radius?: number;
  opacity?: number;
}

export interface LabelStyle {
  fontFamily?: string;
  fontSize: number;
  fontWeight?: string | number;
  color: string;
  background?: string;
  padding?: number;
  align?: 'left' | 'center' | 'right';
}

export type NodeLabelPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface NodeLabelPlacement {
  model: 'internal' | 'external' | 'free';
  position: NodeLabelPosition;
  offset?: Point;
}

export interface EdgeLabelPlacement {
  model: 'center' | 'source' | 'target' | 'ratio' | 'free';
  /** 0..1 along edge path when model === 'ratio' */
  ratio?: number;
  /** perpendicular distance from edge */
  distance?: number;
  offset?: Point;
}

export interface DiagramLabel<TPlacement = NodeLabelPlacement | EdgeLabelPlacement> {
  id: string;
  text: string;
  placement: TPlacement;
  style: LabelStyle;
}

export interface NodeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface NodeStyle {
  fill: FillStyle;
  border: BorderStyle;
  shadow?: boolean;
}

export interface DiagramNode {
  id: string;
  type: string;
  geometry: NodeGeometry;
  style: NodeStyle;
  labels: DiagramLabel<NodeLabelPlacement>[];
  data?: Record<string, unknown>;
}

export type ArrowType = 'none' | 'standard' | 'triangle' | 'open' | 'diamond' | 'circle';
export type EdgeRouting = 'straight' | 'polyline' | 'orthogonal' | 'bezier';

export interface EdgeEndpoint {
  nodeId: string;
  port?: string;
}

export interface EdgeStyle {
  stroke: string;
  width: number;
  dash?: number[];
  opacity?: number;
  sourceArrow: ArrowType;
  targetArrow: ArrowType;
}

export interface DiagramEdge {
  id: string;
  source: EdgeEndpoint;
  target: EdgeEndpoint;
  routing: EdgeRouting;
  bends: Point[];
  style: EdgeStyle;
  labels: DiagramLabel<EdgeLabelPlacement>[];
  data?: Record<string, unknown>;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DiagramMeta {
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DiagramDocument {
  schemaVersion: 1;
  meta: DiagramMeta;
  viewport: Viewport;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  extensions?: Record<string, unknown>;
}

export type DiagramMode = 'readonly' | 'editor';
export type EditorTool = 'select' | 'edge';

let idCounter = 0;

export function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createEmptyDocument(title = 'Untitled Diagram'): DiagramDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: { title, createdAt: now, updatedAt: now },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  };
}

export function createDefaultNodeLabel(text = 'Node'): DiagramLabel<NodeLabelPlacement> {
  return {
    id: generateId('lbl'),
    text,
    placement: { model: 'internal', position: 'center' },
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 13,
      fontWeight: 500,
      color: '#1e293b',
      align: 'center',
      padding: 4,
    },
  };
}

export function createDefaultEdgeLabel(text = ''): DiagramLabel<EdgeLabelPlacement> {
  return {
    id: generateId('lbl'),
    text,
    placement: { model: 'center', distance: -10 },
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 12,
      fontWeight: 500,
      color: '#334155',
      background: '#ffffff',
      padding: 3,
      align: 'center',
    },
  };
}

export function createDefaultNode(
  overrides: Partial<Omit<DiagramNode, 'geometry' | 'style'>> & {
    geometry?: Partial<NodeGeometry>;
    style?: Partial<NodeStyle>;
    labelText?: string;
  } = {},
): DiagramNode {
  const id = overrides.id ?? generateId('node');
  const type = overrides.type ?? 'rounded-rect';
  return {
    id,
    type,
    geometry: {
      x: overrides.geometry?.x ?? 100,
      y: overrides.geometry?.y ?? 100,
      width: overrides.geometry?.width ?? 140,
      height: overrides.geometry?.height ?? 64,
      rotation: overrides.geometry?.rotation ?? 0,
    },
    style: {
      fill: overrides.style?.fill ?? { type: 'solid', color: '#f8fafc', opacity: 1 },
      border: {
        color: overrides.style?.border?.color ?? '#475569',
        width: overrides.style?.border?.width ?? 1.5,
        dash: overrides.style?.border?.dash ?? [],
        radius: overrides.style?.border?.radius ?? (type === 'rounded-rect' ? 8 : 0),
        opacity: overrides.style?.border?.opacity ?? 1,
      },
      shadow: overrides.style?.shadow ?? false,
    },
    labels: overrides.labels ?? [createDefaultNodeLabel(overrides.labelText ?? 'Node')],
    data: overrides.data,
  };
}

export function createDefaultEdge(
  sourceNodeId: string,
  targetNodeId: string,
  overrides: Partial<Omit<DiagramEdge, 'style'>> & { style?: Partial<EdgeStyle> } = {},
): DiagramEdge {
  return {
    id: overrides.id ?? generateId('edge'),
    source: overrides.source ?? { nodeId: sourceNodeId, port: 'auto' },
    target: overrides.target ?? { nodeId: targetNodeId, port: 'auto' },
    routing: overrides.routing ?? 'polyline',
    bends: overrides.bends ?? [],
    style: {
      stroke: overrides.style?.stroke ?? '#475569',
      width: overrides.style?.width ?? 1.75,
      dash: overrides.style?.dash ?? [],
      opacity: overrides.style?.opacity ?? 1,
      sourceArrow: overrides.style?.sourceArrow ?? 'none',
      targetArrow: overrides.style?.targetArrow ?? 'standard',
    },
    labels: overrides.labels ?? [],
    data: overrides.data,
  };
}

export function cloneDocument(doc: DiagramDocument): DiagramDocument {
  return structuredClone(doc);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateDocument(input: unknown): DiagramDocument {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid diagram document: expected object');
  }
  const obj = input as Partial<DiagramDocument>;
  if (obj.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion: ${String(obj.schemaVersion)}`);
  }
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    throw new Error('Invalid diagram document: nodes and edges must be arrays');
  }

  const vp = obj.viewport;
  const vpX = vp && isFiniteNumber(vp.x) ? vp.x : 0;
  const vpY = vp && isFiniteNumber(vp.y) ? vp.y : 0;
  const vpZoom = vp && isFiniteNumber(vp.zoom) && vp.zoom > 0 ? vp.zoom : 1;

  const nodes: DiagramNode[] = obj.nodes.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid node at index ${idx}: expected object`);
    }
    const n = raw as Partial<DiagramNode>;
    if (typeof n.id !== 'string' || !n.id) {
      throw new Error(`Invalid node at index ${idx}: missing string id`);
    }
    if (typeof n.type !== 'string' || !n.type) {
      throw new Error(`Invalid node "${n.id}": missing string type`);
    }
    const g = n.geometry;
    if (
      !g ||
      !isFiniteNumber(g.x) ||
      !isFiniteNumber(g.y) ||
      !isFiniteNumber(g.width) ||
      !isFiniteNumber(g.height) ||
      g.width <= 0 ||
      g.height <= 0
    ) {
      throw new Error(`Invalid node "${n.id}": invalid geometry`);
    }
    const style = n.style;
    if (!style || typeof style !== 'object' || !style.fill || !style.border) {
      throw new Error(`Invalid node "${n.id}": missing style.fill or style.border`);
    }
    return structuredClone({
      id: n.id,
      type: n.type,
      geometry: {
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        rotation: isFiniteNumber(g.rotation) ? g.rotation : 0,
      },
      style,
      labels: Array.isArray(n.labels) ? n.labels : [],
      data: n.data,
    });
  });

  const edges: DiagramEdge[] = obj.edges.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid edge at index ${idx}: expected object`);
    }
    const e = raw as Partial<DiagramEdge>;
    if (typeof e.id !== 'string' || !e.id) {
      throw new Error(`Invalid edge at index ${idx}: missing string id`);
    }
    if (!e.source?.nodeId || !e.target?.nodeId) {
      throw new Error(`Invalid edge "${e.id}": missing source.nodeId or target.nodeId`);
    }
    const style = e.style;
    if (!style || typeof style !== 'object') {
      throw new Error(`Invalid edge "${e.id}": missing style`);
    }
    const bends = Array.isArray(e.bends)
      ? e.bends.filter((b): b is Point => Boolean(b) && isFiniteNumber(b.x) && isFiniteNumber(b.y))
      : [];
    return structuredClone({
      id: e.id,
      source: e.source,
      target: e.target,
      routing: e.routing ?? 'polyline',
      bends,
      style,
      labels: Array.isArray(e.labels) ? e.labels : [],
      data: e.data,
    });
  });

  return {
    schemaVersion: 1,
    meta: {
      title: typeof obj.meta?.title === 'string' ? obj.meta.title : 'Untitled Diagram',
      createdAt: obj.meta?.createdAt,
      updatedAt: obj.meta?.updatedAt,
    },
    viewport: { x: vpX, y: vpY, zoom: vpZoom },
    nodes,
    edges,
    extensions: obj.extensions ? structuredClone(obj.extensions) : undefined,
  };
}
