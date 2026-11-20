import type {
  DiagramDocument,
  DiagramEdge,
  DiagramLabel,
  DiagramNode,
  EdgeLabelPlacement,
  EdgeRouting,
  EdgeStyle,
  NodeGeometry,
  NodeLabelPlacement,
  NodeStyle,
  Point,
  Viewport,
} from '../schema/types.js';

export type NodePatch = {
  type?: string;
  geometry?: Partial<NodeGeometry>;
  style?: {
    fill?: NodeStyle['fill'];
    border?: Partial<NodeStyle['border']>;
    shadow?: boolean;
  };
  labels?: DiagramLabel<NodeLabelPlacement>[];
  data?: Record<string, unknown>;
};

export type EdgePatch = {
  source?: DiagramEdge['source'];
  target?: DiagramEdge['target'];
  routing?: EdgeRouting;
  bends?: Point[];
  style?: Partial<EdgeStyle>;
  labels?: DiagramLabel<EdgeLabelPlacement>[];
  data?: Record<string, unknown>;
};

export type DiagramCommand =
  | { type: 'node.create'; node: DiagramNode }
  | { type: 'node.update'; id: string; patch: NodePatch }
  | { type: 'node.delete'; id: string }
  | { type: 'edge.create'; edge: DiagramEdge }
  | { type: 'edge.update'; id: string; patch: EdgePatch }
  | { type: 'edge.delete'; id: string }
  | {
      type: 'label.upsert';
      targetKind: 'node' | 'edge';
      targetId: string;
      label: DiagramLabel;
    }
  | {
      type: 'label.delete';
      targetKind: 'node' | 'edge';
      targetId: string;
      labelId: string;
    }
  | { type: 'viewport.set'; viewport: Viewport; recordHistory?: boolean }
  | { type: 'document.load'; document: DiagramDocument }
  | { type: 'batch'; commands: DiagramCommand[]; label?: string };

export interface CommandResult {
  ok: boolean;
  error?: string;
}
