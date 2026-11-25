import type { DiagramDocument, SelectionState, ShapeDefinition } from '@diagrav/core';
import { Badge, Stack } from 'jenni-react';

export interface StructurePanelProps {
  doc: DiagramDocument;
  shapes: ShapeDefinition[];
  selection: SelectionState;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
}

export function StructurePanel({
  doc,
  shapes,
  selection,
  onSelectNode,
  onSelectEdge,
}: StructurePanelProps) {
  const shapeMap = new Map(shapes.map((s) => [s.type, s]));
  const containers = doc.nodes.filter((n) => shapeMap.get(n.type)?.isContainer);
  const regularNodes = doc.nodes.filter((n) => !shapeMap.get(n.type)?.isContainer);
  const nodeName = (id: string) => {
    const n = doc.nodes.find((x) => x.id === id);
    return n?.labels[0]?.text?.replace(/\n/g, ' ') || n?.type || id;
  };

  if (doc.nodes.length === 0 && doc.edges.length === 0) {
    return (
      <div className="diagrav-panel">
        <div style={{ fontSize: 12, color: 'var(--j-fg-muted, #64748b)' }}>
          Empty diagram. Drag shapes from Palette to start.
        </div>
      </div>
    );
  }

  return (
    <div className="diagrav-panel diagrav-structure-panel">
      <Stack gap="related">
        {containers.length > 0 && (
          <div>
            <div className="diagrav-section-title">Containers ({containers.length})</div>
            <div className="diagrav-structure-list">
              {containers.map((n) => {
                const selected = selection.nodeIds.includes(n.id);
                const label = n.labels[0]?.text?.replace(/\n/g, ' ') || shapeMap.get(n.type)?.label || n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`diagrav-structure-item ${selected ? 'is-selected' : ''}`}
                    onClick={() => onSelectNode(n.id)}
                  >
                    <span className="diagrav-structure-name">{label}</span>
                    <Badge variant="soft" tone="neutral" size="sm">
                      {shapeMap.get(n.type)?.label ?? n.type}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="diagrav-section-title">Nodes ({regularNodes.length})</div>
          <div className="diagrav-structure-list">
            {regularNodes.map((n) => {
              const selected = selection.nodeIds.includes(n.id);
              const label = n.labels[0]?.text?.replace(/\n/g, ' ') || shapeMap.get(n.type)?.label || n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`diagrav-structure-item ${selected ? 'is-selected' : ''}`}
                  onClick={() => onSelectNode(n.id)}
                >
                  <span className="diagrav-structure-name">{label}</span>
                  <Badge variant="soft" tone="neutral" size="sm">
                    {shapeMap.get(n.type)?.label ?? n.type}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {doc.edges.length > 0 && (
          <div>
            <div className="diagrav-section-title">Connections ({doc.edges.length})</div>
            <div className="diagrav-structure-list">
              {doc.edges.map((e) => {
                const selected = selection.edgeIds.includes(e.id);
                const lbl = e.labels[0]?.text?.replace(/\n/g, ' ');
                const title = lbl
                  ? `${lbl} (${nodeName(e.source.nodeId)} → ${nodeName(e.target.nodeId)})`
                  : `${nodeName(e.source.nodeId)} → ${nodeName(e.target.nodeId)}`;
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`diagrav-structure-item ${selected ? 'is-selected' : ''}`}
                    onClick={() => onSelectEdge(e.id)}
                  >
                    <span className="diagrav-structure-name">{title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Stack>
    </div>
  );
}
