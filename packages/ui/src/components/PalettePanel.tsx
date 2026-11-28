import type { ShapeDefinition } from '@diagrav/core';
import { Accordion, AccordionItem, Input, Stack } from 'jenni-react';
import { useMemo, useState } from 'react';

export interface PalettePanelProps {
  shapes: ShapeDefinition[];
  disabled?: boolean;
  onAddShape: (shape: ShapeDefinition) => void;
}

function fitPreviewBox(defaultSize: { width: number; height: number }, maxW = 34, maxH = 22) {
  const scale = Math.min(maxW / Math.max(1, defaultSize.width), maxH / Math.max(1, defaultSize.height));
  const w = Math.max(10, Math.round(defaultSize.width * scale * 10) / 10);
  const h = Math.max(10, Math.round(defaultSize.height * scale * 10) / 10);
  const ox = (maxW - w) / 2;
  const oy = (maxH - h) / 2;
  return { w, h, ox, oy };
}

export function PalettePanel({ shapes, disabled, onAddShape }: PalettePanelProps) {
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<string[]>(['Basic Shapes', 'Architecture']);
  const normalized = query.trim().toLowerCase();

  const categories = useMemo(() => {
    const map = new Map<string, ShapeDefinition[]>();
    for (const s of shapes) {
      if (normalized) {
        const hay = [s.label, s.type, s.category, ...(s.keywords ?? [])].join(' ').toLowerCase();
        if (!hay.includes(normalized)) continue;
      }
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return Array.from(map.entries());
  }, [shapes, normalized]);

  const activeValues = normalized ? categories.map(([cat]) => cat) : openCategories;

  return (
    <div className="diagrav-panel diagrav-palette-panel">
      <Stack gap="inline">
        <div className="diagrav-search-wrap">
          <Input
            size="sm"
            aria-label="Search shapes"
            placeholder="Search shapes (e.g. db, vpc, cloud)…"
            value={query}
            onValueChange={setQuery}
          />
          {query && (
            <button
              type="button"
              className="diagrav-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {categories.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--j-fg-muted, #64748b)', padding: '8px 2px' }}>
            No shapes match “{query}”.
          </div>
        ) : (
          <Accordion
            variant="divided"
            size="sm"
            multiple
            value={activeValues}
            onValueChange={(next) => {
              if (!normalized) {
                setOpenCategories(Array.isArray(next) ? next : [next]);
              }
            }}
          >
            {categories.map(([category, items]) => (
              <AccordionItem key={category} value={category} title={`${category} (${items.length})`}>
                <div className="diagrav-palette-grid">
                  {items.map((shape) => {
                    const { w, h, ox, oy } = fitPreviewBox(shape.defaultSize, 34, 22);
                    const r = shape.defaultBorderRadius ? Math.min(4, w / 4, h / 4) : 0;
                    const decD = shape.renderDecorations?.(w, h, r);
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
                        <svg width="38" height="26" viewBox="-2 -2 38 26" aria-hidden="true">
                          {!shape.isContainer && (
                            <defs>
                              <linearGradient id={`pal-g-${shape.type}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={shape.defaultFillColor ?? '#ffffff'} />
                                <stop offset="100%" stopColor={shape.defaultFillEndColor ?? '#e2e8f0'} />
                              </linearGradient>
                            </defs>
                          )}
                          <g transform={`translate(${ox}, ${oy})`}>
                            <path
                              d={shape.renderPath(w, h, r)}
                              fill={
                                shape.isContainer
                                  ? shape.defaultFillColor ?? 'var(--j-surface-2, #f1f5f9)'
                                  : `url(#pal-g-${shape.type})`
                              }
                              stroke={shape.defaultBorderColor ?? 'var(--j-fg-muted, #475569)'}
                              strokeWidth="1.4"
                              strokeDasharray={shape.defaultBorderDash?.length ? '3 2' : undefined}
                            />
                            {decD && (
                              <path
                                d={decD}
                                fill="none"
                                stroke={shape.defaultBorderColor ?? 'var(--j-fg-muted, #475569)'}
                                strokeWidth="1.1"
                              />
                            )}
                          </g>
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
