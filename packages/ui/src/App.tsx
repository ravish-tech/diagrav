import {
  Diagrav,
  createDefaultNode,
  validateDocument,
  type DiagramCommand,
  type DiagramDocument,
  type EdgePatch,
  type EditorTool,
  type NodePatch,
  type SelectionState,
  type ShapeDefinition,
} from '@diagrav/core';
import { AppShell, Toaster, toast } from 'jenni-react';
import { useEffect, useRef, useState } from 'react';
import { EmbedDemo } from './components/EmbedDemo';
import { NotesDock } from './components/NotesDock';
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
  const clickCascadeRef = useRef(0);

  const [activeSampleId, setActiveSampleId] = useState<string>(SAMPLES[0].id);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [doc, setDoc] = useState<DiagramDocument>(SAMPLES[0].document);
  const [selection, setSelection] = useState<SelectionState>({ nodeIds: [], edgeIds: [] });
  const [viewMode, setViewMode] = useState<AppViewMode>('editor');
  const [tool, setTool] = useState<EditorTool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hasNotes, setHasNotes] = useState(() => {
    try {
      return Boolean(localStorage.getItem('diagrav.reviewNotes')?.trim());
    } catch {
      return false;
    }
  });
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [shapes, setShapes] = useState<ShapeDefinition[]>([]);

  useEffect(() => {
    if (!hostRef.current) return;
    const instance = new Diagrav({
      container: hostRef.current,
      document: doc,
      mode: viewMode === 'editor' ? 'editor' : 'readonly',
    });
    diagravRef.current = instance;
    setShapes(instance.shapes.list());
    setDoc(instance.getDocument());

    const unsubDoc = instance.onChange((next) => setDoc(next));
    const unsubSel = instance.onSelectionChange((sel) => setSelection(sel));
    const unsubHist = instance.onHistoryChange((h) => setHistory(h));

    // Frame initial sample nicely once layout dimensions settle
    const raf = requestAnimationFrame(() => instance.fitToView(48));

    return () => {
      cancelAnimationFrame(raf);
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
    // Keep hidden studio instance in readonly while viewing Embed Demo so shortcuts never leak
    diagravRef.current?.setMode(next === 'editor' ? 'editor' : 'readonly');
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    setActiveSampleId(sampleId);
    setCustomTitle(null);
    clickCascadeRef.current = 0;
    diagravRef.current?.loadDocument(sample.document);
    requestAnimationFrame(() => diagravRef.current?.fitToView(48));
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

    let pos = worldPos;
    if (!pos) {
      const center = engine.getViewportCenterWorld();
      const offset = (clickCascadeRef.current % 5) * 24;
      clickCascadeRef.current += 1;
      pos = { x: center.x + offset, y: center.y + offset };
    }

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

  const handleUpdateNode = (id: string, patch: NodePatch, mergeKey?: string) => {
    if (viewMode !== 'editor') return;
    diagravRef.current?.execute({ type: 'node.update', id, patch }, mergeKey ? { mergeKey } : undefined);
  };

  const handleUpdateEdge = (id: string, patch: EdgePatch, mergeKey?: string) => {
    if (viewMode !== 'editor') return;
    diagravRef.current?.execute({ type: 'edge.update', id, patch }, mergeKey ? { mergeKey } : undefined);
  };

  const handleDeleteSelection = () => {
    const engine = diagravRef.current;
    if (!engine || viewMode !== 'editor') return;
    const commands: DiagramCommand[] = [];
    for (const id of selection.edgeIds) commands.push({ type: 'edge.delete', id });
    for (const id of selection.nodeIds) commands.push({ type: 'node.delete', id });
    if (commands.length === 0) return;
    engine.execute({ type: 'batch', commands, label: 'Delete selection' });
    engine.interaction.clearSelection();
  };

  const handleExportJson = () => {
    const current = diagravRef.current?.getDocument();
    if (!current) return;
    downloadText('diagram.diagrav.json', JSON.stringify(current, null, 2), 'application/json');
    toast.success('Saved diagram.diagrav.json');
  };

  const handleExportSvg = () => {
    const svg = diagravRef.current?.exportSvg();
    if (!svg) return;
    downloadText('diagram.svg', svg, 'image/svg+xml');
    toast.success('Exported diagram.svg');
  };

  const handleImportFile = async (file: File) => {
    if (viewMode !== 'editor') return;
    try {
      const text = await file.text();
      const parsed = validateDocument(JSON.parse(text));
      diagravRef.current?.loadDocument(parsed);
      setActiveSampleId('custom');
      setCustomTitle(parsed.meta.title || file.name);
      requestAnimationFrame(() => diagravRef.current?.fitToView(48));
      toast.success(`Loaded ${file.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid .diagrav.json file';
      toast.error(`Failed to open file: ${msg}`);
    }
  };

  const selectedNode =
    selection.nodeIds.length === 1 && selection.edgeIds.length === 0
      ? doc.nodes.find((n) => n.id === selection.nodeIds[0]) ?? null
      : null;
  const selectedEdge =
    selection.edgeIds.length === 1 && selection.nodeIds.length === 0
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
      {/* Always keep layout="workspace" so AppShell never unmounts the Diagrav SVG host */}
      <AppShell
        layout="workspace"
        height="100vh"
        asideWidth={210}
        asideLabel="Palette"
        dockHeight={200}
        dockLabel="Review Notes"
        sidebarOpen={!isEmbed}
        asideOpen={!isEmbed}
        dockOpen={!isEmbed && notesOpen}
        onDockOpenChange={setNotesOpen}
        topbar={
          <Toolbar
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            samples={SAMPLES}
            activeSampleId={activeSampleId}
            customTitle={customTitle}
            onSelectSample={handleSelectSample}
            tool={tool}
            onToolChange={handleToolChange}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => diagravRef.current?.undo()}
            onRedo={() => diagravRef.current?.redo()}
            showGrid={showGrid}
            onToggleGrid={handleToggleGrid}
            onFitView={() => diagravRef.current?.fitToView(48)}
            onExportJson={handleExportJson}
            onExportSvg={handleExportSvg}
            onImportJson={() => fileInputRef.current?.click()}
            notesOpen={notesOpen}
            hasNotes={hasNotes}
            onToggleNotes={() => setNotesOpen((v) => !v)}
          />
        }
        sidebar={
          !isEmbed ? (
            <PropertiesPanel
              doc={doc}
              selection={selection}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              shapes={shapes}
              readOnly={viewMode === 'readonly'}
              onUpdateNode={handleUpdateNode}
              onUpdateEdge={handleUpdateEdge}
              onDeleteSelection={handleDeleteSelection}
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
        dock={
          !isEmbed ? (
            <NotesDock
              onClose={() => setNotesOpen(false)}
              onHasContentChange={setHasNotes}
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
            if (viewMode === 'editor') {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
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
      <Toaster position="bottom-right" />
    </>
  );
}
