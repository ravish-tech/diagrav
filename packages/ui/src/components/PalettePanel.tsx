import type { ShapeDefinition } from '@diagrav/core';
import { Accordion, AccordionItem, Stack } from 'jenni-react';

export interface PalettePanelProps {
  shapes: ShapeDefinition[];
  disabled?: boolean;
  onAddShape: (shape: ShapeDefinition) => void;
}

export function PalettePanel({ shapes, disabled, onAddShape }: PalettePanelProps) {
  const categories = new Map<string, ShapeDefinition[]>();
  for (const s of shapes) {
    const list = categories.get(s.category) ?? [];
    list.push(s);
    categories.set(s.category, list);
  }
  const categoryNames = Array.from(categories.keys());

  return (
    <div className="diagrav-panel">
      <Stack gap="related">
        <div className="diagrav-section-title">Palette</div>
        <Accordion
          key={categoryNames.join(',')}
          variant="divided"
          size="sm"
          multiple
          defaultValue={categoryNames}
        >
          {Array.from(categories.entries()).map(([category, items]) => (
            <AccordionItem key={category} value={category} title={category}>
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
                    title={
                      disabled
                        ? 'Switch to Editor mode to add shapes'
                        : `Drag onto canvas or click to add ${shape.label}`
                    }
                  >
                    <svg width="52" height="32" viewBox="-4 -4 60 40" aria-hidden="true">
                      <path
                        d={shape.renderPath(52, 32, shape.defaultBorderRadius)}
                        fill="var(--j-surface-2, #f1f5f9)"
                        stroke="var(--j-fg-muted, #475569)"
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
