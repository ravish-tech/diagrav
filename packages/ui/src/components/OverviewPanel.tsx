import type { DiagramDocument, Point } from '@diagrav/core';
import { useRef } from 'react';

export interface OverviewPanelProps {
  doc: DiagramDocument;
  canvasSize: { width: number; height: number };
  onCenterOnWorld: (worldPt: Point) => void;
}

export function OverviewPanel({ doc, canvasSize, onCenterOnWorld }: OverviewPanelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  // Compute world bounds covering all nodes + current viewport
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

  const vp = doc.viewport;
  const vpWorldX = -vp.x / vp.zoom;
  const vpWorldY = -vp.y / vp.zoom;
  const vpWorldW = Math.max(100, canvasSize.width / vp.zoom);
  const vpWorldH = Math.max(80, canvasSize.height / vp.zoom);

  if (!Number.isFinite(minX)) {
    minX = vpWorldX;
    minY = vpWorldY;
    maxX = vpWorldX + vpWorldW;
    maxY = vpWorldY + vpWorldH;
  } else {
    minX = Math.min(minX, vpWorldX);
    minY = Math.min(minY, vpWorldY);
    maxX = Math.max(maxX, vpWorldX + vpWorldW);
    maxY = Math.max(maxY, vpWorldY + vpWorldH);
  }

  const pad = 40;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = Math.max(100, maxX - minX + pad * 2);
  const vbH = Math.max(80, maxY - minY + pad * 2);

  const clientToWorld = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scale = Math.min(rect.width / vbW, rect.height / vbH);
    const renderedW = vbW * scale;
    const renderedH = vbH * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    return {
      x: vbX + (clientX - rect.left - offsetX) / scale,
      y: vbY + (clientY - rect.top - offsetY) / scale,
    };
  };

  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));

  return (
    <div className="diagrav-panel diagrav-overview-panel">
      <svg
        ref={svgRef}
        className="diagrav-overview-svg"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          const pt = clientToWorld(e.clientX, e.clientY);
          if (pt) onCenterOnWorld(pt);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const pt = clientToWorld(e.clientX, e.clientY);
          if (pt) onCenterOnWorld(pt);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        {/* Edges */}
        {doc.edges.map((e) => {
          const s = nodeMap.get(e.source.nodeId);
          const t = nodeMap.get(e.target.nodeId);
          if (!s || !t) return null;
          return (
            <line
              key={e.id}
              x1={s.geometry.x + s.geometry.width / 2}
              y1={s.geometry.y + s.geometry.height / 2}
              x2={t.geometry.x + t.geometry.width / 2}
              y2={t.geometry.y + t.geometry.height / 2}
              stroke="#94a3b8"
              strokeWidth={Math.max(2, vbW * 0.004)}
            />
          );
        })}

        {/* Nodes */}
        {doc.nodes.map((n) => {
          const fill =
            n.style.fill.type === 'solid'
              ? n.style.fill.color
              : n.style.fill.type === 'linear-gradient' || n.style.fill.type === 'radial-gradient'
                ? n.style.fill.stops[0]?.color ?? '#e2e8f0'
                : 'transparent';
          return (
            <rect
              key={n.id}
              x={n.geometry.x}
              y={n.geometry.y}
              width={n.geometry.width}
              height={n.geometry.height}
              rx={n.style.border.radius ?? 4}
              fill={fill}
              stroke={n.style.border.color}
              strokeWidth={Math.max(2, vbW * 0.004)}
            />
          );
        })}

        {/* Active Viewport Indicator */}
        <rect
          x={vpWorldX}
          y={vpWorldY}
          width={vpWorldW}
          height={vpWorldH}
          fill="rgba(37, 99, 235, 0.08)"
          stroke="#2563eb"
          strokeWidth={Math.max(2.5, vbW * 0.006)}
          rx={4}
        />
      </svg>
    </div>
  );
}
