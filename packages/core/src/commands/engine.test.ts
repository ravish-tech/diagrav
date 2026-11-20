import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandEngine,
  EdgeRouterRegistry,
  ShapeRegistry,
  computeEdgeLabelPosition,
  computeNodeLabelPosition,
  computeSmartSnap,
  createAlignNodesCommand,
  createDefaultEdge,
  createDefaultEdgeLabel,
  createDefaultNode,
  createDefaultNodeLabel,
  createDistributeNodesCommand,
  createEmptyDocument,
  createMatchSizeCommand,
  serializeMetadataJson,
  validateDocument,
} from '../index.js';

test('CommandEngine executes node/edge commands with undo and redo', () => {
  const engine = new CommandEngine();
  const n1 = createDefaultNode({ id: 'n1', labelText: 'Start', geometry: { x: 0, y: 0 } });
  const n2 = createDefaultNode({ id: 'n2', labelText: 'End', geometry: { x: 300, y: 0 } });
  const e1 = createDefaultEdge('n1', 'n2', { id: 'e1' });

  assert.equal(
    engine.execute({
      type: 'batch',
      commands: [
        { type: 'node.create', node: n1 },
        { type: 'node.create', node: n2 },
        { type: 'edge.create', edge: e1 },
      ],
    }).ok,
    true,
  );

  assert.equal(engine.getDocument().nodes.length, 2);
  assert.equal(engine.getDocument().edges.length, 1);

  // Deleting a node removes its connected edges
  assert.equal(engine.execute({ type: 'node.delete', id: 'n1' }).ok, true);
  assert.equal(engine.getDocument().nodes.length, 1);
  assert.equal(engine.getDocument().edges.length, 0);

  // Undo restores node and edge
  assert.equal(engine.undo(), true);
  assert.equal(engine.getDocument().nodes.length, 2);
  assert.equal(engine.getDocument().edges.length, 1);

  // Redo deletes again
  assert.equal(engine.redo(), true);
  assert.equal(engine.getDocument().nodes.length, 1);
});

test('CommandEngine fast-paths viewport.set without polluting history or cloning nodes', () => {
  const engine = new CommandEngine();
  const n1 = createDefaultNode({ id: 'n1' });
  engine.execute({ type: 'node.create', node: n1 });
  const nodesRefBefore = engine.getDocument().nodes;

  assert.equal(
    engine.execute({
      type: 'viewport.set',
      viewport: { x: 42, y: -15, zoom: 1.5 },
      recordHistory: false,
    }).ok,
    true,
  );

  assert.equal(engine.getDocument().viewport.x, 42);
  assert.equal(engine.getDocument().viewport.zoom, 1.5);
  assert.equal(engine.getDocument().nodes, nodesRefBefore);
  // Undo should undo node.create, not viewport.set
  assert.equal(engine.undo(), true);
  assert.equal(engine.getDocument().nodes.length, 0);
});

test('CommandEngine supports label.upsert and label.delete on nodes and edges', () => {
  const engine = new CommandEngine();
  const n1 = createDefaultNode({ id: 'n1', labelText: 'Initial' });
  const n2 = createDefaultNode({ id: 'n2', labelText: 'Target' });
  const e1 = createDefaultEdge('n1', 'n2', { id: 'e1' });
  engine.execute({
    type: 'batch',
    commands: [
      { type: 'node.create', node: n1 },
      { type: 'node.create', node: n2 },
      { type: 'edge.create', edge: e1 },
    ],
  });

  const edgeLbl = createDefaultEdgeLabel('Calls');
  assert.equal(
    engine.execute({ type: 'label.upsert', targetKind: 'edge', targetId: 'e1', label: edgeLbl }).ok,
    true,
  );
  assert.equal(engine.getEdge('e1')?.labels[0]?.text, 'Calls');

  assert.equal(
    engine.execute({ type: 'label.delete', targetKind: 'edge', targetId: 'e1', labelId: edgeLbl.id }).ok,
    true,
  );
  assert.equal(engine.getEdge('e1')?.labels.length, 0);
});

test('validateDocument accepts valid documents and rejects malformed input', () => {
  const doc = createEmptyDocument('Test');
  doc.nodes.push(createDefaultNode({ id: 'n1' }));
  const validated = validateDocument(doc);
  assert.equal(validated.nodes.length, 1);
  assert.equal(validated.meta.title, 'Test');

  assert.throws(() => validateDocument(null), /expected object/);
  assert.throws(() => validateDocument({ schemaVersion: 2, nodes: [], edges: [] }), /Unsupported schemaVersion/);
  assert.throws(
    () =>
      validateDocument({
        schemaVersion: 1,
        nodes: [{ id: 'bad', type: 'rect', geometry: { x: 0, y: 0, width: -10, height: 20 } }],
        edges: [],
      }),
    /invalid geometry/,
  );
  assert.throws(
    () =>
      validateDocument({
        schemaVersion: 1,
        nodes: [],
        edges: [{ id: 'e1', source: {}, target: {} }],
      }),
    /missing source\.nodeId/,
  );
});

test('ShapeRegistry and EdgeRouterRegistry route straight, polyline, orthogonal, bezier, and self-loop edges', () => {
  const shapes = new ShapeRegistry();
  const routers = new EdgeRouterRegistry();
  const n1 = createDefaultNode({ id: 'a', type: 'diamond', geometry: { x: 0, y: 0, width: 100, height: 100 } });
  const n2 = createDefaultNode({ id: 'b', type: 'ellipse', geometry: { x: 300, y: 100, width: 100, height: 100 } });

  for (const routing of ['straight', 'polyline', 'orthogonal', 'bezier'] as const) {
    const edge = createDefaultEdge('a', 'b', {
      routing,
      bends: routing === 'bezier' ? [{ x: 150, y: 10 }] : [],
    });
    const routed = routers.get(routing).route(n1, n2, edge, shapes);
    assert.ok(routed.points.length >= 2, `Expected >=2 points for ${routing}`);
    assert.ok(routed.pathD.startsWith('M '), `Expected valid SVG path for ${routing}`);
  }

  // Self-loop should produce a non-degenerate loop path
  const selfLoop = createDefaultEdge('a', 'a', { routing: 'polyline' });
  const looped = routers.get('polyline').route(n1, n1, selfLoop, shapes);
  assert.ok(looped.points.length >= 4);
});

test('Label placement computes node and edge label positions accurately', () => {
  const node = createDefaultNode({ id: 'n1', geometry: { x: 100, y: 200, width: 120, height: 60 } });
  const centerLbl = createDefaultNodeLabel('Center');
  const posCenter = computeNodeLabelPosition(node, centerLbl);
  assert.equal(posCenter.x, 160);
  assert.equal(posCenter.y, 230);

  const extTop = { ...centerLbl, placement: { model: 'external' as const, position: 'top' as const } };
  const posExtTop = computeNodeLabelPosition(node, extTop);
  assert.ok(posExtTop.y < 200);

  const freeLbl = {
    ...centerLbl,
    placement: { model: 'free' as const, position: 'center' as const, offset: { x: 15, y: -10 } },
  };
  const posFree = computeNodeLabelPosition(node, freeLbl);
  assert.equal(posFree.x, 175);
  assert.equal(posFree.y, 220);

  const edgeLbl = createDefaultEdgeLabel('Mid');
  const posEdge = computeEdgeLabelPosition(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    edgeLbl,
  );
  assert.equal(posEdge.x, 50);
});

test('CommandEngine coalesces rapid edits sharing a mergeKey into one Undo entry', () => {
  const engine = new CommandEngine();
  const n1 = createDefaultNode({
    id: 'n1',
    style: { fill: { type: 'solid', color: '#ffffff' } },
  });
  engine.execute({ type: 'node.create', node: n1 });

  // Simulate dragging a color picker through 4 intermediate colors
  for (const color of ['#ff0000', '#00ff00', '#0000ff', '#123456']) {
    engine.execute(
      { type: 'node.update', id: 'n1', patch: { style: { fill: { type: 'solid', color } } } },
      { mergeKey: 'node-fill:n1' },
    );
  }
  assert.deepEqual(engine.getNode('n1')?.style.fill, { type: 'solid', color: '#123456' });

  // One single undo restores the original #ffffff fill
  assert.equal(engine.undo(), true);
  assert.deepEqual(engine.getNode('n1')?.style.fill, { type: 'solid', color: '#ffffff' });
});

test('serializeMetadataJson round-trips special characters safely', () => {
  const doc = createEmptyDocument('A -- B ]]> <tag> & C');
  const json = serializeMetadataJson(doc);
  const parsed = validateDocument(JSON.parse(json));
  assert.equal(parsed.meta.title, 'A -- B ]]> <tag> & C');
});

test('computeSmartSnap detects edge/center alignment and equal vertical spacing', () => {
  const n1 = createDefaultNode({ id: 'n1', geometry: { x: 100, y: 0, width: 120, height: 60 } });
  const n2 = createDefaultNode({ id: 'n2', geometry: { x: 100, y: 100, width: 120, height: 60 } });
  // Gap between n1 (bottom=60) and n2 (top=100) is 40px.
  // Moving node near x=102, y=198 should snap to x=100 (left/center/right align) and y=200 (40px equal gap).
  const snap = computeSmartSnap({ x: 102, y: 198, width: 120, height: 60 }, [n1, n2], 6);
  assert.equal(snap.dx, -2);
  assert.equal(snap.dy, 2);
  assert.ok(snap.alignLines.some((l) => l.orientation === 'vertical' && l.value === 160));
  assert.equal(snap.spacingGuides.length, 1);
  assert.equal(snap.spacingGuides[0].orientation, 'vertical');
  assert.equal(snap.spacingGuides[0].gap, 40);
});

test('Align, Distribute, and Match Size commands work and undo cleanly', () => {
  const engine = new CommandEngine();
  const n1 = createDefaultNode({ id: 'n1', geometry: { x: 0, y: 10, width: 100, height: 50 } });
  const n2 = createDefaultNode({ id: 'n2', geometry: { x: 120, y: 40, width: 80, height: 70 } });
  const n3 = createDefaultNode({ id: 'n3', geometry: { x: 400, y: 90, width: 100, height: 50 } });
  engine.execute({
    type: 'batch',
    commands: [
      { type: 'node.create', node: n1 },
      { type: 'node.create', node: n2 },
      { type: 'node.create', node: n3 },
    ],
  });

  // Align top
  const alignCmd = createAlignNodesCommand(engine.getDocument(), ['n1', 'n2', 'n3'], 'top');
  assert.ok(alignCmd);
  engine.execute(alignCmd);
  assert.equal(engine.getNode('n2')?.geometry.y, 10);
  assert.equal(engine.getNode('n3')?.geometry.y, 10);

  // Distribute horizontal gaps: span 0..500 (500px), sum widths = 280px, gap = 110px => n2.x = 100 + 110 = 210
  const distCmd = createDistributeNodesCommand(engine.getDocument(), ['n1', 'n2', 'n3'], 'horizontal-gaps');
  assert.ok(distCmd);
  engine.execute(distCmd);
  assert.equal(engine.getNode('n2')?.geometry.x, 210);

  // Match size to n1 (100x50)
  const sizeCmd = createMatchSizeCommand(engine.getDocument(), ['n1', 'n2', 'n3'], 'both');
  assert.ok(sizeCmd);
  engine.execute(sizeCmd);
  assert.equal(engine.getNode('n2')?.geometry.width, 100);
  assert.equal(engine.getNode('n2')?.geometry.height, 50);

  // Undo restores n2 size
  engine.undo();
  assert.equal(engine.getNode('n2')?.geometry.width, 80);
});
