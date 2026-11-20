import {
  Diagrav,
  createDefaultNode,
  validateDocument,
  type DiagramDocument,
  type EdgePatch,
  type EditorTool,
  type NodePatch,
  type SelectionState,
  type ShapeDefinition,
} from '@diagrav/core';
import { AppShell } from 'jenni-react';
import { useEffect, useRef, useState } from 'react';
import { EmbedDemo } from './components/EmbedDemo';
import { PalettePanel } from './components/PalettePanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar, type AppViewMode } from './components/Toolbar';
import { SAMPLES } from './samples';

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const diagravRef = useRef<Diagrav | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSampleId, setActiveSampleId] = useState<string>(SAMPLES[0].id);
  const [doc, setDoc] = useState<DiagramDocument>(SAMPLES[0].document);
  const [selection, setSelection] = useState<SelectionState>({ nodeIds: [], edgeIds: [] });
  const [viewMode, setViewMode] = useState<AppViewMode>('editor');
  const [tool, setTool] = useState<EditorTool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [shapes, setShapes] = useState<ShapeDefinition[]>([]);

  useEffect(() => {
    if (!hostRef.current) return;
    const instance = new Diagrav({
      container: hostRef.current,
      document: doc,
      mode: viewMode === 'readonly' ? 'readonly' : 'editor',
    });
    diagravRef.current = instance;
    setShapes(instance.shapes.list());
    setDoc(instance.getDocument());

    const unsubDoc = instance.onChange((next) => setDoc(next));
    const unsubSel = instance.onSelectionChange((sel) => setSelection(sel));
    const unsubHist = instance.onHistoryChange((h) => setHistory(h));

    return () => {
      unsubDoc();
      unsubSel();
      unsubHist();
      instance.destroy();
      diagravRef.current = null;
    };
    // Mount once; updates flow through the Diagrav instance API
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewModeChange = (next: AppViewMode) => {
    setViewMode(next);
    if (next === 'editor' || next === 'readonly') {
      diagravRef.current?.setMode(next);
    }
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    setActiveSampleId(sampleId);
    diagravRef.current?.loadDocument(sample.document);
  };

  const handleToolChange = (next: EditorTool) => {
    setTool(next);
    diagravRef.current?.setTool(next);
  };

  const handleToggleGrid = () => {
    const next = !showGrid;
    setShowGrid(next);
    diagravRef.current?.setShowGrid(next);
  };

  const handleAddShape = (shape: ShapeDefinition, worldPos?: { x: number; y: number }) => {
    const engine = diagravRef.current;
    if (!engine || viewMode !== 'editor') return;
    const pos = worldPos ?? {
      x: 180 + Math.round(Math.random() * 140),
      y: 160 + Math.round(Math.random() * 100),
    };
    const node = createDefaultNode({
      type: shape.type,
      labelText: shape.label,
      geometry: {
        x: Math.round(pos.x - shape.defaultSize.width / 2),
        y: Math.round(pos.y - shape.defaultSize.height / 2),
        width: shape.defaultSize.width,
        height: shape.defaultSize.height,
      },
      style: {
        border: {
          color: '#475569',
          width: 1.5,
          radius: shape.defaultBorderRadius ?? 0,
          opacity: 1,
        },
      },
    });
    engine.execute({ type: 'node.create', node });
    engine.interaction.selectNodes([node.id]);
  };

  const handleUpdateNode = (id: string, patch: NodePatch) => {
    diagravRef.current?.execute({ type: 'node.update', id, patch });
  };

  const handleUpdateEdge = (id: string, patch: EdgePatch) => {
    diagravRef.current?.execute({ type: 'edge.update', id, patch });
  };

  const handleExportJson = () => {
    const current = diagravRef.current?.getDocument();
    if (!current) return;
    downloadText('diagram.diagrav.json', JSON.stringify(current, null, 2), 'application/json');
  };

  const handleExportSvg = () => {
    const svg = diagravRef.current?.exportSvg();
    if (!svg) return;
    downloadText('diagram.svg', svg, 'image/svg+xml');
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = validateDocument(JSON.parse(text));
    diagravRef.current?.loadDocument(parsed);
  };

  const selectedNode =
    selection.nodeIds.length === 1
      ? doc.nodes.find((n) => n.id === selection.nodeIds[0]) ?? null
      : null;
  const selectedEdge =
    selection.edgeIds.length === 1
      ? doc.edges.find((e) => e.id === selection.edgeIds[0]) ?? null
      : null;

  const isEmbed = viewMode === 'embed';

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.diagrav.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportFile(f);
          e.target.value = '';
        }}
      />
      <AppShell
        layout={isEmbed ? 'topnav' : 'workspace'}
        height="100vh"
        asideWidth={230}
        sidebarOpen={!isEmbed}
        asideOpen={!isEmbed}
        topbar={
          <Toolbar
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            samples={SAMPLES}
            activeSampleId={activeSampleId}
            onSelectSample={handleSelectSample}
            tool={tool}
            onToolChange={handleToolChange}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => diagravRef.current?.undo()}
            onRedo={() => diagravRef.current?.redo()}
            showGrid={showGrid}
            onToggleGrid={handleToggleGrid}
            onFitView={() => diagravRef.current?.fitToView()}
            onExportJson={handleExportJson}
            onExportSvg={handleExportSvg}
            onImportJson={() => fileInputRef.current?.click()}
          />
        }
        sidebar={
          !isEmbed ? (
            <PropertiesPanel
              doc={doc}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              shapes={shapes}
              readOnly={viewMode === 'readonly'}
              onUpdateNode={handleUpdateNode}
              onUpdateEdge={handleUpdateEdge}
            />
          ) : undefined
        }
        aside={
          !isEmbed ? (
            <PalettePanel
              shapes={shapes}
              disabled={viewMode === 'readonly'}
              onAddShape={(s) => handleAddShape(s)}
            />
          ) : undefined
        }
        statusbar={
          !isEmbed ? (
            <div className="diagrav-statusbar">
              <span>
                Mode: <strong>{viewMode}</strong> · Tool: <strong>{tool}</strong>
              </span>
              <span>
                Zoom: <strong>{Math.round(doc.viewport.zoom * 100)}%</strong> · Nodes:{' '}
                {doc.nodes.length} · Edges: {doc.edges.length}
              </span>
            </div>
          ) : undefined
        }
      >
        <div
          ref={hostRef}
          className="diagrav-canvas-host"
          style={{ display: isEmbed ? 'none' : 'block' }}
          onDragOver={(e) => {
            if (viewMode === 'editor') e.preventDefault();
          }}
          onDrop={(e) => {
            if (viewMode !== 'editor') return;
            e.preventDefault();
            const type = e.dataTransfer.getData('application/diagrav-shape');
            const shape = shapes.find((s) => s.type === type);
            if (!shape || !diagravRef.current) return;
            const world = diagravRef.current.screenToWorld(e.clientX, e.clientY);
            handleAddShape(shape, world);
          }}
        />
        {isEmbed && <EmbedDemo />}
      </AppShell>
    </>
  );
}
