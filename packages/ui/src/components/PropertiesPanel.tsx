import {
  createDefaultEdgeLabel,
  createDefaultNodeLabel,
  type ArrowType,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
  type EdgeLabelPlacement,
  type EdgePatch,
  type EdgeRouting,
  type FillStyle,
  type NodeLabelPlacement,
  type NodeLabelPosition,
  type NodePatch,
  type ShapeDefinition,
} from '@diagrav/core';
import {
  Button,
  ColorPicker,
  Field,
  Input,
  NumberInput,
  Select,
  Separator,
  Stack,
  Switch,
} from 'jenni-react';

export interface PropertiesPanelProps {
  doc: DiagramDocument;
  selectedNode: DiagramNode | null;
  selectedEdge: DiagramEdge | null;
  shapes: ShapeDefinition[];
  readOnly: boolean;
  onUpdateNode: (id: string, patch: NodePatch) => void;
  onUpdateEdge: (id: string, patch: EdgePatch) => void;
}

const ARROW_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'standard', label: 'Standard' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'open', label: 'Open' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' },
];

const ROUTING_OPTIONS = [
  { value: 'polyline', label: 'Polyline (Bends)' },
  { value: 'orthogonal', label: 'Orthogonal' },
  { value: 'straight', label: 'Straight' },
  { value: 'bezier', label: 'Bezier' },
];

const NODE_LABEL_POS_OPTIONS: Array<{ value: NodeLabelPosition; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

export function PropertiesPanel({
  doc,
  selectedNode,
  selectedEdge,
  shapes,
  readOnly,
  onUpdateNode,
  onUpdateEdge,
}: PropertiesPanelProps) {
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="diagrav-panel">
        <Stack gap="item">
          <div className="diagrav-section-title">Properties</div>
          <div style={{ fontSize: 13, color: 'var(--j-fg-muted, #64748b)' }}>
            <strong>{doc.meta.title}</strong>
            <br />
            {doc.nodes.length} nodes · {doc.edges.length} edges
          </div>
          <Separator />
          <div style={{ fontSize: 12, color: 'var(--j-fg-muted, #64748b)', lineHeight: 1.5 }}>
            <div>• Drag shapes from the Palette onto the canvas.</div>
            <div>• Hover a node and drag its blue port (or use Connect tool) to link nodes.</div>
            <div>• Select an edge and drag it to insert bend points. Double-click a bend to remove it.</div>
            <div>• Double-click or press F2 to edit labels inline.</div>
          </div>
        </Stack>
      </div>
    );
  }

  if (selectedNode) {
    const fill = selectedNode.style.fill;
    const primaryLabel = selectedNode.labels[0] ?? createDefaultNodeLabel('');
    const solidColor = fill.type === 'solid' ? fill.color : '#f8fafc';
    const gradStart =
      fill.type === 'linear-gradient' || fill.type === 'radial-gradient'
        ? fill.stops[0]?.color ?? '#eff6ff'
        : '#eff6ff';
    const gradEnd =
      fill.type === 'linear-gradient' || fill.type === 'radial-gradient'
        ? fill.stops[fill.stops.length - 1]?.color ?? '#bfdbfe'
        : '#bfdbfe';
    const gradAngle = fill.type === 'linear-gradient' ? fill.angle : 135;

    const handleFillTypeChange = (nextType: string) => {
      let nextFill: FillStyle;
      if (nextType === 'none') nextFill = { type: 'none' };
      else if (nextType === 'solid') nextFill = { type: 'solid', color: solidColor, opacity: 1 };
      else if (nextType === 'linear-gradient') {
        nextFill = {
          type: 'linear-gradient',
          angle: gradAngle,
          stops: [
            { color: gradStart, offset: 0 },
            { color: gradEnd, offset: 1 },
          ],
        };
      } else {
        nextFill = {
          type: 'radial-gradient',
          cx: 0.5,
          cy: 0.5,
          r: 0.65,
          stops: [
            { color: gradStart, offset: 0 },
            { color: gradEnd, offset: 1 },
          ],
        };
      }
      onUpdateNode(selectedNode.id, { style: { fill: nextFill } });
    };

    const updatePrimaryLabel = (
      patch: {
        text?: string;
        placement?: Partial<NodeLabelPlacement>;
        style?: Partial<typeof primaryLabel.style>;
      },
    ) => {
      const updated = {
        ...primaryLabel,
        text: patch.text ?? primaryLabel.text,
        placement: patch.placement
          ? { ...primaryLabel.placement, ...patch.placement }
          : primaryLabel.placement,
        style: patch.style ? { ...primaryLabel.style, ...patch.style } : primaryLabel.style,
      };
      const nextLabels =
        selectedNode.labels.length > 0
          ? [updated, ...selectedNode.labels.slice(1)]
          : [updated];
      onUpdateNode(selectedNode.id, { labels: nextLabels });
    };

    return (
      <div className="diagrav-panel">
        <Stack gap="item">
          <div className="diagrav-section-title">Node</div>

          <Field label="Shape">
            <Select
              size="sm"
              disabled={readOnly}
              value={selectedNode.type}
              onValueChange={(v) => onUpdateNode(selectedNode.id, { type: v })}
              options={shapes.map((s) => ({ value: s.type, label: s.label }))}
            />
          </Field>

          <div className="diagrav-prop-grid-2">
            <Field label="X">
              <NumberInput
                size="sm"
                disabled={readOnly}
                value={Math.round(selectedNode.geometry.x)}
                onValueChange={(v) =>
                  v !== null && onUpdateNode(selectedNode.id, { geometry: { x: v } })
                }
              />
            </Field>
            <Field label="Y">
              <NumberInput
                size="sm"
                disabled={readOnly}
                value={Math.round(selectedNode.geometry.y)}
                onValueChange={(v) =>
                  v !== null && onUpdateNode(selectedNode.id, { geometry: { y: v } })
                }
              />
            </Field>
            <Field label="Width">
              <NumberInput
                size="sm"
                min={36}
                disabled={readOnly}
                value={Math.round(selectedNode.geometry.width)}
                onValueChange={(v) =>
                  v !== null && onUpdateNode(selectedNode.id, { geometry: { width: v } })
                }
              />
            </Field>
            <Field label="Height">
              <NumberInput
                size="sm"
                min={28}
                disabled={readOnly}
                value={Math.round(selectedNode.geometry.height)}
                onValueChange={(v) =>
                  v !== null && onUpdateNode(selectedNode.id, { geometry: { height: v } })
                }
              />
            </Field>
          </div>

          <Separator />
          <div className="diagrav-section-title">Fill</div>

          <Field label="Fill Type">
            <Select
              size="sm"
              disabled={readOnly}
              value={fill.type}
              onValueChange={handleFillTypeChange}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'linear-gradient', label: 'Linear Gradient' },
                { value: 'radial-gradient', label: 'Radial Gradient' },
                { value: 'none', label: 'None' },
              ]}
            />
          </Field>

          {fill.type === 'solid' && (
            <Field label="Color">
              <ColorPicker
                size="sm"
                disabled={readOnly}
                value={fill.color}
                onValueChange={(c) =>
                  onUpdateNode(selectedNode.id, { style: { fill: { ...fill, color: c } } })
                }
              />
            </Field>
          )}

          {(fill.type === 'linear-gradient' || fill.type === 'radial-gradient') && (
            <>
              <div className="diagrav-prop-grid-2">
                <Field label="Start">
                  <ColorPicker
                    size="sm"
                    disabled={readOnly}
                    value={gradStart}
                    onValueChange={(c) =>
                      onUpdateNode(selectedNode.id, {
                        style: {
                          fill: {
                            ...fill,
                            stops: [
                              { color: c, offset: 0 },
                              { color: gradEnd, offset: 1 },
                            ],
                          },
                        },
                      })
                    }
                  />
                </Field>
                <Field label="End">
                  <ColorPicker
                    size="sm"
                    disabled={readOnly}
                    value={gradEnd}
                    onValueChange={(c) =>
                      onUpdateNode(selectedNode.id, {
                        style: {
                          fill: {
                            ...fill,
                            stops: [
                              { color: gradStart, offset: 0 },
                              { color: c, offset: 1 },
                            ],
                          },
                        },
                      })
                    }
                  />
                </Field>
              </div>
              {fill.type === 'linear-gradient' && (
                <Field label="Angle (°)">
                  <NumberInput
                    size="sm"
                    min={0}
                    max={360}
                    step={15}
                    disabled={readOnly}
                    value={fill.angle}
                    onValueChange={(v) =>
                      v !== null &&
                      onUpdateNode(selectedNode.id, { style: { fill: { ...fill, angle: v } } })
                    }
                  />
                </Field>
              )}
            </>
          )}

          <Separator />
          <div className="diagrav-section-title">Border</div>

          <Field label="Color">
            <ColorPicker
              size="sm"
              disabled={readOnly}
              value={selectedNode.style.border.color}
              onValueChange={(c) =>
                onUpdateNode(selectedNode.id, { style: { border: { color: c } } })
              }
            />
          </Field>

          <div className="diagrav-prop-grid-2">
            <Field label="Width">
              <NumberInput
                size="sm"
                min={0}
                max={12}
                step={0.5}
                disabled={readOnly}
                value={selectedNode.style.border.width}
                onValueChange={(v) =>
                  v !== null &&
                  onUpdateNode(selectedNode.id, { style: { border: { width: v } } })
                }
              />
            </Field>
            <Field label="Radius">
              <NumberInput
                size="sm"
                min={0}
                max={48}
                disabled={readOnly}
                value={selectedNode.style.border.radius ?? 0}
                onValueChange={(v) =>
                  v !== null &&
                  onUpdateNode(selectedNode.id, { style: { border: { radius: v } } })
                }
              />
            </Field>
          </div>

          <Switch
            size="sm"
            label="Dashed border"
            disabled={readOnly}
            checked={Boolean(selectedNode.style.border.dash?.length)}
            onCheckedChange={(checked) =>
              onUpdateNode(selectedNode.id, {
                style: { border: { dash: checked ? [6, 4] : [] } },
              })
            }
          />
          <Switch
            size="sm"
            label="Drop shadow"
            disabled={readOnly}
            checked={Boolean(selectedNode.style.shadow)}
            onCheckedChange={(checked) =>
              onUpdateNode(selectedNode.id, { style: { shadow: checked } })
            }
          />

          <Separator />
          <div className="diagrav-section-title">Label</div>

          <Field label="Text">
            <Input
              size="sm"
              disabled={readOnly}
              value={primaryLabel.text}
              onValueChange={(text) => updatePrimaryLabel({ text })}
            />
          </Field>

          <div className="diagrav-prop-grid-2">
            <Field label="Model">
              <Select
                size="sm"
                disabled={readOnly}
                value={primaryLabel.placement.model}
                onValueChange={(v) =>
                  updatePrimaryLabel({
                    placement: { model: v as NodeLabelPlacement['model'] },
                  })
                }
                options={[
                  { value: 'internal', label: 'Internal' },
                  { value: 'external', label: 'External' },
                  { value: 'free', label: 'Free' },
                ]}
              />
            </Field>
            <Field label="Position">
              <Select
                size="sm"
                disabled={readOnly}
                value={primaryLabel.placement.position}
                onValueChange={(v) =>
                  updatePrimaryLabel({
                    placement: { position: v as NodeLabelPosition },
                  })
                }
                options={NODE_LABEL_POS_OPTIONS}
              />
            </Field>
          </div>

          <div className="diagrav-prop-grid-2">
            <Field label="Font Size">
              <NumberInput
                size="sm"
                min={8}
                max={48}
                disabled={readOnly}
                value={primaryLabel.style.fontSize}
                onValueChange={(v) =>
                  v !== null && updatePrimaryLabel({ style: { fontSize: v } })
                }
              />
            </Field>
            <Field label="Text Color">
              <ColorPicker
                size="sm"
                disabled={readOnly}
                value={primaryLabel.style.color}
                onValueChange={(color) => updatePrimaryLabel({ style: { color } })}
              />
            </Field>
          </div>
        </Stack>
      </div>
    );
  }

  // Edge properties
  const edge = selectedEdge!;
  const edgeLabel = edge.labels[0] ?? createDefaultEdgeLabel('');

  const updateEdgeLabel = (
    patch: {
      text?: string;
      placement?: Partial<EdgeLabelPlacement>;
      style?: Partial<typeof edgeLabel.style>;
    },
  ) => {
    const updated = {
      ...edgeLabel,
      text: patch.text ?? edgeLabel.text,
      placement: patch.placement
        ? { ...edgeLabel.placement, ...patch.placement }
        : edgeLabel.placement,
      style: patch.style ? { ...edgeLabel.style, ...patch.style } : edgeLabel.style,
    };
    const nextLabels =
      edge.labels.length > 0 ? [updated, ...edge.labels.slice(1)] : [updated];
    onUpdateEdge(edge.id, { labels: nextLabels });
  };

  return (
    <div className="diagrav-panel">
      <Stack gap="item">
        <div className="diagrav-section-title">Connection</div>

        <Field label="Routing">
          <Select
            size="sm"
            disabled={readOnly}
            value={edge.routing}
            onValueChange={(v) => onUpdateEdge(edge.id, { routing: v as EdgeRouting })}
            options={ROUTING_OPTIONS}
          />
        </Field>

        <div className="diagrav-prop-grid-2">
          <Field label="Stroke">
            <ColorPicker
              size="sm"
              disabled={readOnly}
              value={edge.style.stroke}
              onValueChange={(stroke) => onUpdateEdge(edge.id, { style: { stroke } })}
            />
          </Field>
          <Field label="Width">
            <NumberInput
              size="sm"
              min={0.5}
              max={12}
              step={0.5}
              disabled={readOnly}
              value={edge.style.width}
              onValueChange={(v) => v !== null && onUpdateEdge(edge.id, { style: { width: v } })}
            />
          </Field>
        </div>

        <Switch
          size="sm"
          label="Dashed line"
          disabled={readOnly}
          checked={Boolean(edge.style.dash?.length)}
          onCheckedChange={(checked) =>
            onUpdateEdge(edge.id, { style: { dash: checked ? [6, 4] : [] } })
          }
        />

        <div className="diagrav-prop-grid-2">
          <Field label="Source Arrow">
            <Select
              size="sm"
              disabled={readOnly}
              value={edge.style.sourceArrow}
              onValueChange={(v) =>
                onUpdateEdge(edge.id, { style: { sourceArrow: v as ArrowType } })
              }
              options={ARROW_OPTIONS}
            />
          </Field>
          <Field label="Target Arrow">
            <Select
              size="sm"
              disabled={readOnly}
              value={edge.style.targetArrow}
              onValueChange={(v) =>
                onUpdateEdge(edge.id, { style: { targetArrow: v as ArrowType } })
              }
              options={ARROW_OPTIONS}
            />
          </Field>
        </div>

        {edge.bends.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly}
            onClick={() => onUpdateEdge(edge.id, { bends: [] })}
          >
            Clear {edge.bends.length} Bend Point{edge.bends.length === 1 ? '' : 's'}
          </Button>
        )}

        <Separator />
        <div className="diagrav-section-title">Edge Label</div>

        <Field label="Text">
          <Input
            size="sm"
            disabled={readOnly}
            value={edgeLabel.text}
            onValueChange={(text) => updateEdgeLabel({ text })}
          />
        </Field>

        <div className="diagrav-prop-grid-2">
          <Field label="Placement">
            <Select
              size="sm"
              disabled={readOnly}
              value={edgeLabel.placement.model}
              onValueChange={(v) =>
                updateEdgeLabel({
                  placement: { model: v as EdgeLabelPlacement['model'] },
                })
              }
              options={[
                { value: 'center', label: 'Center' },
                { value: 'source', label: 'Source' },
                { value: 'target', label: 'Target' },
                { value: 'free', label: 'Free' },
              ]}
            />
          </Field>
          <Field label="Font Size">
            <NumberInput
              size="sm"
              min={8}
              max={36}
              disabled={readOnly}
              value={edgeLabel.style.fontSize}
              onValueChange={(v) => v !== null && updateEdgeLabel({ style: { fontSize: v } })}
            />
          </Field>
        </div>
      </Stack>
    </div>
  );
}
