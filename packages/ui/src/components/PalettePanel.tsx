import type { ShapeDefinition } from '@diagrav/core';
import { Accordion, AccordionItem, Stack } from 'jenni-react';

export interface PalettePanelProps {
  shapes: ShapeDefinition[];
  disabled?: boolean;
  onAddShape: (shape: ShapeDefinition) => void;
}

export function PalettePanel({ shapes, disabled, onAddShape }: PalettePanelProps) {
  // Group shapes by category for yEd-style collapsible sections
  const categories = new Map<string, ShapeDefinition[]>();
  for (const s of shapes) {
    const list = categories.get(s.category) ?? [];
    list.push(s);
    categories.set(s.category, list);
  }

  return (
    <div className="diagrav-panel">
      <Stack gap="related">
        <div className="diagrav-section-title">Palette</div>
        <Accordion variant="divided" size="sm" multiple defaultValue={['Basic Shapes']}>
          {Array.from(categories.entries()).map(([category, items]) => (
            <AccordionItem key={category} value={category} title={category} defaultOpen>
              <div className="diagrav-palette-grid">
                {items.map((shape) => (
                  <button
                    key={shape.type}
                    type="button"
                    className="diagrav-palette-item"
                    disabled={disabled}
                    draggable={!disabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/diagrav-shape', shape.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAddShape(shape)}
                    title={`Drag onto canvas or click to add ${shape.label}`}
                  >
                    <svg width="56" height="34" viewBox="-4 -4 64 42" aria-hidden="true">
                      <path
                        d={shape.renderPath(56, 34, shape.defaultBorderRadius)}
                        fill="#f1f5f9"
                        stroke="#475569"
                        strokeWidth="1.75"
                      />
                    </svg>
                    <span>{shape.label}</span>
                  </button>
                ))}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      </Stack>
    </div>
  );
}
