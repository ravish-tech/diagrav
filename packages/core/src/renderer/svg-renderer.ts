import type { AlignGuide, RectBox, SpacingGuide } from '../layout/alignment.js';
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
let rendererInstanceSeq = 0;

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

/** Safely serialize document JSON for embedding inside an SVG `<metadata>` text node. */
export function serializeMetadataJson(doc: DiagramDocument): string {
  return JSON.stringify(doc);
}

export interface RenderState {
  mode: DiagramMode;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  hoveredNodeId: string | null;
  showGrid: boolean;
  gridSize: number;
  draftEdge: { fromNodeId: string; toPoint: Point; targetNodeId: string | null } | null;
  snapLines: AlignGuide[];
  spacingGuides: SpacingGuide[];
  marqueeRect: RectBox | null;
  draggingLabel: { kind: 'node' | 'edge'; targetId: string; labelId: string; from: Point; to: Point } | null;
  /** Internal flag used during standalone SVG export to omit interactive hit paths. */
  exportMode?: boolean;
}

export class SvgRenderer {
  readonly svg: SVGSVGElement;
  private readonly idPrefix: string;
  private defs: SVGDefsElement;
  private gridPattern: SVGPatternElement | null = null;
  private gridRect: SVGRectElement;
  private viewportGroup: SVGGElement;
  private containersLayer: SVGGElement;
  private edgesLayer: SVGGElement;
  private nodesLayer: SVGGElement;
  private overlayLayer: SVGGElement;

  constructor(
    private container: HTMLElement | null,
    private shapes: ShapeRegistry,
    private routers: EdgeRouterRegistry,
    idPrefix?: string,
  ) {
    rendererInstanceSeq += 1;
    this.idPrefix = idPrefix ?? `dg_${rendererInstanceSeq}_`;

    this.svg = el('svg', {
      class: 'diagrav-svg',
      width: '100%',
      height: '100%',
      role: 'application',
      'aria-label': 'Diagrav diagram canvas',
      tabindex: 0,
    });
    this.svg.style.display = 'block';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.userSelect = 'none';
    (this.svg.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
    this.svg.style.touchAction = 'none';
    this.svg.style.outline = 'none';

    this.defs = el('defs');
    this.gridRect = el('rect', {
      class: 'diagrav-grid-rect',
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      fill: `url(#${this.idPrefix}grid-pattern)`,
      'pointer-events': 'none',
    });

    this.viewportGroup = el('g', { class: 'diagrav-viewport' });
    this.containersLayer = el('g', { class: 'diagrav-containers' });
    this.edgesLayer = el('g', { class: 'diagrav-edges' });
    this.nodesLayer = el('g', { class: 'diagrav-nodes' });
    this.overlayLayer = el('g', { class: 'diagrav-overlay' });

    this.viewportGroup.append(this.containersLayer, this.edgesLayer, this.nodesLayer, this.overlayLayer);
    this.svg.append(this.defs, this.gridRect, this.viewportGroup);
    if (this.container) {
      this.container.appendChild(this.svg);
    }
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

  /** Fast-path update for viewport-only changes (pan/zoom) without rebuilding scene DOM. */
  updateViewport(doc: DiagramDocument, state: RenderState): void {
    const { x, y, zoom } = doc.viewport;
    this.viewportGroup.setAttribute('transform', `translate(${x}, ${y}) scale(${zoom})`);

    if (this.gridPattern) {
      const step = state.gridSize * zoom;
      const offsetX = ((x % step) + step) % step;
      const offsetY = ((y % step) + step) % step;
      this.gridPattern.setAttribute('width', String(step));
      this.gridPattern.setAttribute('height', String(step));
      this.gridPattern.setAttribute('x', String(offsetX));
      this.gridPattern.setAttribute('y', String(offsetY));
      const dot = this.gridPattern.firstElementChild;
      if (dot) {
        dot.setAttribute('r', String(Math.max(0.75, Math.min(1.5, zoom))));
      }
    }
  }

  render(doc: DiagramDocument, state: RenderState): void {
    this.defs.innerHTML = '';
    this.containersLayer.innerHTML = '';
    this.edgesLayer.innerHTML = '';
    this.nodesLayer.innerHTML = '';
    this.overlayLayer.innerHTML = '';

    // 1. Grid pattern + drop shadow filter
    this.renderBaseDefs(doc, state);
    this.gridRect.setAttribute('display', state.showGrid && !state.exportMode ? 'inline' : 'none');

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
      this.renderEdge(edge, src, tgt, doc, state);
    }

    // 4. Render nodes
    for (const node of doc.nodes) {
      this.renderNode(node, doc, state);
    }

    // 5. Render overlays (draft edge, snap lines, selection handles)
    if (state.mode === 'editor' && !state.exportMode) {
      this.renderOverlays(doc, nodeMap, state);
    }
  }

  private renderBaseDefs(doc: DiagramDocument, state: RenderState): void {
    if (!state.exportMode) {
      const step = state.gridSize * doc.viewport.zoom;
      const offsetX = ((doc.viewport.x % step) + step) % step;
      const offsetY = ((doc.viewport.y % step) + step) % step;

      const pattern = el('pattern', {
        id: `${this.idPrefix}grid-pattern`,
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
        fill: 'rgba(148, 163, 184, 0.38)',
      });
      pattern.appendChild(dot);
      this.defs.appendChild(pattern);
      this.gridPattern = pattern;
    } else {
      this.gridPattern = null;
    }

    const shadow = el('filter', {
      id: `${this.idPrefix}shadow`,
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

    const safeNodeId = nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const gradId = `${this.idPrefix}grad-${safeNodeId}`;
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
    const id = `${this.idPrefix}arrow-${type}-${end}-${safeColor}`;
    if (this.defs.querySelector(`#${id}`)) return `url(#${id})`;

    // orient="auto-start-reverse" automatically flips marker-start 180deg,
    // so refX stays at the arrow tip for both start and end markers.
    const refX = type === 'circle' ? 6 : 10;

    const marker = el('marker', {
      id,
      viewBox: '0 0 12 12',
      refX,
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

  private renderMultilineText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    attrs: Record<string, string | number | undefined>,
  ): SVGTextElement {
    const lines = text.split('\n');
    const textEl = el('text', {
      x,
      y,
      style: 'user-select: none; -webkit-user-select: none;',
      ...attrs,
    });
    if (lines.length === 1) {
      textEl.textContent = text;
      return textEl;
    }
    const lineHeight = fontSize * 1.25;
    const baseline = attrs['dominant-baseline'];
    const startOffset =
      baseline === 'hanging'
        ? 0
        : baseline === 'auto'
          ? -(lines.length - 1) * lineHeight
          : -((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      const tspan = el('tspan', {
        x,
        dy: idx === 0 ? startOffset : lineHeight,
      });
      tspan.textContent = line || ' ';
      textEl.appendChild(tspan);
    });
    return textEl;
  }

  private renderNode(node: DiagramNode, doc: DiagramDocument, state: RenderState): void {
    const def = this.shapes.get(node.type);
    const isSelected = !state.exportMode && state.selectedNodeIds.has(node.id);
    const isHovered = !state.exportMode && state.hoveredNodeId === node.id;
    const { x, y, width, height, rotation = 0 } = node.geometry;
    const invZoom = 1 / Math.max(0.15, doc.viewport.zoom);

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
      filter: node.style.shadow ? `url(#${this.idPrefix}shadow)` : undefined,
    });
    g.appendChild(shapeEl);

    if (def.renderDecorations) {
      const decD = def.renderDecorations(width, height, node.style.border.radius);
      if (decD) {
        g.appendChild(
          el('path', {
            d: decD,
            fill: 'none',
            stroke: isSelected ? '#2563eb' : node.style.border.color,
            'stroke-width': Math.max(1, node.style.border.width * 0.9),
            'stroke-opacity': node.style.border.opacity ?? 1,
            'pointer-events': 'none',
          }),
        );
      }
    }

    // 4-side port handles offset outward by 12px so they NEVER collide with perimeter resize handles
    // and remain usable on BOTH hovered and single-selected nodes!
    const showPorts =
      state.mode === 'editor' &&
      !state.exportMode &&
      (isHovered ||
        (isSelected && state.selectedNodeIds.size === 1) ||
        state.draftEdge?.targetNodeId === node.id);

    if (showPorts) {
      const portOffset = 12 * invZoom;
      const ports: Array<{ id: string; cx: number; cy: number }> = [
        { id: 'n', cx: width / 2, cy: -portOffset },
        { id: 'e', cx: width + portOffset, cy: height / 2 },
        { id: 's', cx: width / 2, cy: height + portOffset },
        { id: 'w', cx: -portOffset, cy: height / 2 },
      ];
      for (const p of ports) {
        const portRing = el('circle', {
          class: 'diagrav-port-handle',
          'data-port-node-id': node.id,
          'data-port-side': p.id,
          cx: p.cx,
          cy: p.cy,
          r: 4.5 * invZoom,
          fill: '#2563eb',
          stroke: '#ffffff',
          'stroke-width': 1.75 * invZoom,
          cursor: 'crosshair',
        });
        g.appendChild(portRing);
      }
    }

    // Labels
    for (const label of node.labels) {
      if (!label.text) continue;
      const pos = computeNodeLabelPosition(node, label);
      const localX = pos.x - x;
      const localY = pos.y - y;
      const lines = label.text.split('\n');
      const maxLen = Math.max(...lines.map((l) => l.length));
      const pad = 4 * invZoom;
      const estW = Math.max(28, maxLen * label.style.fontSize * 0.62) + pad * 2;
      const estH = lines.length * label.style.fontSize * 1.25 + pad * 2;
      const boxX =
        pos.textAnchor === 'start'
          ? localX - pad
          : pos.textAnchor === 'end'
            ? localX - estW + pad
            : localX - estW / 2;
      const boxY =
        pos.dominantBaseline === 'hanging'
          ? localY - pad
          : pos.dominantBaseline === 'auto'
            ? localY - estH + pad
            : localY - estH / 2;
      const isDraggingThis = state.draggingLabel?.labelId === label.id;

      // External / free labels: full label pill is directly grabbable in 1 motion.
      // Internal labels: NEVER hijack the center of the node! Render a small grip chip at top-right of the text.
      if (state.mode === 'editor' && !state.exportMode) {
        if (label.placement.model !== 'internal') {
          g.appendChild(
            el('rect', {
              class: 'diagrav-label-handle',
              'data-label-kind': 'node',
              'data-label-target-id': node.id,
              'data-label-id': label.id,
              x: boxX,
              y: boxY,
              width: estW,
              height: estH,
              rx: 4 * invZoom,
              fill: isDraggingThis
                ? 'rgba(37, 99, 235, 0.14)'
                : isSelected
                  ? 'rgba(37, 99, 235, 0.06)'
                  : 'transparent',
              stroke: isSelected ? '#2563eb' : 'transparent',
              'stroke-width': 1 * invZoom,
              'stroke-dasharray': isSelected ? `${3 * invZoom} ${2 * invZoom}` : undefined,
              cursor: isDraggingThis ? 'grabbing' : 'grab',
              'pointer-events': 'all',
            }),
          );
        } else if (isSelected) {
          const chipSize = 9 * invZoom;
          g.appendChild(
            el('rect', {
              class: 'diagrav-label-handle',
              'data-label-kind': 'node',
              'data-label-target-id': node.id,
              'data-label-id': label.id,
              x: boxX + estW - chipSize / 2,
              y: boxY - chipSize / 2,
              width: chipSize,
              height: chipSize,
              rx: 2.5 * invZoom,
              fill: isDraggingThis ? '#2563eb' : '#eff6ff',
              stroke: '#2563eb',
              'stroke-width': 1.25 * invZoom,
              cursor: isDraggingThis ? 'grabbing' : 'grab',
              'pointer-events': 'all',
            }),
          );
        }
      }

      const textEl = this.renderMultilineText(
        label.text,
        localX,
        localY,
        label.style.fontSize,
        {
          'text-anchor': pos.textAnchor,
          'dominant-baseline': pos.dominantBaseline,
          fill: label.style.color,
          'font-family': label.style.fontFamily ?? 'system-ui, sans-serif',
          'font-size': label.style.fontSize,
          'font-weight': label.style.fontWeight ?? 500,
          'pointer-events': 'none',
        },
      );
      g.appendChild(textEl);
    }

    if (def.isContainer) {
      this.containersLayer.appendChild(g);
    } else {
      this.nodesLayer.appendChild(g);
    }
  }

  private renderEdge(
    edge: DiagramEdge,
    source: DiagramNode,
    target: DiagramNode,
    doc: DiagramDocument,
    state: RenderState,
  ): void {
    const router = this.routers.get(edge.routing);
    const routed = router.route(source, target, edge, this.shapes);
    const isSelected = !state.exportMode && state.selectedEdgeIds.has(edge.id);
    const invZoom = 1 / Math.max(0.15, doc.viewport.zoom);

    const g = el('g', {
      class: 'diagrav-edge',
      'data-edge-id': edge.id,
    });

    const strokeColor = isSelected ? '#2563eb' : edge.style.stroke;

    // Wide invisible hit area for easy clicking & bend insertion (omitted during SVG export)
    if (!state.exportMode) {
      const hitPath = el('path', {
        d: routed.pathD,
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': Math.max(12, 14 * invZoom),
        cursor: state.mode === 'editor' ? 'pointer' : 'default',
        'data-edge-hit-id': edge.id,
      });
      g.appendChild(hitPath);
    }

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
      const lines = label.text.split('\n');
      const maxLineLen = Math.max(...lines.map((l) => l.length));
      const approxW = Math.max(24, maxLineLen * (label.style.fontSize * 0.62) + pad * 2 + 4);
      const approxH = lines.length * label.style.fontSize * 1.25 + pad * 2;

      let bgRect: SVGRectElement | null = null;
      // Edge labels are ALWAYS directly clickable & draggable in editor mode (1-step UX!)
      const showLabelHandle = state.mode === 'editor' && !state.exportMode;
      const isDraggingThis = state.draggingLabel?.labelId === label.id;
      if (label.style.background || showLabelHandle) {
        bgRect = el('rect', {
          class: showLabelHandle ? 'diagrav-label-handle' : undefined,
          'data-label-kind': showLabelHandle ? 'edge' : undefined,
          'data-label-target-id': showLabelHandle ? edge.id : undefined,
          'data-label-id': showLabelHandle ? label.id : undefined,
          x: pos.x - approxW / 2,
          y: pos.y - approxH / 2,
          width: approxW,
          height: approxH,
          rx: 4,
          fill:
            label.style.background ??
            (isDraggingThis
              ? 'rgba(37, 99, 235, 0.14)'
              : isSelected
                ? 'rgba(37, 99, 235, 0.06)'
                : 'transparent'),
          stroke: showLabelHandle && isSelected ? '#2563eb' : 'transparent',
          'stroke-width': showLabelHandle ? 1 * invZoom : undefined,
          'stroke-dasharray': showLabelHandle && isSelected ? `${3 * invZoom} ${2 * invZoom}` : undefined,
          cursor: showLabelHandle ? (isDraggingThis ? 'grabbing' : 'grab') : undefined,
          'pointer-events': showLabelHandle ? 'all' : 'none',
        });
        g.appendChild(bgRect);
      }

      const textEl = this.renderMultilineText(
        label.text,
        pos.x,
        pos.y,
        label.style.fontSize,
        {
          'text-anchor': pos.textAnchor,
          'dominant-baseline': pos.dominantBaseline,
          fill: label.style.color,
          'font-family': label.style.fontFamily ?? 'system-ui, sans-serif',
          'font-size': label.style.fontSize,
          'font-weight': label.style.fontWeight ?? 500,
          'pointer-events': 'none',
        },
      );
      g.appendChild(textEl);

      // Refine pill background using real measured text bbox when attached to DOM
      if (bgRect && this.svg.isConnected) {
        this.edgesLayer.appendChild(g);
        try {
          const bbox = textEl.getBBox();
          if (bbox.width > 0 && bbox.height > 0) {
            bgRect.setAttribute('x', String(bbox.x - pad - 2));
            bgRect.setAttribute('y', String(bbox.y - pad));
            bgRect.setAttribute('width', String(bbox.width + pad * 2 + 4));
            bgRect.setAttribute('height', String(bbox.height + pad * 2));
          }
        } catch {
          // Fallback to estimated dimensions if SVG is hidden/unmeasured
        }
      }
    }

    // Bend handles when selected in editor mode
    if (state.mode === 'editor' && !state.exportMode && isSelected) {
      edge.bends.forEach((bend, idx) => {
        const handle = el('circle', {
          class: 'diagrav-bend-handle',
          'data-bend-edge-id': edge.id,
          'data-bend-index': idx,
          cx: bend.x,
          cy: bend.y,
          r: 5 * invZoom,
          fill: '#ffffff',
          stroke: '#2563eb',
          'stroke-width': 2 * invZoom,
          cursor: 'grab',
        });
        g.appendChild(handle);
      });
    }

    if (!g.parentNode) {
      this.edgesLayer.appendChild(g);
    }
  }

  private renderOverlays(
    doc: DiagramDocument,
    nodeMap: Map<string, DiagramNode>,
    state: RenderState,
  ): void {
    const invZoom = 1 / Math.max(0.15, doc.viewport.zoom);

    // 1. yEd-style alignment guide lines with cross ticks at anchor points
    const guideStroke = '#64748b';
    const crossHalf = 3.5 * invZoom;
    for (const line of state.snapLines) {
      if (line.orientation === 'vertical') {
        this.overlayLayer.appendChild(
          el('line', {
            x1: line.value,
            y1: line.from,
            x2: line.value,
            y2: line.to,
            stroke: guideStroke,
            'stroke-width': 1.1 * invZoom,
            'stroke-dasharray': `${4 * invZoom} ${3 * invZoom}`,
            'pointer-events': 'none',
          }),
        );
        for (const m of line.marks) {
          this.overlayLayer.appendChild(
            el('path', {
              d: `M ${line.value - crossHalf} ${m - crossHalf} L ${line.value + crossHalf} ${m + crossHalf} M ${line.value + crossHalf} ${m - crossHalf} L ${line.value - crossHalf} ${m + crossHalf}`,
              stroke: guideStroke,
              'stroke-width': 1.2 * invZoom,
              'pointer-events': 'none',
            }),
          );
        }
      } else {
        this.overlayLayer.appendChild(
          el('line', {
            x1: line.from,
            y1: line.value,
            x2: line.to,
            y2: line.value,
            stroke: guideStroke,
            'stroke-width': 1.1 * invZoom,
            'stroke-dasharray': `${4 * invZoom} ${3 * invZoom}`,
            'pointer-events': 'none',
          }),
        );
        for (const m of line.marks) {
          this.overlayLayer.appendChild(
            el('path', {
              d: `M ${m - crossHalf} ${line.value - crossHalf} L ${m + crossHalf} ${line.value + crossHalf} M ${m + crossHalf} ${line.value - crossHalf} L ${m - crossHalf} ${line.value + crossHalf}`,
              stroke: guideStroke,
              'stroke-width': 1.2 * invZoom,
              'pointer-events': 'none',
            }),
          );
        }
      }
    }

    // 2. yEd-style equal-spacing distance guides (chevrons + axis line + gap pill)
    const chevronSize = 4.5 * invZoom;
    const capHalf = 5 * invZoom;
    const spacingColor = '#2563eb';
    for (const sg of state.spacingGuides) {
      for (const seg of sg.segments) {
        if (sg.orientation === 'vertical') {
          const x = sg.axis;
          const y1 = Math.min(seg.start, seg.end);
          const y2 = Math.max(seg.start, seg.end);
          const midY = (y1 + y2) / 2;
          // Connector line + end caps + chevrons pointing at facing edges
          this.overlayLayer.appendChild(
            el('path', {
              d: [
                `M ${x} ${y1} L ${x} ${y2}`,
                `M ${x - capHalf} ${y1} L ${x + capHalf} ${y1}`,
                `M ${x - capHalf} ${y2} L ${x + capHalf} ${y2}`,
                `M ${x - chevronSize} ${y1 + chevronSize} L ${x} ${y1} L ${x + chevronSize} ${y1 + chevronSize}`,
                `M ${x - chevronSize} ${y2 - chevronSize} L ${x} ${y2} L ${x + chevronSize} ${y2 - chevronSize}`,
              ].join(' '),
              fill: 'none',
              stroke: spacingColor,
              'stroke-width': 1.25 * invZoom,
              'pointer-events': 'none',
            }),
          );
          if (y2 - y1 >= 18 * invZoom) {
            const labelW = 26 * invZoom;
            const labelH = 14 * invZoom;
            this.overlayLayer.appendChild(
              el('rect', {
                x: x + 6 * invZoom,
                y: midY - labelH / 2,
                width: labelW,
                height: labelH,
                rx: 3 * invZoom,
                fill: spacingColor,
                'pointer-events': 'none',
              }),
            );
            const txt = el('text', {
              x: x + 6 * invZoom + labelW / 2,
              y: midY,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              fill: '#ffffff',
              'font-family': 'system-ui, sans-serif',
              'font-size': 9.5 * invZoom,
              'font-weight': 600,
              'pointer-events': 'none',
            });
            txt.textContent = String(sg.gap);
            this.overlayLayer.appendChild(txt);
          }
        } else {
          const y = sg.axis;
          const x1 = Math.min(seg.start, seg.end);
          const x2 = Math.max(seg.start, seg.end);
          const midX = (x1 + x2) / 2;
          this.overlayLayer.appendChild(
            el('path', {
              d: [
                `M ${x1} ${y} L ${x2} ${y}`,
                `M ${x1} ${y - capHalf} L ${x1} ${y + capHalf}`,
                `M ${x2} ${y - capHalf} L ${x2} ${y + capHalf}`,
                `M ${x1 + chevronSize} ${y - chevronSize} L ${x1} ${y} L ${x1 + chevronSize} ${y + chevronSize}`,
                `M ${x2 - chevronSize} ${y - chevronSize} L ${x2} ${y} L ${x2 - chevronSize} ${y + chevronSize}`,
              ].join(' '),
              fill: 'none',
              stroke: spacingColor,
              'stroke-width': 1.25 * invZoom,
              'pointer-events': 'none',
            }),
          );
          if (x2 - x1 >= 18 * invZoom) {
            const labelW = 26 * invZoom;
            const labelH = 14 * invZoom;
            this.overlayLayer.appendChild(
              el('rect', {
                x: midX - labelW / 2,
                y: y - labelH - 5 * invZoom,
                width: labelW,
                height: labelH,
                rx: 3 * invZoom,
                fill: spacingColor,
                'pointer-events': 'none',
              }),
            );
            const txt = el('text', {
              x: midX,
              y: y - labelH / 2 - 5 * invZoom,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              fill: '#ffffff',
              'font-family': 'system-ui, sans-serif',
              'font-size': 9.5 * invZoom,
              'font-weight': 600,
              'pointer-events': 'none',
            });
            txt.textContent = String(sg.gap);
            this.overlayLayer.appendChild(txt);
          }
        }
      }
    }

    // 3. Marquee box selection overlay (Shift+drag on empty canvas)
    if (state.marqueeRect) {
      this.overlayLayer.appendChild(
        el('rect', {
          x: state.marqueeRect.x,
          y: state.marqueeRect.y,
          width: state.marqueeRect.width,
          height: state.marqueeRect.height,
          fill: 'rgba(37, 99, 235, 0.08)',
          stroke: '#2563eb',
          'stroke-width': 1.25 * invZoom,
          'stroke-dasharray': `${4 * invZoom} ${3 * invZoom}`,
          'pointer-events': 'none',
        }),
      );
    }

    // 4. Label tether line while dragging a label on canvas
    if (state.draggingLabel) {
      this.overlayLayer.appendChild(
        el('line', {
          x1: state.draggingLabel.from.x,
          y1: state.draggingLabel.from.y,
          x2: state.draggingLabel.to.x,
          y2: state.draggingLabel.to.y,
          stroke: '#2563eb',
          'stroke-width': 1 * invZoom,
          'stroke-dasharray': `${3 * invZoom} ${3 * invZoom}`,
          'pointer-events': 'none',
        }),
      );
    }

    // Resize handles for single selected node (zoom-invariant size)
    if (state.selectedNodeIds.size === 1) {
      const id = Array.from(state.selectedNodeIds)[0];
      const node = nodeMap.get(id);
      if (node) {
        const { x, y, width: w, height: h } = node.geometry;
        const size = 8 * invZoom;
        const half = size / 2;
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
              x: hd.hx - half,
              y: hd.hy - half,
              width: size,
              height: size,
              rx: 2 * invZoom,
              fill: '#ffffff',
              stroke: '#2563eb',
              'stroke-width': 1.5 * invZoom,
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
            'stroke-width': 2 * invZoom,
            'stroke-dasharray': `${5 * invZoom} ${4 * invZoom}`,
            'pointer-events': 'none',
          }),
        );
      }
    }
  }

  exportSvg(doc: DiagramDocument): string {
    // Render into a clean detached SVG with zero selection/editor artifacts
    const cleanRenderer = new SvgRenderer(null, this.shapes, this.routers, 'dg_exp_');
    const cleanDoc: DiagramDocument = {
      ...doc,
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    cleanRenderer.render(cleanDoc, {
      mode: 'readonly',
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      hoveredNodeId: null,
      showGrid: false,
      gridSize: 10,
      draftEdge: null,
      snapLines: [],
      spacingGuides: [],
      marqueeRect: null,
      draggingLabel: null,
      exportMode: true,
    });

    const exportSvg = cleanRenderer.svg;
    exportSvg.setAttribute('xmlns', SVG_NS);
    exportSvg.removeAttribute('style');
    exportSvg.removeAttribute('tabindex');
    exportSvg.removeAttribute('role');
    exportSvg.querySelector('.diagrav-overlay')?.remove();
    exportSvg.querySelector('.diagrav-grid-rect')?.remove();
    exportSvg.querySelector('.diagrav-viewport')?.removeAttribute('transform');

    // Compute accurate bounding box covering nodes, routed edges, bends, and labels
    const nodeMap = new Map<string, DiagramNode>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const expand = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const n of doc.nodes) {
      nodeMap.set(n.id, n);
      const margin = n.style.shadow ? 12 : 4;
      expand(n.geometry.x - margin, n.geometry.y - margin);
      expand(n.geometry.x + n.geometry.width + margin, n.geometry.y + n.geometry.height + margin);
      for (const lbl of n.labels) {
        if (!lbl.text) continue;
        const pos = computeNodeLabelPosition(n, lbl);
        const halfW = (lbl.text.length * lbl.style.fontSize * 0.62) / 2;
        const halfH = lbl.style.fontSize * 0.8;
        expand(pos.x - halfW, pos.y - halfH);
        expand(pos.x + halfW, pos.y + halfH);
      }
    }

    for (const e of doc.edges) {
      const src = nodeMap.get(e.source.nodeId);
      const tgt = nodeMap.get(e.target.nodeId);
      if (src && tgt) {
        const routed = this.routers.get(e.routing).route(src, tgt, e, this.shapes);
        for (const p of routed.points) {
          expand(p.x - 8, p.y - 8);
          expand(p.x + 8, p.y + 8);
        }
        for (const lbl of e.labels) {
          if (!lbl.text) continue;
          const pos = computeEdgeLabelPosition(routed.points, lbl);
          const halfW = (lbl.text.length * lbl.style.fontSize * 0.62) / 2 + 6;
          const halfH = lbl.style.fontSize * 0.8 + 6;
          expand(pos.x - halfW, pos.y - halfH);
          expand(pos.x + halfW, pos.y + halfH);
        }
      }
    }

    const pad = 28;
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

    exportSvg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    exportSvg.setAttribute('width', String(vbW));
    exportSvg.setAttribute('height', String(vbH));

    // Embed canonical JSON safely inside <metadata> text node (XMLSerializer escapes <, >, & safely)
    const metadata = document.createElementNS(SVG_NS, 'metadata');
    metadata.setAttribute('data-diagrav-version', '1');
    metadata.textContent = serializeMetadataJson(doc);
    exportSvg.insertBefore(metadata, exportSvg.firstChild);

    return new XMLSerializer().serializeToString(exportSvg);
  }
}
