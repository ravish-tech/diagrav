import type { EditorTool } from '@diagrav/core';
import {
  Badge,
  Button,
  Inline,
  SegmentedControl,
  Select,
  Separator,
  TopBar,
} from 'jenni-react';
import type { SampleEntry } from '../samples';

export type AppViewMode = 'editor' | 'readonly' | 'embed';

export interface ToolbarProps {
  viewMode: AppViewMode;
  onViewModeChange: (mode: AppViewMode) => void;
  samples: SampleEntry[];
  activeSampleId: string;
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
  onExportJson: () => void;
  onExportSvg: () => void;
  onImportJson: () => void;
}

export function Toolbar({
  viewMode,
  onViewModeChange,
  samples,
  activeSampleId,
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
  onExportJson,
  onExportSvg,
  onImportJson,
}: ToolbarProps) {
  return (
    <TopBar
      sticky
      start={
        <Inline gap="related" align="center">
          <strong style={{ fontSize: 15, letterSpacing: '-0.02em' }}>Diagrav</strong>
          <Badge variant="soft" tone="accent" size="sm">
            v0.1
          </Badge>
          {viewMode !== 'embed' && (
            <Select
              size="sm"
              aria-label="Sample diagram"
              value={activeSampleId}
              onValueChange={onSelectSample}
              options={samples.map((s) => ({ value: s.id, label: s.name }))}
              style={{ width: 175 }}
            />
          )}
        </Inline>
      }
      center={
        <Inline gap="related" align="center">
          <SegmentedControl
            size="sm"
            value={viewMode}
            onValueChange={(v) => onViewModeChange(v as AppViewMode)}
            options={[
              { value: 'editor', label: 'Editor' },
              { value: 'readonly', label: 'Readonly' },
              { value: 'embed', label: 'Embed Demo' },
            ]}
          />
          {viewMode === 'editor' && (
            <>
              <Separator orientation="vertical" style={{ height: 20 }} />
              <SegmentedControl
                size="sm"
                value={tool}
                onValueChange={(v) => onToolChange(v as EditorTool)}
                options={[
                  { value: 'select', label: 'Select' },
                  { value: 'edge', label: 'Connect' },
                ]}
              />
              <Separator orientation="vertical" style={{ height: 20 }} />
              <Button size="sm" variant="ghost" disabled={!canUndo} onClick={onUndo}>
                Undo
              </Button>
              <Button size="sm" variant="ghost" disabled={!canRedo} onClick={onRedo}>
                Redo
              </Button>
            </>
          )}
          {viewMode !== 'embed' && (
            <>
              <Separator orientation="vertical" style={{ height: 20 }} />
              <Button
                size="sm"
                variant={showGrid ? 'soft' : 'ghost'}
                onClick={onToggleGrid}
              >
                Grid
              </Button>
              <Button size="sm" variant="ghost" onClick={onFitView}>
                Fit
              </Button>
            </>
          )}
        </Inline>
      }
      end={
        viewMode !== 'embed' ? (
          <Inline gap="inline" align="center">
            <Button size="sm" variant="outline" onClick={onImportJson}>
              Open JSON
            </Button>
            <Button size="sm" variant="outline" onClick={onExportJson}>
              Save JSON
            </Button>
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
