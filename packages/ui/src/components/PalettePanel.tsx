import type { ShapeDefinition } from '@diagrav/core';
import { Accordion, AccordionItem, Input, Stack } from 'jenni-react';
import { useMemo, useState } from 'react';

export interface PalettePanelProps {
  shapes: ShapeDefinition[];
  disabled?: boolean;
  onAddShape: (shape: ShapeDefinition) => void;
}

export function PalettePanel({ shapes, disabled, onAddShape }: PalettePanelProps) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const categories = useMemo(() => {
    const map = new Map<string, ShapeDefinition[]>();
    for (const s of shapes) {
      if (
        normalized &&
        !s.label.toLowerCase().includes(normalized) &&
        !s.type.toLowerCase().includes(normalized) &&
        !s.category.toLowerCase().includes(normalized)
      ) {
        continue;
      }
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return Array.from(map.entries());
  }, [shapes, normalized]);

  // Only open Basic Shapes by default to keep palette compact; auto-expand all matches while searching
  const openDefaults = normalized
    ? categories.map(([cat]) => cat)
    : categories.length > 0
      ? [categories[0][0]]
      : [];

  return (
    <div className="diagrav-panel diagrav-palette-panel">
      <Stack gap="inline">
        <Input
          size="sm"
          aria-label="Search shapes"
          placeholder="Search shapes…"
          value={query}
          onValueChange={setQuery}
        />

        {categories.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--j-fg-muted, #64748b)', padding: '8px 2px' }}>
            No shapes match “{query}”.
          </div>
        ) : (
          <Accordion
            key={normalized ? `search:${normalized}` : `init:${categories.length}`}
            variant="divided"
            size="sm"
            multiple
            defaultValue={openDefaults}
          >
            {categories.map(([category, items]) => (
              <AccordionItem key={category} value={category} title={`${category} (${items.length})`}>
                <div className="diagrav-palette-grid">
                  {items.map((shape) => {
                    const decD = shape.renderDecorations?.(36, 24, shape.defaultBorderRadius);
                    return (
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
                            : `${shape.label} (${shape.category}) — drag or click to add`
                        }
                      >
                        <svg width="36" height="24" viewBox="-3 -3 42 30" aria-hidden="true">
                          <path
                            d={shape.renderPath(36, 24, shape.defaultBorderRadius ? 4 : 0)}
                            fill={shape.defaultFillColor ?? 'var(--j-surface-2, #f1f5f9)'}
                            stroke={shape.defaultBorderColor ?? 'var(--j-fg-muted, #475569)'}
                            strokeWidth="1.5"
                            strokeDasharray={shape.defaultBorderDash?.length ? '3 2' : undefined}
                          />
                          {decD && (
                            <path
                              d={decD}
                              fill="none"
                              stroke={shape.defaultBorderColor ?? 'var(--j-fg-muted, #475569)'}
                              strokeWidth="1.2"
                            />
                          )}
                        </svg>
                        <span className="diagrav-palette-label">{shape.label}</span>
                      </button>
                    );
                  })}
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </Stack>
    </div>
  );
}
