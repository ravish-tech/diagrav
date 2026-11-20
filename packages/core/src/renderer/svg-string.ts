import { EdgeRouterRegistry } from '../registries/edges.js';
import { computeEdgeLabelPosition, computeNodeLabelPosition } from '../registries/labels.js';
import { ShapeRegistry } from '../registries/shapes.js';
import type { ArrowType, DiagramDocument, DiagramNode, FillStyle } from '../schema/types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function attrsToString(attrs: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) {
      parts.push(`${k}="${escapeXml(String(v))}"`);
    }
  }
  return parts.join(' ');
}

function renderMultilineTextSvg(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  attrs: Record<string, string | number | undefined>,
): string {
  const lines = text.split('\n');
  const attrStr = attrsToString({ x, y, ...attrs });
  if (lines.length === 1) {
    return `<text ${attrStr}>${escapeXml(text)}</text>`;
  }
  const lineHeight = fontSize * 1.25;
  const startOffset = -((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map(
      (line, idx) =>
        `<tspan x="${x}" dy="${idx === 0 ? startOffset : lineHeight}">${escapeXml(line || ' ')}</tspan>`,
    )
    .join('');
  return `<text ${attrStr}>${tspans}</text>`;
}

/**
 * Pure, DOM-free standalone SVG exporter for `@diagrav/core`.
 * Runs identically in Node.js (for headless `@diagrav/mcp` agents) and browsers.
 */
export function exportDocumentToSvg(
  doc: DiagramDocument,
  shapes: ShapeRegistry = new ShapeRegistry(),
  routers: EdgeRouterRegistry = new EdgeRouterRegistry(),
): string {
  const defs: string[] = [
    `<filter id="dg_exp_shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.14"/></filter>`,
  ];
  const seenMarkers = new Set<string>();

  const ensureArrow = (type: ArrowType, color: string, end: 'start' | 'end'): string | undefined => {
    if (type === 'none') return undefined;
    const safeColor = color.replace(/[^a-zA-Z0-9]/g, '');
    const id = `dg_exp_arrow_${type}_${end}_${safeColor}`;
    if (!seenMarkers.has(id)) {
      seenMarkers.add(id);
      const refX = type === 'circle' ? 6 : 10;
      let inner = '';
      switch (type) {
        case 'standard':
          inner = `<path d="M 0 1 L 11 6 L 0 11 L 2.5 6 Z" fill="${escapeXml(color)}"/>`;
          break;
        case 'triangle':
          inner = `<path d="M 0 1 L 11 6 L 0 11 Z" fill="${escapeXml(color)}"/>`;
          break;
        case 'open':
          inner = `<path d="M 1 1 L 10 6 L 1 11" fill="none" stroke="${escapeXml(color)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
          break;
        case 'diamond':
          inner = `<path d="M 0 6 L 5.5 1.5 L 11 6 L 5.5 10.5 Z" fill="${escapeXml(color)}"/>`;
          break;
        case 'circle':
          inner = `<circle cx="6" cy="6" r="4" fill="${escapeXml(color)}"/>`;
          break;
      }
      defs.push(
        `<marker id="${id}" viewBox="0 0 12 12" refX="${refX}" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="strokeWidth">${inner}</marker>`,
      );
    }
    return `url(#${id})`;
  };

  const resolveFill = (nodeId: string, fill: FillStyle): { fill: string; opacity?: number } => {
    if (fill.type === 'none') return { fill: 'none' };
    if (fill.type === 'solid') return { fill: fill.color, opacity: fill.opacity };

    const safeId = nodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const gradId = `dg_exp_grad_${safeId}`;
    const stops = fill.stops
      .map(
        (s) =>
          `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${escapeXml(s.color)}" stop-opacity="${s.opacity ?? 1}"/>`,
      )
      .join('');

    if (fill.type === 'linear-gradient') {
      const rad = ((fill.angle - 90) * Math.PI) / 180;
      const x1 = (50 - Math.cos(rad) * 50).toFixed(1);
      const y1 = (50 - Math.sin(rad) * 50).toFixed(1);
      const x2 = (50 + Math.cos(rad) * 50).toFixed(1);
      const y2 = (50 + Math.sin(rad) * 50).toFixed(1);
      defs.push(
        `<linearGradient id="${gradId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`,
      );
    } else {
      const cx = ((fill.cx ?? 0.5) * 100).toFixed(1);
      const cy = ((fill.cy ?? 0.5) * 100).toFixed(1);
      const r = ((fill.r ?? 0.5) * 100).toFixed(1);
      defs.push(`<radialGradient id="${gradId}" cx="${cx}%" cy="${cy}%" r="${r}%">${stops}</radialGradient>`);
    }
    return { fill: `url(#${gradId})` };
  };

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

  // Render edges
  const edgeFragments: string[] = [];
  for (const edge of doc.edges) {
    const src = nodeMap.get(edge.source.nodeId);
    const tgt = nodeMap.get(edge.target.nodeId);
    if (!src || !tgt) continue;
    const routed = routers.get(edge.routing).route(src, tgt, edge, shapes);
    for (const p of routed.points) {
      expand(p.x - 8, p.y - 8);
      expand(p.x + 8, p.y + 8);
    }

    const pathAttrs = attrsToString({
      d: routed.pathD,
      fill: 'none',
      stroke: edge.style.stroke,
      'stroke-width': edge.style.width,
      'stroke-dasharray': edge.style.dash?.length ? edge.style.dash.join(' ') : undefined,
      'stroke-opacity': edge.style.opacity ?? 1,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'marker-start': ensureArrow(edge.style.sourceArrow, edge.style.stroke, 'start'),
      'marker-end': ensureArrow(edge.style.targetArrow, edge.style.stroke, 'end'),
    });

    const labelFragments: string[] = [];
    for (const lbl of edge.labels) {
      if (!lbl.text) continue;
      const pos = computeEdgeLabelPosition(routed.points, lbl);
      const pad = lbl.style.padding ?? 3;
      const lines = lbl.text.split('\n');
      const maxLen = Math.max(...lines.map((l) => l.length));
      const approxW = Math.max(24, maxLen * (lbl.style.fontSize * 0.62) + pad * 2 + 4);
      const approxH = lines.length * lbl.style.fontSize * 1.25 + pad * 2;
      expand(pos.x - approxW / 2, pos.y - approxH / 2);
      expand(pos.x + approxW / 2, pos.y + approxH / 2);

      if (lbl.style.background) {
        labelFragments.push(
          `<rect ${attrsToString({
            x: pos.x - approxW / 2,
            y: pos.y - approxH / 2,
            width: approxW,
            height: approxH,
            rx: 4,
            fill: lbl.style.background,
          })}/>`,
        );
      }
      labelFragments.push(
        renderMultilineTextSvg(lbl.text, pos.x, pos.y, lbl.style.fontSize, {
          'text-anchor': pos.textAnchor,
          'dominant-baseline': pos.dominantBaseline,
          fill: lbl.style.color,
          'font-family': lbl.style.fontFamily ?? 'system-ui, sans-serif',
          'font-size': lbl.style.fontSize,
          'font-weight': lbl.style.fontWeight ?? 500,
        }),
      );
    }

    edgeFragments.push(
      `<g class="diagrav-edge" data-edge-id="${escapeXml(edge.id)}"><path ${pathAttrs}/>${labelFragments.join('')}</g>`,
    );
  }

  // Render nodes (containers behind edges & normal nodes)
  const containerFragments: string[] = [];
  const nodeFragments: string[] = [];
  for (const node of doc.nodes) {
    const def = shapes.get(node.type);
    const { x, y, width, height, rotation = 0 } = node.geometry;
    const transform =
      rotation !== 0
        ? `translate(${x}, ${y}) rotate(${rotation}, ${width / 2}, ${height / 2})`
        : `translate(${x}, ${y})`;
    const fill = resolveFill(node.id, node.style.fill);
    const pathAttrs = attrsToString({
      d: def.renderPath(width, height, node.style.border.radius),
      fill: fill.fill,
      'fill-opacity': fill.opacity,
      stroke: node.style.border.color,
      'stroke-width': node.style.border.width,
      'stroke-dasharray': node.style.border.dash?.length ? node.style.border.dash.join(' ') : undefined,
      'stroke-opacity': node.style.border.opacity ?? 1,
      filter: node.style.shadow ? 'url(#dg_exp_shadow)' : undefined,
    });

    const decD = def.renderDecorations?.(width, height, node.style.border.radius);
    const decSvg = decD
      ? `<path ${attrsToString({
          d: decD,
          fill: 'none',
          stroke: node.style.border.color,
          'stroke-width': Math.max(1, node.style.border.width * 0.9),
          'stroke-opacity': node.style.border.opacity ?? 1,
        })}/>`
      : '';

    const labelFragments: string[] = [];
    for (const lbl of node.labels) {
      if (!lbl.text) continue;
      const pos = computeNodeLabelPosition(node, lbl);
      labelFragments.push(
        renderMultilineTextSvg(lbl.text, pos.x - x, pos.y - y, lbl.style.fontSize, {
          'text-anchor': pos.textAnchor,
          'dominant-baseline': pos.dominantBaseline,
          fill: lbl.style.color,
          'font-family': lbl.style.fontFamily ?? 'system-ui, sans-serif',
          'font-size': lbl.style.fontSize,
          'font-weight': lbl.style.fontWeight ?? 500,
        }),
      );
    }

    const frag = `<g class="diagrav-node" data-node-id="${escapeXml(node.id)}" transform="${transform}"><path ${pathAttrs}/>${decSvg}${labelFragments.join('')}</g>`;
    if (def.isContainer) containerFragments.push(frag);
    else nodeFragments.push(frag);
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

  const metadataJson = escapeXml(JSON.stringify(doc));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">`,
    `<metadata data-diagrav-version="1">${metadataJson}</metadata>`,
    `<defs>${defs.join('')}</defs>`,
    `<g class="diagrav-viewport">`,
    `<g class="diagrav-containers">${containerFragments.join('')}</g>`,
    `<g class="diagrav-edges">${edgeFragments.join('')}</g>`,
    `<g class="diagrav-nodes">${nodeFragments.join('')}</g>`,
    `</g>`,
    `</svg>`,
  ].join('');
}
