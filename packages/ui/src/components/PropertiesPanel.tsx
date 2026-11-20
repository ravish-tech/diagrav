import {
  createDefaultEdgeLabel,
  createDefaultNodeLabel,
  type ArrowType,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramLabel,
  type DiagramNode,
  type EdgeLabelPlacement,
  type EdgePatch,
  type EdgeRouting,
  type FillStyle,
  type NodeAlignment,
  type NodeDistribution,
  type NodeLabelPlacement,
  type NodeLabelPosition,
  type NodeMatchSize,
  type NodePatch,
  type SelectionState,
  type ShapeDefinition,
} from '@diagrav/core';
import {
  Button,
  ColorPicker,
  Field,
  Input,
  Kbd,
  NumberInput,
  Select,
  Separator,
  Stack,
  Switch,
  Tooltip,
} from 'jenni-react';
import { useEffect, useRef, useState } from 'react';

export interface PropertiesPanelProps {
  doc: DiagramDocument;
  selection: SelectionState;
  selectedNode: DiagramNode | null;
  selectedEdge: DiagramEdge | null;
  shapes: ShapeDefinition[];
  readOnly: boolean;
  onUpdateNode: (id: string, patch: NodePatch, mergeKey?: string) => void;
  onUpdateEdge: (id: string, patch: EdgePatch, mergeKey?: string) => void;
  onAlignNodes: (alignment: NodeAlignment) => void;
  onDistributeNodes: (mode: NodeDistribution) => void;
  onMatchSizeNodes: (mode: NodeMatchSize) => void;
  onDeleteSelection: () => void;
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

const FONT_WEIGHT_OPTIONS = [
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
];

const SHAPES_WITH_RADIUS = new Set(['rect', 'rounded-rect']);

// Pure static fallback templates (never invoke generateId during render)
const FALLBACK_NODE_LABEL: DiagramLabel<NodeLabelPlacement> = {
  id: '',
  text: '',
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

const FALLBACK_EDGE_LABEL: DiagramLabel<EdgeLabelPlacement> = {
  id: '',
  text: '',
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

/**
 * Text input that avoids pushing one Undo history entry per keystroke:
 * updates local draft immediately and commits on blur, Enter, or after a brief pause.
 */
function DebouncedTextInput({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDraft(value);
    lastCommittedRef.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const flush = (next: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next !== lastCommittedRef.current) {
      lastCommittedRef.current = next;
      onCommit(next);
    }
  };

  return (
    <Input
      size="sm"
      disabled={disabled}
      value={draft}
      onValueChange={(next) => {
        setDraft(next);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => flush(next), 350);
      }}
      onBlur={() => flush(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          flush(draft);
        }
      }}
    />
  );
}

export function PropertiesPanel({
  doc,
  selection,
  selectedNode,
  selectedEdge,
  shapes,
  readOnly,
  onUpdateNode,
  onUpdateEdge,
  onAlignNodes,
  onDistributeNodes,
  onMatchSizeNodes,
  onDeleteSelection,
}: PropertiesPanelProps) {
  const multiCount = selection.nodeIds.length + selection.edgeIds.length;
  const multiNodes = selection.nodeIds.length;

  // Multi-selection view (yEd-style Align, Distribute/Space Equally, Match Size)
  if (multiCount > 1) {
    return (
      <div className="diagrav-panel">
        <Stack gap="item">
          <div className="diagrav-section-title">Selection</div>
          <div style={{ fontSize: 13, color: 'var(--j-fg-muted, #64748b)' }}>
            <strong style={{ color: 'var(--j-fg, #0f172a)' }}>{multiCount} elements selected</strong>
            <br />
            {multiNodes} nodes · {selection.edgeIds.length} edges
          </div>

          {!readOnly && multiNodes >= 2 && (
            <>
              <Separator />
              <div className="diagrav-section-title">Align</div>
              <div className="diagrav-align-grid-3">
                <Tooltip content="Align Left Edges">
                  <Button size="sm" variant="outline" onClick={() => onAlignNodes('left')}>
                    Left
                  </Button>
                </Tooltip>
                <Tooltip content="Align Horizontal Centers">
                  <Button size="sm" variant="outline" onClick={() => onAlignNodes('center-x')}>
                    Center
                  </Button>
                </Tooltip>
                <Tooltip content="Align Right Edges">
                  <Button size="sm" variant="outline" onClick={() => onAlignNodes('right')}>
                    Right
                  </Button>
                </Tooltip>
                <Tooltip content="Align Top Edges">
                  <Button size="sm" variant="outline" onClick={() => onAlignNodes('top')}>
                    Top
                  </Button>
                </Tooltip>
                <Tooltip content="Align Vertical Middles">
                  <Button size="sm" variant="outline" onClick={() => onAlignNodes('middle-y')}>
                    Middle
                  </Button>
                </Tooltip>
                <Tooltip content="Align Bottom Edges">
                  <Button size="sm" variant="outline" onClick={() => onAlignNodes('bottom')}>
                    Bottom
                  </Button>
                </Tooltip>
              </div>

              <Separator />
              <div className="diagrav-section-title">Distribute &amp; Space</div>
              <div className="diagrav-align-grid-2">
                <Tooltip content="Equal horizontal gaps (3+ nodes)">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={multiNodes < 3}
                    onClick={() => onDistributeNodes('horizontal-gaps')}
                  >
                    Space H
                  </Button>
                </Tooltip>
                <Tooltip content="Equal vertical gaps (3+ nodes)">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={multiNodes < 3}
                    onClick={() => onDistributeNodes('vertical-gaps')}
                  >
                    Space V
                  </Button>
                </Tooltip>
                <Tooltip content="Distribute horizontal centers (3+ nodes)">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={multiNodes < 3}
                    onClick={() => onDistributeNodes('horizontal-centers')}
                  >
                    Centers H
                  </Button>
                </Tooltip>
                <Tooltip content="Distribute vertical centers (3+ nodes)">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={multiNodes < 3}
                    onClick={() => onDistributeNodes('vertical-centers')}
                  >
                    Centers V
                  </Button>
                </Tooltip>
              </div>

              <Separator />
              <div className="diagrav-section-title">Match Size</div>
              <div className="diagrav-align-grid-3">
                <Tooltip content="Match width to first selected node">
                  <Button size="sm" variant="outline" onClick={() => onMatchSizeNodes('width')}>
                    Width
                  </Button>
                </Tooltip>
                <Tooltip content="Match height to first selected node">
                  <Button size="sm" variant="outline" onClick={() => onMatchSizeNodes('height')}>
                    Height
                  </Button>
                </Tooltip>
                <Tooltip content="Match width & height">
                  <Button size="sm" variant="outline" onClick={() => onMatchSizeNodes('both')}>
                    Both
                  </Button>
                </Tooltip>
              </div>
            </>
          )}

          {!readOnly && (
            <>
              <Separator />
              <Button size="sm" variant="outline" tone="danger" onClick={onDeleteSelection}>
                Delete Selected
              </Button>
            </>
          )}
        </Stack>
      </div>
    );
  }

  // Empty selection (document overview + shortcuts)
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="diagrav-panel">
        <Stack gap="item">
          <div className="diagrav-section-title">Properties</div>
          <div style={{ fontSize: 13, color: 'var(--j-fg-muted, #64748b)' }}>
            <strong style={{ color: 'var(--j-fg, #0f172a)' }}>{doc.meta.title}</strong>
            <br />
            {doc.nodes.length} nodes · {doc.edges.length} edges
          </div>
          <Separator />
          <div className="diagrav-section-title">Quick Guide</div>
          <div className="diagrav-shortcuts-list">
            <div>Drag shapes from Palette or click to insert.</div>
            <div>Hover a node and drag any blue port to connect.</div>
            <div>Drag a selected edge to add bends; double-click a bend to remove.</div>
            <div>Shift+drag empty canvas to box-select &amp; align/distribute nodes.</div>
          </div>
          <Separator />
          <div className="diagrav-section-title">Shortcuts</div>
          <div className="diagrav-shortcuts-list">
            <div className="diagrav-shortcut-row">
              <span>Edit label</span>
              <Kbd size="sm">F2</Kbd>
            </div>
            <div className="diagrav-shortcut-row">
              <span>Undo / Redo</span>
              <span>
                <Kbd size="sm">⌘Z</Kbd>
              </span>
            </div>
            <div className="diagrav-shortcut-row">
              <span>Duplicate</span>
              <Kbd size="sm">⌘D</Kbd>
            </div>
            <div className="diagrav-shortcut-row">
              <span>Nudge</span>
              <Kbd size="sm">↑↓←→</Kbd>
            </div>
            <div className="diagrav-shortcut-row">
              <span>Delete</span>
              <Kbd size="sm">Del</Kbd>
            </div>
          </div>
        </Stack>
      </div>
    );
  }

  if (selectedNode) {
    const fill = selectedNode.style.fill;
    const primaryLabel = selectedNode.labels[0] ?? FALLBACK_NODE_LABEL;
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
    const supportsRadius = SHAPES_WITH_RADIUS.has(selectedNode.type);

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
      mergeKey?: string,
    ) => {
      const base = selectedNode.labels[0] ?? createDefaultNodeLabel('');
      const updated = {
        ...base,
        text: patch.text ?? base.text,
        placement: patch.placement
          ? { ...base.placement, ...patch.placement }
          : base.placement,
        style: patch.style ? { ...base.style, ...patch.style } : base.style,
      };
      const nextLabels =
        selectedNode.labels.length > 0
          ? [updated, ...selectedNode.labels.slice(1)]
          : [updated];
      onUpdateNode(selectedNode.id, { labels: nextLabels }, mergeKey);
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
                  onUpdateNode(
                    selectedNode.id,
                    { style: { fill: { ...fill, color: c } } },
                    `node-fill:${selectedNode.id}`,
                  )
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
                      onUpdateNode(
                        selectedNode.id,
                        {
                          style: {
                            fill: {
                              ...fill,
                              stops: [
                                { color: c, offset: 0 },
                                { color: gradEnd, offset: 1 },
                              ],
                            },
                          },
                        },
                        `node-grad-start:${selectedNode.id}`,
                      )
                    }
                  />
                </Field>
                <Field label="End">
                  <ColorPicker
                    size="sm"
                    disabled={readOnly}
                    value={gradEnd}
                    onValueChange={(c) =>
                      onUpdateNode(
                        selectedNode.id,
                        {
                          style: {
                            fill: {
                              ...fill,
                              stops: [
                                { color: gradStart, offset: 0 },
                                { color: c, offset: 1 },
                              ],
                            },
                          },
                        },
                        `node-grad-end:${selectedNode.id}`,
                      )
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
                onUpdateNode(
                  selectedNode.id,
                  { style: { border: { color: c } } },
                  `node-border-color:${selectedNode.id}`,
                )
              }
            />
          </Field>

          <div className={supportsRadius ? 'diagrav-prop-grid-2' : undefined}>
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
            {supportsRadius && (
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
            )}
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
            <DebouncedTextInput
              key={selectedNode.id}
              disabled={readOnly}
              value={primaryLabel.text}
              onCommit={(text) => updatePrimaryLabel({ text })}
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
            {primaryLabel.placement.model !== 'free' && (
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
            )}
          </div>

          {primaryLabel.placement.model === 'free' && (
            <div className="diagrav-prop-grid-2">
              <Field label="Offset X">
                <NumberInput
                  size="sm"
                  disabled={readOnly}
                  value={Math.round(primaryLabel.placement.offset?.x ?? 0)}
                  onValueChange={(v) =>
                    v !== null &&
                    updatePrimaryLabel({
                      placement: {
                        offset: { x: v, y: primaryLabel.placement.offset?.y ?? 0 },
                      },
                    })
                  }
                />
              </Field>
              <Field label="Offset Y">
                <NumberInput
                  size="sm"
                  disabled={readOnly}
                  value={Math.round(primaryLabel.placement.offset?.y ?? 0)}
                  onValueChange={(v) =>
                    v !== null &&
                    updatePrimaryLabel({
                      placement: {
                        offset: { x: primaryLabel.placement.offset?.x ?? 0, y: v },
                      },
                    })
                  }
                />
              </Field>
            </div>
          )}

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
            <Field label="Weight">
              <Select
                size="sm"
                disabled={readOnly}
                value={String(primaryLabel.style.fontWeight ?? 500)}
                onValueChange={(v) => updatePrimaryLabel({ style: { fontWeight: Number(v) } })}
                options={FONT_WEIGHT_OPTIONS}
              />
            </Field>
          </div>

          <Field label="Text Color">
            <ColorPicker
              size="sm"
              disabled={readOnly}
              value={primaryLabel.style.color}
              onValueChange={(color) =>
                updatePrimaryLabel({ style: { color } }, `node-lbl-color:${selectedNode.id}`)
              }
            />
          </Field>
        </Stack>
      </div>
    );
  }

  // Edge properties
  const edge = selectedEdge!;
  const edgeLabel = edge.labels[0] ?? FALLBACK_EDGE_LABEL;

  const updateEdgeLabel = (
    patch: {
      text?: string;
      placement?: Partial<EdgeLabelPlacement>;
      style?: Partial<typeof edgeLabel.style>;
    },
    mergeKey?: string,
  ) => {
    const base = edge.labels[0] ?? createDefaultEdgeLabel('');
    const updated = {
      ...base,
      text: patch.text ?? base.text,
      placement: patch.placement
        ? { ...base.placement, ...patch.placement }
        : base.placement,
      style: patch.style ? { ...base.style, ...patch.style } : base.style,
    };
    const nextLabels =
      edge.labels.length > 0 ? [updated, ...edge.labels.slice(1)] : [updated];
    onUpdateEdge(edge.id, { labels: nextLabels }, mergeKey);
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
              onValueChange={(stroke) =>
                onUpdateEdge(edge.id, { style: { stroke } }, `edge-stroke:${edge.id}`)
              }
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
          <DebouncedTextInput
            key={edge.id}
            disabled={readOnly}
            value={edgeLabel.text}
            onCommit={(text) => updateEdgeLabel({ text })}
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
                { value: 'ratio', label: 'Ratio' },
                { value: 'free', label: 'Free' },
              ]}
            />
          </Field>
          <Field label="Distance">
            <NumberInput
              size="sm"
              min={-60}
              max={60}
              step={2}
              disabled={readOnly}
              value={edgeLabel.placement.distance ?? -10}
              onValueChange={(v) =>
                v !== null && updateEdgeLabel({ placement: { distance: v } })
              }
            />
          </Field>
        </div>

        {edgeLabel.placement.model === 'ratio' && (
          <Field label="Ratio (0–1)">
            <NumberInput
              size="sm"
              min={0}
              max={1}
              step={0.05}
              disabled={readOnly}
              value={edgeLabel.placement.ratio ?? 0.5}
              onValueChange={(v) =>
                v !== null &&
                updateEdgeLabel({ placement: { ratio: Math.max(0, Math.min(1, v)) } })
              }
            />
          </Field>
        )}

        <div className="diagrav-prop-grid-2">
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
          <Field label="Text Color">
            <ColorPicker
              size="sm"
              disabled={readOnly}
              value={edgeLabel.style.color}
              onValueChange={(color) =>
                updateEdgeLabel({ style: { color } }, `edge-lbl-color:${edge.id}`)
              }
            />
          </Field>
        </div>

        <Field label="Background">
          <ColorPicker
            size="sm"
            disabled={readOnly}
            value={edgeLabel.style.background ?? '#ffffff'}
            onValueChange={(background) =>
              updateEdgeLabel({ style: { background } }, `edge-lbl-bg:${edge.id}`)
            }
          />
        </Field>
      </Stack>
    </div>
  );
}
