import {
  computeEdgeLabelPosition,
  computeNodeLabelPosition,
} from '../registries/labels.js';
import type { EdgeRouterRegistry } from '../registries/edges.js';
import type { ShapeRegistry } from '../registries/shapes.js';
import type {
  ArrowType,
  DiagramDocument,
  DiagramEdge,
  DiagramMode,
  DiagramNode,
  FillStyle,
  Point,
} from '../schema/types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) node.setAttribute(k, String(v));
  }
  return node;
}

export interface RenderState {
  mode: DiagramMode;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  hoveredNodeId: string | null;
  showGrid: boolean;
  gridSize: number;
  draftEdge: { fromNodeId: string; toPoint: Point; targetNodeId: string | null } | null;
  snapLines: Array<{ orientation: 'vertical' | 'horizontal'; value: number }>;
}

export class SvgRenderer {
  readonly svg: SVGSVGElement;
  private defs: SVGDefsElement;
  private gridRect: SVGRectElement;
  private viewportGroup: SVGGElement;
  private edgesLayer: SVGGElement;
  private nodesLayer: SVGGElement;
  private overlayLayer: SVGGElement;

  constructor(
    private container: HTMLElement,
    private shapes: ShapeRegistry,
    private routers: EdgeRouterRegistry,
  ) {
    this.svg = el('svg', {
      class: 'diagrav-svg',
      width: '100%',
      height: '100%',
    });
    this.svg.style.display = 'block';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.userSelect = 'none';
    this.svg.style.touchAction = 'none';

    this.defs = el('defs');
    this.gridRect = el('rect', {
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      fill: 'url(#diagrav-grid-pattern)',
      'pointer-events': 'none',
    });

    this.viewportGroup = el('g', { class: 'diagrav-viewport' });
    this.edgesLayer = el('g', { class: 'diagrav-edges' });
    this.nodesLayer = el('g', { class: 'diagrav-nodes' });
    this.overlayLayer = el('g', { class: 'diagrav-overlay' });

    this.viewportGroup.append(this.edgesLayer, this.nodesLayer, this.overlayLayer);
    this.svg.append(this.defs, this.gridRect, this.viewportGroup);
    this.container.appendChild(this.svg);
  }

  destroy(): void {
    this.svg.remove();
  }

  screenToWorld(clientX: number, clientY: number, doc: DiagramDocument): Point {
    const rect = this.svg.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - doc.viewport.x) / doc.viewport.zoom,
      y: (sy - doc.viewport.y) / doc.viewport.zoom,
    };
  }

  worldToScreen(pt: Point, doc: DiagramDocument): Point {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: rect.left + pt.x * doc.viewport.zoom + doc.viewport.x,
      y: rect.top + pt.y * doc.viewport.zoom + doc.viewport.y,
    };
  }

  render(doc: DiagramDocument, state: RenderState): void {
    this.defs.innerHTML = '';
    this.edgesLayer.innerHTML = '';
    this.nodesLayer.innerHTML = '';
    this.overlayLayer.innerHTML = '';

    // 1. Grid pattern + drop shadow filter
    this.renderBaseDefs(doc, state);
    this.gridRect.setAttribute('display', state.showGrid ? 'inline' : 'none');

    // 2. Viewport transform
    const { x, y, zoom } = doc.viewport;
    this.viewportGroup.setAttribute('transform', `translate(${x}, ${y}) scale(${zoom})`);

    // Index nodes for O(1) lookup
    const nodeMap = new Map<string, DiagramNode>();
    for (const n of doc.nodes) nodeMap.set(n.id, n);

    // 3. Render edges
    for (const edge of doc.edges) {
      const src = nodeMap.get(edge.source.nodeId);
      const tgt = nodeMap.get(edge.target.nodeId);
      if (!src || !tgt) continue;
      this.renderEdge(edge, src, tgt, state);
    }

    // 4. Render nodes
    for (const node of doc.nodes) {
      this.renderNode(node, state);
    }

    // 5. Render overlays (draft edge, snap lines, selection handles)
    if (state.mode === 'editor') {
      this.renderOverlays(doc, nodeMap, state);
    }
  }

  private renderBaseDefs(doc: DiagramDocument, state: RenderState): void {
    const step = state.gridSize * doc.viewport.zoom;
    const offsetX = ((doc.viewport.x % step) + step) % step;
    const offsetY = ((doc.viewport.y % step) + step) % step;

    const pattern = el('pattern', {
      id: 'diagrav-grid-pattern',
      width: step,
      height: step,
      patternUnits: 'userSpaceOnUse',
      x: offsetX,
      y: offsetY,
    });
    const dot = el('circle', {
      cx: 1,
      cy: 1,
      r: Math.max(0.75, Math.min(1.5, doc.viewport.zoom)),
      fill: 'rgba(148, 163, 184, 0.35)',
    });
    pattern.appendChild(dot);
    this.defs.appendChild(pattern);

    const shadow = el('filter', {
      id: 'diagrav-shadow',
      x: '-20%',
      y: '-20%',
      width: '140%',
      height: '140%',
    });
    shadow.appendChild(
      el('feDropShadow', {
        dx: 0,
        dy: 3,
        stdDeviation: 4,
        'flood-color': '#0f172a',
        'flood-opacity': 0.14,
      }),
    );
    this.defs.appendChild(shadow);
  }

  private resolveFill(nodeId: string, fill: FillStyle): { fill: string; opacity?: number } {
    if (fill.type === 'none') return { fill: 'none' };
    if (fill.type === 'solid') return { fill: fill.color, opacity: fill.opacity };

    const gradId = `diagrav-grad-${nodeId}`;
    if (fill.type === 'linear-gradient') {
      const rad = ((fill.angle - 90) * Math.PI) / 180;
      const x1 = 50 - Math.cos(rad) * 50;
      const y1 = 50 - Math.sin(rad) * 50;
      const x2 = 50 + Math.cos(rad) * 50;
      const y2 = 50 + Math.sin(rad) * 50;
      const grad = el('linearGradient', {
        id: gradId,
        x1: `${x1.toFixed(1)}%`,
        y1: `${y1.toFixed(1)}%`,
        x2: `${x2.toFixed(1)}%`,
        y2: `${y2.toFixed(1)}%`,
      });
      for (const s of fill.stops) {
        grad.appendChild(
          el('stop', {
            offset: `${(s.offset * 100).toFixed(1)}%`,
            'stop-color': s.color,
            'stop-opacity': s.opacity ?? 1,
          }),
        );
      }
      this.defs.appendChild(grad);
      return { fill: `url(#${gradId})` };
    }

    const grad = el('radialGradient', {
      id: gradId,
      cx: `${((fill.cx ?? 0.5) * 100).toFixed(1)}%`,
      cy: `${((fill.cy ?? 0.5) * 100).toFixed(1)}%`,
      r: `${((fill.r ?? 0.5) * 100).toFixed(1)}%`,
    });
    for (const s of fill.stops) {
      grad.appendChild(
        el('stop', {
          offset: `${(s.offset * 100).toFixed(1)}%`,
          'stop-color': s.color,
          'stop-opacity': s.opacity ?? 1,
        }),
      );
    }
    this.defs.appendChild(grad);
    return { fill: `url(#${gradId})` };
  }

  private ensureArrowMarker(type: ArrowType, color: string, end: 'start' | 'end'): string | undefined {
    if (type === 'none') return undefined;
    const safeColor = color.replace(/[^a-zA-Z0-9]/g, '');
    const id = `diagrav-arrow-${type}-${end}-${safeColor}`;
    if (this.defs.querySelector(`#${id}`)) return `url(#${id})`;

    const marker = el('marker', {
      id,
      viewBox: '0 0 12 12',
      refX: end === 'end' ? 10 : 2,
      refY: 6,
      markerWidth: 8,
      markerHeight: 8,
      orient: 'auto-start-reverse',
      markerUnits: 'strokeWidth',
    });

    switch (type) {
      case 'standard':
        marker.appendChild(el('path', { d: 'M 0 1 L 11 6 L 0 11 L 2.5 6 Z', fill: color }));
        break;
      case 'triangle':
        marker.appendChild(el('path', { d: 'M 0 1 L 11 6 L 0 11 Z', fill: color }));
        break;
      case 'open':
        marker.appendChild(
          el('path', {
            d: 'M 1 1 L 10 6 L 1 11',
            fill: 'none',
            stroke: color,
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        );
        break;
      case 'diamond':
        marker.appendChild(el('path', { d: 'M 0 6 L 5.5 1.5 L 11 6 L 5.5 10.5 Z', fill: color }));
        break;
      case 'circle':
        marker.appendChild(el('circle', { cx: 6, cy: 6, r: 4, fill: color }));
        break;
    }

    this.defs.appendChild(marker);
    return `url(#${id})`;
  }

  private renderNode(node: DiagramNode, state: RenderState): void {
    const def = this.shapes.get(node.type);
    const isSelected = state.selectedNodeIds.has(node.id);
    const isHovered = state.hoveredNodeId === node.id;
    const { x, y, width, height, rotation = 0 } = node.geometry;

    const g = el('g', {
      class: 'diagrav-node',
      'data-node-id': node.id,
      transform:
        rotation !== 0
          ? `translate(${x}, ${y}) rotate(${rotation}, ${width / 2}, ${height / 2})`
          : `translate(${x}, ${y})`,
      cursor: state.mode === 'editor' ? 'move' : 'pointer',
    });

    const fillResolved = this.resolveFill(node.id, node.style.fill);
    const pathD = def.renderPath(width, height, node.style.border.radius);

    const shapeEl = el('path', {
      d: pathD,
      fill: fillResolved.fill,
      'fill-opacity': fillResolved.opacity,
      stroke: isSelected ? '#2563eb' : node.style.border.color,
      'stroke-width': isSelected ? Math.max(2, node.style.border.width) : node.style.border.width,
      'stroke-dasharray': node.style.border.dash?.length ? node.style.border.dash.join(' ') : undefined,
      'stroke-opacity': node.style.border.opacity ?? 1,
      filter: node.style.shadow ? 'url(#diagrav-shadow)' : undefined,
    });
    g.appendChild(shapeEl);

    // Subtle port anchor hint on hover in editor mode (yEd-style edge drag start)
    if (state.mode === 'editor' && (isHovered || state.draftEdge?.targetNodeId === node.id)) {
      const portRing = el('circle', {
        class: 'diagrav-port-handle',
        'data-port-node-id': node.id,
        cx: width,
        cy: height / 2,
        r: 5,
        fill: '#2563eb',
        stroke: '#ffffff',
        'stroke-width': 2,
        cursor: 'crosshair',
      });
      g.appendChild(portRing);
    }

    // Labels
    for (const label of node.labels) {
      if (!label.text) continue;
      const pos = computeNodeLabelPosition(node, label);
      const localX = pos.x - x;
      const localY = pos.y - y;
      const textEl = el('text', {
        x: localX,
        y: localY,
        'text-anchor': pos.textAnchor,
        'dominant-baseline': pos.dominantBaseline,
        fill: label.style.color,
        'font-family': label.style.fontFamily ?? 'system-ui, sans-serif',
        'font-size': label.style.fontSize,
        'font-weight': label.style.fontWeight ?? 500,
        'pointer-events': 'none',
      });
      textEl.textContent = label.text;
      g.appendChild(textEl);
    }

    this.nodesLayer.appendChild(g);
  }

  private renderEdge(
    edge: DiagramEdge,
    source: DiagramNode,
    target: DiagramNode,
    state: RenderState,
  ): void {
    const router = this.routers.get(edge.routing);
    const routed = router.route(source, target, edge, this.shapes);
    const isSelected = state.selectedEdgeIds.has(edge.id);

    const g = el('g', {
      class: 'diagrav-edge',
      'data-edge-id': edge.id,
    });

    const strokeColor = isSelected ? '#2563eb' : edge.style.stroke;

    // Wide invisible hit area for easy clicking & bend insertion
    const hitPath = el('path', {
      d: routed.pathD,
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': 14,
      cursor: state.mode === 'editor' ? 'pointer' : 'default',
      'data-edge-hit-id': edge.id,
    });
    g.appendChild(hitPath);

    const visiblePath = el('path', {
      d: routed.pathD,
      fill: 'none',
      stroke: strokeColor,
      'stroke-width': isSelected ? Math.max(2.25, edge.style.width) : edge.style.width,
      'stroke-dasharray': edge.style.dash?.length ? edge.style.dash.join(' ') : undefined,
      'stroke-opacity': edge.style.opacity ?? 1,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'marker-start': this.ensureArrowMarker(edge.style.sourceArrow, strokeColor, 'start'),
      'marker-end': this.ensureArrowMarker(edge.style.targetArrow, strokeColor, 'end'),
      'pointer-events': 'none',
    });
    g.appendChild(visiblePath);

    // Edge labels
    for (const label of edge.labels) {
      if (!label.text) continue;
      const pos = computeEdgeLabelPosition(routed.points, label);
      const pad = label.style.padding ?? 3;
      const approxW = Math.max(24, label.text.length * (label.style.fontSize * 0.58) + pad * 2);
      const approxH = label.style.fontSize + pad * 2;

      if (label.style.background) {
        g.appendChild(
          el('rect', {
            x: pos.x - approxW / 2,
            y: pos.y - approxH / 2,
            width: approxW,
            height: approxH,
            rx: 4,
            fill: label.style.background,
            'pointer-events': 'none',
          }),
        );
      }

      const textEl = el('text', {
        x: pos.x,
        y: pos.y,
        'text-anchor': pos.textAnchor,
        'dominant-baseline': pos.dominantBaseline,
        fill: label.style.color,
        'font-family': label.style.fontFamily ?? 'system-ui, sans-serif',
        'font-size': label.style.fontSize,
        'font-weight': label.style.fontWeight ?? 500,
        'pointer-events': 'none',
      });
      textEl.textContent = label.text;
      g.appendChild(textEl);
    }

    // Bend handles when selected in editor mode
    if (state.mode === 'editor' && isSelected) {
      edge.bends.forEach((bend, idx) => {
        const handle = el('circle', {
          class: 'diagrav-bend-handle',
          'data-bend-edge-id': edge.id,
          'data-bend-index': idx,
          cx: bend.x,
          cy: bend.y,
          r: 5,
          fill: '#ffffff',
          stroke: '#2563eb',
          'stroke-width': 2,
          cursor: 'grab',
        });
        g.appendChild(handle);
      });
    }

    this.edgesLayer.appendChild(g);
  }

  private renderOverlays(
    doc: DiagramDocument,
    nodeMap: Map<string, DiagramNode>,
    state: RenderState,
  ): void {
    // Snap lines
    for (const line of state.snapLines) {
      if (line.orientation === 'vertical') {
        this.overlayLayer.appendChild(
          el('line', {
            x1: line.value,
            y1: -10000,
            x2: line.value,
            y2: 10000,
            stroke: '#3b82f6',
            'stroke-width': 1 / doc.viewport.zoom,
            'stroke-dasharray': `${4 / doc.viewport.zoom} ${4 / doc.viewport.zoom}`,
            'pointer-events': 'none',
          }),
        );
      } else {
        this.overlayLayer.appendChild(
          el('line', {
            x1: -10000,
            y1: line.value,
            x2: 10000,
            y2: line.value,
            stroke: '#3b82f6',
            'stroke-width': 1 / doc.viewport.zoom,
            'stroke-dasharray': `${4 / doc.viewport.zoom} ${4 / doc.viewport.zoom}`,
            'pointer-events': 'none',
          }),
        );
      }
    }

    // Resize handles for single selected node
    if (state.selectedNodeIds.size === 1) {
      const id = Array.from(state.selectedNodeIds)[0];
      const node = nodeMap.get(id);
      if (node) {
        const { x, y, width: w, height: h } = node.geometry;
        const handles: Array<{ dir: string; hx: number; hy: number; cursor: string }> = [
          { dir: 'nw', hx: x, hy: y, cursor: 'nwse-resize' },
          { dir: 'n', hx: x + w / 2, hy: y, cursor: 'ns-resize' },
          { dir: 'ne', hx: x + w, hy: y, cursor: 'nesw-resize' },
          { dir: 'e', hx: x + w, hy: y + h / 2, cursor: 'ew-resize' },
          { dir: 'se', hx: x + w, hy: y + h, cursor: 'nwse-resize' },
          { dir: 's', hx: x + w / 2, hy: y + h, cursor: 'ns-resize' },
          { dir: 'sw', hx: x, hy: y + h, cursor: 'nesw-resize' },
          { dir: 'w', hx: x, hy: y + h / 2, cursor: 'ew-resize' },
        ];
        for (const hd of handles) {
          this.overlayLayer.appendChild(
            el('rect', {
              class: 'diagrav-resize-handle',
              'data-resize-node-id': node.id,
              'data-resize-dir': hd.dir,
              x: hd.hx - 4,
              y: hd.hy - 4,
              width: 8,
              height: 8,
              rx: 2,
              fill: '#ffffff',
              stroke: '#2563eb',
              'stroke-width': 1.5,
              cursor: hd.cursor,
            }),
          );
        }
      }
    }

    // Draft edge preview
    if (state.draftEdge) {
      const src = nodeMap.get(state.draftEdge.fromNodeId);
      if (src) {
        const start = this.shapes.get(src.type).getAnchorPoint(src, state.draftEdge.toPoint);
        const end = state.draftEdge.targetNodeId
          ? (() => {
              const tgt = nodeMap.get(state.draftEdge!.targetNodeId!);
              return tgt
                ? this.shapes.get(tgt.type).getAnchorPoint(tgt, start)
                : state.draftEdge!.toPoint;
            })()
          : state.draftEdge.toPoint;

        this.overlayLayer.appendChild(
          el('line', {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            stroke: '#2563eb',
            'stroke-width': 2,
            'stroke-dasharray': '5 4',
            'pointer-events': 'none',
          }),
        );
      }
    }
  }

  exportSvg(doc: DiagramDocument): string {
    const clone = this.svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', SVG_NS);
    // Remove grid & overlays from exported SVG
    clone.querySelector('.diagrav-overlay')?.remove();
    clone.querySelector('rect[fill="url(#diagrav-grid-pattern)"]')?.remove();

    // Compute tight bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of doc.nodes) {
      minX = Math.min(minX, n.geometry.x);
      minY = Math.min(minY, n.geometry.y);
      maxX = Math.max(maxX, n.geometry.x + n.geometry.width);
      maxY = Math.max(maxY, n.geometry.y + n.geometry.height);
    }
    for (const e of doc.edges) {
      for (const b of e.bends) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x);
        maxY = Math.max(maxY, b.y);
      }
    }

    const pad = 32;
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 300;
    }
    const vbX = Math.floor(minX - pad);
    const vbY = Math.floor(minY - pad);
    const vbW = Math.ceil(maxX - minX + pad * 2);
    const vbH = Math.ceil(maxY - minY + pad * 2);

    clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    clone.setAttribute('width', String(vbW));
    clone.setAttribute('height', String(vbH));
    const vp = clone.querySelector('.diagrav-viewport');
    if (vp) vp.removeAttribute('transform');

    const serialized = new XMLSerializer().serializeToString(clone);
    return `<!-- diagrav:v1 ${JSON.stringify(doc)} -->\n${serialized}`;
  }
}
