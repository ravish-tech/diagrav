import type { EditorTool } from '@diagrav/core';
import {
  Badge,
  Button,
  Inline,
  SegmentedControl,
  Select,
  Separator,
  Tooltip,
  TopBar,
} from 'jenni-react';
import type { SampleEntry } from '../samples';

export type AppViewMode = 'editor' | 'readonly' | 'embed';

export interface ToolbarProps {
  viewMode: AppViewMode;
  onViewModeChange: (mode: AppViewMode) => void;
  samples: SampleEntry[];
  activeSampleId: string;
  customTitle?: string | null;
  onSelectSample: (sampleId: string) => void;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onFitView: () => void;
  onViewJson: () => void;
  onExportSvg: () => void;
  onImportJson: () => void;
  notesOpen: boolean;
  hasNotes: boolean;
  onToggleNotes: () => void;
}

export function Toolbar({
  viewMode,
  onViewModeChange,
  samples,
  activeSampleId,
  customTitle,
  onSelectSample,
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showGrid,
  onToggleGrid,
  onFitView,
  onViewJson,
  onExportSvg,
  onImportJson,
  notesOpen,
  hasNotes,
  onToggleNotes,
}: ToolbarProps) {
  const sampleOptions = [
    ...samples.map((s) => ({ value: s.id, label: s.name })),
    ...(activeSampleId === 'custom'
      ? [{ value: 'custom', label: customTitle || 'Imported JSON' }]
      : []),
  ];

  return (
    <TopBar
      sticky
      start={
        <Inline gap="inline" align="center" style={{ flexWrap: 'nowrap' }}>
          <strong style={{ fontSize: 15, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            Diagrav
          </strong>
          <Badge variant="soft" tone="accent" size="sm">
            v0.1
          </Badge>
          {viewMode !== 'embed' && (
            <Select
              size="sm"
              aria-label="Sample diagram"
              value={activeSampleId}
              onValueChange={onSelectSample}
              options={sampleOptions}
              style={{ width: 158 }}
            />
          )}
        </Inline>
      }
      center={
        <Inline gap="inline" align="center" style={{ flexWrap: 'nowrap' }}>
          <SegmentedControl
            size="sm"
            value={viewMode}
            onValueChange={(v) => onViewModeChange(v as AppViewMode)}
            options={[
              { value: 'editor', label: 'Editor' },
              { value: 'readonly', label: 'Readonly' },
              { value: 'embed', label: 'Embed' },
            ]}
          />
          {viewMode === 'editor' && (
            <>
              <Separator orientation="vertical" style={{ height: 18 }} />
              <SegmentedControl
                size="sm"
                value={tool}
                onValueChange={(v) => onToolChange(v as EditorTool)}
                options={[
                  { value: 'select', label: 'Select' },
                  { value: 'edge', label: 'Connect' },
                ]}
              />
              <Separator orientation="vertical" style={{ height: 18 }} />
              <Tooltip content="Undo (Cmd+Z)">
                <Button size="sm" variant="ghost" disabled={!canUndo} onClick={onUndo}>
                  Undo
                </Button>
              </Tooltip>
              <Tooltip content="Redo (Cmd+Shift+Z)">
                <Button size="sm" variant="ghost" disabled={!canRedo} onClick={onRedo}>
                  Redo
                </Button>
              </Tooltip>
            </>
          )}
          {viewMode !== 'embed' && (
            <>
              <Separator orientation="vertical" style={{ height: 18 }} />
              <Tooltip content="Toggle snap grid">
                <Button
                  size="sm"
                  variant={showGrid ? 'soft' : 'ghost'}
                  aria-pressed={showGrid}
                  onClick={onToggleGrid}
                >
                  Grid
                </Button>
              </Tooltip>
              <Tooltip content="Fit diagram to viewport">
                <Button size="sm" variant="ghost" onClick={onFitView}>
                  Fit
                </Button>
              </Tooltip>
              <Tooltip content="Toggle Review Notes dock (auto-saved to docs/REVIEW_NOTES.md)">
                <Button
                  size="sm"
                  variant={notesOpen ? 'soft' : 'ghost'}
                  aria-pressed={notesOpen}
                  onClick={onToggleNotes}
                >
                  Notes{hasNotes ? ' •' : ''}
                </Button>
              </Tooltip>
            </>
          )}
        </Inline>
      }
      end={
        viewMode !== 'embed' ? (
          <Inline gap="inline" align="center" style={{ flexWrap: 'nowrap' }}>
            {viewMode === 'editor' && (
              <Button size="sm" variant="outline" onClick={onImportJson}>
                Open
              </Button>
            )}
            <Tooltip content="Inspect syntax-highlighted .diagrav.json">
              <Button size="sm" variant="outline" onClick={onViewJson}>
                View JSON
              </Button>
            </Tooltip>
            <Button size="sm" variant="solid" onClick={onExportSvg}>
              Export SVG
            </Button>
          </Inline>
        ) : (
          <Button size="sm" variant="solid" onClick={() => onViewModeChange('editor')}>
            Back to Editor
          </Button>
        )
      }
    />
  );
}
